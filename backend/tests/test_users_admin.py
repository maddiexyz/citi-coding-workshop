"""User management by admins, with self-protection and session revocation."""

import pytest

from _common import db
from _common.auth import create_token
from conftest import call

NEW = {"email": "New.User@Acme.test", "full_name": "New User", "role": "project_manager", "password": "Long-enough-1"}


@pytest.fixture
def created(users_service, users):
    status, body = call(users_service, "POST", "/", token=users["admin"]["token"], body=NEW)
    assert status == 201, body
    yield body
    db.execute("DELETE FROM users WHERE id = %s", (body["id"],))


def test_create_returns_no_password_and_user_can_sign_in(created, auth_service):
    assert (created["email"], created["role"], created["is_active"]) == ("new.user@acme.test", "project_manager", True)
    assert "password_hash" not in created and "password" not in created
    status, body = call(auth_service, "POST", "/login",
                        body={"email": "new.user@acme.test", "password": "Long-enough-1"})
    assert (status, body["user"]["role"]) == (200, "project_manager")


@pytest.mark.parametrize("change, field", [
    ({"email": "nope"}, "email"), ({"full_name": " "}, "full_name"),
    ({"role": "boss"}, "role"), ({"password": "short1"}, "password"), ({"password": None}, "password"),
])
def test_create_validation(users_service, users, change, field):
    status, body = call(users_service, "POST", "/", token=users["admin"]["token"], body={**NEW, **change})
    assert status == 400 and field in body["error"]["details"]


def test_duplicate_email(users_service, users, created):  # pylint: disable=unused-argument
    status, body = call(users_service, "POST", "/", token=users["admin"]["token"], body=NEW)
    assert (status, list(body["error"]["details"])) == (409, ["email"])


@pytest.mark.parametrize("who", ["pm", "team_lead", "viewer"])
def test_only_admins_manage_users(users_service, users, created, who):
    token = users[who]["token"]
    assert call(users_service, "POST", "/", token=token, body={**NEW, "email": "x@acme.test"})[0] == 403
    assert call(users_service, "PUT", f"/{created['id']}", token=token, body=NEW)[0] == 403
    assert call(users_service, "PUT", f"/{created['id']}/password", token=token, body={"password": "x" * 12})[0] == 403
    assert call(users_service, "DELETE", f"/{created['id']}", token=token)[0] == 403
    assert call(users_service, "GET", f"/{created['id']}", token=token)[0] == 403


def test_role_change_and_deactivation_take_effect_and_revoke_sessions(users_service, auth_service, users, created):
    login = call(auth_service, "POST", "/login", body={"email": created["email"], "password": "Long-enough-1"})
    token = login[1]["token"]
    status, body = call(users_service, "PUT", f"/{created['id']}", token=users["admin"]["token"],
                        body={**NEW, "role": "viewer"})
    assert (status, body["role"]) == (200, "viewer")
    assert db.fetch_one("SELECT count(*) AS n FROM refresh_tokens WHERE user_id = %s AND revoked_at IS NULL",
                        (created["id"],))["n"] == 0
    status, _ = call(users_service, "PUT", f"/{created['id']}", token=users["admin"]["token"],
                     body={**NEW, "role": "viewer", "is_active": False})
    assert status == 200
    assert call(auth_service, "GET", "/me", token=token)[0] == 401   # the old access token stops working


def test_password_reset(users_service, auth_service, users, created):
    status, _ = call(users_service, "PUT", f"/{created['id']}/password", token=users["admin"]["token"],
                     body={"password": "Brand-new-pass-2"})
    assert status == 204
    assert call(auth_service, "POST", "/login", body={"email": created["email"], "password": "Long-enough-1"})[0] == 401
    assert call(auth_service, "POST", "/login",
                body={"email": created["email"], "password": "Brand-new-pass-2"})[0] == 200
    assert call(users_service, "PUT", f"/{created['id']}/password", token=users["admin"]["token"],
                body={"password": "short"})[0] == 400


def test_admins_cannot_lock_themselves_out(users_service, users):
    admin = users["admin"]
    me = {"email": admin["email"], "full_name": "Admin", "role": "viewer", "is_active": True}
    assert call(users_service, "PUT", f"/{admin['id']}", token=admin["token"], body=me)[0] == 400
    assert call(users_service, "PUT", f"/{admin['id']}", token=admin["token"],
                body={**me, "role": "admin", "is_active": False})[0] == 400
    assert call(users_service, "DELETE", f"/{admin['id']}", token=admin["token"])[0] == 400


def test_user_who_owns_projects_cannot_be_deleted(users_service, projects_service, users, created):
    pm_token = create_token(created["id"], "project_manager")
    assert call(projects_service, "POST", "/", token=pm_token, body={"code": "OWN-1", "name": "Owned"})[0] == 201
    status, body = call(users_service, "DELETE", f"/{created['id']}", token=users["admin"]["token"])
    assert (status, body["error"]["code"]) == (409, "conflict")
    db.execute("DELETE FROM projects WHERE code = 'OWN-1'")
    assert call(users_service, "DELETE", f"/{created['id']}", token=users["admin"]["token"])[0] == 204


def test_user_changes_are_audited_without_passwords(users_service, audit_service, users, created):
    call(users_service, "PUT", f"/{created['id']}/password", token=users["admin"]["token"],
         body={"password": "Brand-new-pass-2"})
    items = call(audit_service, "GET", "/", token=users["admin"]["token"],
                 query={"entity_type": "user", "entity_id": str(created["id"])})[1]["items"]
    assert [i["summary"].split(" ")[0] for i in items] == ["Reset", "Created"]
    assert "password" not in str(items[1]["new_values"]) and "Long-enough-1" not in str(items)
