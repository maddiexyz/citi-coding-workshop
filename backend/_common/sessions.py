"""
Refresh tokens: long-lived sessions kept in an HttpOnly cookie.

The browser holds a random token in the ``acme_refresh`` cookie
(HttpOnly, Secure, SameSite=Strict, Path=/api/auth), so page scripts can't
read it and other sites can't send it. Only its SHA-256 hash is stored.
Every use rotates it: the old token is revoked and a new one issued.
"""

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from . import db
from .http import ApiError

COOKIE_NAME = "acme_refresh"
COOKIE_PATH = "/api/auth"
REFRESH_TTL_HOURS = int(os.getenv("REFRESH_TTL_HOURS", "12"))


def _hash(token: str) -> str:
    """SHA-256 of a token (hex). Tokens are random, so no salt is needed."""
    return hashlib.sha256(token.encode()).hexdigest()


def cookie(token: str, max_age: int) -> str:
    """A Set-Cookie value for the refresh token (max_age 0 deletes it)."""
    return (f"{COOKIE_NAME}={token}; Path={COOKIE_PATH}; Max-Age={max_age}; "
            "HttpOnly; Secure; SameSite=Strict")


def clear_cookie() -> str:
    """A Set-Cookie value that removes the refresh cookie."""
    return cookie("", 0)


def issue(user_id: int, previous_id: Optional[int] = None) -> str:
    """
    Create a refresh token for a user and return the Set-Cookie value.

    With previous_id (inside a transaction), the previous token is revoked and
    linked to the new one.
    """
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(hours=REFRESH_TTL_HOURS)
    row = db.fetch_one(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (%s, %s, %s) RETURNING id",
        (user_id, _hash(token), expires),
    )
    if previous_id:
        db.execute("UPDATE refresh_tokens SET revoked_at = now(), replaced_by = %s WHERE id = %s",
                   (row["id"], previous_id))
    return cookie(token, REFRESH_TTL_HOURS * 3600)


def rotate(token: Optional[str]) -> tuple[dict, str]:
    """
    Exchange a valid refresh token for a new one.

    The user is re-read from the database, so a deactivated account is refused
    and the current role is used.

    Returns:
        (user row, Set-Cookie value for the new token)

    Raises:
        ApiError: 401 (and clears the cookie) if the token is missing, unknown,
            revoked or expired, or the account is inactive.
    """
    refused = ApiError(401, "session_expired", "Your session has expired, please sign in again",
                       cookies=[clear_cookie()])
    if not token:
        raise refused
    with db.transaction():
        # FOR UPDATE: two tabs refreshing at once can't both use the same token
        row = db.fetch_one(
            """
            SELECT t.id, u.id AS user_id, u.email, u.full_name, u.role, u.is_active
            FROM refresh_tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = %s AND t.revoked_at IS NULL AND t.expires_at > now()
            FOR UPDATE OF t
            """,
            (_hash(token),),
        )
        if not row:
            raise refused
        if not row["is_active"]:
            db.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE id = %s", (row["id"],))
            raise refused
        new_cookie = issue(row["user_id"], previous_id=row["id"])
    return row, new_cookie


def revoke(token: Optional[str]) -> None:
    """Revoke one refresh token (sign-out). Unknown tokens are ignored."""
    if token:
        db.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = %s AND revoked_at IS NULL",
                   (_hash(token),))


def revoke_all(user_id: int) -> None:
    """Revoke every refresh token of a user (deactivation, role change, password reset)."""
    db.execute("UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = %s AND revoked_at IS NULL",
               (user_id,))


def revoke_others(user_id: int, keep_token: Optional[str]) -> None:
    """Revoke every refresh token of a user except the one in keep_token (the current session)."""
    db.execute(
        "UPDATE refresh_tokens SET revoked_at = now()"
        " WHERE user_id = %s AND revoked_at IS NULL AND token_hash <> %s",
        (user_id, _hash(keep_token) if keep_token else ""),
    )
