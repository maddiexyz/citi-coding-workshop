"""Tests for who may read, create, edit and delete projects."""

import pytest

from _common.auth import CurrentUser
from _common.permissions import can_change_project, can_create_project
from conftest import call

PROJECT = {"code": "ACME-01", "name": "Data platform", "status": "active"}


@pytest.mark.parametrize("role, allowed", [
    ("admin", True), ("project_manager", True), ("team_lead", False), ("viewer", False),
])
def test_create_permission_by_role(role, allowed):
    assert can_create_project(CurrentUser(id=1, role=role)) is allowed


@pytest.mark.parametrize("role, owner_id, allowed", [
    ("admin", 2, True),             # admin changes anyone's project
    ("project_manager", 1, True),   # manager changes their own project
    ("project_manager", 2, False),  # ...but not someone else's
    ("team_lead", 1, False),        # read-only even as owner
    ("viewer", 1, False),
])
def test_change_permission_by_role_and_ownership(role, owner_id, allowed):
    assert can_change_project(CurrentUser(id=1, role=role), {"owner_id": owner_id}) is allowed


def create_as(service, user, **overrides):
    """Create a project through the API as the given user."""
    status, body = call(service, "POST", "/", body={**PROJECT, **overrides}, token=user["token"])
    assert status == 201, body
    return body


def test_every_route_requires_authentication(projects_service, users):
    for method, path in [("GET", "/"), ("GET", "/1"), ("POST", "/"), ("PUT", "/1"), ("DELETE", "/1")]:
        status, body = call(projects_service, method, path, body=PROJECT)
        assert (status, body["error"]["code"]) == (401, "unauthorized"), (method, path)


@pytest.mark.parametrize("role", ["viewer", "team_lead"])
def test_read_only_roles_can_read_but_not_write(projects_service, users, role):
    project = create_as(projects_service, users["admin"])
    token = users[role]["token"]
    path = f"/{project['id']}"

    assert call(projects_service, "GET", "/", token=token)[0] == 200
    assert call(projects_service, "GET", path, token=token)[0] == 200
    assert call(projects_service, "POST", "/", body={**PROJECT, "code": "NEW-1"}, token=token)[0] == 403
    assert call(projects_service, "PUT", path, body=PROJECT, token=token)[0] == 403
    assert call(projects_service, "DELETE", path, token=token)[0] == 403


def test_project_manager_owns_what_they_create(projects_service, users):
    project = create_as(projects_service, users["pm"])
    assert project["owner_id"] == users["pm"]["id"]

    status, body = call(projects_service, "PUT", f"/{project['id']}",
                        body={**PROJECT, "name": "Renamed"}, token=users["pm"]["token"])
    assert (status, body["name"]) == (200, "Renamed")
    assert call(projects_service, "DELETE", f"/{project['id']}", token=users["pm"]["token"])[0] == 204


def test_project_manager_cannot_change_someone_elses_project(projects_service, users):
    project = create_as(projects_service, users["other_pm"])
    path = f"/{project['id']}"

    status, body = call(projects_service, "PUT", path, body=PROJECT, token=users["pm"]["token"])
    assert (status, body["error"]["code"]) == (403, "forbidden")
    assert call(projects_service, "DELETE", path, token=users["pm"]["token"])[0] == 403
    # Nothing changed
    assert call(projects_service, "GET", path, token=users["pm"]["token"])[1]["name"] == PROJECT["name"]


def test_admin_can_change_any_project(projects_service, users):
    project = create_as(projects_service, users["pm"])
    path = f"/{project['id']}"
    token = users["admin"]["token"]

    assert call(projects_service, "PUT", path, body={**PROJECT, "status": "on_hold"}, token=token)[0] == 200
    assert call(projects_service, "DELETE", path, token=token)[0] == 204
    assert call(projects_service, "GET", path, token=token)[0] == 404
