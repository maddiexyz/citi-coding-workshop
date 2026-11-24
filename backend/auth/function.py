"""
Auth service: sign in, stay signed in, sign out, and look up the signed-in user.

Routes (served at /api/auth):
    POST /login    {"email", "password"} -> {"token", "expires_in", "user"} + refresh cookie
    POST /refresh  (refresh cookie)      -> {"token", "expires_in", "user"} + new refresh cookie
    POST /logout   (refresh cookie)      -> 204, cookie cleared
    GET  /me       (Bearer token)        -> {"user"}
    POST /password {"current_password", "new_password"} (Bearer token) -> 204
                   wrong current password: 400 on current_password, rate limited like sign-in;
                   on success every other session (refresh token) is revoked, this one is kept

"user" is {id, email, full_name, role, resource_id}: resource_id is the
person (resource) linked to this account, or null.

The access token (JWT, 15 minutes) goes in the Authorization header; the
refresh token lives in an HttpOnly cookie (see common.sessions).

Sign-in is rate limited: after 5 failed attempts for an email, or 20 from
one IP, within 15 minutes, further attempts get 429 with Retry-After.
"""

import logging
import math

from common import audit, db, sessions
from common.auth import TOKEN_TTL_MINUTES, create_token, require_auth
from common.http import ApiError, Request, json_response, make_handler
from common.passwords import check_new_password, hash_password, verify_password
from common.validation import Validator

logger = logging.getLogger()

INVALID_CREDENTIALS = ApiError(401, "invalid_credentials", "Invalid email or password")
WRONG_CURRENT = "Incorrect password"
WINDOW_MINUTES = 15
MAX_FAILURES_PER_EMAIL = 5
MAX_FAILURES_PER_IP = 20


def public_user(row: dict) -> dict:
    """Return the user fields that are safe to send to the client, with the linked resource."""
    resource = db.fetch_one("SELECT id FROM resources WHERE user_id = %s", (row["id"],))
    return {
        "id": row["id"],
        "email": row["email"],
        "full_name": row["full_name"],
        "role": row["role"],
        "resource_id": resource["id"] if resource else None,
    }


def session_response(user: dict, cookie: str) -> dict:
    """The access token and user, with the refresh cookie."""
    return json_response(200, {
        "token": create_token(user["id"], user["role"]),
        "token_type": "Bearer",  # nosec B105 - token type name, not a password
        "expires_in": TOKEN_TTL_MINUTES * 60,
        "user": public_user(user),
    }, cookies=[cookie])


def check_rate_limit(email: str, ip: str | None) -> None:
    """
    Refuse the attempt (429) if this email or IP has failed too often recently.

    Retry-After says when the oldest failure in the window expires.
    """
    row = db.fetch_one(
        """
        SELECT
            count(*) FILTER (WHERE email_lower = %(email)s) AS email_failures,
            min(attempted_at) FILTER (WHERE email_lower = %(email)s) AS email_oldest,
            count(*) FILTER (WHERE ip = %(ip)s) AS ip_failures,
            min(attempted_at) FILTER (WHERE ip = %(ip)s) AS ip_oldest
        FROM login_attempts
        WHERE NOT succeeded
          AND attempted_at > now() - make_interval(mins => %(window)s)
          AND (email_lower = %(email)s OR ip = %(ip)s)
        """,
        {"email": email, "ip": ip, "window": WINDOW_MINUTES},
    )
    oldest = None
    if row["email_failures"] >= MAX_FAILURES_PER_EMAIL:
        oldest = row["email_oldest"]
    elif ip and row["ip_failures"] >= MAX_FAILURES_PER_IP:
        oldest = row["ip_oldest"]
    if oldest is None:
        return
    wait = db.fetch_one("SELECT extract(epoch FROM %s + make_interval(mins => %s) - now()) AS seconds",
                        (oldest, WINDOW_MINUTES))["seconds"]
    seconds = max(1, math.ceil(wait))
    minutes = math.ceil(seconds / 60)
    raise ApiError(429, "rate_limited",
                   f"Too many failed sign-in attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
                   {"retry_after": seconds}, headers={"Retry-After": str(seconds)})


def record_attempt(email: str, ip: str | None, succeeded: bool) -> None:
    """Remember a sign-in attempt and drop attempts older than a day."""
    db.execute("INSERT INTO login_attempts (email_lower, ip, succeeded) VALUES (%s, %s, %s)", (email, ip, succeeded))
    db.execute("DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'")


def login(request: Request) -> dict:
    """Check email and password; return an access token and set the refresh cookie."""
    validator = Validator(request.json())
    email = validator.string("email", required=True, max_length=254, transform=str.lower)
    password = validator.string("password", required=True, max_length=200, strip=False)
    validator.raise_if_errors()

    check_rate_limit(email, request.source_ip)
    user = db.fetch_one(
        "SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = %s",
        (email,),
    )
    # Same error for unknown email, inactive user and wrong password,
    # so the response never reveals which accounts exist
    password_ok = verify_password(password, user["password_hash"] if user else None)
    succeeded = bool(user and user["is_active"] and password_ok)
    record_attempt(email, request.source_ip, succeeded)
    if not succeeded:
        logger.info("Failed sign-in for a %s account from %s", "known" if user else "unknown", request.source_ip)
        raise INVALID_CREDENTIALS
    return session_response(user, sessions.issue(user["id"]))


def refresh(request: Request) -> dict:
    """Swap the refresh cookie for a new one and a fresh access token."""
    user, cookie = sessions.rotate(request.cookies.get(sessions.COOKIE_NAME))
    return session_response({**user, "id": user["user_id"]}, cookie)


def logout(request: Request) -> dict:
    """Revoke the refresh token and clear the cookie."""
    sessions.revoke(request.cookies.get(sessions.COOKIE_NAME))
    return json_response(204, cookies=[sessions.clear_cookie()])


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


@require_auth
def change_password(request: Request) -> dict:
    """Change the signed-in user's own password; sign out their other sessions."""
    validator = Validator(request.json())
    current = validator.string("current_password", required=True, max_length=200, strip=False)
    new = check_new_password(validator, "new_password")
    if current and new and current == new:
        validator.add_error("new_password", "Must be different from the current password")
    validator.raise_if_errors()

    user = db.fetch_one("SELECT id, email, password_hash FROM users WHERE id = %s", (request.user.id,))
    # Guessing the current password counts towards the same limit as sign-in
    check_rate_limit(user["email"], request.source_ip)
    if not verify_password(current, user["password_hash"]):
        record_attempt(user["email"], request.source_ip, False)
        raise ApiError(400, "validation_error", "Some fields are invalid",
                       {"current_password": WRONG_CURRENT})
    with db.transaction():
        db.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hash_password(new), user["id"]))
        sessions.revoke_others(user["id"], request.cookies.get(sessions.COOKIE_NAME))
        audit.record(request.user, "update", "user", user["id"], details={"change": "own_password"},
                     summary="Changed their own password")
    return json_response(204)


handler = make_handler([
    ("POST", "/login", login),
    ("POST", "/refresh", refresh),
    ("POST", "/logout", logout),
    ("GET", "/me", me),
    ("POST", "/password", change_password),
])
