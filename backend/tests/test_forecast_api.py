"""Forecast endpoint, the schedule fields on deliverables and the forecast_late risk signal (real database)."""

from datetime import timedelta

import pytest

from common import schedule
from conftest import call, db_today


def iso(day):
    return day.isoformat()


@pytest.fixture
def chain(projects_service, deliverables_service, users):
    """An active project ending in 60 days with A (3 days) -> B (2) -> C (4), all estimated."""
    pm = users["pm"]["token"]
    today = db_today()
    project = call(projects_service, "POST", "/", token=pm, body={
        "code": "FC-1", "name": "Forecast", "status": "active",
        "start_date": iso(today - timedelta(days=10)), "end_date": iso(today + timedelta(days=60))})[1]
    items = {}
    for title, estimate in (("A", 3), ("B", 2), ("C", 4)):
        items[title] = call(deliverables_service, "POST", "/", token=pm, body={
            "project_id": project["id"], "title": title, "estimate_days": estimate})[1]
    for later, earlier in (("B", "A"), ("C", "B")):
        assert call(deliverables_service, "POST", f"/{items[later]['id']}/dependencies", token=pm,
                    body={"depends_on_id": items[earlier]["id"]})[0] == 201
    return project, items


def set_end(projects_service, users, project, end):
    body = {"code": project["code"], "name": project["name"], "status": "active",
            "start_date": project["start_date"], "end_date": iso(end)}
    assert call(projects_service, "PUT", f"/{project['id']}", token=users["pm"]["token"], body=body)[0] == 200


def test_forecast_follows_the_critical_path(projects_service, users, chain):
    project, items = chain
    today = db_today()
    status, body = call(projects_service, "GET", f"/{project['id']}/forecast", token=users["viewer"]["token"])
    assert status == 200
    # 3 + 2 + 4 = 9 working days back to back, starting today (or Monday at the weekend)
    assert body["forecast_end"] == iso(schedule.add_working_days(today, 8))
    assert body["planned_end"] == project["end_date"]
    assert body["status"] == "on_track" and body["at_risk"] is False
    assert body["critical_path"] == [items[t]["id"] for t in "ABC"]
    assert body["confidence"] == {"level": "high", "estimated": 3, "remaining": 3}
    first = body["items"][0]
    assert (first["title"], first["critical"], first["remaining_days"], first["float_days"]) == ("A", True, 3, 0)
    assert first["start"] == iso(schedule.next_working_day(today))
    assert set(body["spi"]) == {"value", "earned", "planned", "explanation"}


def test_forecast_for_a_project_without_deliverables_or_estimates(projects_service, deliverables_service, users):
    pm = users["pm"]["token"]
    project = call(projects_service, "POST", "/", token=pm, body={"code": "FC-0", "name": "Empty"})[1]
    body = call(projects_service, "GET", f"/{project['id']}/forecast", token=pm)[1]
    assert (body["status"], body["forecast_end"], body["items"]) == ("no_deliverables", None, [])
    call(deliverables_service, "POST", "/", token=pm, body={"project_id": project["id"], "title": "No estimate"})
    body = call(projects_service, "GET", f"/{project['id']}/forecast", token=pm)[1]
    assert (body["status"], body["forecast_end"], body["confidence"]["level"]) == ("no_estimates", None, "low")


@pytest.mark.parametrize("role", ["admin", "pm", "other_pm", "team_lead", "viewer"])
def test_every_signed_in_role_can_read_the_forecast(projects_service, users, chain, role):
    assert call(projects_service, "GET", f"/{chain[0]['id']}/forecast", token=users[role]["token"])[0] == 200


def test_forecast_errors(projects_service, users, chain):
    project, _ = chain
    token = users["pm"]["token"]
    assert call(projects_service, "GET", f"/{project['id']}/forecast")[0] == 401
    status, body = call(projects_service, "GET", "/999999/forecast", token=token)
    assert (status, body["error"]["code"]) == (404, "not_found")
    assert call(projects_service, "GET", "/abc/forecast", token=token)[0] == 400
    assert call(projects_service, "POST", f"/{project['id']}/forecast", token=token, body={})[0] == 405


def test_project_list_carries_the_forecast_summary(projects_service, users, chain):
    project, _ = chain
    listed = call(projects_service, "GET", "/", token=users["viewer"]["token"])[1]["items"][0]
    assert listed["forecast_end"] == iso(schedule.add_working_days(db_today(), 8))
    assert (listed["forecast_status"], listed["forecast_confidence"]) == ("on_track", "high")
    assert listed["forecast_slip_days"] < 0
    set_end(projects_service, users, project, db_today() + timedelta(days=3))
    listed = call(projects_service, "GET", "/", token=users["viewer"]["token"])[1]["items"][0]
    assert listed["forecast_status"] == "late" and listed["forecast_slip_days"] > 0


