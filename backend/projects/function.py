"""
Projects service: list, read, create, update and delete projects.

Routes (served at /api/projects; every route needs a Bearer token):
    GET    /             ?status&q&department_id -> {"items": [...]}
    GET    /{id}                               -> project
    POST   /             project fields        -> 201 project
    PUT    /{id}         project fields        -> project
    DELETE /{id}                               -> 204

Project fields: code, name, description, status, start_date, end_date,
team_lead_id, department_id, budget_planned. Budget figures (actual_spend, remaining,
burn_pct, over_budget) are computed by the project_details view.

Who may change what is decided in common.permissions; every change is
written to the audit log in the same transaction.
"""

from decimal import Decimal

from psycopg import errors

from common import audit, db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_id
from common.permissions import can_change_project, can_create_project, can_delete_project
from common.validation import Validator

PROJECT_STATUSES = ("planned", "active", "on_hold", "completed", "cancelled")
CODE_PATTERN = r"[A-Z0-9][A-Z0-9-]{1,19}"


def validate_project(data: dict) -> dict:
    """
    Validate the editable project fields from a request body.

    Returns:
        Cleaned values: code (uppercased), name, description, status, start_date,
        end_date, team_lead_id, department_id, budget_planned.

    Raises:
        ApiError: 400 with a message per invalid field.
    """
    validator = Validator(data)
    validator.string("code", required=True, max_length=20, transform=str.upper, pattern=CODE_PATTERN,
                     pattern_message="Use 2-20 letters, digits or dashes, e.g. ACME-01")
    validator.string("name", required=True, max_length=200)
    validator.string("description", max_length=2000)
    validator.choice("status", PROJECT_STATUSES, default="planned")
    start_date = validator.date("start_date")
    end_date = validator.date("end_date")
    if start_date and end_date and end_date < start_date:
        validator.add_error("end_date", "End date must be on or after the start date")
    validator.number("budget_planned", minimum=Decimal(0), maximum=Decimal("9999999999.99"))
    department_id = validator.integer("department_id")
    if department_id and not db.fetch_one("SELECT 1 FROM departments WHERE id = %s", (department_id,)):
        validator.add_error("department_id", "Department not found")
    team_lead_id = validator.integer("team_lead_id")
    if team_lead_id and not db.fetch_one(
            "SELECT 1 FROM users WHERE id = %s AND role = 'team_lead' AND is_active", (team_lead_id,)):
        validator.add_error("team_lead_id", "Must be an active user with the team lead role")
    validator.raise_if_errors()
    return validator.clean


def find_project(project_id: int) -> dict:
    """Load one project or raise 404."""
    project = db.fetch_one("SELECT * FROM project_details WHERE id = %s", (project_id,))
    if not project:
        raise ApiError(404, "not_found", "Project not found")
    return project


def duplicate_code_error() -> ApiError:
    """The 409 returned when a project code is already taken."""
    return ApiError(409, "conflict", "A project with this code already exists",
                    {"code": "This code is already in use"})


@require_auth
def list_projects(request: Request) -> dict:
    """List projects, filtered by status, department and text in name or code."""
    query = request.query
    status = query.get("status") or None
    if status and status not in PROJECT_STATUSES:
        raise ApiError(400, "validation_error", "Invalid filter",
                       {"status": f"Must be one of: {', '.join(PROJECT_STATUSES)}"})
    text = (query.get("q") or "").strip()
    department_id = parse_id(query["department_id"], "Department id") if query.get("department_id") else None

    # One fixed query: a NULL parameter switches its filter off
    items = db.fetch_all(
        """
        SELECT * FROM project_details
        WHERE (%(status)s::project_status IS NULL OR status = %(status)s::project_status)
          AND (%(department_id)s::bigint IS NULL OR department_id = %(department_id)s)
          AND (%(search)s::text IS NULL OR name ILIKE %(search)s OR code ILIKE %(search)s)
        ORDER BY created_at DESC, id DESC
        """,
        {"status": status, "department_id": department_id, "search": db.like_pattern(text) if text else None},
    )
    return json_response(200, {"items": items})


@require_auth
def get_project(_request: Request, project_id: str) -> dict:
    """Return one project."""
    return json_response(200, find_project(parse_id(project_id, "Project id")))


