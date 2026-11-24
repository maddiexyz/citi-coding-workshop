"""Assignees may change the status of their own deliverables, and nothing else."""

import pytest

from conftest import call


@pytest.fixture
def setup(projects_service, deliverables_service, resources_service, users):
    """A project the viewer has no role in, with one deliverable assigned to the viewer's person."""
    admin = users["admin"]["token"]
    me = call(resources_service, "POST", "/", token=admin,
              body={"full_name": "Vee", "user_id": users["viewer"]["id"]})[1]
    other = call(resources_service, "POST", "/", token=admin, body={"full_name": "Other"})[1]
    project = call(projects_service, "POST", "/", token=users["pm"]["token"],
                   body={"code": "AS-1", "name": "Assigned"})[1]
    mine = call(deliverables_service, "POST", "/", token=admin, body={
        "project_id": project["id"], "title": "Mine", "due_date": "2030-01-10", "assignee_resource_id": me["id"]})[1]
    theirs = call(deliverables_service, "POST", "/", token=admin, body={
        "project_id": project["id"], "title": "Theirs", "assignee_resource_id": other["id"]})[1]
    return mine, theirs, me


def body_of(deliverable, **changes):
    fields = ("title", "description", "status", "due_date", "assignee_resource_id")
    return {**{f: deliverable[f] for f in fields}, **changes}


def test_assignee_changes_the_status_and_it_is_audited(deliverables_service, audit_service, users, setup):
    mine, _, _ = setup
    status, body = call(deliverables_service, "PUT", f"/{mine['id']}", token=users["viewer"]["token"],
                        body=body_of(mine, status="done"))
    assert (status, body["status"]) == (200, "done")
    entries = call(audit_service, "GET", "/", token=users["admin"]["token"],
                   query={"entity_type": "deliverable", "entity_id": str(mine["id"])})[1]["items"]
    assert (entries[0]["actor_name"], entries[0]["new_values"]["status"]) == ("Viewer", "done")


def test_someone_elses_deliverable_is_refused(deliverables_service, users, setup):
    _, theirs, _ = setup
    status, body = call(deliverables_service, "PUT", f"/{theirs['id']}", token=users["viewer"]["token"],
                        body=body_of(theirs, status="done"))
    assert (status, body["error"]["code"]) == (403, "forbidden")


@pytest.mark.parametrize("change", [{"title": "Renamed"}, {"due_date": "2031-01-01"}, {"description": "x"},
                                    {"assignee_resource_id": None}])
def test_assignee_cannot_change_other_fields(deliverables_service, users, setup, change):
    mine, _, _ = setup
    status, body = call(deliverables_service, "PUT", f"/{mine['id']}", token=users["viewer"]["token"],
                        body=body_of(mine, status="in_progress", **change))
    assert status == 403
    assert list(body["error"]["details"]) == list(change)


def test_assignee_cannot_delete_or_create(deliverables_service, users, setup):
    mine, _, _ = setup
    token = users["viewer"]["token"]
    assert call(deliverables_service, "DELETE", f"/{mine['id']}", token=token)[0] == 403
    assert call(deliverables_service, "POST", "/", token=token,
                body={"project_id": mine["project_id"], "title": "x"})[0] == 403
