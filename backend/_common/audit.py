"""
Audit log: who changed what, recorded in the same transaction as the change.

Usage inside a write::

    with db.transaction():
        db.execute("UPDATE ...")
        audit.record(request.user, "update", "deliverable", deliverable_id,
                     project_id=project_id, old=before, new=after)

If either statement fails the whole transaction rolls back, so there is never
a change without its entry or an entry without its change.
"""

import json
from typing import Any, Optional

from psycopg.types.json import Jsonb

from . import db
from .http import json_default

# Bookkeeping columns that change on every write and say nothing to a reader
IGNORED_FIELDS = {"updated_at", "created_at"}


def _jsonb(value: Optional[dict]) -> Optional[Jsonb]:
    """Wrap a dict for a JSONB column, encoding dates and decimals the same way the API does."""
    if value is None:
        return None
    return Jsonb(value, dumps=lambda obj: json.dumps(obj, default=json_default))


def changes(old: dict, new: dict) -> tuple[dict, dict]:
    """Return only the fields whose value changed, as (old values, new values)."""
    keys = [key for key in new if key not in IGNORED_FIELDS and old.get(key) != new.get(key)]
    return {key: old.get(key) for key in keys}, {key: new.get(key) for key in keys}


def _clean(row: Optional[dict]) -> Optional[dict]:
    """Drop bookkeeping fields from a full record."""
    if row is None:
        return None
    return {key: value for key, value in row.items() if key not in IGNORED_FIELDS}


def record(user: Any, action: str, entity_type: str, entity_id: int, *,  # pylint: disable=too-many-arguments
           project_id: Optional[int] = None, old: Optional[dict] = None, new: Optional[dict] = None,
           details: Optional[dict] = None, summary: Optional[str] = None) -> None:
    """
    Write one audit entry (call inside db.transaction()).

    For "update", pass the full old and new records: only changed fields are
    stored, and nothing is written if nothing changed.
    """
    if action == "update" and old is not None and new is not None:
        old, new = changes(old, new)
        if not new:
            return
    else:
        old, new = _clean(old), _clean(new)
    db.execute(
        """
        INSERT INTO audit_log (actor_user_id, actor_name, action, entity_type, entity_id, project_id,
                               summary, old_values, new_values, details)
        VALUES (%(actor)s, (SELECT full_name FROM users WHERE id = %(actor)s), %(action)s, %(entity_type)s,
                %(entity_id)s, %(project_id)s, %(summary)s, %(old)s, %(new)s, %(details)s)
        """,
        {
            "actor": user.id, "action": action, "entity_type": entity_type, "entity_id": entity_id,
            "project_id": project_id, "summary": summary,
            "old": _jsonb(old), "new": _jsonb(new), "details": _jsonb(details),
        },
    )
