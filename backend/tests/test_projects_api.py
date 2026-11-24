"""Tests for project validation, filtering and error responses."""

from conftest import call

PROJECT = {"code": "ACME-01", "name": "Data platform", "status": "active"}


def test_invalid_fields_are_reported_together(projects_service, users):
    status, body = call(projects_service, "POST", "/", token=users["admin"]["token"], body={
        "code": "x", "name": "", "status": "unknown",
        "start_date": "2026-05-01", "end_date": "2026-04-01",
    })
    assert status == 400
    assert body["error"]["code"] == "validation_error"
    assert set(body["error"]["details"]) == {"code", "name", "status", "end_date"}


def test_code_is_normalized_and_unique(projects_service, users):
    token = users["admin"]["token"]
    status, body = call(projects_service, "POST", "/", body={**PROJECT, "code": "acme-01"}, token=token)
    assert (status, body["code"]) == (201, "ACME-01")

    status, body = call(projects_service, "POST", "/", body=PROJECT, token=token)
    assert (status, body["error"]["code"]) == (409, "conflict")


def test_list_filters_by_status_and_search_text(projects_service, users):
    token = users["admin"]["token"]
    for code, name, status in [("WEB-1", "Website redesign", "active"),
                               ("DATA-1", "Data lake", "active"),
                               ("WEB-2", "Web analytics", "planned")]:
        call(projects_service, "POST", "/", body={"code": code, "name": name, "status": status}, token=token)

    def codes(query):
        status, body = call(projects_service, "GET", "/", query=query, token=token)
        assert status == 200
        return sorted(item["code"] for item in body["items"])

    assert codes({"status": "active"}) == ["DATA-1", "WEB-1"]
    assert codes({"q": "web"}) == ["WEB-1", "WEB-2"]
    assert codes({"q": "data-1"}) == ["DATA-1"]          # matches the code too
    assert codes({"status": "planned", "q": "web"}) == ["WEB-2"]
    assert codes({"q": "%"}) == []                        # % is literal, not a wildcard


def test_invalid_status_filter_is_rejected(projects_service, users):
    status, body = call(projects_service, "GET", "/", query={"status": "done"}, token=users["admin"]["token"])
    assert (status, body["error"]["code"]) == (400, "validation_error")


def test_missing_and_malformed_ids(projects_service, users):
    token = users["admin"]["token"]
    assert call(projects_service, "GET", "/999", token=token)[0] == 404
    assert call(projects_service, "GET", "/abc", token=token)[0] == 400


def test_cloudfront_style_path_is_routed(projects_service, users):
    project = call(projects_service, "POST", "/", body=PROJECT, token=users["admin"]["token"])[1]
    status, body = call(projects_service, "GET", f"/api/projects/{project['id']}", token=users["admin"]["token"])
    assert (status, body["code"]) == (200, "ACME-01")


def test_unknown_route_and_method(projects_service, users):
    token = users["admin"]["token"]
    assert call(projects_service, "GET", "/1/extra", token=token)[0] == 404
    assert call(projects_service, "PATCH", "/1", token=token)[0] == 405


def test_every_error_has_code_message_and_details(projects_service, users, monkeypatch):
    """The shared error shape {"error": {code, message, details}} holds for every status, details {} if none."""
    pm, viewer = users["pm"]["token"], users["viewer"]["token"]
    project = call(projects_service, "POST", "/", token=pm, body={"code": "SHAPE-1", "name": "Shape"})[1]
    cases = {
        400: call(projects_service, "POST", "/", token=pm, body='{"code": '),          # malformed JSON
        401: call(projects_service, "GET", "/"),                                        # no token
        403: call(projects_service, "DELETE", f"/{project['id']}", token=viewer),
        404: call(projects_service, "GET", "/999999", token=viewer),
        405: call(projects_service, "PATCH", f"/{project['id']}", token=pm, body={}),
        409: call(projects_service, "POST", "/", token=pm, body={"code": "shape-1", "name": "Again"}),
    }

    def broken(*args, **kwargs):
        raise RuntimeError("database unavailable")
    monkeypatch.setattr(projects_service.db, "fetch_all", broken)
    cases[500] = call(projects_service, "GET", "/", token=viewer)

    for expected, (status, body) in cases.items():
        assert status == expected
        assert set(body["error"]) == {"code", "message", "details"}, expected
        assert isinstance(body["error"]["details"], dict), expected
    assert cases[404][1]["error"]["details"] == {}
    assert cases[500][1]["error"] == {"code": "internal_error", "message": "An unexpected error occurred",
                                      "details": {}}
