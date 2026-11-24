"""At-risk signals and the dashboard summary (all computed at query time)."""

from datetime import timedelta

from conftest import call, db_today


def today():
    """Today by the database clock (looked up per test, after the test database exists)."""
    return db_today()


def monday():
    return today() - timedelta(days=today().weekday())


def iso(day):
    return day.isoformat()


def project(projects_service, users, code, **fields):
    body = {"code": code, "name": f"Project {code}", "status": "active", **fields}
    status, created = call(projects_service, "POST", "/", token=users["admin"]["token"], body=body)
    assert status == 201, created
    return created


def deliverable(deliverables_service, users, project_id, title, **fields):
    status, created = call(deliverables_service, "POST", "/", token=users["admin"]["token"],
                           body={"project_id": project_id, "title": title, **fields})
    assert status == 201, created
    return created


def at_risk(dashboard_service, users, **query):
    status, body = call(dashboard_service, "GET", "/at-risk", token=users["viewer"]["token"], query=query or None)
    assert status == 200, body
    return {p["code"]: p for p in body["items"]}


def reason_types(item):
    return [r["type"] for r in item["risk_reasons"]]


def test_healthy_project_is_not_listed(dashboard_service, projects_service, users):
    project(projects_service, users, "OK-1", start_date=iso(today() - timedelta(days=10)),
            end_date=iso(today() + timedelta(days=100)))
    assert at_risk(dashboard_service, users) == {}


def test_late_project_is_high_severity(dashboard_service, projects_service, users):
    project(projects_service, users, "LATE-1", start_date=iso(today() - timedelta(days=60)),
            end_date=iso(today() - timedelta(days=3)))
    item = at_risk(dashboard_service, users)["LATE-1"]
    assert (item["severity"], reason_types(item)) == ("high", ["late"])
    assert item["risk_reasons"][0]["details"]["days_late"] == 3


def test_overdue_deliverable(dashboard_service, projects_service, deliverables_service, users):
    p = project(projects_service, users, "OD-1")
    deliverable(deliverables_service, users, p["id"], "Report", due_date=iso(today() - timedelta(days=1)))
    item = at_risk(dashboard_service, users)["OD-1"]
    assert reason_types(item) == ["overdue_deliverable"]
    assert item["risk_reasons"][0]["details"]["deliverables"][0]["title"] == "Report"


def test_schedule_slip_uses_the_threshold(dashboard_service, projects_service, deliverables_service, users,
                                          monkeypatch):
    # Halfway through the schedule with nothing done: 50 points behind
    p = project(projects_service, users, "SLIP-1", start_date=iso(today() - timedelta(days=50)),
                end_date=iso(today() + timedelta(days=50)))
    deliverable(deliverables_service, users, p["id"], "A", due_date=iso(today() + timedelta(days=30)))
    item = at_risk(dashboard_service, users)["SLIP-1"]
    assert reason_types(item) == ["schedule_slip"]
    assert item["risk_reasons"][0]["details"]["gap_points"] == "50.0"
    monkeypatch.setenv("AT_RISK_SLIP_POINTS", "60")
    assert "SLIP-1" not in at_risk(dashboard_service, users)


def test_schedule_slip_skips_projects_without_deliverables_or_not_started(dashboard_service, projects_service,
                                                                          users):
    project(projects_service, users, "EMPTY-1", start_date=iso(today() - timedelta(days=50)),
            end_date=iso(today() + timedelta(days=50)))
    project(projects_service, users, "FUTURE-1", status="planned", start_date=iso(today() + timedelta(days=5)),
            end_date=iso(today() - timedelta(days=1) + timedelta(days=100)))
    assert at_risk(dashboard_service, users) == {}


