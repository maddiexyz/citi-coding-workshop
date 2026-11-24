"""Budgets (planned vs actual), the audit log, and who may delete a project."""

import pytest

from _common import audit, db
from conftest import call


@pytest.fixture
def project(projects_service, users):
    status, body = call(projects_service, "POST", "/", token=users["pm"]["token"], body={
        "code": "BUD-1", "name": "Budgeted", "status": "active", "budget_planned": "1000",
        "team_lead_id": users["team_lead"]["id"]})
    assert status == 201, body
    return body


def spend(service, token, project_id, amount, category="labor", spent_on="2030-01-15", **extra):
    return call(service, "POST", "/", token=token, body={
        "project_id": project_id, "category": category, "amount": amount, "spent_on": spent_on, **extra})


def summary(service, token, project_id):
    status, body = call(service, "GET", "/summary", token=token, query={"project_id": str(project_id)})
    assert status == 200, body
    return body


# --- Budget ----------------------------------------------------------------------

def test_burn_remaining_and_over_budget(budget_service, projects_service, users, project):
    token = users["pm"]["token"]
    assert spend(budget_service, token, project["id"], "600")[0] == 201
    assert spend(budget_service, token, project["id"], "500.00", category="software")[0] == 201

    body = summary(budget_service, users["viewer"]["token"], project["id"])
    assert (body["budget_planned"], body["actual"], body["remaining"]) == ("1000.00", "1100.00", "-100.00")
    assert (body["burn_pct"], body["over_budget"], body["budget_set"], body["currency"]) == ("110.0", True, True, "INR")
    assert {c["category"]: c["amount"] for c in body["by_category"]} == {
        "labor": "600.00", "software": "500.00", "hardware": "0.00", "travel": "0.00", "other": "0.00"}

    listed = call(projects_service, "GET", f"/{project['id']}", token=users["viewer"]["token"])[1]
    assert (listed["burn_pct"], listed["over_budget"], listed["actual_spend"]) == ("110.0", True, "1100.00")


def test_amounts_are_exact_decimals(budget_service, users, project):
    for amount in ("0.10", "0.20"):
        spend(budget_service, users["pm"]["token"], project["id"], amount)
    assert summary(budget_service, users["pm"]["token"], project["id"])["actual"] == "0.30"


@pytest.mark.parametrize("planned", [None, "0"])
def test_no_budget_set_never_divides_by_zero(budget_service, projects_service, users, planned):
    project = call(projects_service, "POST", "/", token=users["pm"]["token"],
                   body={"code": "BUD-0", "name": "No budget", "budget_planned": planned})[1]
    spend(budget_service, users["pm"]["token"], project["id"], "50")
    body = summary(budget_service, users["pm"]["token"], project["id"])
    assert (body["budget_set"], body["burn_pct"], body["remaining"], body["over_budget"]) == (False, None, None, False)
    assert body["actual"] == "50.00"


@pytest.mark.parametrize("fields, bad", [
    ({"amount": "-1"}, "amount"),
    ({"amount": "1.234"}, "amount"),
    ({"amount": "abc"}, "amount"),
    ({"category": "food"}, "category"),
    ({"spent_on": None}, "spent_on"),
    ({"spent_on": "2030-02-30"}, "spent_on"),
])
def test_entry_validation(budget_service, users, project, fields, bad):
    body = {"project_id": project["id"], "category": "labor", "amount": "10", "spent_on": "2030-01-15", **fields}
    status, result = call(budget_service, "POST", "/", token=users["pm"]["token"], body=body)
    assert status == 400 and bad in result["error"]["details"]


def test_planned_budget_validation(projects_service, users):
    for planned in ("-5", "12.345", "x"):
        status, body = call(projects_service, "POST", "/", token=users["pm"]["token"],
                            body={"code": "BUD-X", "name": "x", "budget_planned": planned})
        assert (status, list(body["error"]["details"])) == (400, ["budget_planned"])


@pytest.mark.parametrize("who, summary_ok, entries_ok, write_ok, delete_ok", [
    ("admin", True, True, True, True),
    ("pm", True, True, True, False),          # owning PM: everything except deleting entries
    ("other_pm", True, False, False, False),
    ("team_lead", True, False, False, False),  # assigned team lead: summary only
    ("viewer", True, False, False, False),
])
def test_budget_permissions(budget_service, users, project, who, summary_ok, entries_ok, write_ok, delete_ok):
    entry = spend(budget_service, users["pm"]["token"], project["id"], "10")[1]
    token = users[who]["token"]
    query = {"project_id": str(project["id"])}
    assert call(budget_service, "GET", "/summary", token=token, query=query)[0] == (200 if summary_ok else 403)
    assert call(budget_service, "GET", "/", token=token, query=query)[0] == (200 if entries_ok else 403)
    assert call(budget_service, "GET", f"/{entry['id']}", token=token)[0] == (200 if entries_ok else 403)
    assert spend(budget_service, token, project["id"], "5")[0] == (201 if write_ok else 403)
    update = call(budget_service, "PUT", f"/{entry['id']}", token=token,
                  body={"category": "travel", "amount": "12", "spent_on": "2030-01-16"})
    assert update[0] == (200 if write_ok else 403)
    assert call(budget_service, "DELETE", f"/{entry['id']}", token=token)[0] == (204 if delete_ok else 403)


