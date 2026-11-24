"""
Users service: sign-in accounts and their roles.

Routes (served at /api/users; every route needs a Bearer token):
    GET    /                ?role&active&q -> {"items": [...]}  admin; project managers (for pickers)
    GET    /{id}                           -> user              admin
    POST   /                user fields + password -> 201 user  admin
    PUT    /{id}            user fields    -> user              admin
    PUT    /{id}/password   {"password"}   -> 204               admin (password reset)
    DELETE /{id}                           -> 204               admin

User fields: email, full_name, role, is_active. Password hashes are never
returned or written to the audit log.

Safety rules: an admin can't change their own role, deactivate or delete
themselves, and the last active admin can't be demoted, deactivated or
deleted. A user who still owns projects can't be deleted (409: reassign or
deactivate). Deactivating, changing the role or resetting the password
revokes the user's refresh tokens; access tokens are re-checked against the
database on every request anyway.
"""

from psycopg import errors

from common import audit, db, sessions
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_bool, parse_id
from common.passwords import check_new_password, hash_password
from common.permissions import ADMIN, PROJECT_MANAGER, ROLES
from common.validation import Validator

EMAIL_PATTERN = r"[^@\s]+@[^@\s]+\.[^@\s]+"


def require_admin(request: Request) -> None:
    """403 unless the user is an admin."""
    if request.user.role != ADMIN:
        raise ApiError(403, "forbidden", "Only an admin can manage users")


def validate_password(validator: Validator) -> None:
    """Check the password field with the shared strength rule."""
    check_new_password(validator, "password")


def validate_user(data: dict, *, creating: bool) -> dict:
    """
    Validate user fields (and the password when creating).

    Raises:
        ApiError: 400 with a message per invalid field.
    """
    validator = Validator(data)
    validator.string("email", required=True, max_length=254, transform=str.lower, pattern=EMAIL_PATTERN,
                     pattern_message="Must be an email address")
    validator.string("full_name", required=True, max_length=200)
    validator.choice("role", ROLES, default="viewer")
    validator.boolean("is_active", default=True)
    if creating:
        validate_password(validator)
    validator.raise_if_errors()
    return validator.clean


def find_user(user_id: int) -> dict:
    """Load one user (without the password hash) or raise 404."""
    row = db.fetch_one("SELECT id, email, full_name, role, is_active, created_at FROM users WHERE id = %s",
                       (user_id,))
    if not row:
        raise ApiError(404, "not_found", "User not found")
    return row


def other_active_admins(user_id: int) -> int:
    """How many active admins there are besides this user."""
    return db.fetch_one(
        "SELECT count(*) AS n FROM users WHERE role = 'admin' AND is_active AND id <> %s", (user_id,))["n"]


