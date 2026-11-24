"""
Deliverables service: deliverables of a project and the dependencies between them.

Routes (served at /api/deliverables; every route needs a Bearer token):
    GET    /        ?project_id&status&blocked&overdue&due_soon&due_before&assignee&q -> {"items": [...]}
                    (due_soon=true: not done or cancelled and due within 7 days, by the database clock)
                    (assignee: a resource id, or "me" for the signed-in user's linked person)
    GET    /{id}                                   -> deliverable + predecessors + successors
    POST   /        deliverable fields + project_id -> 201 deliverable
    PUT    /{id}    deliverable fields              -> deliverable
    DELETE /{id}                                    -> 204
    GET    /{id}/dependencies                       -> {"items": [predecessors]}
    POST   /{id}/dependencies   {"depends_on_id"}   -> 201 deliverable
    DELETE /{id}/dependencies/{depends_on_id}       -> 204

Deliverable fields: title, description, status, due_date, assignee_resource_id.
"blocked" and "overdue" are computed by the deliverable_details view.
Who may change what is decided in common.permissions; every change is
written to the audit log in the same transaction.
"""

from psycopg import errors

from common import audit, db
from common.auth import linked_resource_id, require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_bool, parse_id
from common.permissions import can_delete_deliverables, can_edit_deliverables
from common.validation import Validator

STATUSES = ("not_started", "in_progress", "done", "cancelled")


def validate_deliverable(data: dict, *, creating: bool) -> dict:
    """
    Validate the editable deliverable fields (and project_id when creating).

    Raises:
        ApiError: 400 with a message per invalid field.
    """
    validator = Validator(data)
    if creating:
        validator.integer("project_id", required=True)
    validator.string("title", required=True, max_length=200)
    validator.string("description", max_length=2000)
    validator.choice("status", STATUSES, default="not_started")
    validator.date("due_date")
    assignee = validator.integer("assignee_resource_id")
    if assignee and not db.fetch_one("SELECT 1 FROM resources WHERE id = %s AND is_active", (assignee,)):
        validator.add_error("assignee_resource_id", "Must be an active resource")
    validator.raise_if_errors()
    return validator.clean


def load_project(project_id: int, *, missing_status: int = 404) -> dict:
    """Load the project row used for permission checks (owner_id, team_lead_id)."""
    project = db.fetch_one("SELECT id, owner_id, team_lead_id FROM projects WHERE id = %s", (project_id,))
    if not project:
        if missing_status == 400:
            raise ApiError(400, "validation_error", "Some fields are invalid", {"project_id": "Project not found"})
        raise ApiError(404, "not_found", "Project not found")
    return project


def find_deliverable(deliverable_id: int) -> dict:
    """Load one deliverable (with computed flags) or raise 404."""
    row = db.fetch_one("SELECT * FROM deliverable_details WHERE id = %s", (deliverable_id,))
    if not row:
        raise ApiError(404, "not_found", "Deliverable not found")
    return row


def with_dependencies(deliverable: dict) -> dict:
    """Add the deliverable's predecessors (it depends on) and successors (depend on it)."""
    predecessors = db.fetch_all(
        "SELECT id, title, status, due_date, is_blocked, is_overdue FROM deliverable_details WHERE id IN "
        "(SELECT depends_on_id FROM deliverable_dependencies WHERE deliverable_id = %s) ORDER BY title",
        (deliverable["id"],),
    )
    successors = db.fetch_all(
        "SELECT id, title, status, due_date, is_blocked, is_overdue FROM deliverable_details WHERE id IN "
        "(SELECT deliverable_id FROM deliverable_dependencies WHERE depends_on_id = %s) ORDER BY title",
        (deliverable["id"],),
    )
    return {**deliverable, "predecessors": predecessors, "successors": successors}


def require_edit(request: Request, project: dict) -> None:
    """403 unless the user may create/edit deliverables in this project."""
    if not can_edit_deliverables(request.user, project):
        raise ApiError(403, "forbidden", "You cannot change deliverables in this project")


def assignee_filter(request: Request) -> int | None:
    """The ?assignee= filter: a resource id, or "me" (resolved from the token; no linked person matches nothing)."""
    raw = request.query.get("assignee")
    if not raw:
        return None
    if raw == "me":
        return linked_resource_id(request.user) or 0   # 0 matches no deliverable
    return parse_id(raw, "Assignee id")


