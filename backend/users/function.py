"""
Users service.

Routes (served at /api/users; every route needs a Bearer token):
    GET /   ?role&active&q -> {"items": [...]}   admin and project managers (pickers)

Increment D adds user management (create, update, deactivate) for admins.
"""

from common import db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_bool
from common.permissions import ADMIN, PROJECT_MANAGER, ROLES


@require_auth
def list_users(request: Request) -> dict:
    """List users (no password hashes), e.g. ?role=team_lead&active=true for a picker."""
    if request.user.role not in (ADMIN, PROJECT_MANAGER):
        raise ApiError(403, "forbidden", "Your role cannot list users")
    role = request.query.get("role") or None
    active = parse_bool("active", request.query.get("active"))
    if role and role not in ROLES:
        raise ApiError(400, "validation_error", "Invalid filter", {"role": f"Must be one of: {', '.join(ROLES)}"})
    text = (request.query.get("q") or "").strip()
    items = db.fetch_all(
        """
        SELECT id, email, full_name, role, is_active FROM users
        WHERE (%(role)s::user_role IS NULL OR role = %(role)s::user_role)
          AND (%(active)s::boolean IS NULL OR is_active = %(active)s)
          AND (%(search)s::text IS NULL OR full_name ILIKE %(search)s OR email ILIKE %(search)s)
        ORDER BY full_name, id
        """,
        {"role": role, "active": active, "search": db.like_pattern(text) if text else None},
    )
    return json_response(200, {"items": items})


handler = make_handler([
    ("GET", "/", list_users),
])