def duplicate_email() -> ApiError:
    """The 409 for an email that is already in use."""
    return ApiError(409, "conflict", "A user with this email already exists", {"email": "Email already in use"})


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
        SELECT id, email, full_name, role, is_active, created_at FROM users
        WHERE (%(role)s::user_role IS NULL OR role = %(role)s::user_role)
          AND (%(active)s::boolean IS NULL OR is_active = %(active)s)
          AND (%(search)s::text IS NULL OR full_name ILIKE %(search)s OR email ILIKE %(search)s)
        ORDER BY full_name, id
        """,
        {"role": role, "active": active, "search": db.like_pattern(text) if text else None},
    )
    return json_response(200, {"items": items})


@require_auth
def get_user(request: Request, user_id: str) -> dict:
    """Return one user."""
    require_admin(request)
    return json_response(200, find_user(parse_id(user_id, "User id")))


@require_auth
def create_user(request: Request) -> dict:
    """Create a user with an initial password."""
    require_admin(request)
    body = request.json()
    data = validate_user(body, creating=True)
    password_hash = hash_password(body["password"])
    try:
        with db.transaction():
            row = db.fetch_one(
                """
                INSERT INTO users (email, full_name, role, is_active, password_hash)
                VALUES (%(email)s, %(full_name)s, %(role)s, %(is_active)s, %(password_hash)s)
                RETURNING id, email, full_name, role, is_active, created_at
                """,
                {**data, "password_hash": password_hash},
            )
            audit.record(request.user, "create", "user", row["id"], new=row,
                         summary=f"Created user {row['email']} ({row['role']})")
    except errors.UniqueViolation as exc:
        raise duplicate_email() from exc
    return json_response(201, row)


@require_auth
def update_user(request: Request, user_id: str) -> dict:
    """Change a user's email, name, role or active flag."""
    require_admin(request)
    user = find_user(parse_id(user_id, "User id"))
    data = validate_user(request.json(), creating=False)
    demoted = user["role"] == ADMIN and data["role"] != ADMIN
    deactivated = user["is_active"] and not data["is_active"]
    if user["id"] == request.user.id and (demoted or deactivated):
        raise ApiError(400, "validation_error", "You can't remove your own admin access",
                       {"role" if demoted else "is_active": "You can't change this for your own account"})
    try:
        with db.transaction():
            if (demoted or deactivated) and user["role"] == ADMIN and other_active_admins(user["id"]) == 0:
                raise ApiError(409, "conflict", "This is the last active admin",
                               {"role" if demoted else "is_active": "Keep at least one active admin"})
            after = db.fetch_one(
                """
                UPDATE users SET email = %(email)s, full_name = %(full_name)s, role = %(role)s,
                                 is_active = %(is_active)s
                WHERE id = %(id)s
                RETURNING id, email, full_name, role, is_active, created_at
                """,
                {**data, "id": user["id"]},
            )
            if after["role"] != user["role"] or deactivated:
                sessions.revoke_all(user["id"])
            audit.record(request.user, "update", "user", user["id"], old=user, new=after,
                         summary=f"Updated user {after['email']}")
    except errors.UniqueViolation as exc:
        raise duplicate_email() from exc
    return json_response(200, after)


@require_auth
def reset_password(request: Request, user_id: str) -> dict:
    """Set a new password and sign the user out everywhere."""
    require_admin(request)
    user = find_user(parse_id(user_id, "User id"))
    validator = Validator(request.json())
    validate_password(validator)
    validator.raise_if_errors()
    password_hash = hash_password(validator.clean["password"])
    with db.transaction():
        db.execute("UPDATE users SET password_hash = %s WHERE id = %s", (password_hash, user["id"]))
        sessions.revoke_all(user["id"])
        audit.record(request.user, "update", "user", user["id"], details={"change": "reset_password"},
                     summary=f"Reset the password of {user['email']}")
    return json_response(204)


@require_auth
def delete_user(request: Request, user_id: str) -> dict:
    """Delete a user who owns no projects."""
    require_admin(request)
    user = find_user(parse_id(user_id, "User id"))
    if user["id"] == request.user.id:
        raise ApiError(400, "validation_error", "You can't delete your own account")
    try:
        with db.transaction():
            if user["role"] == ADMIN and user["is_active"] and other_active_admins(user["id"]) == 0:
                raise ApiError(409, "conflict", "This is the last active admin")
            db.execute("DELETE FROM users WHERE id = %s", (user["id"],))
            audit.record(request.user, "delete", "user", user["id"], old=user,
                         summary=f"Deleted user {user['email']}")
    except (errors.ForeignKeyViolation, errors.RestrictViolation) as exc:
        raise ApiError(409, "conflict", "This user still owns projects: reassign them or deactivate the user",
                       {"projects": "Reassign their projects or set the user inactive"}) from exc
    return json_response(204)


handler = make_handler([
    ("GET", "/", list_users),
    ("POST", "/", create_user),
    ("GET", "/{user_id}", get_user),
    ("PUT", "/{user_id}", update_user),
    ("DELETE", "/{user_id}", delete_user),
    ("PUT", "/{user_id}/password", reset_password),
])