@require_auth
def list_deliverables(request: Request) -> dict:
    """List deliverables, filtered by project, status, blocked, overdue, due date and text."""
    query = request.query
    filters = Validator({"due_before": query.get("due_before")})
    due_before = filters.date("due_before")
    status = query.get("status") or None
    if status and status not in STATUSES:
        filters.add_error("status", f"Must be one of: {', '.join(STATUSES)}")
    if filters.errors:
        raise ApiError(400, "validation_error", "Invalid filter", filters.errors)
    project_id = parse_id(query["project_id"], "Project id") if query.get("project_id") else None
    text = (query.get("q") or "").strip()

    # One fixed query: a NULL parameter switches its filter off
    items = db.fetch_all(
        """
        SELECT * FROM deliverable_details
        WHERE (%(project_id)s::bigint IS NULL OR project_id = %(project_id)s)
          AND (%(status)s::deliverable_status IS NULL OR status = %(status)s::deliverable_status)
          AND (%(blocked)s::boolean IS NULL OR is_blocked = %(blocked)s)
          AND (%(overdue)s::boolean IS NULL OR is_overdue = %(overdue)s)
          AND (%(due_before)s::date IS NULL OR due_date < %(due_before)s)
          AND (%(due_soon)s::boolean IS NULL OR (status NOT IN ('done', 'cancelled')
               AND due_date BETWEEN current_date AND current_date + 7) = %(due_soon)s)
          AND (%(assignee)s::bigint IS NULL OR assignee_resource_id = %(assignee)s)
          AND (%(search)s::text IS NULL OR title ILIKE %(search)s OR description ILIKE %(search)s)
        ORDER BY due_date NULLS LAST, id
        """,
        {
            "project_id": project_id,
            "status": status,
            "blocked": parse_bool("blocked", query.get("blocked")),
            "overdue": parse_bool("overdue", query.get("overdue")),
            "due_before": due_before,
            "due_soon": parse_bool("due_soon", query.get("due_soon")),
            "assignee": assignee_filter(request),
            "search": db.like_pattern(text) if text else None,
        },
    )
    return json_response(200, {"items": items})


@require_auth
def get_deliverable(_request: Request, deliverable_id: str) -> dict:
    """Return one deliverable with its predecessors and successors."""
    return json_response(200, with_dependencies(find_deliverable(parse_id(deliverable_id, "Deliverable id"))))


@require_auth
def create_deliverable(request: Request) -> dict:
    """Create a deliverable in a project."""
    data = validate_deliverable(request.json(), creating=True)
    project = load_project(data["project_id"], missing_status=400)
    require_edit(request, project)
    with db.transaction():
        row = db.fetch_one(
            """
            INSERT INTO deliverables (project_id, title, description, status, due_date, assignee_resource_id,
                                      completed_at, created_by)
            VALUES (%(project_id)s, %(title)s, %(description)s, %(status)s::deliverable_status, %(due_date)s,
                    %(assignee_resource_id)s, CASE WHEN %(status)s::deliverable_status = 'done' THEN now() END,
                    %(created_by)s)
            RETURNING *
            """,
            {**data, "created_by": request.user.id},
        )
        audit.record(request.user, "create", "deliverable", row["id"], project_id=row["project_id"], new=row,
                     summary=f"Created deliverable {row['title']}")
    return json_response(201, with_dependencies(find_deliverable(row["id"])))


@require_auth
def update_deliverable(request: Request, deliverable_id: str) -> dict:
    """Replace a deliverable's editable fields (it stays in its project)."""
    deliverable = find_deliverable(parse_id(deliverable_id, "Deliverable id"))
    require_edit(request, load_project(deliverable["project_id"]))
    data = validate_deliverable(request.json(), creating=False)
    with db.transaction():
        before = db.fetch_one("SELECT * FROM deliverables WHERE id = %s", (deliverable["id"],))
        after = db.fetch_one(
            """
            UPDATE deliverables
            SET title = %(title)s, description = %(description)s, status = %(status)s::deliverable_status,
                due_date = %(due_date)s, assignee_resource_id = %(assignee_resource_id)s,
                completed_at = CASE WHEN %(status)s::deliverable_status = 'done'
                                    THEN COALESCE(completed_at, now()) END,
                updated_at = now()
            WHERE id = %(id)s
            RETURNING *
            """,
            {**data, "id": deliverable["id"]},
        )
        audit.record(request.user, "update", "deliverable", deliverable["id"], project_id=deliverable["project_id"],
                     old=before, new=after, summary=f"Updated deliverable {after['title']}")
    return json_response(200, with_dependencies(find_deliverable(deliverable["id"])))


@require_auth
def delete_deliverable(request: Request, deliverable_id: str) -> dict:
    """Delete a deliverable (its dependency links go with it)."""
    deliverable = find_deliverable(parse_id(deliverable_id, "Deliverable id"))
    if not can_delete_deliverables(request.user, load_project(deliverable["project_id"])):
        raise ApiError(403, "forbidden", "Only an admin or the project's manager can delete deliverables")
    with db.transaction():
        old = db.fetch_one("DELETE FROM deliverables WHERE id = %s RETURNING *", (deliverable["id"],))
        audit.record(request.user, "delete", "deliverable", deliverable["id"], project_id=deliverable["project_id"],
                     old=old,
                     details={"dependency_links": deliverable["predecessor_count"] + deliverable["successor_count"]},
                     summary=f"Deleted deliverable {deliverable['title']}")
    return json_response(204)


