"""Tests for the demo data generator (no database or network needed).

    backend/.venv/bin/pytest tests/seed
"""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

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
    assert {"late", "overdue_deliverable", "schedule_slip", "blocked_due_soon", "over_allocated_resource",
            "forecast_late"} <= reasons
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


def test_schedule_fields_fit_the_api_rules():
    plan = spec.build()
    projects = {p["code"]: p for p in plan["projects"]}
    for d in plan["deliverables"]:
        assert 1 <= d["estimate"] <= 365 and 0 <= d["progress"] <= 100
        assert (d["progress"] == 100) == (d["status"] == "done")
        assert d["status"] == "in_progress" or d["progress"] in (0, 100)
        if d["earliest_start"] is not None:
            assert d["status"] == "not_started"
            assert max(projects[d["project"]]["start"], 1) <= d["earliest_start"] < d["due"]
    assert any(d["earliest_start"] is not None for d in plan["deliverables"])


WEEK = [date(2026, 11, 23) + timedelta(days=n) for n in range(7)]    # Monday to Sunday


@pytest.mark.parametrize("today", WEEK, ids=lambda d: d.strftime("%a"))
def test_the_forecast_story_holds_on_every_weekday(today):
    """One project forecasts late through a clear critical path, one is on track, and no healthy one flips."""
    plan = spec.build()
    forecasts = spec.forecasts(plan, today)
    late = forecasts["ACME-TRN"]
    assert late["status"] == "late" and 7 <= late["slip_days"] <= 14
    assert late["critical_path"] == spec.LATE_FORECAST_PATH
    assert late["confidence"]["level"] == "high"
    on_track = forecasts["ACME-CRM"]
    assert on_track["status"] == "on_track" and -14 <= on_track["slip_days"] <= -5
    assert on_track["confidence"]["level"] == "high" and on_track["critical_path"]

    flagged = {code for code, reasons in spec.expected_flags(plan, today)["at_risk"].items()
               if "forecast_late" in reasons}
    assert flagged == {"ACME-TRN", "ACME-PAY"}          # PAY is already past its end date
    active = {p["code"] for p in plan["projects"] if p["status"] == "active"}
    assert all(forecasts[code]["status"] == "on_track" for code in active - flagged)


def test_the_other_flags_do_not_depend_on_the_weekday():
    plan = spec.build()

    def without_forecast(today):
        return {code: [r for r in reasons if r != "forecast_late"]
                for code, reasons in spec.expected_flags(plan, today)["at_risk"].items()}

    assert all(without_forecast(day) == without_forecast(WEEK[0]) for day in WEEK)
