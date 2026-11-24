"""
PostgreSQL access with one connection reused across Lambda invocations.

All queries take parameters separately from the SQL text (psycopg ``%s`` /
``%(name)s`` placeholders), so user input is never built into a query string.
"""

import os
from contextlib import contextmanager
from datetime import date
from typing import Any, Iterator, Optional

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

# Module-level connection survives between invocations of a warm Lambda container
# Module state, not a constant
_connection: Optional[psycopg.Connection] = None  # pylint: disable=invalid-name


def _connection_info() -> str:
    """Build the connection string from the environment variables Terraform injects."""
    is_local = os.getenv("IS_LOCAL", "false") == "true"
    return make_conninfo(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        dbname=os.getenv("POSTGRES_NAME", "postgres"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASS", ""),
        # Aurora Serverless v2 at 0 capacity takes ~15 s to resume on first connect
        connect_timeout=30,
        # AWS Aurora requires TLS; the local database does not offer it
        sslmode="disable" if is_local else "require",
    )


def like_pattern(text: str) -> str:
    """Turn search text into an ILIKE pattern that matches it anywhere, treating % and _ literally."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def get_connection() -> psycopg.Connection:
    """
    Return the shared connection, opening a new one if needed.

    Autocommit is on: each statement is its own transaction, which is all
    Increment 1 needs (every write is a single statement).
    """
    global _connection  # pylint: disable=global-statement
    if _connection is None or _connection.closed:
        _connection = psycopg.connect(_connection_info(), autocommit=True, row_factory=dict_row)
    return _connection


def _run(sql: str, params: Any) -> psycopg.Cursor:
    """Execute a statement, dropping the connection if it turns out to be broken."""
    global _connection  # pylint: disable=global-statement
    try:
        return get_connection().execute(sql, params)
    except psycopg.OperationalError:
        # Connection lost (e.g. database restarted): reconnect on the next call
        _connection = None
        raise


def today() -> date:
    """
    Today's date by the database clock.

    "Overdue", "late" and "this week" are decided by SQL (current_date) in
    views and queries, so Python code asks the database too: one clock,
    whatever time zone the Lambda or the developer's machine is in.
    """
    return fetch_one("SELECT current_date AS today")["today"]


def fetch_one(sql: str, params: Any = None) -> Optional[dict]:
    """Run a query and return the first row as a dict, or None."""
    return _run(sql, params).fetchone()


def fetch_all(sql: str, params: Any = None) -> list[dict]:
    """Run a query and return all rows as dicts."""
    return _run(sql, params).fetchall()


def execute(sql: str, params: Any = None) -> int:
    """Run a statement and return the number of affected rows."""
    return _run(sql, params).rowcount


@contextmanager
def transaction() -> Iterator[psycopg.Connection]:
    """
    Run the enclosed statements as one transaction on the shared connection.

    Every fetch_one/fetch_all/execute inside the block joins it; it commits
    when the block ends and rolls back if it raises::

        with db.transaction():
            db.execute("SELECT ... FOR UPDATE", ...)
            db.execute("INSERT ...", ...)
    """
    global _connection  # pylint: disable=global-statement
    conn = get_connection()
    try:
        with conn.transaction():
            yield conn
    except psycopg.OperationalError:
        _connection = None
        raise