@require_auth
def list_dependencies(_request: Request, deliverable_id: str) -> dict:
    """List what a deliverable depends on."""
    deliverable = with_dependencies(find_deliverable(parse_id(deliverable_id, "Deliverable id")))
    return json_response(200, {"items": deliverable["predecessors"]})


def find_cycle(deliverable_id: int, depends_on_id: int) -> list[int] | None:
    """
    Return the chain that adding "deliverable_id depends on depends_on_id" would close, or None.

    Walks everything depends_on_id already (transitively) depends on; if that
    reaches deliverable_id, the new link would create a cycle.
    """
    row = db.fetch_one(
        """
        WITH RECURSIVE chain (id, path) AS (
            SELECT depends_on_id, ARRAY[deliverable_id, depends_on_id]
            FROM deliverable_dependencies WHERE deliverable_id = %(start)s
          UNION ALL
            SELECT dep.depends_on_id, chain.path || dep.depends_on_id
            FROM deliverable_dependencies dep
            JOIN chain ON dep.deliverable_id = chain.id
            WHERE NOT dep.depends_on_id = ANY (chain.path)
        )
        SELECT path FROM chain WHERE id = %(target)s LIMIT 1
        """,
        {"start": depends_on_id, "target": deliverable_id},
    )
    return [deliverable_id, *row["path"]] if row else None


@require_auth
def add_dependency(request: Request, deliverable_id: str) -> dict:
    """Record that a deliverable depends on another one in the same project."""
    deliverable = find_deliverable(parse_id(deliverable_id, "Deliverable id"))
    require_edit(request, load_project(deliverable["project_id"]))
    validator = Validator(request.json())
    depends_on_id = validator.integer("depends_on_id", required=True)
    validator.raise_if_errors()
    if depends_on_id == deliverable["id"]:
        raise ApiError(400, "validation_error", "Some fields are invalid",
                       {"depends_on_id": "A deliverable cannot depend on itself"})

    try:
        with db.transaction():
            # Lock the project so two concurrent edits cannot each add half of a cycle
            db.fetch_one("SELECT id FROM projects WHERE id = %s FOR UPDATE", (deliverable["project_id"],))
            other = db.fetch_one("SELECT id, project_id FROM deliverables WHERE id = %s", (depends_on_id,))
            if not other or other["project_id"] != deliverable["project_id"]:
                raise ApiError(400, "validation_error", "Some fields are invalid",
                               {"depends_on_id": "Must be a deliverable in the same project"})
            cycle = find_cycle(deliverable["id"], depends_on_id)
            if cycle:
                titles = {row["id"]: row["title"] for row in db.fetch_all(
                    "SELECT id, title FROM deliverables WHERE id = ANY(%s)", (cycle,))}
                raise ApiError(409, "dependency_cycle", "This dependency would create a cycle",
                               {"depends_on_id": " → ".join(titles[i] for i in cycle), "cycle": cycle})
            db.execute("INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id) VALUES (%s, %s)",
                       (deliverable["id"], depends_on_id))
            audit.record(request.user, "create", "dependency", deliverable["id"],
                         project_id=deliverable["project_id"],
                         new={"deliverable_id": deliverable["id"], "depends_on_id": depends_on_id},
                         summary=f"{deliverable['title']} now depends on #{depends_on_id}")
    except errors.UniqueViolation as exc:
        raise ApiError(409, "conflict", "This dependency already exists",
                       {"depends_on_id": "Already a dependency"}) from exc
    return json_response(201, with_dependencies(find_deliverable(deliverable["id"])))


@require_auth
def remove_dependency(request: Request, deliverable_id: str, depends_on_id: str) -> dict:
    """Remove a dependency link."""
    deliverable = find_deliverable(parse_id(deliverable_id, "Deliverable id"))
    require_edit(request, load_project(deliverable["project_id"]))
    other_id = parse_id(depends_on_id, "Dependency id")
    with db.transaction():
        removed = db.execute(
            "DELETE FROM deliverable_dependencies WHERE deliverable_id = %s AND depends_on_id = %s",
            (deliverable["id"], other_id),
        )
        if not removed:
            raise ApiError(404, "not_found", "Dependency not found")
        audit.record(request.user, "delete", "dependency", deliverable["id"], project_id=deliverable["project_id"],
                     old={"deliverable_id": deliverable["id"], "depends_on_id": other_id},
                     summary=f"{deliverable['title']} no longer depends on #{other_id}")
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_deliverables),
    ("POST", "/", create_deliverable),
    ("GET", "/{deliverable_id}", get_deliverable),
    ("PUT", "/{deliverable_id}", update_deliverable),
    ("DELETE", "/{deliverable_id}", delete_deliverable),
    ("GET", "/{deliverable_id}/dependencies", list_dependencies),
    ("POST", "/{deliverable_id}/dependencies", add_dependency),
    ("DELETE", "/{deliverable_id}/dependencies/{depends_on_id}", remove_dependency),
])
