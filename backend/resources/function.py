"""
Resources service: the people who do the work, their weekly capacity and load.

Routes (served at /api/resources; every route needs a Bearer token):
    GET    /           ?q&department_id&active&over_allocated&week -> {"items": [...], "week_start"}
    GET    /{id}                                   -> resource + allocations
    GET    /{id}/load  ?from&to                    -> {"weeks": [...]} hours per week
    POST   /           resource fields             -> 201 resource      (admin)
    PUT    /{id}       resource fields             -> resource          (admin)
    DELETE /{id}                                   -> 204 (409 if it has allocations) (admin)

Resource fields: full_name, email, department_id, title, user_id, weekly_hours, is_active.
Load and over-allocation come from the resource_weekly_load() SQL function
(weeks start on Monday) and are computed at query time.
"""

from datetime import date, timedelta
from decimal import Decimal

from psycopg import errors

from common import audit, db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_bool, parse_id
from common.permissions import can_manage_resources
from common.validation import Validator

EMAIL_PATTERN = r"[^@\s]+@[^@\s]+\.[^@\s]+"
DEFAULT_LOAD_WEEKS = 8
MAX_LOAD_WEEKS = 53


def week_start(day: date) -> date:
    """The Monday of the week containing day."""
    return day - timedelta(days=day.weekday())


def parse_date_param(name: str, raw, default: date) -> date:
    """Parse an optional YYYY-MM-DD query parameter."""
    validator = Validator({name: raw})
    value = validator.date(name)
    if validator.errors:
        raise ApiError(400, "validation_error", "Invalid filter", validator.errors)
    return value or default


def validate_resource(data: dict) -> dict:
    """
    Validate the editable resource fields.

    Raises:
        ApiError: 400 with a message per invalid field.
    """
    validator = Validator(data)
    validator.string("full_name", required=True, max_length=200)
    validator.string("email", max_length=254, transform=str.lower, pattern=EMAIL_PATTERN,
                     pattern_message="Must be an email address")
    department_id = validator.integer("department_id")
    validator.string("title", max_length=100)
    user_id = validator.integer("user_id")
    validator.number("weekly_hours", greater_than=Decimal(0), maximum=Decimal(60), default=Decimal(40))
    validator.boolean("is_active", default=True)
    if user_id and not db.fetch_one("SELECT 1 FROM users WHERE id = %s", (user_id,)):
        validator.add_error("user_id", "User not found")
    if department_id and not db.fetch_one("SELECT 1 FROM departments WHERE id = %s", (department_id,)):
        validator.add_error("department_id", "Department not found")
    validator.raise_if_errors()
    return validator.clean


def require_admin(request: Request) -> None:
    """403 unless the user may manage resources."""
    if not can_manage_resources(request.user):
        raise ApiError(403, "forbidden", "Only an admin can change resources")


def find_resource(resource_id: int) -> dict:
    """Load one resource (with the linked user's name and this week's load) or raise 404."""
    this_week = week_start(db.today())
    row = db.fetch_one(
        """
        SELECT r.*, u.full_name AS user_name, dep.name AS department_name,
               coalesce(l.total_hours, 0) AS week_hours, coalesce(l.over_by, 0) > 0 AS over_allocated
        FROM resources r
        LEFT JOIN users u ON u.id = r.user_id
        LEFT JOIN departments dep ON dep.id = r.department_id
        LEFT JOIN resource_weekly_load(%(week)s, %(week)s) l ON l.resource_id = r.id
        WHERE r.id = %(id)s
        """,
        {"week": this_week, "id": resource_id},
    )
    if not row:
        raise ApiError(404, "not_found", "Resource not found")
    return row


def unique_error(exc: errors.UniqueViolation) -> ApiError:
    """Turn a duplicate email or user link into a 409 on the right field."""
    field = "user_id" if "user_id" in (exc.diag.constraint_name or "") else "email"
    message = "This user is already linked to another resource" if field == "user_id" else "Email already in use"
    return ApiError(409, "conflict", "A resource with these details already exists", {field: message})


@require_auth
def list_resources(request: Request) -> dict:
    """List resources with their load in one week (default: this week)."""
    query = request.query
    week = week_start(parse_date_param("week", query.get("week"), db.today()))
    text = (query.get("q") or "").strip()
    items = db.fetch_all(
        """
        SELECT r.*, u.full_name AS user_name, dep.name AS department_name,
               coalesce(l.total_hours, 0) AS week_hours, coalesce(l.over_by, 0) > 0 AS over_allocated
        FROM resources r
        LEFT JOIN users u ON u.id = r.user_id
        LEFT JOIN departments dep ON dep.id = r.department_id
        LEFT JOIN resource_weekly_load(%(week)s, %(week)s) l ON l.resource_id = r.id
        WHERE (%(active)s::boolean IS NULL OR r.is_active = %(active)s)
          AND (%(department_id)s::bigint IS NULL OR r.department_id = %(department_id)s)
          AND (%(search)s::text IS NULL OR r.full_name ILIKE %(search)s OR r.email ILIKE %(search)s
               OR r.title ILIKE %(search)s OR dep.name ILIKE %(search)s)
          AND (%(over)s::boolean IS NULL OR (coalesce(l.over_by, 0) > 0) = %(over)s)
        ORDER BY r.full_name, r.id
        """,
        {
            "week": week,
            "active": parse_bool("active", query.get("active")),
            "department_id": parse_id(query["department_id"], "Department id") if query.get("department_id") else None,
            "search": db.like_pattern(text) if text else None,
            "over": parse_bool("over_allocated", query.get("over_allocated")),
        },
    )
    return json_response(200, {"items": items, "week_start": week})


