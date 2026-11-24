"""
Allocations service: hours per week a resource works on a project, for a period.

Routes (served at /api/allocations; every route needs a Bearer token):
    GET    /       ?project_id&resource_id&resource=me&active_on -> {"items": [...]}
    GET    /{id}                                     -> allocation
    POST   /       allocation fields + project_id    -> 201 allocation + warnings  (admin, owning PM)
    PUT    /{id}   allocation fields                 -> allocation + warnings      (admin, owning PM)
    DELETE /{id}                                     -> 204                        (admin, owning PM)

Allocation fields: resource_id, hours_per_week (0–80), start_date, end_date, note.

Rules:
- dates must fall within the project's start and end dates (when set): 400;
- one allocation per resource per project per period: an overlap is 409;
- going over the resource's weekly capacity is allowed: the response lists
  the affected weeks in "warnings" (over-allocation is flagged, never blocked).

Every change is written to the audit log in the same transaction.
"""

from datetime import date
from decimal import Decimal

from psycopg import errors

from common import audit, db
from common.auth import linked_resource_id, me_filter, require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_id
from common.permissions import can_manage_allocations
from common.validation import Validator

SELECT_ALLOCATION = """
    SELECT a.*, r.full_name AS resource_name, r.weekly_hours AS resource_weekly_hours,
           p.code AS project_code, p.name AS project_name
    FROM allocations a
    JOIN resources r ON r.id = a.resource_id
    JOIN projects p ON p.id = a.project_id
"""


def validate_allocation(data: dict, project: dict) -> dict:
    """
    Validate allocation fields against the project's dates.

    Raises:
        ApiError: 400 with a message per invalid field.
    """
    validator = Validator(data)
    resource_id = validator.integer("resource_id", required=True)
    validator.number("hours_per_week", required=True, greater_than=Decimal(0), maximum=Decimal(80))
    start = validator.date("start_date")
    end = validator.date("end_date")
    validator.string("note", max_length=500)
    if start is None and "start_date" not in validator.errors:
        validator.add_error("start_date", "This field is required")
    if end is None and "end_date" not in validator.errors:
        validator.add_error("end_date", "This field is required")
    if start and end and end < start:
        validator.add_error("end_date", "End date must be on or after the start date")
    if start and project["start_date"] and start < project["start_date"]:
        validator.add_error("start_date", f"Must be on or after the project start ({project['start_date']})")
    if end and project["end_date"] and end > project["end_date"]:
        validator.add_error("end_date", f"Must be on or before the project end ({project['end_date']})")
    if resource_id:
        resource = db.fetch_one("SELECT is_active FROM resources WHERE id = %s", (resource_id,))
        if not resource:
            validator.add_error("resource_id", "Resource not found")
        elif not resource["is_active"]:
            validator.add_error("resource_id", "This resource is inactive")
    validator.raise_if_errors()
    return validator.clean


def load_project(project_id: int, *, missing_status: int = 404) -> dict:
    """Load the project fields needed for permissions and date checks."""
    project = db.fetch_one(
        "SELECT id, owner_id, team_lead_id, start_date, end_date FROM projects WHERE id = %s", (project_id,))
    if not project:
        if missing_status == 400:
            raise ApiError(400, "validation_error", "Some fields are invalid", {"project_id": "Project not found"})
        raise ApiError(404, "not_found", "Project not found")
    return project


def find_allocation(allocation_id: int) -> dict:
    """Load one allocation or raise 404."""
    row = db.fetch_one(SELECT_ALLOCATION + " WHERE a.id = %s", (allocation_id,))
    if not row:
        raise ApiError(404, "not_found", "Allocation not found")
    return row


def require_manage(request: Request, project: dict) -> None:
    """403 unless the user may change allocations on this project."""
    if not can_manage_allocations(request.user, project):
        raise ApiError(403, "forbidden", "Only an admin or the project's manager can change allocations")


def over_allocation_warnings(allocation: dict) -> list[dict]:
    """Weeks in the allocation's period where its resource is allocated beyond capacity."""
    return db.fetch_all(
        """
        SELECT week_start, total_hours, weekly_hours, over_by
        FROM resource_weekly_load(%s, %s)
        WHERE resource_id = %s AND over_by > 0
        ORDER BY week_start
        """,
        (allocation["start_date"], allocation["end_date"], allocation["resource_id"]),
    )


def overlap_error() -> ApiError:
    """The 409 for a second allocation of the same resource to the same project and period."""
    return ApiError(409, "allocation_overlap",
                    "This person is already allocated to this project in that period: edit that allocation instead",
                    {"start_date": "Overlaps an existing allocation for this person on this project"})


