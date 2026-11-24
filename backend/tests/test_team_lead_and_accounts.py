"""Project team lead assignment, the users picker, and account checks on every request."""

from _common import db
from _common.auth import create_token
from conftest import call


def test_team_lead_must_be_an_active_team_lead(projects_service, users):
    token = users["pm"]["token"]
    for bad_id in (users["viewer"]["id"], users["pm"]["id"], 999999):
        status, body = call(projects_service, "POST", "/", token=token,
                            body={"code": "TL-1", "name": "x", "team_lead_id": bad_id})
        assert (status, list(body["error"]["details"])) == (400, ["team_lead_id"])

    status, body = call(projects_service, "POST", "/", token=token,
                        body={"code": "TL-1", "name": "x", "team_lead_id": users["team_lead"]["id"]})
    assert (status, body["team_lead_name"]) == (201, "Team Lead")


def test_only_admin_or_owning_pm_change_the_team_lead(projects_service, users):
    project = call(projects_service, "POST", "/", token=users["pm"]["token"], body={"code": "TL-2", "name": "x"})[1]
    body = {"code": "TL-2", "name": "x", "team_lead_id": users["team_lead"]["id"]}
    assert call(projects_service, "PUT", f"/{project['id']}", token=users["team_lead"]["token"], body=body)[0] == 403
    assert call(projects_service, "PUT", f"/{project['id']}", token=users["other_pm"]["token"], body=body)[0] == 403
    status, updated = call(projects_service, "PUT", f"/{project['id']}", token=users["admin"]["token"], body=body)
    assert (status, updated["team_lead_id"]) == (200, users["team_lead"]["id"])


def test_users_picker(users_service, users):
    status, body = call(users_service, "GET", "/", token=users["pm"]["token"],
                        query={"role": "team_lead", "active": "true"})
    assert status == 200
    assert {u["email"] for u in body["items"]} == {"lead@acme.test", "other.lead@acme.test"}
    assert all("password_hash" not in u for u in body["items"])
    assert call(users_service, "GET", "/", token=users["team_lead"]["token"])[0] == 403
    assert call(users_service, "GET", "/", token=users["viewer"]["token"])[0] == 403
    assert call(users_service, "GET", "/", token=users["admin"]["token"], query={"role": "boss"})[0] == 400


def test_token_for_missing_or_inactive_user_is_refused(projects_service, users):
    ghost = create_token(999999, "admin")
    status, body = call(projects_service, "POST", "/", token=ghost, body={"code": "GH-1", "name": "Ghost"})
    assert (status, body["error"]["code"]) == (401, "account_inactive")

    inactive = db.fetch_one("SELECT id FROM users WHERE email = 'inactive@acme.test'")
    assert call(projects_service, "GET", "/", token=create_token(inactive["id"], "viewer"))[0] == 401


def test_role_comes_from_the_database_not_the_token(projects_service, users):
    # A viewer's token claiming admin (signed correctly) still acts as a viewer
    token = create_token(users["viewer"]["id"], "admin")
    assert call(projects_service, "POST", "/", token=token, body={"code": "ESC-1", "name": "x"})[0] == 403