def test_blocked_deliverable_due_soon(dashboard_service, projects_service, deliverables_service, users):
    p = project(projects_service, users, "BLK-1")
    first = deliverable(deliverables_service, users, p["id"], "First")
    second = deliverable(deliverables_service, users, p["id"], "Second", due_date=iso(today() + timedelta(days=3)))
    call(deliverables_service, "POST", f"/{second['id']}/dependencies", token=users["admin"]["token"],
         body={"depends_on_id": first["id"]})
    assert reason_types(at_risk(dashboard_service, users)["BLK-1"]) == ["blocked_due_soon"]


def test_over_allocated_person_this_week(dashboard_service, projects_service, resources_service,
                                         allocations_service, users):
    p = project(projects_service, users, "OVR-1")
    person = call(resources_service, "POST", "/", token=users["admin"]["token"],
                  body={"full_name": "Busy Bee", "weekly_hours": 10})[1]
    call(allocations_service, "POST", "/", token=users["admin"]["token"], body={
        "project_id": p["id"], "resource_id": person["id"], "hours_per_week": 30,
        "start_date": iso(monday()), "end_date": iso(monday() + timedelta(days=6))})
    item = at_risk(dashboard_service, users)["OVR-1"]
    assert reason_types(item) == ["over_allocated_resource"]
    assert item["risk_reasons"][0]["details"]["people"][0]["full_name"] == "Busy Bee"


def test_over_budget_is_a_separate_flag(dashboard_service, projects_service, budget_service, users):
    p = project(projects_service, users, "BUD-1", budget_planned="100")
    call(budget_service, "POST", "/", token=users["admin"]["token"], body={
        "project_id": p["id"], "category": "other", "amount": "150", "spent_on": iso(today())})
    item = at_risk(dashboard_service, users)["BUD-1"]
    assert (item["is_at_risk"], item["over_budget"], item["risk_reasons"]) == (False, True, [])
    assert at_risk(dashboard_service, users, flag="at_risk") == {}
    assert list(at_risk(dashboard_service, users, flag="over_budget")) == ["BUD-1"]


def test_completed_and_cancelled_projects_are_not_evaluated(dashboard_service, projects_service, users):
    for code, status in (("DONE-1", "completed"), ("STOP-1", "cancelled"), ("HOLD-1", "on_hold")):
        project(projects_service, users, code, status=status, end_date=iso(today() - timedelta(days=5)))
    assert at_risk(dashboard_service, users) == {}


def test_filters_and_ordering(dashboard_service, projects_service, deliverables_service, users):
    project(projects_service, users, "LATE-2", end_date=iso(today() - timedelta(days=1)))
    p = project(projects_service, users, "OD-2")
    deliverable(deliverables_service, users, p["id"], "Late", due_date=iso(today() - timedelta(days=1)))
    status, body = call(dashboard_service, "GET", "/at-risk", token=users["viewer"]["token"])
    assert [i["code"] for i in body["items"]] == ["LATE-2", "OD-2"]          # most severe first
    assert list(at_risk(dashboard_service, users, severity="medium")) == ["OD-2"]
    assert list(at_risk(dashboard_service, users, q="late")) == ["LATE-2"]
    assert call(dashboard_service, "GET", "/at-risk", token=users["viewer"]["token"], query={"flag": "x"})[0] == 400


def test_summary_counts(dashboard_service, projects_service, deliverables_service, users):
    project(projects_service, users, "LATE-3", end_date=iso(today() - timedelta(days=1)))
    p = project(projects_service, users, "PLAN-3", status="planned")
    deliverable(deliverables_service, users, p["id"], "Overdue", due_date=iso(today() - timedelta(days=2)))
    status, body = call(dashboard_service, "GET", "/summary", token=users["team_lead"]["token"])
    assert status == 200
    assert (body["active_projects"], body["at_risk"], body["high_risk"]) == (1, 1, 1)
    assert body["overdue_deliverables"] == 1
    assert {s["status"]: s["count"] for s in body["projects_by_status"]}["planned"] == 1
    assert call(dashboard_service, "GET", "/summary")[0] == 401