@require_auth
def get_resource(_request: Request, resource_id: str) -> dict:
    """Return one resource with its allocations."""
    resource = find_resource(parse_id(resource_id, "Resource id"))
    allocations = db.fetch_all(
        """
        SELECT a.*, p.code AS project_code, p.name AS project_name, p.status AS project_status
        FROM allocations a JOIN projects p ON p.id = a.project_id
        WHERE a.resource_id = %s ORDER BY a.start_date, a.id
        """,
        (resource["id"],),
    )
    return json_response(200, {**resource, "allocations": allocations})


@require_auth
def get_load(request: Request, resource_id: str) -> dict:
    """Hours allocated per week between from and to (default: this week and the next 7)."""
    resource = find_resource(parse_id(resource_id, "Resource id"))
    first = week_start(parse_date_param("from", request.query.get("from"), db.today()))
    last = week_start(parse_date_param("to", request.query.get("to"),
                                       first + timedelta(weeks=DEFAULT_LOAD_WEEKS - 1)))
    if last < first or (last - first).days // 7 >= MAX_LOAD_WEEKS:
        raise ApiError(400, "validation_error", "Invalid filter",
                       {"to": f"Must be on or after from, at most {MAX_LOAD_WEEKS} weeks later"})

    loads = {row["week_start"]: row for row in db.fetch_all(
        "SELECT * FROM resource_weekly_load(%s, %s) WHERE resource_id = %s", (first, last, resource["id"]))}
    projects = db.fetch_all(
        """
        SELECT a.start_date, a.end_date, a.hours_per_week, p.id AS project_id, p.code AS project_code
        FROM allocations a JOIN projects p ON p.id = a.project_id
        WHERE a.resource_id = %s AND p.status <> 'cancelled' AND a.start_date <= %s AND a.end_date >= %s
        """,
        (resource["id"], last + timedelta(days=6), first),
    )
    weeks = []
    week = first
    while week <= last:
        load = loads.get(week)
        weeks.append({
            "week_start": week,
            "total_hours": load["total_hours"] if load else Decimal(0),
            "weekly_hours": resource["weekly_hours"],
            "over_by": load["over_by"] if load else Decimal(0),
            "projects": [
                {"project_id": a["project_id"], "project_code": a["project_code"], "hours": a["hours_per_week"]}
                for a in projects if a["start_date"] <= week + timedelta(days=6) and a["end_date"] >= week
            ],
        })
        week += timedelta(weeks=1)
    return json_response(200, {"resource_id": resource["id"], "weeks": weeks})


@require_auth
def create_resource(request: Request) -> dict:
    """Create a resource (admin)."""
    require_admin(request)
    data = validate_resource(request.json())
    try:
        with db.transaction():
            row = db.fetch_one(
                """
                INSERT INTO resources (full_name, email, department_id, title, user_id, weekly_hours, is_active)
                VALUES (%(full_name)s, %(email)s, %(department_id)s, %(title)s, %(user_id)s, %(weekly_hours)s,
                        %(is_active)s)
                RETURNING *
                """,
                data,
            )
            audit.record(request.user, "create", "resource", row["id"], new=row,
                         summary=f"Added {row['full_name']}")
    except errors.UniqueViolation as exc:
        raise unique_error(exc) from exc
    return json_response(201, find_resource(row["id"]))


@require_auth
def update_resource(request: Request, resource_id: str) -> dict:
    """Replace a resource's editable fields (admin)."""
    require_admin(request)
    resource = find_resource(parse_id(resource_id, "Resource id"))
    data = validate_resource(request.json())
    try:
        with db.transaction():
            before = db.fetch_one("SELECT * FROM resources WHERE id = %s", (resource["id"],))
            after = db.fetch_one(
                """
                UPDATE resources
                SET full_name = %(full_name)s, email = %(email)s, department_id = %(department_id)s, title = %(title)s,
                    user_id = %(user_id)s, weekly_hours = %(weekly_hours)s, is_active = %(is_active)s,
                    updated_at = now()
                WHERE id = %(id)s
                RETURNING *
                """,
                {**data, "id": resource["id"]},
            )
            audit.record(request.user, "update", "resource", resource["id"], old=before, new=after,
                         summary=f"Updated {after['full_name']}")
    except errors.UniqueViolation as exc:
        raise unique_error(exc) from exc
    return json_response(200, find_resource(resource["id"]))


@require_auth
def delete_resource(request: Request, resource_id: str) -> dict:
    """Delete a resource that has no allocations (admin)."""
    require_admin(request)
    resource = find_resource(parse_id(resource_id, "Resource id"))
    try:
        with db.transaction():
            old = db.fetch_one("DELETE FROM resources WHERE id = %s RETURNING *", (resource["id"],))
            audit.record(request.user, "delete", "resource", resource["id"], old=old,
                         summary=f"Deleted {resource['full_name']}")
    except (errors.ForeignKeyViolation, errors.RestrictViolation) as exc:
        raise ApiError(409, "conflict", "This resource still has allocations: remove them or deactivate it",
                       {"allocations": "Remove the allocations or set the resource inactive"}) from exc
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_resources),
    ("POST", "/", create_resource),
    ("GET", "/{resource_id}", get_resource),
    ("PUT", "/{resource_id}", update_resource),
    ("DELETE", "/{resource_id}", delete_resource),
    ("GET", "/{resource_id}/load", get_load),
])
