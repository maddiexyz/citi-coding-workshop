"""
Departments service: the departments people and projects belong to.

Routes (served at /api/departments; every route needs a Bearer token):
    GET    /        ?q   -> {"items": [...]} with resource_count, project_count  (everyone)
    POST   /        {"name"} -> 201 department                                   (admin)
    PUT    /{id}    {"name"} -> department (rename)                              (admin)
    DELETE /{id}         -> 204; 409 while people or projects still use it      (admin)

Names are unique regardless of case and stored trimmed. Every change is
written to the audit log in the same transaction.
"""

from psycopg import errors

from common import audit, db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_id
from common.permissions import can_manage_departments
from common.validation import Validator

SELECT_DEPARTMENT = """
    SELECT d.id, d.name, d.created_at, d.updated_at,
           (SELECT count(*) FROM resources r WHERE r.department_id = d.id) AS resource_count,
           (SELECT count(*) FROM projects p WHERE p.department_id = d.id) AS project_count
    FROM departments d
"""


def require_admin(request: Request) -> None:
    """403 unless the user may change departments."""
    if not can_manage_departments(request.user):
        raise ApiError(403, "forbidden", "Only an admin can change departments")


def validate_name(data: dict) -> str:
    """The trimmed department name (required, at most 100 characters)."""
    validator = Validator(data)
    name = validator.string("name", required=True, max_length=100)
    validator.raise_if_errors()
    return name


def find_department(department_id: int) -> dict:
    """Load one department (with usage counts) or raise 404."""
    row = db.fetch_one(SELECT_DEPARTMENT + " WHERE d.id = %s", (department_id,))
    if not row:
        raise ApiError(404, "not_found", "Department not found")
    return row


def duplicate_name() -> ApiError:
    """The 409 for a name that is already taken (case-insensitively)."""
    return ApiError(409, "conflict", "A department with this name already exists",
                    {"name": "Name already in use"})


@require_auth
def list_departments(request: Request) -> dict:
    """List departments by name, optionally filtered by text."""
    text = (request.query.get("q") or "").strip()
    items = db.fetch_all(
        SELECT_DEPARTMENT + " WHERE (%(search)s::text IS NULL OR d.name ILIKE %(search)s) ORDER BY lower(d.name)",
        {"search": db.like_pattern(text) if text else None},
    )
    return json_response(200, {"items": items})


@require_auth
def create_department(request: Request) -> dict:
    """Add a department."""
    require_admin(request)
    name = validate_name(request.json())
    try:
        with db.transaction():
            row = db.fetch_one("INSERT INTO departments (name) VALUES (%s) RETURNING id, name", (name,))
            audit.record(request.user, "create", "department", row["id"], new=row,
                         summary=f"Added department {name}")
    except errors.UniqueViolation as exc:
        raise duplicate_name() from exc
    return json_response(201, find_department(row["id"]))


@require_auth
def rename_department(request: Request, department_id: str) -> dict:
    """Rename a department."""
    require_admin(request)
    department = find_department(parse_id(department_id, "Department id"))
    name = validate_name(request.json())
    try:
        with db.transaction():
            db.execute("UPDATE departments SET name = %s, updated_at = now() WHERE id = %s", (name, department["id"]))
            audit.record(request.user, "update", "department", department["id"],
                         old={"name": department["name"]}, new={"name": name},
                         summary=f"Renamed department {department['name']} to {name}")
    except errors.UniqueViolation as exc:
        raise duplicate_name() from exc
    return json_response(200, find_department(department["id"]))


@require_auth
def delete_department(request: Request, department_id: str) -> dict:
    """Delete a department that no person or project uses."""
    require_admin(request)
    department = find_department(parse_id(department_id, "Department id"))
    try:
        with db.transaction():
            db.execute("DELETE FROM departments WHERE id = %s", (department["id"],))
            audit.record(request.user, "delete", "department", department["id"], old={"name": department["name"]},
                         summary=f"Deleted department {department['name']}")
    except (errors.ForeignKeyViolation, errors.RestrictViolation) as exc:
        raise ApiError(409, "conflict",
                       f"{department['name']} is still used by {department['resource_count']} people and "
                       f"{department['project_count']} projects: move them first",
                       {"department": "In use"}) from exc
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_departments),
    ("POST", "/", create_department),
    ("PUT", "/{department_id}", rename_department),
    ("DELETE", "/{department_id}", delete_department),
])
