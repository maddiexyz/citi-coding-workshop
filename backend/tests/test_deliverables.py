"""Deliverables: CRUD, validation, computed flags, permissions and dependency rules."""

from datetime import timedelta

import pytest

from _common import db
from conftest import call, db_today


def make_project(projects_service, owner, code="DEL-1", team_lead_id=None, **extra):
    body = {"code": code, "name": f"Project {code}", "status": "active", **extra}
    if team_lead_id:
        body["team_lead_id"] = team_lead_id
    status, project = call(projects_service, "POST", "/", token=owner["token"], body=body)
    assert status == 201, project
    return project


def make_deliverable(service, token, project_id, title, **fields):
    status, body = call(service, "POST", "/", token=token, body={"project_id": project_id, "title": title, **fields})
    assert status == 201, body
    return body


@pytest.fixture
def project(projects_service, users):
    """A project owned by the PM with the team lead assigned."""
    return make_project(projects_service, users["pm"], team_lead_id=users["team_lead"]["id"])


# --- CRUD and validation ---------------------------------------------------------

def test_create_read_update_delete(deliverables_service, users, project):
    token = users["pm"]["token"]
    created = make_deliverable(deliverables_service, token, project["id"], "  Design doc ", due_date="2026-06-01")
    assert (created["title"], created["status"], created["due_date"]) == ("Design doc", "not_started", "2026-06-01")
    assert created["project_code"] == "DEL-1" and created["predecessors"] == []

    status, body = call(deliverables_service, "PUT", f"/{created['id']}", token=token,
                        body={"title": "Design doc v2", "status": "done"})
    assert status == 200
    assert (body["title"], body["status"], body["due_date"]) == ("Design doc v2", "done", None)
    assert body["completed_at"] is not None

    status, body = call(deliverables_service, "PUT", f"/{created['id']}", token=token,
                        body={"title": "Design doc v2", "status": "in_progress"})
    assert body["completed_at"] is None   # cleared when it leaves done

    assert call(deliverables_service, "GET", f"/{created['id']}", token=users["viewer"]["token"])[0] == 200
    assert call(deliverables_service, "DELETE", f"/{created['id']}", token=token)[0] == 204
    assert call(deliverables_service, "GET", f"/{created['id']}", token=token)[0] == 404


def test_validation_errors_are_reported_per_field(deliverables_service, users, project):
    status, body = call(deliverables_service, "POST", "/", token=users["pm"]["token"],
                        body={"project_id": "1", "title": " ", "status": "blocked", "due_date": "2026-02-30"})
    assert status == 400
    assert set(body["error"]["details"]) == {"project_id", "title", "status", "due_date"}


def test_unknown_project_is_a_validation_error(deliverables_service, users):
    status, body = call(deliverables_service, "POST", "/", token=users["admin"]["token"],
                        body={"project_id": 999999, "title": "Orphan"})
    assert (status, body["error"]["details"]) == (400, {"project_id": "Project not found"})


def test_ids_must_be_ascii_numbers(deliverables_service, users):
    token = users["viewer"]["token"]
    for raw in ("abc", "0", "²", "٣"):
        assert call(deliverables_service, "GET", f"/{raw}", token=token)[0] == 400


def test_list_filters(deliverables_service, projects_service, users, project):
    token = users["pm"]["token"]
    other = make_project(projects_service, users["pm"], code="DEL-2")
    yesterday = (db_today() - timedelta(days=1)).isoformat()
    late = make_deliverable(deliverables_service, token, project["id"], "Late report", due_date=yesterday)
    make_deliverable(deliverables_service, token, project["id"], "Finished", status="done", due_date=yesterday)
    make_deliverable(deliverables_service, token, other["id"], "Other project task")

    def titles(query):
        status, body = call(deliverables_service, "GET", "/", token=token, query=query)
        assert status == 200, body
        return sorted(item["title"] for item in body["items"])

    assert titles({"project_id": str(project["id"])}) == ["Finished", "Late report"]
    assert titles({"overdue": "true"}) == ["Late report"]
    assert titles({"status": "done"}) == ["Finished"]
    assert titles({"q": "report"}) == ["Late report"]
    assert titles({"due_before": db_today().isoformat(), "project_id": str(project["id"])}) == \
        ["Finished", "Late report"]
    assert late["is_overdue"] is True
    for bad in ({"status": "x"}, {"blocked": "yes"}, {"due_before": "soon"}, {"project_id": "x"}):
        assert call(deliverables_service, "GET", "/", token=token, query=bad)[0] == 400


def test_project_progress_counts(deliverables_service, projects_service, users, project):
    token = users["pm"]["token"]
    for title, status in [("A", "done"), ("B", "in_progress"), ("C", "cancelled")]:
        make_deliverable(deliverables_service, token, project["id"], title, status=status)
    body = call(projects_service, "GET", f"/{project['id']}", token=token)[1]
    assert (body["deliverables_done"], body["deliverables_total"]) == (1, 2)   # cancelled not counted


def test_deleting_a_project_deletes_its_deliverables(deliverables_service, projects_service, users, project):
    item = make_deliverable(deliverables_service, users["pm"]["token"], project["id"], "Goes away")
    assert call(projects_service, "DELETE", f"/{project['id']}", token=users["pm"]["token"])[0] == 204
    assert db.fetch_one("SELECT 1 AS found FROM deliverables WHERE id = %s", (item["id"],)) is None