@pytest.mark.parametrize("field, value, message", [
    ("estimate_days", 0, "Must be at least 1"),
    ("estimate_days", 366, "Must be at most 365"),
    ("estimate_days", "5", "Must be a whole number"),
    ("progress_pct", 101, "Must be at most 100"),
    ("progress_pct", -1, "Must be at least 0"),
    ("earliest_start", "next week", None),
])
def test_schedule_fields_are_validated(deliverables_service, users, chain, field, value, message):
    project, items = chain
    token = users["pm"]["token"]
    status, body = call(deliverables_service, "POST", "/", token=token,
                        body={"project_id": project["id"], "title": "New", field: value})
    assert (status, body["error"]["code"]) == (400, "validation_error")
    assert field in body["error"]["details"]
    if message:
        assert body["error"]["details"][field] == message
    assert call(deliverables_service, "PUT", f"/{items['A']['id']}", token=token,
                body={"title": "A", field: value})[0] == 400


def test_schedule_fields_round_trip_and_done_means_100(deliverables_service, users, chain):
    project, items = chain
    token = users["pm"]["token"]
    created = call(deliverables_service, "POST", "/", token=token, body={
        "project_id": project["id"], "title": "Full", "estimate_days": 8, "earliest_start": "2031-03-03",
        "progress_pct": 25})[1]
    assert (created["estimate_days"], created["earliest_start"], created["progress_pct"]) == (8, "2031-03-03", 25)
    assert items["A"]["progress_pct"] == 0 and items["A"]["earliest_start"] is None
    listed = call(deliverables_service, "GET", "/", token=token, query={"q": "Full"})[1]["items"][0]
    assert listed["estimate_days"] == 8
    done = call(deliverables_service, "PUT", f"/{created['id']}", token=token,
                body={"title": "Full", "status": "done", "progress_pct": 40})[1]
    assert (done["status"], done["progress_pct"]) == ("done", 100)
    born_done = call(deliverables_service, "POST", "/", token=token,
                     body={"project_id": project["id"], "title": "Born done", "status": "done"})[1]
    assert born_done["progress_pct"] == 100


def test_a_v1_2_shaped_put_keeps_the_schedule_fields(deliverables_service, users, chain):
    """Older clients send only the five original fields; that must never clear the new ones."""
    project, _ = chain
    token = users["pm"]["token"]
    created = call(deliverables_service, "POST", "/", token=token, body={
        "project_id": project["id"], "title": "Keep", "estimate_days": 8, "earliest_start": "2031-03-03",
        "progress_pct": 25})[1]
    old_client = {"title": "Keep (renamed)", "description": None, "status": "in_progress", "due_date": None,
                  "assignee_resource_id": None}
    status, body = call(deliverables_service, "PUT", f"/{created['id']}", token=token, body=old_client)
    assert status == 200 and body["title"] == "Keep (renamed)"
    assert (body["estimate_days"], body["earliest_start"], body["progress_pct"]) == (8, "2031-03-03", 25)
    # an explicit null does clear the two optional fields; progress cannot be null, so it stays
    cleared = call(deliverables_service, "PUT", f"/{created['id']}", token=token, body={
        **old_client, "estimate_days": None, "earliest_start": None, "progress_pct": None})[1]
    assert (cleared["estimate_days"], cleared["earliest_start"], cleared["progress_pct"]) == (None, None, 25)


def reasons_for(dashboard_service, users, code):
    items = call(dashboard_service, "GET", "/at-risk", token=users["admin"]["token"])[1]["items"]
    found = [p for p in items if p["code"] == code]
    return {r["type"]: r for r in found[0]["risk_reasons"]} if found else {}


def test_forecast_past_the_end_date_is_an_at_risk_reason(projects_service, dashboard_service, users, chain):
    project, items = chain
    assert "forecast_late" not in reasons_for(dashboard_service, users, "FC-1")
    today = db_today()
    end = today + timedelta(days=3)
    set_end(projects_service, users, project, end)
    reason = reasons_for(dashboard_service, users, "FC-1")["forecast_late"]
    slip = (schedule.add_working_days(today, 8) - end).days
    assert reason["severity"] == "medium"
    assert reason["message"] == f"Forecast to finish {slip} days after its end date"
    assert reason["details"]["slip_days"] == slip and reason["details"]["confidence"] == "high"
    assert reason["details"]["forecast_end"] == iso(schedule.add_working_days(today, 8))
    assert reason["details"]["critical_path"] == [items[t]["id"] for t in "ABC"]
    forecast = call(projects_service, "GET", f"/{project['id']}/forecast", token=users["pm"]["token"])[1]
    assert (forecast["status"], forecast["slip_days"], forecast["at_risk"]) == ("late", slip, True)


def test_a_late_forecast_with_low_confidence_is_not_flagged(
        projects_service, deliverables_service, dashboard_service, users, chain):
    project, _ = chain
    set_end(projects_service, users, project, db_today() + timedelta(days=3))
    for title in ("U1", "U2", "U3", "U4"):     # 3 of 7 remaining estimated: low confidence
        call(deliverables_service, "POST", "/", token=users["pm"]["token"],
             body={"project_id": project["id"], "title": title})
    forecast = call(projects_service, "GET", f"/{project['id']}/forecast", token=users["pm"]["token"])[1]
    assert (forecast["status"], forecast["confidence"]["level"], forecast["at_risk"]) == ("late", "low", False)
    assert "forecast_late" not in reasons_for(dashboard_service, users, "FC-1")
