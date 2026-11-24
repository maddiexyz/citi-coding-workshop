"""
JWT access tokens and the ``require_auth`` decorator.

Tokens are signed with HS256 using the JWT_SECRET environment variable and
carry two claims the backend relies on: ``sub`` (user id) and ``role``.
"""

import functools
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable

import jwt

from . import db
from .http import ApiError, Request

ALGORITHM = "HS256"
# Short-lived: a refresh token (common.sessions) renews it without signing in again
TOKEN_TTL_MINUTES = int(os.getenv("JWT_TTL_MINUTES", "15"))


@dataclass(frozen=True)
class CurrentUser:
    """The authenticated caller, taken from a verified token."""

    id: int
    role: str


def _secret() -> str:
    """Return the signing secret; fail loudly if the deployment forgot it."""
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    return secret


def create_token(user_id: int, role: str) -> str:
    """
    Issue a signed, short-lived access token.

    Args:
        user_id: The user's database id (stored as the ``sub`` claim).
        role: The user's role (stored as the ``role`` claim).

    Returns:
        The encoded JWT.
    """
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(user_id),
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=TOKEN_TTL_MINUTES),
    }
    return jwt.encode(claims, _secret(), algorithm=ALGORITHM)


def decode_token(token: str) -> CurrentUser:
    """
    Verify a token's signature and expiry and return the user it identifies.

    Raises:
        ApiError: 401 if the token is expired, tampered with or malformed.
    """
    try:
        claims = jwt.decode(token, _secret(), algorithms=[ALGORITHM],
                            options={"require": ["exp", "sub", "role"]})
        return CurrentUser(id=int(claims["sub"]), role=str(claims["role"]))
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "token_expired", "Your session has expired, please sign in again") from exc
    except (jwt.InvalidTokenError, ValueError) as exc:
        raise ApiError(401, "invalid_token", "Invalid authentication token") from exc


def authenticate(request: Request) -> CurrentUser:
    """
    Read and verify the ``Authorization: Bearer <token>`` header.

    The user is re-read from the database on every request, so a deleted or
    deactivated account is refused at once and role changes apply immediately
    (the role in the token is not trusted on its own).

    Raises:
        ApiError: 401 if the header is missing, the token is invalid, or the
            account no longer exists or is inactive.
    """
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "unauthorized", "Authentication required")
    claims = decode_token(token.strip())
    row = db.fetch_one("SELECT id, role FROM users WHERE id = %s AND is_active", (claims.id,))
    if not row:
        raise ApiError(401, "account_inactive", "This account no longer exists or is inactive")
    return CurrentUser(id=row["id"], role=str(row["role"]))


def require_auth(func: Callable[..., dict]) -> Callable[..., dict]:
    """
    Decorate a route function so it only runs for authenticated callers.

    The verified user is available to the route as ``request.user``.
    """

    @functools.wraps(func)
    def wrapper(request: Request, **params: str) -> dict:
        request.user = authenticate(request)
        return func(request, **params)

    return wrapper


def linked_resource_id(user: CurrentUser) -> int | None:
    """The id of the person (resource) linked to this account, or None."""
    row = db.fetch_one("SELECT id FROM resources WHERE user_id = %s", (user.id,))
    return row["id"] if row else None


def me_filter(name: str, raw: str | None) -> bool:
    """
    Read a "<name>=me" filter. Only the literal "me" is accepted: who "me" is
    comes from the verified token, never from the request.

    Returns:
        True if the filter is set.

    Raises:
        ApiError: 400 for any other value.
    """
    if raw in (None, ""):
        return False
    if raw == "me":
        return True
    raise ApiError(400, "validation_error", "Invalid filter", {name: 'Only "me" is supported'})
