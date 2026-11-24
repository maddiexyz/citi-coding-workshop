"""Resources, allocations, weekly load and over-allocation warnings."""

from datetime import date, timedelta

import pytest

from conftest import call

MONDAY = date(2030, 1, 7)   # a Monday inside the test project's dates


def iso(day: date) -> str:
    return day.isoformat()


@pytest.fixture
def project(projects_service, users):
    status, body = call(projects_service, "POST", "/", token=users["pm"]["token"], body={
        "code": "RES-1", "name": "Resourcing", "status": "active",
        "start_date": "2030-01-01", "end_date": "2030-12-31", "team_lead_id": users["team_lead"]["id"]})
    assert status == 201, body
    return body


@pytest.fixture
def other_project(projects_service, users):
    return call(projects_service, "POST", "/", token=users["admin"]["token"],
                body={"code": "RES-2", "name": "Other", "status": "active"})[1]


def make_resource(service, users, name="Pat", **fields):
    status, body = call(service, "POST", "/", token=users["admin"]["token"], body={"full_name": name, **fields})
    assert status == 201, body
    return body


def allocate(service, token, project_id, resource_id, hours, start=MONDAY, weeks=1, **extra):
    return call(service, "POST", "/", token=token, body={
        "project_id": project_id, "resource_id": resource_id, "hours_per_week": hours,
        "start_date": iso(start), "end_date": iso(start + timedelta(days=7 * weeks - 1)), **extra})


# --- Resources -------------------------------------------------------------------

def test_resource_crud_and_defaults(resources_service, users):
    created = make_resource(resources_service, users, "  Pat Lee ", email="Pat@Acme.test", department="Data",
                            user_id=users["team_lead"]["id"])
    assert (created["full_name"], created["email"], created["weekly_hours"]) == ("Pat Lee", "pat@acme.test", "40.00")
    assert (created["user_name"], created["is_active"], created["over_allocated"]) == ("Team Lead", True, False)

    status, body = call(resources_service, "PUT", f"/{created['id']}", token=users["admin"]["token"],
                        body={"full_name": "Pat Lee", "weekly_hours": "32.5", "is_active": False})
    assert (status, body["weekly_hours"], body["is_active"], body["user_id"]) == (200, "32.50", False, None)
    assert call(resources_service, "DELETE", f"/{created['id']}", token=users["admin"]["token"])[0] == 204


@pytest.mark.parametrize("fields, bad", [
    ({"full_name": " "}, "full_name"),
    ({"full_name": "x", "weekly_hours": 0}, "weekly_hours"),
    ({"full_name": "x", "weekly_hours": 61}, "weekly_hours"),          # cap catches typos
    ({"full_name": "x", "weekly_hours": "40.123"}, "weekly_hours"),
    ({"full_name": "x", "weekly_hours": "forty"}, "weekly_hours"),
    ({"full_name": "x", "email": "nope"}, "email"),
    ({"full_name": "x", "user_id": 999999}, "user_id"),
    ({"full_name": "x", "is_active": "yes"}, "is_active"),
])
def test_resource_validation(resources_service, users, fields, bad):
    status, body = call(resources_service, "POST", "/", token=users["admin"]["token"], body=fields)
    assert status == 400 and bad in body["error"]["details"]


def test_resource_uniqueness(resources_service, users):
    make_resource(resources_service, users, email="a@acme.test", user_id=users["viewer"]["id"])
    token = users["admin"]["token"]
    status, body = call(resources_service, "POST", "/", token=token, body={"full_name": "B", "email": "A@acme.test"})
    assert (status, list(body["error"]["details"])) == (409, ["email"])
    status, body = call(resources_service, "POST", "/", token=token,
                        body={"full_name": "C", "user_id": users["viewer"]["id"]})
    assert (status, list(body["error"]["details"])) == (409, ["user_id"])


@pytest.mark.parametrize("who", ["pm", "team_lead", "viewer"])
def test_only_admin_changes_resources(resources_service, users, who):
    resource = make_resource(resources_service, users)
    token = users[who]["token"]
    assert call(resources_service, "POST", "/", token=token, body={"full_name": "x"})[0] == 403
    assert call(resources_service, "PUT", f"/{resource['id']}", token=token, body={"full_name": "x"})[0] == 403
    assert call(resources_service, "DELETE", f"/{resource['id']}", token=token)[0] == 403
    assert call(resources_service, "GET", f"/{resource['id']}", token=token)[0] == 200


