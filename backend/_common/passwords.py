"""
Password hashing with bcrypt.

Hashes produced by PostgreSQL's pgcrypto ``crypt(..., gen_salt('bf'))`` (used
by the admin seed) are standard bcrypt hashes and verify here too.
"""

from functools import lru_cache
from typing import Optional

import bcrypt

BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    """Return a salted bcrypt hash of the password."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(BCRYPT_ROUNDS)).decode("utf-8")


@lru_cache(maxsize=1)
def _dummy_hash() -> bytes:
    """A throwaway hash, so unknown emails take as long to reject as wrong passwords."""
    return bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt(BCRYPT_ROUNDS))


def verify_password(password: str, password_hash: Optional[str]) -> bool:
    """
    Check a password against a stored hash in constant-ish time.

    Args:
        password: The password the user typed.
        password_hash: The stored hash, or None when the user does not exist.

    Returns:
        True only if the hash exists and matches.
    """
    stored = password_hash.encode("utf-8") if password_hash else _dummy_hash()
    try:
        matches = bcrypt.checkpw(password.encode("utf-8"), stored)
    except ValueError:
        # bcrypt rejects passwords longer than 72 bytes and malformed hashes
        return False
    return matches and password_hash is not None


# One strength rule for every password a person sets (admin reset, own change)
MIN_PASSWORD_LENGTH = 10


def check_new_password(validator, field: str = "password"):
    """Validate a new password field on a Validator: required, 10 to 200 characters. Returns it."""
    password = validator.string(field, required=True, max_length=200, strip=False)
    if password and len(password) < MIN_PASSWORD_LENGTH:
        validator.add_error(field, f"Must be at least {MIN_PASSWORD_LENGTH} characters")
    return password
