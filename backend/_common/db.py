"""
PostgreSQL access with one connection reused across Lambda invocations.

All queries take parameters separately from the SQL text (psycopg ``%s`` /
``%(name)s`` placeholders), so user input is never built into a query string.
"""

import os
from typing import Any, Optional

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

# Module-level connection survives between invocations of a warm Lambda container
_connection: Optional[psycopg.Connection] = None


def _connection_info() -> str:
    """Build the connection string from the environment variables Terraform injects."""
    is_local = os.getenv("IS_LOCAL", "false") == "true"
    return make_conninfo(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=os.getenv("POSTGRES_PORT", "5432"),
        dbname=os.getenv("POSTGRES_NAME", "postgres"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASS", ""),
        connect_timeout=10,
        # AWS Aurora requires TLS; the local database does not offer it
        sslmode="disable" if is_local else "require",
    )


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


def fetch_one(sql: str, params: Any = None) -> Optional[dict]:
    """Run a query and return the first row as a dict, or None."""
    return _run(sql, params).fetchone()


def fetch_all(sql: str, params: Any = None) -> list[dict]:
    """Run a query and return all rows as dicts."""
    return _run(sql, params).fetchall()


def execute(sql: str, params: Any = None) -> int:
    """Run a statement and return the number of affected rows."""
    return _run(sql, params).rowcount
