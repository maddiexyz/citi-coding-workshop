"""
Database migrations for the cloud (Aurora), run inside the VPC.

Aurora is not reachable from outside the VPC, so bin/migrate.sh (psql) cannot
run there. This private Lambda does the same job: it applies
``db/migrations/*.sql`` once each, tracked in the same ``schema_migrations``
table, and can seed the first admin user.

It has no Function URL and no CloudFront route; bin/migrate-cloud.sh invokes it
with the AWS CLI after each deploy. Invoking it again is safe.

Event (all optional)::

    {"admin": {"email": "...", "password_hash": "<bcrypt hash>", "full_name": "..."}}

Only a bcrypt hash is accepted, never a password, and the event is not logged.
"""

import logging
import re
from pathlib import Path
from typing import Optional

from common import db

logger = logging.getLogger()
logger.setLevel(logging.INFO)

MIGRATIONS_DIR = Path(__file__).resolve().parent / "db" / "migrations"
BCRYPT_HASH = re.compile(r"^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Any constant works: it only stops two runs from migrating at the same time
LOCK_ID = 7_411_001


def apply_migrations() -> list[str]:
    """Apply each pending migration in its own transaction; return the versions applied."""
    conn = db.get_connection()
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " version TEXT PRIMARY KEY,"
        " applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    )
    if not any(MIGRATIONS_DIR.glob("*.sql")):
        raise RuntimeError(f"No migrations found in {MIGRATIONS_DIR}")
    applied = []
    conn.execute("SELECT pg_advisory_lock(%s)", (LOCK_ID,))
    try:
        done = {row["version"] for row in conn.execute("SELECT version FROM schema_migrations").fetchall()}
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            version = path.stem
            if version in done:
                continue
            logger.info("Applying migration %s", version)
            # The migration and its bookkeeping row commit together, or not at all
            with conn.transaction():
                conn.execute(path.read_text(encoding="utf-8"))
                conn.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
            applied.append(version)
    finally:
        conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
    return applied


def seed_admin(admin: Optional[dict]) -> str:
    """Create the admin user unless one with that email exists. Returns created/exists/skipped."""
    if not admin:
        return "skipped"
    email = str(admin.get("email", "")).strip().lower()
    password_hash = str(admin.get("password_hash", ""))
    full_name = str(admin.get("full_name") or "Administrator").strip()[:200]
    if not EMAIL.match(email):
        raise ValueError("admin.email is not a valid email address")
    if not BCRYPT_HASH.match(password_hash):
        raise ValueError("admin.password_hash must be a bcrypt hash")
    created = db.execute(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES (%s, %s, %s, 'admin')"
        " ON CONFLICT (email) DO NOTHING",
        (email, password_hash, full_name),
    )
    return "created" if created else "exists"


def handler(event, context):  # pylint: disable=unused-argument
    """Apply migrations, then seed the admin if the event asks for it."""
    applied = apply_migrations()
    admin = seed_admin((event or {}).get("admin"))
    logger.info("Migrations applied: %s; admin: %s", applied or "none", admin)
    return {"applied": applied, "admin": admin}
