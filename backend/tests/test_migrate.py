"""
The cloud migrations Lambda (backend/_migrate) against a fresh, empty database.

It must build the same schema as bin/migrate.sh, be safe to run twice, and
only ever accept a bcrypt hash for the admin user.
"""

import os
import subprocess

import pytest

from _common import db
from _common.passwords import hash_password
from conftest import BACKEND_DIR, _admin_env, call, load_service

MIGRATE_DB = "acme_migrate_test"


@pytest.fixture(scope="module")
def migrate():
    """The migrate module, connected to its own empty database for the duration of this file."""
    env = _admin_env()
    psql = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres"]
    if subprocess.run([*psql, "-c", "SELECT 1"], env=env, capture_output=True, check=False).returncode != 0:
        pytest.skip("PostgreSQL not available")
    subprocess.run([*psql, "-c", f"DROP DATABASE IF EXISTS {MIGRATE_DB} WITH (FORCE)",
                    "-c", f"CREATE DATABASE {MIGRATE_DB}"], env=env, check=True, capture_output=True)

    module = load_service("_migrate")
    module.MIGRATIONS_DIR = BACKEND_DIR / "_db" / "migrations"  # the Lambda package has them under db/
    original = os.environ["POSTGRES_NAME"]
    os.environ["POSTGRES_NAME"] = MIGRATE_DB
    db._connection = None  # pylint: disable=protected-access
    yield module
    if db._connection is not None:  # pylint: disable=protected-access
        db._connection.close()  # pylint: disable=protected-access
    db._connection = None  # pylint: disable=protected-access
    os.environ["POSTGRES_NAME"] = original


def test_applies_every_migration_once(migrate):
    first = migrate.handler({}, None)
    expected = sorted(p.stem for p in (BACKEND_DIR / "_db" / "migrations").glob("*.sql"))

    assert first == {"applied": expected, "admin": "skipped"}
    assert db.fetch_one("SELECT count(*) AS n FROM project_details")["n"] == 0
    assert migrate.handler({}, None)["applied"] == []


def test_seeds_admin_that_can_sign_in_and_never_overwrites_it(migrate, auth_service):
    migrate.handler({}, None)
    event = {"admin": {"email": "Boss@Acme.test", "password_hash": hash_password("First-pass1"),
                       "full_name": "The Boss"}}

    assert migrate.handler(event, None)["admin"] == "created"

    event["admin"]["password_hash"] = hash_password("Second-pass2")
    assert migrate.handler(event, None)["admin"] == "exists"

    status, body = call(auth_service, "POST", "/login",
                        body={"email": "boss@acme.test", "password": "First-pass1"})
    assert status == 200
    assert body["user"]["role"] == "admin"


@pytest.mark.parametrize("admin", [
    {"email": "x@acme.test", "password_hash": "plain-text-password"},
    {"email": "not-an-email", "password_hash": hash_password("Passw0rd!")},
])
def test_rejects_bad_admin_input(migrate, admin):
    with pytest.raises(ValueError):
        migrate.handler({"admin": admin}, None)
    assert db.fetch_one("SELECT 1 AS found FROM users WHERE email = %s", (admin["email"],)) is None