# --- Permissions -----------------------------------------------------------------

@pytest.mark.parametrize("who, can_edit, can_delete", [
    ("admin", True, True),
    ("pm", True, True),             # owns the project
    ("team_lead", True, False),     # assigned team lead: edit but not delete
    ("other_pm", False, False),
    ("other_lead", False, False),   # a team lead not assigned to this project
    ("viewer", False, False),
])
def test_permissions_by_role(deliverables_service, users, project, who, can_edit, can_delete):
    token = users[who]["token"]
    item = make_deliverable(deliverables_service, users["pm"]["token"], project["id"], "Target")

    create = call(deliverables_service, "POST", "/", token=token, body={"project_id": project["id"], "title": "New"})
    update = call(deliverables_service, "PUT", f"/{item['id']}", token=token, body={"title": "Edited"})
    delete = call(deliverables_service, "DELETE", f"/{item['id']}", token=token)

    assert create[0] == (201 if can_edit else 403)
    assert update[0] == (200 if can_edit else 403)
    assert delete[0] == (204 if can_delete else 403)
    if not can_edit:
        assert create[1]["error"]["code"] == "forbidden"
    assert call(deliverables_service, "GET", "/", token=token)[0] == 200   # everyone reads


def test_every_route_requires_authentication(deliverables_service):
    for method, path in [("GET", "/"), ("POST", "/"), ("GET", "/1"), ("PUT", "/1"), ("DELETE", "/1"),
                         ("GET", "/1/dependencies"), ("POST", "/1/dependencies"), ("DELETE", "/1/dependencies/2")]:
        assert call(deliverables_service, method, path)[0] == 401


# --- Dependencies ----------------------------------------------------------------

@pytest.fixture
def chain(deliverables_service, users, project):
    """Deliverables A, B, C in the project, with A depending on B and B on C."""
    token = users["pm"]["token"]
    a, b, c = (make_deliverable(deliverables_service, token, project["id"], t) for t in "ABC")
    for x, y in ((a, b), (b, c)):
        status, body = call(deliverables_service, "POST", f"/{x['id']}/dependencies", token=token,
                            body={"depends_on_id": y["id"]})
        assert status == 201, body
    return a, b, c


def test_dependencies_compute_blocked_and_chain(deliverables_service, users, chain):
    a, b, c = chain
    token = users["viewer"]["token"]
    body = call(deliverables_service, "GET", f"/{b['id']}", token=token)[1]
    assert [p["title"] for p in body["predecessors"]] == ["C"]
    assert [s["title"] for s in body["successors"]] == ["A"]
    blocked = call(deliverables_service, "GET", "/", token=token, query={"blocked": "true"})[1]["items"]
    assert sorted(item["title"] for item in blocked) == ["A", "B"]

    # Finishing C unblocks B
    call(deliverables_service, "PUT", f"/{c['id']}", token=users["pm"]["token"], body={"title": "C", "status": "done"})
    assert call(deliverables_service, "GET", f"/{b['id']}", token=token)[1]["is_blocked"] is False
    assert call(deliverables_service, "GET", f"/{b['id']}/dependencies", token=token)[1]["items"][0]["title"] == "C"


def test_cycles_are_rejected_with_the_path(deliverables_service, users, chain):
    a, _, c = chain
    status, body = call(deliverables_service, "POST", f"/{c['id']}/dependencies", token=users["pm"]["token"],
                        body={"depends_on_id": a["id"]})
    assert (status, body["error"]["code"]) == (409, "dependency_cycle")
    assert body["error"]["details"]["depends_on_id"] == "C → A → B → C"
    assert db.fetch_one("SELECT count(*) AS n FROM deliverable_dependencies")["n"] == 2   # nothing added


def test_dependency_rules(deliverables_service, projects_service, users, chain):
    a, b, _ = chain
    token = users["pm"]["token"]
    other = make_project(projects_service, users["pm"], code="DEL-9")
    elsewhere = make_deliverable(deliverables_service, token, other["id"], "Elsewhere")

    def add(x, depends_on_id):
        return call(deliverables_service, "POST", f"/{x['id']}/dependencies", token=token,
                    body={"depends_on_id": depends_on_id})

    assert add(a, a["id"])[0] == 400                      # itself
    assert add(a, elsewhere["id"])[0] == 400              # other project
    assert add(a, 999999)[0] == 400                       # does not exist
    assert add(a, "x")[0] == 400                          # not a number
    assert add(a, b["id"])[1]["error"]["code"] == "conflict"   # already there (409)
    assert call(deliverables_service, "DELETE", f"/{a['id']}/dependencies/{b['id']}", token=token)[0] == 204
    assert call(deliverables_service, "DELETE", f"/{a['id']}/dependencies/{b['id']}", token=token)[0] == 404


def test_team_lead_manages_dependencies_only_when_assigned(deliverables_service, users, chain):
    a, _, c = chain
    for who, expected in (("team_lead", 201), ("other_lead", 403), ("viewer", 403)):
        status, _ = call(deliverables_service, "POST", f"/{a['id']}/dependencies", token=users[who]["token"],
                         body={"depends_on_id": c["id"]})
        assert status == expected
        if status == 201:
            call(deliverables_service, "DELETE", f"/{a['id']}/dependencies/{c['id']}", token=users[who]["token"])
