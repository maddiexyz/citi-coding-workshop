"""
Auth service: sign in and look up the signed-in user.

Routes (served at /api/auth):
    POST /login  {"email", "password"} -> {"token", "expires_in", "user"}
    GET  /me     (Bearer token)        -> {"user"}
"""

from common import db
from common.auth import TOKEN_TTL_MINUTES, create_token, require_auth
from common.http import ApiError, Request, json_response, make_handler
from common.passwords import verify_password
from common.validation import Validator

INVALID_CREDENTIALS = ApiError(401, "invalid_credentials", "Invalid email or password")


def public_user(row: dict) -> dict:
    """Return the user fields that are safe to send to the client."""
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
    }


def login(request: Request) -> dict:
    """Check email and password and return a signed access token."""
    validator = Validator(request.json())
    email = validator.string("email", required=True, max_length=254, transform=str.lower)
    password = validator.string("password", required=True, max_length=200, strip=False)
    validator.raise_if_errors()

    user = db.fetch_one(
        "SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = %s",
        (email,),
    )
    # Same error for unknown email, inactive user and wrong password,
    # so the response never reveals which accounts exist
    password_ok = verify_password(password, user["password_hash"] if user else None)
    if not user or not user["is_active"] or not password_ok:
        raise INVALID_CREDENTIALS

    return json_response(200, {
        "token": create_token(user["id"], user["role"]),
        "token_type": "Bearer",  # nosec B105 - token type name, not a password
        "expires_in": TOKEN_TTL_MINUTES * 60,
        "user": public_user(user),
    })


@require_auth
def me(request: Request) -> dict:
    """Return the current user, re-read from the database."""
    user = db.fetch_one(
        "SELECT id, email, full_name, role FROM users WHERE id = %s AND is_active",
        (request.user.id,),
    )
    if not user:
        raise ApiError(401, "unauthorized", "This account no longer exists or is inactive")
    return json_response(200, {"user": public_user(user)})


handler = make_handler([
    ("POST", "/login", login),
    ("GET", "/me", me),
])