def test_resource_with_allocations_cannot_be_deleted(resources_service, allocations_service, users, project):
    resource = make_resource(resources_service, users)
    assert allocate(allocations_service, users["pm"]["token"], project["id"], resource["id"], 10)[0] == 201
    status, body = call(resources_service, "DELETE", f"/{resource['id']}", token=users["admin"]["token"])
    assert (status, body["error"]["code"]) == (409, "conflict")


# --- Allocations -----------------------------------------------------------------

def test_over_allocation_is_a_warning_not_a_block(resources_service, allocations_service, users, project,
                                                  other_project):
    resource = make_resource(resources_service, users)   # 40 h/week
    status, first = allocate(allocations_service, users["pm"]["token"], project["id"], resource["id"], 30)
    assert (status, first["warnings"]) == (201, [])

    status, second = allocate(allocations_service, users["admin"]["token"], other_project["id"],
                              resource["id"], 20, weeks=2)
    assert status == 201                                 # saved anyway
    assert second["warnings"] == [{"week_start": iso(MONDAY), "total_hours": "50.00",
                                   "weekly_hours": "40.00", "over_by": "10.00"}]

    week = {"week": iso(MONDAY + timedelta(days=3))}     # any day in that week
    over = call(resources_service, "GET", "/", token=users["viewer"]["token"],
                query={**week, "over_allocated": "true"})[1]
    assert [r["full_name"] for r in over["items"]] == ["Pat"] and over["week_start"] == iso(MONDAY)

    load = call(resources_service, "GET", f"/{resource['id']}/load", token=users["viewer"]["token"],
                query={"from": iso(MONDAY), "to": iso(MONDAY + timedelta(weeks=2))})[1]["weeks"]
    assert [(w["total_hours"], w["over_by"]) for w in load] == [("50.00", "10.00"), ("20.00", "0"), ("0", "0")]
    assert {p["project_code"] for p in load[0]["projects"]} == {"RES-1", "RES-2"}


def test_week_boundaries(resources_service, allocations_service, users, project):
    resource = make_resource(resources_service, users, weekly_hours=10)
    # Sunday to Monday: touches two weeks, so both count the full hours
    sunday = MONDAY + timedelta(days=6)
    call(allocations_service, "POST", "/", token=users["pm"]["token"], body={
        "project_id": project["id"], "resource_id": resource["id"], "hours_per_week": 8,
        "start_date": iso(sunday), "end_date": iso(sunday + timedelta(days=1))})
    load = call(resources_service, "GET", f"/{resource['id']}/load", token=users["pm"]["token"],
                query={"from": iso(MONDAY - timedelta(weeks=1)), "to": iso(MONDAY + timedelta(weeks=2))})[1]
    assert [w["total_hours"] for w in load["weeks"]] == ["0", "8.00", "8.00", "0"]


def test_cancelled_projects_do_not_count(resources_service, allocations_service, projects_service, users, project):
    resource = make_resource(resources_service, users, weekly_hours=10)
    allocate(allocations_service, users["pm"]["token"], project["id"], resource["id"], 20)
    call(projects_service, "PUT", f"/{project['id']}", token=users["pm"]["token"],
         body={"code": "RES-1", "name": "Resourcing", "status": "cancelled"})
    found = call(resources_service, "GET", "/", token=users["pm"]["token"],
                 query={"week": iso(MONDAY), "over_allocated": "true"})[1]["items"]
    assert found == []


def test_overlap_on_same_project_is_rejected(resources_service, allocations_service, users, project,
                                             other_project):
    resource = make_resource(resources_service, users)
    token = users["admin"]["token"]
    assert allocate(allocations_service, token, project["id"], resource["id"], 10, weeks=2)[0] == 201
    status, body = allocate(allocations_service, token, project["id"], resource["id"], 5,
                            start=MONDAY + timedelta(weeks=1))
    assert (status, body["error"]["code"]) == (409, "allocation_overlap")
    # Same period on another project is fine (that's what over-allocation warnings are for)
    assert allocate(allocations_service, token, other_project["id"], resource["id"], 5)[0] == 201
    # Back-to-back on the same project is fine
    assert allocate(allocations_service, token, project["id"], resource["id"], 5,
                    start=MONDAY + timedelta(weeks=2))[0] == 201


