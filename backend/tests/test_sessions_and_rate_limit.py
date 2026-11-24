"""Refresh tokens in an HttpOnly cookie, sign-out, and sign-in rate limiting."""

import pytest

from _common import db
from _common.passwords import hash_password
from conftest import call, call_raw

PASSWORD = "Passw0rd!"


@pytest.fixture
def person(users):  # pylint: disable=unused-argument
    """A throwaway viewer that tests may deactivate."""
    row = db.fetch_one(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES (%s, %s, 'Temp', 'viewer') RETURNING id",
        (f"temp{db.fetch_one('SELECT count(*) AS n FROM users')['n']}@acme.test", hash_password(PASSWORD)))
    user = db.fetch_one("SELECT id, email FROM users WHERE id = %s", (row["id"],))
    yield user
    db.execute("DELETE FROM users WHERE id = %s", (user["id"],))


def login(auth_service, email, password=PASSWORD, ip=None):
    headers = {"cloudfront-viewer-address": f"{ip}:443"} if ip else None
    return call_raw(auth_service, "POST", "/login", body={"email": email, "password": password}, headers=headers)


def refresh_cookie(response):
    """The refresh token value from a response's Set-Cookie list."""
    cookie = next(c for c in response["cookies"] if c.startswith("acme_refresh="))
    return cookie.split(";")[0].split("=", 1)[1], cookie


def test_login_sets_a_hardened_refresh_cookie(auth_service, person):
    response = login(auth_service, person["email"])
    assert response["statusCode"] == 200
    token, cookie = refresh_cookie(response)
    assert len(token) > 30
    for part in ("HttpOnly", "Secure", "SameSite=Strict", "Path=/api/auth", "Max-Age=43200"):
        assert part in cookie
    assert token not in response["body"]              # never in the JSON body
    stored = db.fetch_one("SELECT token_hash FROM refresh_tokens WHERE user_id = %s", (person["id"],))
    assert stored["token_hash"] != token               # only a hash is stored


def test_refresh_rotates_and_old_token_stops_working(auth_service, person):
    token, _ = refresh_cookie(login(auth_service, person["email"]))
    first = call_raw(auth_service, "POST", "/refresh", cookies={"acme_refresh": token})
    assert first["statusCode"] == 200
    new_token, _ = refresh_cookie(first)
    assert new_token != token

    reused = call_raw(auth_service, "POST", "/refresh", cookies={"acme_refresh": token})
    assert reused["statusCode"] == 401
    assert any(c.startswith("acme_refresh=;") and "Max-Age=0" in c for c in reused["cookies"])  # cleared
    assert call_raw(auth_service, "POST", "/refresh", cookies={"acme_refresh": new_token})["statusCode"] == 200


def test_refresh_from_a_cookie_header_works_too(auth_service, person):
    token, _ = refresh_cookie(login(auth_service, person["email"]))
    response = call_raw(auth_service, "POST", "/refresh", headers={"cookie": f"theme=dark; acme_refresh={token}"})
    assert response["statusCode"] == 200


def test_refresh_refuses_missing_expired_and_deactivated(auth_service, person):
    assert call(auth_service, "POST", "/refresh")[0] == 401
    assert call(auth_service, "POST", "/refresh", cookies={"acme_refresh": "made-up"})[0] == 401

    token, _ = refresh_cookie(login(auth_service, person["email"]))
    db.execute("UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE user_id = %s", (person["id"],))
    assert call(auth_service, "POST", "/refresh", cookies={"acme_refresh": token})[0] == 401

    token, _ = refresh_cookie(login(auth_service, person["email"]))
    db.execute("UPDATE users SET is_active = false WHERE id = %s", (person["id"],))
    status, body = call(auth_service, "POST", "/refresh", cookies={"acme_refresh": token})
    assert (status, body["error"]["code"]) == (401, "session_expired")


def test_refresh_uses_the_current_role(auth_service, person):
    token, _ = refresh_cookie(login(auth_service, person["email"]))
    db.execute("UPDATE users SET role = 'project_manager' WHERE id = %s", (person["id"],))
    status, body = call(auth_service, "POST", "/refresh", cookies={"acme_refresh": token})
    assert (status, body["user"]["role"]) == (200, "project_manager")


def test_logout_revokes_the_token_and_clears_the_cookie(auth_service, person):
    token, _ = refresh_cookie(login(auth_service, person["email"]))
    response = call_raw(auth_service, "POST", "/logout", cookies={"acme_refresh": token})
    assert response["statusCode"] == 204
    assert any("Max-Age=0" in c for c in response["cookies"])
    assert call(auth_service, "POST", "/refresh", cookies={"acme_refresh": token})[0] == 401
    assert call(auth_service, "POST", "/logout")[0] == 204   # without a cookie: still fine


def test_sixth_failed_attempt_is_rate_limited(auth_service, person):
    for _ in range(5):
        assert login(auth_service, person["email"], "wrong")["statusCode"] == 401
    response = login(auth_service, person["email"])           # even the right password
    assert response["statusCode"] == 429
    assert 1 <= int(response["headers"]["Retry-After"]) <= 900
    assert "Try again in" in response["body"]

    # Once the failures are older than the window, signing in works again
    db.execute("UPDATE login_attempts SET attempted_at = attempted_at - interval '16 minutes'")
    assert login(auth_service, person["email"])["statusCode"] == 200


def test_unknown_emails_are_limited_the_same_way(auth_service, users):  # pylint: disable=unused-argument
    for _ in range(5):
        login(auth_service, "nobody@acme.test", "wrong")
    assert login(auth_service, "nobody@acme.test", "wrong")["statusCode"] == 429


def test_one_ip_is_limited_across_emails(auth_service, person):
    for i in range(20):
        login(auth_service, f"guess{i}@acme.test", "wrong", ip="203.0.113.7")
    assert login(auth_service, person["email"], ip="203.0.113.7")["statusCode"] == 429
    assert login(auth_service, person["email"], ip="198.51.100.1")["statusCode"] == 200   # other IPs unaffected


def test_access_tokens_last_15_minutes(auth_service, person):
    status, body = call(auth_service, "POST", "/login", body={"email": person["email"], "password": PASSWORD})
    assert (status, body["expires_in"]) == (200, 900)
