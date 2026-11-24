"""Tests for login, tokens and the /me endpoint."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest

from _common.auth import ALGORITHM, create_token, decode_token
from _common.http import ApiError
from conftest import call


def test_token_carries_user_id_and_role():
    claims = decode_token(create_token(42, "viewer"))
    assert (claims.id, claims.role) == (42, "viewer")


def test_expired_token_is_rejected():
    expired = jwt.encode(
        {"sub": "1", "role": "admin", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
        "test-secret-used-only-by-the-test-suite", algorithm=ALGORITHM,
    )
    with pytest.raises(ApiError) as error:
        decode_token(expired)
    assert (error.value.status, error.value.code) == (401, "token_expired")


def test_token_signed_with_another_secret_is_rejected():
    forged = jwt.encode({"sub": "1", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
                        "an-attacker-secret-that-is-long-enough", algorithm=ALGORITHM)
    with pytest.raises(ApiError) as error:
        decode_token(forged)
    assert (error.value.status, error.value.code) == (401, "invalid_token")


def test_login_returns_token_for_valid_credentials(auth_service, users):
    status, body = call(auth_service, "POST", "/login",
                        body={"email": "PM@acme.test", "password": "Passw0rd!"})
    assert status == 200
    assert body["user"] == {"id": users["pm"]["id"], "email": "pm@acme.test",
                            "full_name": "Pm", "role": "project_manager"}
    claims = decode_token(body["token"])
    assert (claims.id, claims.role) == (users["pm"]["id"], "project_manager")


@pytest.mark.parametrize("email, password", [
    ("pm@acme.test", "wrong-password"),
    ("nobody@acme.test", "Passw0rd!"),
    ("inactive@acme.test", "Passw0rd!"),
])
def test_login_failures_share_one_generic_error(auth_service, users, email, password):
    status, body = call(auth_service, "POST", "/login", body={"email": email, "password": password})
    assert status == 401
    assert body["error"]["code"] == "invalid_credentials"


def test_login_validates_required_fields(auth_service, users):
    status, body = call(auth_service, "POST", "/login", body={"email": " "})
    assert status == 400
    assert set(body["error"]["details"]) == {"email", "password"}


def test_login_rejects_malformed_json(auth_service, users):
    status, body = call(auth_service, "POST", "/login", body="{not json")
    assert (status, body["error"]["code"]) == (400, "invalid_json")


def test_me_requires_a_token(auth_service, users):
    status, body = call(auth_service, "GET", "/me")
    assert (status, body["error"]["code"]) == (401, "unauthorized")


def test_me_returns_current_user(auth_service, users):
    status, body = call(auth_service, "GET", "/me", token=users["viewer"]["token"])
    assert status == 200
    assert body["user"]["email"] == "viewer@acme.test"
