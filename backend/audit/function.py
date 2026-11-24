"""
Audit service: the history of changes made through the API.

Routes (served at /api/audit; every route needs a Bearer token):
    GET / ?project_id&entity_type&entity_id&actor&from&to&limit -> {"items": [...]}

Admins can read everything. A project manager can read the history of a
project they own (project_id is then required). Newest first; limit
defaults to 100 (max 500).
"""

from common import db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_id
from common.permissions import ADMIN, can_read_project_audit
from common.validation import Validator

ENTITY_TYPES = ("project", "deliverable", "dependency", "resource", "allocation", "budget_entry", "user",
                "department")
DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def parse_filters(query: dict) -> dict:
    """Validate the optional filters."""
    validator = Validator({"from": query.get("from"), "to": query.get("to")})
    first, last = validator.date("from"), validator.date("to")
    entity_type = query.get("entity_type") or None
    if entity_type and entity_type not in ENTITY_TYPES:
        validator.add_error("entity_type", f"Must be one of: {', '.join(ENTITY_TYPES)}")
    limit = DEFAULT_LIMIT
    if query.get("limit"):
        limit = parse_id(query["limit"], "Limit")
        if limit > MAX_LIMIT:
            validator.add_error("limit", f"Must be at most {MAX_LIMIT}")
    if validator.errors:
        raise ApiError(400, "validation_error", "Invalid filter", validator.errors)
    return {
        "project_id": parse_id(query["project_id"], "Project id") if query.get("project_id") else None,
        "entity_type": entity_type,
        "entity_id": parse_id(query["entity_id"], "Entity id") if query.get("entity_id") else None,
        "actor": parse_id(query["actor"], "Actor id") if query.get("actor") else None,
        "first": first,
        "last": last,
        "limit": limit,
    }


@require_auth
def list_audit(request: Request) -> dict:
    """List audit entries, newest first."""
    filters = parse_filters(request.query)
    if request.user.role != ADMIN:
        project = None
        if filters["project_id"]:
            project = db.fetch_one("SELECT id, owner_id FROM projects WHERE id = %s", (filters["project_id"],))
        if not project or not can_read_project_audit(request.user, project):
            raise ApiError(403, "forbidden", "You can only see the history of projects you manage")
    items = db.fetch_all(
        """
        SELECT * FROM audit_log
        WHERE (%(project_id)s::bigint IS NULL OR project_id = %(project_id)s)
          AND (%(entity_type)s::text IS NULL OR entity_type = %(entity_type)s)
          AND (%(entity_id)s::bigint IS NULL OR entity_id = %(entity_id)s)
          AND (%(actor)s::bigint IS NULL OR actor_user_id = %(actor)s)
          AND (%(first)s::date IS NULL OR occurred_at >= %(first)s)
          AND (%(last)s::date IS NULL OR occurred_at < %(last)s::date + 1)
        ORDER BY occurred_at DESC, id DESC
        LIMIT %(limit)s
        """,
        filters,
    )
    return json_response(200, {"items": items})


handler = make_handler([
    ("GET", "/", list_audit),
])
