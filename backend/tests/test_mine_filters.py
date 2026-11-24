"""'Mine' filters: owner=me, team_lead=me, assignee=me, resource=me, resolved from the token."""

from conftest import call


def test_projects_owned_and_led_by_me(projects_service, users):
    call(projects_service, "POST", "/", token=users["pm"]["token"], body={"code": "MINE-1", "name": "Mine"})
    call(projects_service, "POST", "/", token=users["other_pm"]["token"],
         body={"code": "LED-1", "name": "Led", "team_lead_id": users["team_lead"]["id"]})

    def codes(who, query):
        status, body = call(projects_service, "GET", "/", token=users[who]["token"], query=query)
        assert status == 200, body
        return [p["code"] for p in body["items"]]

    assert codes("pm", {"owner": "me"}) == ["MINE-1"]
    assert codes("other_pm", {"owner": "me"}) == ["LED-1"]
    assert codes("team_lead", {"team_lead": "me"}) == ["LED-1"]
    assert codes("viewer", {"owner": "me"}) == []
    assert sorted(codes("viewer", {})) == ["LED-1", "MINE-1"]


def test_me_is_the_only_accepted_value(projects_service, allocations_service, users):
    other = str(users["other_pm"]["id"])
    assert call(projects_service, "GET", "/", token=users["pm"]["token"], query={"owner": other})[0] == 400
    assert call(projects_service, "GET", "/", token=users["pm"]["token"], query={"team_lead": "you"})[0] == 400
    assert call(allocations_service, "GET", "/", token=users["pm"]["token"], query={"resource": other})[0] == 400


def test_my_deliverables_and_allocations(projects_service, deliverables_service, resources_service,
                                        allocations_service, users):
    admin = users["admin"]["token"]
    mine = call(resources_service, "POST", "/", token=admin,
                body={"full_name": "Me", "user_id": users["team_lead"]["id"]})[1]
    other = call(resources_service, "POST", "/", token=admin, body={"full_name": "Other"})[1]
    project = call(projects_service, "POST", "/", token=admin, body={"code": "ME-1", "name": "Me"})[1]
    for title, person in (("Mine", mine), ("Theirs", other)):
        call(deliverables_service, "POST", "/", token=admin,
             body={"project_id": project["id"], "title": title, "assignee_resource_id": person["id"]})
    for person in (mine, other):
        call(allocations_service, "POST", "/", token=admin, body={
            "project_id": project["id"], "resource_id": person["id"], "hours_per_week": 10,
            "start_date": "2030-01-07", "end_date": "2030-01-13"})

    lead = users["team_lead"]["token"]
    found = call(deliverables_service, "GET", "/", token=lead, query={"assignee": "me"})[1]["items"]
    assert [d["title"] for d in found] == ["Mine"]
    found = call(allocations_service, "GET", "/", token=lead, query={"resource": "me"})[1]["items"]
    assert [a["resource_name"] for a in found] == ["Me"]

    # Someone with no linked person gets nothing, not everything
    viewer = users["viewer"]["token"]
    assert call(deliverables_service, "GET", "/", token=viewer, query={"assignee": "me"})[1]["items"] == []
    assert call(allocations_service, "GET", "/", token=viewer, query={"resource": "me"})[1]["items"] == []
