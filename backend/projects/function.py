"""
Projects service: list, read, create, update and delete projects.

Routes (served at /api/projects; every route needs a Bearer token):
    GET    /             ?status=active&q=text -> {"items": [...]}
    GET    /{id}                               -> project
    POST   /             project fields        -> 201 project
    PUT    /{id}         project fields        -> project
    DELETE /{id}                               -> 204

Who may change what is decided in common.permissions.
"""

from psycopg import errors

from common import db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler
from common.permissions import can_change_project, can_create_project
from common.validation import Validator

PROJECT_STATUSES = ("planned", "active", "on_hold", "completed", "cancelled")
CODE_PATTERN = r"[A-Z0-9][A-Z0-9-]{1,19}"


def validate_project(data: dict) -> dict:
    """
    Validate the editable project fields from a request body.

    Returns:
        Cleaned values: code (uppercased), name, description, status, start_date, end_date.

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
    validator.raise_if_errors()
    return validator.clean


def parse_id(raw_id: str) -> int:
    """Convert a path id to an int, rejecting anything that is not a positive number."""
    if not raw_id.isdigit() or int(raw_id) == 0:
        raise ApiError(400, "invalid_id", "Project id must be a positive number")
    return int(raw_id)


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


def search_pattern(text: str) -> str:
    """Turn search text into an ILIKE pattern, treating % and _ as literal characters."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@require_auth
def list_projects(request: Request) -> dict:
    """List projects, optionally filtered by status and by text in name or code."""
    status = request.query.get("status") or None
    if status and status not in PROJECT_STATUSES:
        raise ApiError(400, "validation_error", "Invalid filter",
                       {"status": f"Must be one of: {', '.join(PROJECT_STATUSES)}"})
    text = (request.query.get("q") or "").strip()

    # One fixed query: a NULL parameter switches its filter off
    items = db.fetch_all(
        """
        SELECT * FROM project_details
        WHERE (%(status)s::project_status IS NULL OR status = %(status)s::project_status)
          AND (%(search)s::text IS NULL OR name ILIKE %(search)s OR code ILIKE %(search)s)
        ORDER BY created_at DESC, id DESC
        """,
        {"status": status, "search": search_pattern(text) if text else None},
    )
    return json_response(200, {"items": items})


@require_auth
def get_project(request: Request, project_id: str) -> dict:
    """Return one project."""
    return json_response(200, find_project(parse_id(project_id)))


@require_auth
def create_project(request: Request) -> dict:
    """Create a project owned by the current user."""
    if not can_create_project(request.user):
        raise ApiError(403, "forbidden", "Your role cannot create projects")
    data = validate_project(request.json())
    try:
        row = db.fetch_one(
            """
            INSERT INTO projects (code, name, description, status, start_date, end_date, owner_id)
            VALUES (%(code)s, %(name)s, %(description)s, %(status)s, %(start_date)s, %(end_date)s, %(owner_id)s)
            RETURNING id
            """,
            {**data, "owner_id": request.user.id},
        )
    except errors.UniqueViolation as exc:
        raise duplicate_code_error() from exc
    return json_response(201, find_project(row["id"]))


@require_auth
def update_project(request: Request, project_id: str) -> dict:
    """Replace a project's editable fields."""
    project = find_project(parse_id(project_id))
    if not can_change_project(request.user, project):
        raise ApiError(403, "forbidden", "You can only edit projects you own")
    data = validate_project(request.json())
    try:
        db.execute(
            """
            UPDATE projects
            SET code = %(code)s, name = %(name)s, description = %(description)s, status = %(status)s,
                start_date = %(start_date)s, end_date = %(end_date)s, updated_at = now()
            WHERE id = %(id)s
            """,
            {**data, "id": project["id"]},
        )
    except errors.UniqueViolation as exc:
        raise duplicate_code_error() from exc
    return json_response(200, find_project(project["id"]))


@require_auth
def delete_project(request: Request, project_id: str) -> dict:
    """Delete a project."""
    project = find_project(parse_id(project_id))
    if not can_change_project(request.user, project):
        raise ApiError(403, "forbidden", "You can only delete projects you own")
    db.execute("DELETE FROM projects WHERE id = %s", (project["id"],))
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_projects),
    ("POST", "/", create_project),
    ("GET", "/{project_id}", get_project),
    ("PUT", "/{project_id}", update_project),
    ("DELETE", "/{project_id}", delete_project),
])
