"""Tests for the demo data generator (no database or network needed).

    backend/.venv/bin/pytest tests/seed
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spec  # noqa: E402  pylint: disable=wrong-import-position


def test_same_output_on_every_run():
    assert json.dumps(spec.build(), sort_keys=True) == json.dumps(spec.build(), sort_keys=True)


def test_sizes_match_the_brief():
    plan = spec.build()
    assert 6 <= len(plan["departments"]) <= 8
    assert 30 <= len(plan["people"]) <= 40
    assert 12 <= len(plan["projects"]) <= 15
    assert 130 <= len(plan["deliverables"]) <= 170
    roles = [u["role"] for u in plan["users"]]
    assert (roles.count("project_manager"), roles.count("team_lead"), roles.count("viewer")) == (3, 2, 2)
    assert sorted(u["role"] for u in plan["users"] if u["demo"]) == ["project_manager", "team_lead", "viewer"]


def test_names_codes_and_emails_are_unique():
    plan = spec.build()
    for key, field in (("people", "email"), ("users", "email"), ("projects", "code"), ("spend", "description")):
        values = [x[field] for x in plan[key]]
        assert len(values) == len(set(values)), key
    titles = [(d["project"], d["title"]) for d in plan["deliverables"]]
    assert len(titles) == len(set(titles))
    assert all(p["code"].startswith("ACME-") for p in plan["projects"])


def test_references_point_at_seeded_rows():
    plan = spec.build()
    departments = set(plan["departments"])
    people = {p["email"] for p in plan["people"]}
    projects = {p["code"] for p in plan["projects"]}
    leads = {u["email"] for u in plan["users"] if u["role"] == "team_lead"}
    assert {p["department"] for p in plan["people"]} <= departments
    assert {u["person"] for u in plan["users"]} <= people
    assert {p["team_lead"] for p in plan["projects"] if p["team_lead"]} <= leads
    assert {d["assignee"] for d in plan["deliverables"]} <= people
    assert {a["person"] for a in plan["allocations"]} <= people
    assert {x["project"] for key in ("deliverables", "allocations", "spend") for x in plan[key]} <= projects


def test_every_project_is_owned_by_a_seeded_pm():
    plan = spec.build()
    pms = {u["email"] for u in plan["users"] if u["role"] == "project_manager"}
    assert {p["owner"] for p in plan["projects"]} <= pms
    assert len({p["owner"] for p in plan["projects"]}) == 3   # each PM owns some


def test_dependencies_stay_in_their_project_and_have_no_cycles():
    plan = spec.build()
    titles = {(d["project"], d["title"]) for d in plan["deliverables"]}
    graph: dict = {}
    for dep in plan["dependencies"]:
        later, earlier = (dep["project"], dep["deliverable"]), (dep["project"], dep["depends_on"])
        assert later in titles and earlier in titles and later != earlier
        graph.setdefault(later, set()).add(earlier)
    state: dict = {}

    def visit(node):
        assert state.get(node) != "visiting", f"cycle through {node}"
        if state.get(node) == "done":
            return
        state[node] = "visiting"
        for nxt in graph.get(node, ()):
            visit(nxt)
        state[node] = "done"

    for node in graph:
        visit(node)


def test_dates_and_amounts_fit_the_api_rules():
    plan = spec.build()
    projects = {p["code"]: p for p in plan["projects"]}
    for a in plan["allocations"]:
        p = projects[a["project"]]
        assert p["start"] <= a["start"] <= a["end"] <= p["end"]
        assert 0 < a["hours"] <= 80
    for p in plan["people"]:
        assert 0 < p["weekly_hours"] <= 60
    for s in plan["spend"]:
        assert float(s["amount"]) >= 0
    # One allocation per person per project (overlaps there are a 409)
    pairs = [(a["project"], a["person"]) for a in plan["allocations"]]
    assert len(pairs) == len(set(pairs))


def test_the_mix_of_states_is_present():
    plan = spec.build()
    flags = spec.expected_flags(plan)
    reasons = {r for rs in flags["at_risk"].values() for r in rs}
    assert {"late", "overdue_deliverable", "schedule_slip", "blocked_due_soon", "over_allocated_resource"} <= reasons
    assert 2 <= len(flags["over_allocated"]) <= 3
    assert flags["over_budget"]
    statuses = {p["status"] for p in plan["projects"]}
    assert {"active", "completed", "cancelled", "planned"} <= statuses
    assert any(p["budget"] is None for p in plan["projects"])
    on_track = [p["code"] for p in plan["projects"] if p["archetype"] == "on_track"]
    assert on_track and not set(on_track) & set(flags["at_risk"])
    assert plan["deactivate"]
    assert {d["status"] for d in plan["deliverables"]} == {"not_started", "in_progress", "done", "cancelled"}


def test_people_mostly_full_time():
    hours = [p["weekly_hours"] for p in spec.build()["people"]]
    assert hours.count(40) >= len(hours) * 0.7 and any(h < 40 for h in hours)
