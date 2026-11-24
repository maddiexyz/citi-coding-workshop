"""Departments: the 008 migration from free text, CRUD, in-use protection and filters."""

import os
import shutil
import subprocess

import pytest

from _common import db
from conftest import BACKEND_DIR, _admin_env, call, load_service

MIGRATIONS = BACKEND_DIR / "_db" / "migrations"


@pytest.fixture
def pre_departments_db(tmp_path, users):  # pylint: disable=unused-argument
    """A fresh database migrated up to 007, i.e. with resources.department as text."""
    env = _admin_env()
    psql = ["psql", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres"]
    subprocess.run([*psql, "-c", "DROP DATABASE IF EXISTS acme_dept_test WITH (FORCE)",
                    "-c", "CREATE DATABASE acme_dept_test"], env=env, check=True, capture_output=True)
    migrations = tmp_path / "migrations"
    migrations.mkdir()
    for path in sorted(MIGRATIONS.glob("*.sql")):
        if path.stem < "008":
            shutil.copy(path, migrations)
    migrate = load_service("_migrate")
    migrate.MIGRATIONS_DIR = migrations
    original = os.environ["POSTGRES_NAME"]
    os.environ["POSTGRES_NAME"] = "acme_dept_test"
    db._connection = None  # pylint: disable=protected-access
    migrate.apply_migrations()
    yield migrate, migrations
    db._connection.close()  # pylint: disable=protected-access
    db._connection = None  # pylint: disable=protected-access
    os.environ["POSTGRES_NAME"] = original


def test_migration_maps_messy_values_without_losing_any(pre_departments_db):
    migrate, migrations = pre_departments_db
    people = [("Ann", "Finance"), ("Bob", "finance "), ("Cy", " FINANCE"), ("Di", "Data"),
              ("Ed", "Data"), ("Flo", "data"), ("Gus", None), ("Hal", "   ")]
    for name, department in people:
        db.execute("INSERT INTO resources (full_name, department) VALUES (%s, %s)", (name, department))

    shutil.copy(MIGRATIONS / "008_departments.sql", migrations)
    assert migrate.apply_migrations() == ["008_departments"]

    names = [row["name"] for row in db.fetch_all("SELECT name FROM departments ORDER BY name")]
    assert names == ["Data", "Finance"]          # one per value; most-used spelling, trimmed
    mapped = {row["full_name"]: row["name"] for row in db.fetch_all(
        "SELECT r.full_name, d.name FROM resources r LEFT JOIN departments d ON d.id = r.department_id")}
    assert mapped == {"Ann": "Finance", "Bob": "Finance", "Cy": "Finance", "Di": "Data", "Ed": "Data",
                      "Flo": "Data", "Gus": None, "Hal": None}
    columns = {row["column_name"] for row in db.fetch_all(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'resources'")}
    assert "department" not in columns and "department_id" in columns


@pytest.fixture
def finance(departments_service, users):
    status, body = call(departments_service, "POST", "/", token=users["admin"]["token"], body={"name": "  Finance "})
    assert status == 201, body
    return body


def test_admin_manages_departments(departments_service, users, finance):
    token = users["admin"]["token"]
    assert finance["name"] == "Finance" and finance["resource_count"] == 0
    status, body = call(departments_service, "POST", "/", token=token, body={"name": "finance"})
    assert (status, body["error"]["details"]) == (409, {"name": "Name already in use"})
    status, body = call(departments_service, "PUT", f"/{finance['id']}", token=token, body={"name": "Finance & Risk"})
    assert (status, body["name"]) == (200, "Finance & Risk")
    assert call(departments_service, "POST", "/", token=token, body={"name": " "})[0] == 400
    items = call(departments_service, "GET", "/", token=users["viewer"]["token"], query={"q": "risk"})[1]["items"]
    assert [d["name"] for d in items] == ["Finance & Risk"]
    assert call(departments_service, "DELETE", f"/{finance['id']}", token=token)[0] == 204


@pytest.mark.parametrize("who", ["pm", "team_lead", "viewer"])
def test_only_admins_change_departments(departments_service, users, finance, who):
    token = users[who]["token"]
    assert call(departments_service, "GET", "/", token=token)[0] == 200
    assert call(departments_service, "POST", "/", token=token, body={"name": "X"})[0] == 403
    assert call(departments_service, "PUT", f"/{finance['id']}", token=token, body={"name": "X"})[0] == 403
    assert call(departments_service, "DELETE", f"/{finance['id']}", token=token)[0] == 403


def test_department_in_use_cannot_be_deleted(departments_service, resources_service, projects_service, users,
                                             finance):
    token = users["admin"]["token"]
    person = call(resources_service, "POST", "/", token=token,
                  body={"full_name": "Pat", "department_id": finance["id"]})[1]
    assert person["department_name"] == "Finance"
    status, body = call(departments_service, "DELETE", f"/{finance['id']}", token=token)
    assert status == 409 and "1 people" in body["error"]["message"]

    call(resources_service, "PUT", f"/{person['id']}", token=token, body={"full_name": "Pat"})
    project = call(projects_service, "POST", "/", token=token,
                   body={"code": "FIN-1", "name": "Ledger", "department_id": finance["id"]})[1]
    assert project["department_name"] == "Finance"
    assert call(departments_service, "DELETE", f"/{finance['id']}", token=token)[0] == 409
    call(projects_service, "DELETE", f"/{project['id']}", token=token)
    assert call(departments_service, "DELETE", f"/{finance['id']}", token=token)[0] == 204


def test_unknown_department_is_a_validation_error(resources_service, projects_service, users):
    token = users["admin"]["token"]
    status, body = call(resources_service, "POST", "/", token=token, body={"full_name": "X", "department_id": 999999})
    assert (status, list(body["error"]["details"])) == (400, ["department_id"])
    status, body = call(projects_service, "POST", "/", token=token,
                        body={"code": "X-1", "name": "X", "department_id": 999999})
    assert (status, list(body["error"]["details"])) == (400, ["department_id"])


def test_department_filters(departments_service, resources_service, projects_service, dashboard_service, users,
                            finance):
    token = users["admin"]["token"]
    data = call(departments_service, "POST", "/", token=token, body={"name": "Data"})[1]
    for name, dep in (("Ann", finance), ("Ben", data)):
        call(resources_service, "POST", "/", token=token, body={"full_name": name, "department_id": dep["id"]})
    for code, dep in (("FIN-1", finance), ("DAT-1", data)):
        call(projects_service, "POST", "/", token=token, body={
            "code": code, "name": code, "status": "active", "end_date": "2000-01-01", "department_id": dep["id"]})

    def names(service, query):
        status, body = call(service, "GET", "/", token=users["viewer"]["token"], query=query)
        assert status == 200, body
        return [item.get("full_name") or item.get("code") for item in body["items"]]

    assert names(resources_service, {"department_id": str(finance["id"])}) == ["Ann"]
    assert names(resources_service, {"q": "data"}) == ["Ben"]          # search matches the department name
    assert names(projects_service, {"department_id": str(data["id"])}) == ["DAT-1"]
    status, body = call(dashboard_service, "GET", "/at-risk", token=users["viewer"]["token"],
                        query={"department_id": str(finance["id"])})
    assert [p["code"] for p in body["items"]] == ["FIN-1"]
    assert body["items"][0]["department_name"] == "Finance"
    assert call(projects_service, "GET", "/", token=token, query={"department_id": "x"})[0] == 400