def project_row(project_id: int) -> dict:
    """The stored project record (without computed fields), as written to the audit log."""
    return db.fetch_one("SELECT * FROM projects WHERE id = %s", (project_id,))


@require_auth
def create_project(request: Request) -> dict:
    """Create a project owned by the current user."""
    if not can_create_project(request.user):
        raise ApiError(403, "forbidden", "Your role cannot create projects")
    data = validate_project(request.json())
    try:
        with db.transaction():
            row = db.fetch_one(
                """
                INSERT INTO projects (code, name, description, status, start_date, end_date, team_lead_id,
                                      department_id, budget_planned, owner_id)
                VALUES (%(code)s, %(name)s, %(description)s, %(status)s, %(start_date)s, %(end_date)s,
                        %(team_lead_id)s, %(department_id)s, %(budget_planned)s, %(owner_id)s)
                RETURNING *
                """,
                {**data, "owner_id": request.user.id},
            )
            audit.record(request.user, "create", "project", row["id"], project_id=row["id"], new=row,
                         summary=f"Created project {row['code']}")
    except errors.UniqueViolation as exc:
        raise duplicate_code_error() from exc
    return json_response(201, find_project(row["id"]))


@require_auth
def update_project(request: Request, project_id: str) -> dict:
    """Replace a project's editable fields (only admin or the owning PM, so only they set the team lead and budget)."""
    project = find_project(parse_id(project_id, "Project id"))
    if not can_change_project(request.user, project):
        raise ApiError(403, "forbidden", "You can only edit projects you own")
    data = validate_project(request.json())
    try:
        with db.transaction():
            before = project_row(project["id"])
            after = db.fetch_one(
                """
                UPDATE projects
                SET code = %(code)s, name = %(name)s, description = %(description)s, status = %(status)s,
                    start_date = %(start_date)s, end_date = %(end_date)s, team_lead_id = %(team_lead_id)s,
                    department_id = %(department_id)s, budget_planned = %(budget_planned)s, updated_at = now()
                WHERE id = %(id)s
                RETURNING *
                """,
                {**data, "id": project["id"]},
            )
            audit.record(request.user, "update", "project", project["id"], project_id=project["id"],
                         old=before, new=after, summary=f"Updated project {after['code']}")
    except errors.UniqueViolation as exc:
        raise duplicate_code_error() from exc
    return json_response(200, find_project(project["id"]))


@require_auth
def delete_project(request: Request, project_id: str) -> dict:
    """
    Delete a project and everything under it.

    Once a project has spend entries only an admin may delete it; the owning
    PM should set its status to cancelled instead. The audit entry keeps the
    project and what was removed with it.
    """
    project = find_project(parse_id(project_id, "Project id"))
    if not can_change_project(request.user, project):
        raise ApiError(403, "forbidden", "You can only delete projects you own")
    if not can_delete_project(request.user, project, project["budget_entry_count"] > 0):
        raise ApiError(403, "forbidden",
                       "This project has budget entries: only an admin can delete it. "
                       "Set its status to cancelled instead")
    with db.transaction():
        removed = {
            "deliverables": db.fetch_all(
                "SELECT id, title, status FROM deliverables WHERE project_id = %s ORDER BY id", (project["id"],)),
            "dependencies": db.fetch_one(
                "SELECT count(*) AS n FROM deliverable_dependencies dep"
                " JOIN deliverables d ON d.id = dep.deliverable_id WHERE d.project_id = %s", (project["id"],))["n"],
            "allocations": db.fetch_all(
                "SELECT id, resource_id, hours_per_week, start_date, end_date FROM allocations"
                " WHERE project_id = %s ORDER BY id", (project["id"],)),
            "budget_entries": db.fetch_all(
                "SELECT id, category, amount, spent_on, description FROM budget_entries"
                " WHERE project_id = %s ORDER BY id", (project["id"],)),
        }
        old = project_row(project["id"])
        db.execute("DELETE FROM projects WHERE id = %s", (project["id"],))
        audit.record(request.user, "delete", "project", project["id"], project_id=project["id"], old=old,
                     details=removed, summary=f"Deleted project {project['code']}")
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_projects),
    ("POST", "/", create_project),
    ("GET", "/{project_id}", get_project),
    ("PUT", "/{project_id}", update_project),
    ("DELETE", "/{project_id}", delete_project),
])