def test_entry_filters(budget_service, users, project):
    token = users["pm"]["token"]
    spend(budget_service, token, project["id"], "1", category="labor", spent_on="2030-01-01", description="Contractor")
    spend(budget_service, token, project["id"], "2", category="travel", spent_on="2030-02-01", description="Flights")

    def amounts(query):
        status, body = call(budget_service, "GET", "/", token=token, query={"project_id": str(project["id"]), **query})
        assert status == 200, body
        return [item["amount"] for item in body["items"]]

    assert amounts({}) == ["2.00", "1.00"]                       # newest first
    assert amounts({"category": "travel"}) == ["2.00"]
    assert amounts({"from": "2030-01-15"}) == ["2.00"]
    assert amounts({"to": "2030-01-15"}) == ["1.00"]
    assert amounts({"q": "flight"}) == ["2.00"]
    assert call(budget_service, "GET", "/", token=token)[0] == 400   # project_id required
    assert call(budget_service, "GET", "/", token=token,
                query={"project_id": str(project["id"]), "category": "x"})[0] == 400


# --- Deleting a project with budget entries --------------------------------------

def test_project_with_spend_can_only_be_deleted_by_admin(budget_service, projects_service, users, project):
    spend(budget_service, users["pm"]["token"], project["id"], "10")
    status, body = call(projects_service, "DELETE", f"/{project['id']}", token=users["pm"]["token"])
    assert status == 403 and "cancelled" in body["error"]["message"]
    assert call(projects_service, "DELETE", f"/{project['id']}", token=users["admin"]["token"])[0] == 204


def test_project_without_spend_can_be_deleted_by_owning_pm(projects_service, users, project):
    assert call(projects_service, "DELETE", f"/{project['id']}", token=users["pm"]["token"])[0] == 204


# --- Audit log -------------------------------------------------------------------

def entries(audit_service, token, **query):
    status, body = call(audit_service, "GET", "/", token=token, query={k: str(v) for k, v in query.items()})
    assert status == 200, body
    return body["items"]


def test_changes_are_recorded_with_old_and_new_values(audit_service, budget_service, projects_service, users,
                                                      project):
    token = users["pm"]["token"]
    call(projects_service, "PUT", f"/{project['id']}", token=token, body={
        "code": "BUD-1", "name": "Budgeted", "status": "active", "budget_planned": "1500",
        "team_lead_id": users["team_lead"]["id"]})
    entry = spend(budget_service, token, project["id"], "40")[1]
    call(budget_service, "PUT", f"/{entry['id']}", token=token,
         body={"category": "labor", "amount": "45", "spent_on": "2030-01-15"})

    log = entries(audit_service, users["admin"]["token"], project_id=project["id"])
    assert [(e["action"], e["entity_type"]) for e in log] == [
        ("update", "budget_entry"), ("create", "budget_entry"), ("update", "project"), ("create", "project")]
    budget_change = log[2]
    assert (budget_change["old_values"], budget_change["new_values"]) == (
        {"budget_planned": "1000.00"}, {"budget_planned": "1500.00"})
    assert (log[0]["old_values"], log[0]["new_values"]) == ({"amount": "40.00"}, {"amount": "45.00"})
    assert all(e["actor_name"] == "Pm" for e in log)


def test_project_delete_keeps_a_snapshot(audit_service, budget_service, deliverables_service, projects_service,
                                         users, project):
    call(deliverables_service, "POST", "/", token=users["pm"]["token"],
         body={"project_id": project["id"], "title": "D1"})
    spend(budget_service, users["pm"]["token"], project["id"], "10")
    assert call(projects_service, "DELETE", f"/{project['id']}", token=users["admin"]["token"])[0] == 204

    deleted = entries(audit_service, users["admin"]["token"], entity_type="project", entity_id=project["id"])[0]
    assert (deleted["action"], deleted["old_values"]["code"]) == ("delete", "BUD-1")
    assert [d["title"] for d in deleted["details"]["deliverables"]] == ["D1"]
    assert [b["amount"] for b in deleted["details"]["budget_entries"]] == ["10.00"]


def test_a_failed_audit_write_rolls_back_the_change(budget_service, users, project, monkeypatch):
    def broken(*args, **kwargs):
        raise RuntimeError("audit store unavailable")
    monkeypatch.setattr(audit, "record", broken)
    status, _ = spend(budget_service, users["pm"]["token"], project["id"], "99")
    assert status == 500
    assert db.fetch_one("SELECT count(*) AS n FROM budget_entries")["n"] == 0


def test_unchanged_update_writes_no_entry(audit_service, deliverables_service, users, project):
    item = call(deliverables_service, "POST", "/", token=users["pm"]["token"],
                body={"project_id": project["id"], "title": "Same"})[1]
    call(deliverables_service, "PUT", f"/{item['id']}", token=users["pm"]["token"], body={"title": "Same"})
    assert len(entries(audit_service, users["admin"]["token"], entity_type="deliverable")) == 1


def test_audit_access(audit_service, users, project):
    query = {"project_id": str(project["id"])}
    assert call(audit_service, "GET", "/", token=users["pm"]["token"], query=query)[0] == 200
    assert call(audit_service, "GET", "/", token=users["pm"]["token"])[0] == 403            # must name a project
    assert call(audit_service, "GET", "/", token=users["other_pm"]["token"],
                query={"project_id": str(project["id"])})[0] == 403
    for who in ("team_lead", "viewer"):
        assert call(audit_service, "GET", "/", token=users[who]["token"],
                    query={"project_id": str(project["id"])})[0] == 403
    assert call(audit_service, "GET", "/", token=users["admin"]["token"], query={"entity_type": "x"})[0] == 400
    assert call(audit_service, "GET", "/", token=users["admin"]["token"], query={"limit": "501"})[0] == 400
