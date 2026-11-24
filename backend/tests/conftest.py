"""
Shared fixtures for backend tests.

Tests call each service's real ``handler`` with Lambda-style events against a
throwaway PostgreSQL database (``acme_test``) built with bin/migrate.sh.
Database tests are skipped when PostgreSQL is not reachable.
"""

import importlib
import importlib.util
import json
import os
import pkgutil
import subprocess
import sys
from pathlib import Path
from typing import Optional

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
TEST_DB = "acme_test"

# Configure the environment before any service code is imported
os.environ.update({
    "IS_LOCAL": "true",
    "JWT_SECRET": "test-secret-used-only-by-the-test-suite",
    "POSTGRES_HOST": os.getenv("PGHOST", "localhost"),
    "POSTGRES_PORT": os.getenv("PGPORT", "5432"),
    "POSTGRES_USER": os.getenv("PGUSER", "postgres"),
    "POSTGRES_PASS": os.getenv("PGPASSWORD", "postgres123"),
    "POSTGRES_NAME": TEST_DB,
})

# Services import the shared code as ``common`` (bin/sync-common.sh copies it
# in at deploy time); in tests, point that name at backend/_common directly
sys.path.insert(0, str(BACKEND_DIR))
_COMMON = importlib.import_module("_common")
sys.modules["common"] = _COMMON
# Register every submodule under both names, so "common.http" and
# "_common.http" are the same module (one ApiError class, one connection)
for _info in pkgutil.iter_modules(_COMMON.__path__):
    sys.modules[f"common.{_info.name}"] = importlib.import_module(f"_common.{_info.name}")

from _common import db  # noqa: E402  pylint: disable=wrong-import-position
from _common.auth import create_token  # noqa: E402  pylint: disable=wrong-import-position
from _common.passwords import hash_password  # noqa: E402  pylint: disable=wrong-import-position


def load_service(name: str):
    """Import backend/<name>/function.py under a unique module name."""
    spec = importlib.util.spec_from_file_location(f"{name}_function", BACKEND_DIR / name / "function.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_event(method: str, path: str = "/", body: Optional[object] = None,  # pylint: disable=too-many-arguments
               token: Optional[str] = None, query: Optional[dict] = None,
               cookies: Optional[dict] = None, headers: Optional[dict] = None) -> dict:
    """Build a Lambda Function URL (payload v2) event like the local proxy or CloudFront sends."""
    all_headers = {"content-type": "application/json", **(headers or {})}
    if token:
        all_headers["authorization"] = f"Bearer {token}"
    event = {
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "headers": all_headers,
        "queryStringParameters": query,
        "body": body if isinstance(body, str) or body is None else json.dumps(body),
    }
    if cookies:
        event["cookies"] = [f"{name}={value}" for name, value in cookies.items()]
    return event


def call(service, method: str, path: str = "/", **kwargs) -> tuple[int, Optional[dict]]:
    """Invoke a service handler and return (status, decoded JSON body)."""
    response = service.handler(make_event(method, path, **kwargs))
    body = response.get("body")
    return response["statusCode"], json.loads(body) if body else None


def call_raw(service, method: str, path: str = "/", **kwargs) -> dict:
    """Invoke a service handler and return the whole Lambda response (status, headers, cookies, body)."""
    return service.handler(make_event(method, path, **kwargs))


def _admin_env() -> dict:
    """psql environment for the maintenance database."""
    return {**os.environ, "PGHOST": os.environ["POSTGRES_HOST"], "PGPORT": os.environ["POSTGRES_PORT"],
            "PGUSER": os.environ["POSTGRES_USER"], "PGPASSWORD": os.environ["POSTGRES_PASS"]}


@pytest.fixture(scope="session")
def database():
    """Create a fresh acme_test database with all migrations applied."""
    env = _admin_env()
    psql = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres"]
    ping = subprocess.run([*psql, "-c", "SELECT 1"], env=env, capture_output=True, text=True, check=False)
    if ping.returncode != 0:
        pytest.skip(f"PostgreSQL not available: {ping.stderr.strip()}")
    subprocess.run([*psql, "-c", f"DROP DATABASE IF EXISTS {TEST_DB} WITH (FORCE)",
                    "-c", f"CREATE DATABASE {TEST_DB}"], env=env, check=True, capture_output=True)
    subprocess.run([str(PROJECT_ROOT / "bin" / "migrate.sh")], env={**env, "PGDATABASE": TEST_DB},
                   check=True, capture_output=True)
    yield


@pytest.fixture(scope="session")
def users(database):  # pylint: disable=redefined-outer-name,unused-argument
    """One user per role, a second project manager and team lead, and an inactive user."""
    people = {
        "admin": ("admin@acme.test", "admin"),
        "pm": ("pm@acme.test", "project_manager"),
        "other_pm": ("other.pm@acme.test", "project_manager"),
        "team_lead": ("lead@acme.test", "team_lead"),
        "other_lead": ("other.lead@acme.test", "team_lead"),
        "viewer": ("viewer@acme.test", "viewer"),
    }
    password_hash = hash_password("Passw0rd!")
    created = {}
    for key, (email, role) in people.items():
        row = db.fetch_one(
            "INSERT INTO users (email, password_hash, full_name, role) VALUES (%s, %s, %s, %s) RETURNING id",
            (email, password_hash, key.replace("_", " ").title(), role),
        )
        created[key] = {"id": row["id"], "email": email, "role": role,
                        "token": create_token(row["id"], role)}
    db.execute(
        "INSERT INTO users (email, password_hash, full_name, role, is_active) VALUES (%s, %s, %s, 'viewer', false)",
        ("inactive@acme.test", password_hash, "Inactive User"),
    )
    return created


@pytest.fixture(autouse=True)
def empty_projects(request):
    """Start every database test with no projects or resources (and so nothing that hangs off them)."""
    if "users" in request.fixturenames:
        request.getfixturevalue("users")  # make sure the database exists first
        db.execute("TRUNCATE projects, resources, departments, audit_log, login_attempts, refresh_tokens "
                   "RESTART IDENTITY CASCADE")


@pytest.fixture(scope="session")
def auth_service():
    """The auth service module."""
    return load_service("auth")


@pytest.fixture(scope="session")
def projects_service():
    """The projects service module."""
    return load_service("projects")


@pytest.fixture(scope="session")
def deliverables_service():
    """The deliverables service module."""
    return load_service("deliverables")


@pytest.fixture(scope="session")
def users_service():
    """The users service module."""
    return load_service("users")


@pytest.fixture(scope="session")
def resources_service():
    """The resources service module."""
    return load_service("resources")


@pytest.fixture(scope="session")
def allocations_service():
    """The allocations service module."""
    return load_service("allocations")


@pytest.fixture(scope="session")
def budget_service():
    """The budget service module."""
    return load_service("budget")


@pytest.fixture(scope="session")
def audit_service():
    """The audit service module."""
    return load_service("audit")


@pytest.fixture(scope="session")
def dashboard_service():
    """The dashboard service module."""
    return load_service("dashboard")


def db_today():
    """Today by the database clock, which decides overdue/late (see _common.db.today)."""
    return db.today()


@pytest.fixture(scope="session")
def departments_service():
    """The departments service module."""
    return load_service("departments")