@pytest.mark.parametrize("change, field", [
    ({"start_date": "2029-12-31"}, "start_date"),        # before the project starts
    ({"end_date": "2031-01-01"}, "end_date"),            # after the project ends
    ({"hours_per_week": 0}, "hours_per_week"),
    ({"hours_per_week": 81}, "hours_per_week"),          # cap catches typos
    ({"end_date": "2030-01-01"}, "end_date"),            # before its own start
    ({"start_date": None}, "start_date"),
    ({"resource_id": 999999}, "resource_id"),
])
def test_allocation_validation(resources_service, allocations_service, users, project, change, field):
    resource = make_resource(resources_service, users)
    body = {"project_id": project["id"], "resource_id": resource["id"], "hours_per_week": 10,
            "start_date": iso(MONDAY), "end_date": iso(MONDAY + timedelta(days=6)), **change}
    status, result = call(allocations_service, "POST", "/", token=users["pm"]["token"], body=body)
    assert status == 400 and field in result["error"]["details"]


def test_inactive_resource_cannot_be_allocated(resources_service, allocations_service, users, project):
    resource = make_resource(resources_service, users, is_active=False)
    status, body = allocate(allocations_service, users["pm"]["token"], project["id"], resource["id"], 10)
    assert (status, body["error"]["details"]) == (400, {"resource_id": "This resource is inactive"})


@pytest.mark.parametrize("who, allowed", [
    ("admin", True), ("pm", True), ("other_pm", False), ("team_lead", False), ("viewer", False)])
def test_allocation_permissions(resources_service, allocations_service, users, project, who, allowed):
    resource = make_resource(resources_service, users)
    existing = allocate(allocations_service, users["pm"]["token"], project["id"], resource["id"], 5)[1]
    token = users[who]["token"]
    create = allocate(allocations_service, token, project["id"], resource["id"], 5, start=MONDAY + timedelta(weeks=4))
    update = call(allocations_service, "PUT", f"/{existing['id']}", token=token, body={
        "resource_id": resource["id"], "hours_per_week": 6,
        "start_date": existing["start_date"], "end_date": existing["end_date"]})
    delete = call(allocations_service, "DELETE", f"/{existing['id']}", token=token)
    assert (create[0], update[0], delete[0]) == ((201, 200, 204) if allowed else (403, 403, 403))
    listing = call(allocations_service, "GET", "/", token=token, query={"project_id": str(project["id"])})
    assert listing[0] == 200   # everyone reads, including the assigned team lead


def test_allocation_filters(resources_service, allocations_service, users, project, other_project):
    pat = make_resource(resources_service, users, "Pat")
    sam = make_resource(resources_service, users, "Sam")
    token = users["admin"]["token"]
    allocate(allocations_service, token, project["id"], pat["id"], 10)
    allocate(allocations_service, token, other_project["id"], sam["id"], 10, start=MONDAY + timedelta(weeks=3))

    def names(query):
        status, body = call(allocations_service, "GET", "/", token=token, query=query)
        assert status == 200, body
        return [item["resource_name"] for item in body["items"]]

    assert names({"project_id": str(project["id"])}) == ["Pat"]
    assert names({"resource_id": str(sam["id"])}) == ["Sam"]
    assert names({"active_on": iso(MONDAY + timedelta(days=2))}) == ["Pat"]
    assert call(allocations_service, "GET", "/", token=token, query={"active_on": "soon"})[0] == 400


# --- Deliverable assignees -------------------------------------------------------

def test_deliverable_assignee(resources_service, deliverables_service, users, project):
    pat = make_resource(resources_service, users, "Pat")
    gone = make_resource(resources_service, users, "Gone", is_active=False)
    token = users["pm"]["token"]
    status, item = call(deliverables_service, "POST", "/", token=token,
                        body={"project_id": project["id"], "title": "Spec", "assignee_resource_id": pat["id"]})
    assert (status, item["assignee_name"]) == (201, "Pat")
    status, body = call(deliverables_service, "POST", "/", token=token,
                        body={"project_id": project["id"], "title": "x", "assignee_resource_id": gone["id"]})
    assert (status, list(body["error"]["details"])) == (400, ["assignee_resource_id"])
    found = call(deliverables_service, "GET", "/", token=token, query={"assignee": str(pat["id"])})[1]["items"]
    assert [d["title"] for d in found] == ["Spec"]