def saved_response(status: int, allocation_id: int) -> dict:
    """The allocation plus any over-allocation warnings."""
    allocation = find_allocation(allocation_id)
    return json_response(status, {**allocation, "warnings": over_allocation_warnings(allocation)})


@require_auth
def list_allocations(request: Request) -> dict:
    """List allocations, filtered by project, resource and a date they cover."""
    query = request.query
    filters = Validator({"active_on": query.get("active_on")})
    active_on: date | None = filters.date("active_on")
    if filters.errors:
        raise ApiError(400, "validation_error", "Invalid filter", filters.errors)
    resource_id = parse_id(query["resource_id"], "Resource id") if query.get("resource_id") else None
    if me_filter("resource", query.get("resource")):
        # The signed-in user's own allocations; no linked person matches nothing
        resource_id = linked_resource_id(request.user) or 0
    items = db.fetch_all(
        SELECT_ALLOCATION + """
        WHERE (%(project_id)s::bigint IS NULL OR a.project_id = %(project_id)s)
          AND (%(resource_id)s::bigint IS NULL OR a.resource_id = %(resource_id)s)
          AND (%(active_on)s::date IS NULL OR %(active_on)s BETWEEN a.start_date AND a.end_date)
        ORDER BY a.start_date, r.full_name, a.id
        """,
        {
            "project_id": parse_id(query["project_id"], "Project id") if query.get("project_id") else None,
            "resource_id": resource_id,
            "active_on": active_on,
        },
    )
    return json_response(200, {"items": items})


@require_auth
def get_allocation(_request: Request, allocation_id: str) -> dict:
    """Return one allocation."""
    return json_response(200, find_allocation(parse_id(allocation_id, "Allocation id")))


@require_auth
def create_allocation(request: Request) -> dict:
    """Allocate a resource's hours to a project."""
    body = request.json()
    validator = Validator(body)
    project_id = validator.integer("project_id", required=True)
    validator.raise_if_errors()
    project = load_project(project_id, missing_status=400)
    require_manage(request, project)
    data = validate_allocation(body, project)
    try:
        with db.transaction():
            row = db.fetch_one(
                """
                INSERT INTO allocations (project_id, resource_id, hours_per_week, start_date, end_date, note)
                VALUES (%(project_id)s, %(resource_id)s, %(hours_per_week)s, %(start_date)s, %(end_date)s,
                        %(note)s)
                RETURNING *
                """,
                {**data, "project_id": project["id"]},
            )
            audit.record(request.user, "create", "allocation", row["id"], project_id=project["id"], new=row,
                         summary="Allocated a person to the project")
    except errors.ExclusionViolation as exc:
        raise overlap_error() from exc
    return saved_response(201, row["id"])


@require_auth
def update_allocation(request: Request, allocation_id: str) -> dict:
    """Replace an allocation's fields (it stays on its project)."""
    allocation = find_allocation(parse_id(allocation_id, "Allocation id"))
    project = load_project(allocation["project_id"])
    require_manage(request, project)
    data = validate_allocation(request.json(), project)
    try:
        with db.transaction():
            before = db.fetch_one("SELECT * FROM allocations WHERE id = %s", (allocation["id"],))
            after = db.fetch_one(
                """
                UPDATE allocations
                SET resource_id = %(resource_id)s, hours_per_week = %(hours_per_week)s,
                    start_date = %(start_date)s, end_date = %(end_date)s, note = %(note)s, updated_at = now()
                WHERE id = %(id)s
                RETURNING *
                """,
                {**data, "id": allocation["id"]},
            )
            audit.record(request.user, "update", "allocation", allocation["id"], project_id=project["id"],
                         old=before, new=after, summary=f"Updated allocation for {allocation['resource_name']}")
    except errors.ExclusionViolation as exc:
        raise overlap_error() from exc
    return saved_response(200, allocation["id"])


@require_auth
def delete_allocation(request: Request, allocation_id: str) -> dict:
    """Delete an allocation."""
    allocation = find_allocation(parse_id(allocation_id, "Allocation id"))
    require_manage(request, load_project(allocation["project_id"]))
    with db.transaction():
        old = db.fetch_one("DELETE FROM allocations WHERE id = %s RETURNING *", (allocation["id"],))
        audit.record(request.user, "delete", "allocation", allocation["id"], project_id=allocation["project_id"],
                     old=old, summary=f"Removed {allocation['resource_name']} from the project")
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_allocations),
    ("POST", "/", create_allocation),
    ("GET", "/{allocation_id}", get_allocation),
    ("PUT", "/{allocation_id}", update_allocation),
    ("DELETE", "/{allocation_id}", delete_allocation),
])
