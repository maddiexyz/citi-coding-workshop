"""Changing your own password: checks, rate limit, and signing out other sessions."""

import json

import pytest

from _common import db
from _common.passwords import hash_password
from conftest import call, call_raw

OLD = "Old-password-1"
NEW = "New-password-2"


@pytest.fixture
def me(users):  # pylint: disable=unused-argument
    """A throwaway user with a known password."""
    row = db.fetch_one("INSERT INTO users (email, password_hash, full_name, role) "
                       "VALUES ('changer@acme.test', %s, 'Changer', 'viewer') RETURNING id", (hash_password(OLD),))
    yield row["id"]
    db.execute("DELETE FROM users WHERE id = %s", (row["id"],))


def sign_in(auth_service, password=OLD):
    response = call_raw(auth_service, "POST", "/login", body={"email": "changer@acme.test", "password": password})
    if response["statusCode"] != 200:
        return response["statusCode"], None, None
    cookie = response["headers"]["Set-Cookie"].split(";")[0].split("=", 1)[1]
    return 200, json.loads(response["body"])["token"], cookie


def change(auth_service, token, current, new, cookie=None):
    return call(auth_service, "POST", "/password", token=token,
                body={"current_password": current, "new_password": new},
                cookies={"acme_refresh": cookie} if cookie else None)


def test_wrong_current_password_is_a_field_error(auth_service, me):  # pylint: disable=unused-argument
    _, token, _ = sign_in(auth_service)
    status, body = change(auth_service, token, "not-it-at-all", NEW)
    assert (status, body["error"]["details"]) == (400, {"current_password": "Incorrect password"})


@pytest.mark.parametrize("new, message", [("short1", "Must be at least 10 characters"),
                                          (OLD, "Must be different from the current password"),
                                          (None, "This field is required")])
def test_new_password_rules(auth_service, me, new, message):  # pylint: disable=unused-argument
    _, token, _ = sign_in(auth_service)
    status, body = change(auth_service, token, OLD, new)
    assert (status, body["error"]["details"]["new_password"]) == (400, message)


def test_success_keeps_this_session_and_signs_out_the_others(auth_service, audit_service, users, me):
    _, token, this_session = sign_in(auth_service)
    _, _, other_session = sign_in(auth_service)
    status, _ = change(auth_service, token, OLD, NEW, cookie=this_session)
    assert status == 204
    assert call(auth_service, "POST", "/refresh", cookies={"acme_refresh": other_session})[0] == 401
    assert call(auth_service, "POST", "/refresh", cookies={"acme_refresh": this_session})[0] == 200
    assert call(auth_service, "GET", "/me", token=token)[0] == 200          # current access token still works
    assert sign_in(auth_service, OLD)[0] == 401
    assert sign_in(auth_service, NEW)[0] == 200
    entries = call(audit_service, "GET", "/", token=users["admin"]["token"],
                   query={"entity_type": "user", "entity_id": str(me)})[1]["items"]
    assert entries[0]["summary"] == "Changed their own password" and NEW not in str(entries)


def test_wrong_current_passwords_are_rate_limited(auth_service, me):  # pylint: disable=unused-argument
    _, token, _ = sign_in(auth_service)
    for _ in range(5):
        assert change(auth_service, token, "wrong-guess-x", NEW)[0] == 400
    status, body = change(auth_service, token, OLD, NEW)          # even the right one, for now
    assert (status, body["error"]["code"]) == (429, "rate_limited")


def test_needs_a_signed_in_user(auth_service):
    assert call(auth_service, "POST", "/password", body={"current_password": OLD, "new_password": NEW})[0] == 401
