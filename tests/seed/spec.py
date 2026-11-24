"""
Demo data spec for ACME: what the seeder creates, generated deterministically.

Kept apart from the loader (seed_api.py) so later versions can add fields
(e.g. deliverable estimates and progress) without touching how data is sent.

All dates are day offsets from "today" (0); the loader turns them into real
dates. Allocations that should count for "this week" span at least a week
on each side of today, and the others stay well clear of it, so the result
doesn't depend on the weekday the seeder runs.

``build()`` returns plain dicts; ``expected_flags()`` applies the app's
at-risk rules (backend/_common/risk.py) to the spec, so tests can prove the
intended mix of states is really there.

v2 (forecasting): every deliverable also has an ``estimate`` (working days),
a ``progress`` percentage and, when not started, an ``earliest_start`` two
weeks before its due date. They are derived after everything else, so the
rest of the data is exactly what earlier versions generated. ``forecasts()``
runs the app's own pure schedule engine (backend/_common/schedule.py) over
the spec: ACME-CRM is the on-track example, ACME-TRN the one that forecasts
late through a clear critical path.
"""

import importlib.util
import random
from datetime import date, timedelta
from pathlib import Path

SEED = 20261125
EMAIL_DOMAIN = "acme.example"   # reserved domain: no real mailbox
CODE_PREFIX = "ACME-"
SLIP_POINTS = 20                # AT_RISK_SLIP_POINTS default
BLOCKED_SOON_DAYS = 7
REFERENCE_TODAY = date(2026, 11, 25)   # only fixes the weekday when no date is given; the tests try all seven
START_LEAD_DAYS = 14                   # a deliverable not yet started may begin this long before it is due
FORECAST_FLAG_LEVELS = ("high", "medium")

# The late-forecast story: the last three stages of the learning platform cannot begin before
# integration is ready to start, and together need more working days than are left.
# Critical path: Integration -> Security review -> User acceptance testing.
LATE_FORECAST = {"TRN": {"Integration": 15, "Security review": 12, "User acceptance testing": 15}}
LATE_FORECAST_PATH = ["Integration", "Security review", "User acceptance testing"]

DEPARTMENTS = ["Engineering", "Finance", "Operations", "Sales", "Human Resources",
               "Data & Analytics", "Customer Support"]

# (name, title, department, weekly hours)
PEOPLE = [
    ("Ananya Iyer", "Programme Manager", "Engineering", 40),
    ("Rohan Mehta", "Project Manager", "Finance", 40),
    ("Kavya Reddy", "Project Manager", "Operations", 40),
    ("Arjun Nair", "Engineering Lead", "Engineering", 40),
    ("Sneha Kulkarni", "Analytics Lead", "Data & Analytics", 40),
    ("Vikram Singh", "Business Analyst", "Sales", 40),
    ("Pooja Desai", "HR Business Partner", "Human Resources", 40),
    ("Aditya Rao", "Senior Developer", "Engineering", 40),
    ("Meenakshi Pillai", "Developer", "Engineering", 40),
    ("Siddharth Joshi", "Developer", "Engineering", 40),
    ("Divya Menon", "QA Engineer", "Engineering", 40),
    ("Karthik Subramanian", "DevOps Engineer", "Engineering", 40),
    ("Neha Agarwal", "UX Designer", "Engineering", 30),
    ("Rahul Verma", "Financial Analyst", "Finance", 40),
    ("Priya Sharma", "Accountant", "Finance", 40),
    ("Amit Patel", "Finance Controller", "Finance", 40),
    ("Lakshmi Narayanan", "Payments Specialist", "Finance", 20),
    ("Suresh Babu", "Warehouse Supervisor", "Operations", 40),
    ("Deepa Krishnan", "Logistics Planner", "Operations", 40),
    ("Manoj Tiwari", "Operations Analyst", "Operations", 40),
    ("Farhan Qureshi", "Automation Engineer", "Operations", 20),
    ("Ishita Banerjee", "Account Executive", "Sales", 40),
    ("Varun Malhotra", "Sales Operations Analyst", "Sales", 40),
    ("Nisha Gupta", "Sales Manager", "Sales", 40),
    ("Harish Chandra", "CRM Administrator", "Sales", 30),
    ("Shruti Saxena", "Recruiter", "Human Resources", 40),
    ("Gaurav Bhatt", "L&D Specialist", "Human Resources", 40),
    ("Ritu Chawla", "HR Generalist", "Human Resources", 20),
    ("Abhishek Pandey", "Data Engineer", "Data & Analytics", 40),
    ("Swati Mishra", "Data Scientist", "Data & Analytics", 40),
    ("Nikhil Kapoor", "BI Developer", "Data & Analytics", 40),
    ("Tanvi Shah", "Data Analyst", "Data & Analytics", 40),
    ("Sanjay Yadav", "Support Manager", "Customer Support", 40),
    ("Bhavana Hegde", "Support Engineer", "Customer Support", 40),
    ("Imran Sheikh", "Support Engineer", "Customer Support", 40),
    ("Revathi Sundaram", "Knowledge Manager", "Customer Support", 30),
]

# Sign-in accounts linked to people: (person, role, named demo account?)
USERS = [
    ("Ananya Iyer", "project_manager", True),
    ("Rohan Mehta", "project_manager", False),
    ("Kavya Reddy", "project_manager", False),
    ("Arjun Nair", "team_lead", True),
    ("Sneha Kulkarni", "team_lead", False),
    ("Vikram Singh", "viewer", True),
    ("Pooja Desai", "viewer", False),
]

ON_LEAVE = "Revathi Sundaram"   # deactivated by the admin at the end

# Projects: code, name, department, owner, team lead, start, end, budget (₹, None = no budget),
# final status, archetype (the state it is meant to show)
PROJECTS = [
    ("PAY", "Payments gateway revamp", "Finance", "Rohan Mehta", "Arjun Nair", -120, -6, "1800000", "active", "late"),
    ("CRM", "CRM migration", "Sales", "Ananya Iyer", None, -30, 90, "1200000", "active", "on_track"),
    ("DWH", "Data warehouse modernisation", "Data & Analytics", "Kavya Reddy", "Sneha Kulkarni", -60, 60, "2500000",
     "active", "slip"),
    ("APP", "Customer mobile app", "Engineering", "Ananya Iyer", "Arjun Nair", -40, 80, "3000000", "active",
     "blocked_soon"),
    ("HRP", "HR self-service portal", "Human Resources", "Rohan Mehta", None, -50, 70, "800000", "active",
     "over_budget"),
    ("WMS", "Warehouse management system", "Operations", "Kavya Reddy", "Arjun Nair", -45, 75, "2200000", "active",
     "over_allocated"),
    ("SUP", "Support desk automation", "Customer Support", "Ananya Iyer", "Sneha Kulkarni", -35, 85, "900000",
     "active", "over_allocated"),
    ("SEC", "Security hardening", "Engineering", "Rohan Mehta", "Arjun Nair", -20, 100, None, "active", "no_budget"),
    ("ANL", "Sales analytics dashboards", "Data & Analytics", "Kavya Reddy", "Sneha Kulkarni", -160, -20, "1500000",
     "completed", "completed"),
    ("ERP", "ERP upgrade", "Finance", "Rohan Mehta", None, -90, 120, "4000000", "cancelled", "cancelled"),
    ("KYC", "KYC automation", "Finance", "Ananya Iyer", None, 20, 140, "1100000", "planned", "planned"),
    ("LOG", "Logistics route optimisation", "Operations", "Kavya Reddy", None, -25, 95, None, "active", "on_track"),
    ("TRN", "Learning platform", "Human Resources", "Rohan Mehta", "Sneha Kulkarni", -15, 105, "600000", "active",
     "forecast_late"),
]

PHASES = ["Discovery workshop", "Requirements sign-off", "Solution design", "Data model", "API contract",
          "Build iteration 1", "Build iteration 2", "Integration", "Security review", "Performance testing",
          "User acceptance testing", "Training material", "Go-live readiness", "Hypercare plan"]

# People over-allocated this week: (person, [(project, hours)]) against their weekly hours
OVER_ALLOCATED = [
    ("Aditya Rao", [("WMS", 25), ("SUP", 25)]),          # 50 of 40
    ("Suresh Babu", [("WMS", 30), ("SUP", 20)]),         # 50 of 40
    ("Farhan Qureshi", [("WMS", 15), ("SUP", 10)]),      # 25 of 20 (part-time)
]

SPEND_CATEGORIES = ["labor", "software", "hardware", "travel", "other"]


def email_of(name: str) -> str:
    """firstname.lastname@acme.example"""
    first, *rest = name.lower().split()
    return f"{first}.{''.join(rest)}@{EMAIL_DOMAIN}"


# pylint: disable-next=too-many-locals
def _deliverables_for(rng: random.Random, project: dict, people_by_dept: dict, user_people: set) -> list[dict]:
    """10–13 deliverables spread over the project, with statuses that fit its archetype."""
    start, end, kind = project["start"], project["end"], project["archetype"]
    count = rng.randint(10, 13)
    titles = PHASES[:count]
    span = end - start
    team = people_by_dept[project["department"]]
    items = []
    for i, title in enumerate(titles):
        due = start + round(span * (i + 1) / count)
        # Most work goes to the department; some to people with accounts (so they update their own)
        pool = sorted(user_people) if rng.random() < 0.25 else team
        assignee = rng.choice([p for p in pool if p != ON_LEAVE])
        if kind in ("completed",):
            status = "done"
        elif kind == "cancelled":
            status = "done" if due < -30 else "cancelled"
        elif kind == "planned":
            status = "not_started"
        elif kind == "late":
            status = "done" if i < count * 0.6 else ("in_progress" if i < count * 0.8 else "not_started")
        elif kind == "slip":
            status = "done" if i == 0 else ("in_progress" if due < 15 else "not_started")
        else:  # on track: everything past due is done, the next ones are in progress
            if due < 0:
                status = "done"
            elif due <= 21:
                status = "in_progress"
            else:
                status = "not_started"
        items.append({"project": project["code"], "title": title, "due": due, "status": status,
                      "assignee": email_of(assignee)})
    return items


def _dependencies_for(rng: random.Random, project: dict, items: list[dict]) -> list[dict]:
    """
    Chains from earlier to later deliverables only (so no cycles). For
    projects that should not be at risk, a deliverable due within the next
    7 days never waits on one that isn't done.
    """
    deps = []
    blocking_ok = project["archetype"] in ("late", "slip", "blocked_soon", "cancelled")
    for later_index in range(1, len(items)):
        later = items[later_index]
        if rng.random() < 0.45:
            earlier = items[rng.randrange(max(0, later_index - 3), later_index)]
            soon = 0 <= later["due"] <= BLOCKED_SOON_DAYS
            if soon and earlier["status"] not in ("done", "cancelled") and not blocking_ok:
                continue
            deps.append({"project": project["code"], "deliverable": later["title"], "depends_on": earlier["title"]})
    if project["archetype"] == "blocked_soon":
        # A deliverable due in 3 days waits on one that isn't finished
        items.append({"project": project["code"], "title": "App store submission", "due": 3,
                      "status": "not_started", "assignee": email_of("Divya Menon")})
        items.append({"project": project["code"], "title": "Release candidate build", "due": 10,
                      "status": "in_progress", "assignee": email_of("Siddharth Joshi")})
        deps.append({"project": project["code"], "deliverable": "App store submission",
                     "depends_on": "Release candidate build"})
    return deps


def _allocations(rng: random.Random, projects: list[dict], people: list[dict]) -> list[dict]:
    """
    Over-allocated people on WMS and SUP for this week; everyone else on at
    most one active project, within their capacity.
    """
    by_code = {p["code"]: p for p in projects}
    allocations = []
    over = set()
    for name, bookings in OVER_ALLOCATED:
        over.add(name)
        for code, hours in bookings:
            code = f"{CODE_PREFIX}{code}"
            p = by_code[code]
            allocations.append({"project": code, "person": email_of(name), "hours": hours,
                                "start": max(p["start"], -14), "end": min(p["end"], 28), "note": "Rollout"})
    used = set(over) | {ON_LEAVE}
    for p in projects:
        if p["archetype"] in ("cancelled", "planned"):
            continue
        dept_people = [x for x in people if x["department"] == p["department"] and x["full_name"] not in used]
        for person in rng.sample(dept_people, min(2, len(dept_people))):
            used.add(person["full_name"])
            hours = min(person["weekly_hours"], rng.choice([10, 15, 20, 25]))
            allocations.append({"project": p["code"], "person": person["email"], "hours": hours,
                                "start": p["start"], "end": p["end"], "note": person["title"]})
    return allocations


def _spend(rng: random.Random, projects: list[dict]) -> list[dict]:
    """Spend entries in ₹: over plan for the over-budget projects, comfortably under it otherwise."""
    entries = []
    for p in projects:
        if p["archetype"] in ("planned",):
            continue
        budget = int(p["budget"]) if p["budget"] else 900000
        share = 1.15 if p["archetype"] in ("over_budget", "completed") else rng.uniform(0.25, 0.6)
        target = round(budget * share / 1000) * 1000
        parts = rng.randint(3, 5)
        last_day = min(p["end"], -1)
        for i in range(parts):
            amount = target // parts if i < parts - 1 else target - (target // parts) * (parts - 1)
            category = SPEND_CATEGORIES[(i + len(p["code"])) % len(SPEND_CATEGORIES)]
            day = p["start"] + round((last_day - p["start"]) * (i + 1) / (parts + 1))
            entries.append({"project": p["code"], "category": category, "amount": f"{amount}.00", "spent_on": day,
                            "description": f"{p['name']} – {category} {i + 1}"})
    return entries


def _schedule_fields(rng: random.Random, projects: list[dict], deliverables: list[dict]) -> None:
    """
    Add estimate (working days), progress (%) and earliest_start to every deliverable.

    The estimate is about 60% of the working days between two due dates, so a
    project that follows its plan forecasts a few days before its end date;
    the LATE_FORECAST project gets larger estimates on its last stages.
    """
    by_code = {p["code"]: p for p in projects}
    counts: dict = {}
    for d in deliverables:
        counts[d["project"]] = counts.get(d["project"], 0) + 1
    for d in deliverables:
        project = by_code[d["project"]]
        spacing = (project["end"] - project["start"]) / counts[d["project"]]      # calendar days between due dates
        estimate = min(max(round(spacing * 5 / 7 * 0.6), 2), 10)
        d["estimate"] = LATE_FORECAST.get(d["project"].removeprefix(CODE_PREFIX), {}).get(d["title"], estimate)
        if d["status"] == "done":
            d["progress"] = 100
        elif d["status"] == "in_progress":
            # Further along when due within a week, barely begun otherwise
            d["progress"] = rng.choice([30, 40, 50, 60] if d["due"] <= 7 else [10, 20])
        else:
            d["progress"] = 0
        start = max(d["due"] - START_LEAD_DAYS, project["start"])
        d["earliest_start"] = start if d["status"] == "not_started" and start > 0 else None


def build(seed: int = SEED) -> dict:  # pylint: disable=too-many-locals
    """The complete demo data spec (deterministic for a given seed)."""
    # Deterministic demo data, not security: a seeded PRNG on purpose
    rng = random.Random(seed)  # nosec B311
    people = [{"full_name": n, "email": email_of(n), "title": t, "department": d, "weekly_hours": h}
              for n, t, d, h in PEOPLE]
    users = [{"email": email_of(n), "full_name": n, "role": r, "person": email_of(n), "demo": demo}
             for n, r, demo in USERS]
    people_by_dept: dict = {}
    for n, _, d, _ in PEOPLE:
        people_by_dept.setdefault(d, []).append(n)
    projects = []
    for code, name, dept, owner, lead, start, end, budget, status, kind in PROJECTS:
        projects.append({
            "code": f"{CODE_PREFIX}{code}", "name": name, "department": dept, "owner": email_of(owner),
            "team_lead": email_of(lead) if lead else None, "start": start, "end": end, "budget": budget,
            "status": status, "archetype": kind,
            "description": f"{name} for ACME's {dept} team.",
        })
    deliverables, dependencies = [], []
    for p in projects:
        # Assignees with accounts are team leads and viewers, who then update their own work
        assignable_users = {n for n, r, _ in USERS if r != "project_manager"}
        items = _deliverables_for(rng, p, people_by_dept, assignable_users)
        dependencies += _dependencies_for(rng, p, items)
        deliverables += items
    allocations = _allocations(rng, projects, people)
    spend = _spend(rng, projects)
    # A separate generator, so adding these fields changed nothing that was generated before them
    _schedule_fields(random.Random(seed + 1), projects, deliverables)  # nosec B311
    return {
        "departments": list(DEPARTMENTS),
        "people": people,
        "users": users,
        "projects": projects,
        "deliverables": deliverables,
        "dependencies": dependencies,
        "allocations": allocations,
        "spend": spend,
        "deactivate": [email_of(ON_LEAVE)],
    }


def _engine():
    """The app's pure schedule engine, loaded from the backend source (standard library only)."""
    path = Path(__file__).resolve().parents[2] / "backend" / "_common" / "schedule.py"
    module_spec = importlib.util.spec_from_file_location("acme_schedule", path)
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    return module


def forecasts(spec: dict, today: date = REFERENCE_TODAY) -> dict:
    """
    The completion forecast of every seeded project, as the app will compute it on ``today``.

    Returns:
        {code: schedule.compute() result}, with deliverable titles as ids.
    """
    engine = _engine()

    def day(offset):
        return None if offset is None else today + timedelta(days=offset)

    results = {}
    for p in spec["projects"]:
        items = [{"id": d["title"], "status": d["status"], "estimate_days": d["estimate"],
                  "earliest_start": day(d["earliest_start"]), "progress_pct": d["progress"],
                  "completed_at": today if d["status"] == "done" else None, "due_date": day(d["due"])}
                 for d in spec["deliverables"] if d["project"] == p["code"]]
        edges = [(x["deliverable"], x["depends_on"]) for x in spec["dependencies"] if x["project"] == p["code"]]
        results[p["code"]] = engine.compute(items, edges, today, project_start=day(p["start"]),
                                            project_end=day(p["end"]))
    return results


def expected_flags(spec: dict, today: date = REFERENCE_TODAY) -> dict:  # pylint: disable=too-many-locals,too-many-branches
    """
    Apply the app's dashboard rules to the spec (today = 0, this week = the
    days around today), for the seeded projects only. ``today`` only matters
    for the forecast, which counts working days.

    Returns:
        {"at_risk": {code: [reasons]}, "over_budget": [codes], "over_allocated": [emails]}
    """
    people = {p["email"]: p for p in spec["people"]}
    projects = {p["code"]: p for p in spec["projects"]}
    week_load: dict = {}
    for a in spec["allocations"]:
        if projects[a["project"]]["status"] != "cancelled" and a["start"] <= 0 <= a["end"]:
            week_load[a["person"]] = week_load.get(a["person"], 0) + a["hours"]
    over_people = sorted(e for e, h in week_load.items() if h > people[e]["weekly_hours"])

    status = {(d["project"], d["title"]): d["status"] for d in spec["deliverables"]}
    preds: dict = {}
    for dep in spec["dependencies"]:
        preds.setdefault((dep["project"], dep["deliverable"]), []).append((dep["project"], dep["depends_on"]))

    outlook = forecasts(spec, today)
    at_risk = {}
    for p in spec["projects"]:
        if not (p["status"] == "active" or (p["status"] == "planned" and p["start"] <= 0)):
            continue
        items = [d for d in spec["deliverables"] if d["project"] == p["code"]]
        reasons = []
        if p["end"] < 0:
            reasons.append("late")
        if any(d["due"] < 0 and d["status"] not in ("done", "cancelled") for d in items):
            reasons.append("overdue_deliverable")
        counted = [d for d in items if d["status"] != "cancelled"]
        if counted and p["start"] <= 0 and p["end"] > p["start"]:   # as risk.py: ended projects count as 100% elapsed
            elapsed = min(-p["start"] / (p["end"] - p["start"]), 1) * 100
            done = sum(d["status"] == "done" for d in counted) / len(counted) * 100
            if elapsed - done > SLIP_POINTS:
                reasons.append("schedule_slip")
        for d in items:
            open_preds = [k for k in preds.get((p["code"], d["title"]), []) if status[k] not in ("done", "cancelled")]
            if open_preds and d["status"] not in ("done", "cancelled") and 0 <= d["due"] <= BLOCKED_SOON_DAYS:
                reasons.append("blocked_due_soon")
                break
        if any(a["project"] == p["code"] and a["person"] in over_people and a["start"] <= 0 <= a["end"]
               for a in spec["allocations"]):
            reasons.append("over_allocated_resource")
        forecast = outlook[p["code"]]
        if forecast["status"] == "late" and forecast["confidence"]["level"] in FORECAST_FLAG_LEVELS:
            reasons.append("forecast_late")
        if reasons:
            at_risk[p["code"]] = reasons

    spent: dict = {}
    for s in spec["spend"]:
        spent[s["project"]] = spent.get(s["project"], 0) + float(s["amount"])
    over_budget = sorted(p["code"] for p in spec["projects"]
                         if p["budget"] and spent.get(p["code"], 0) > float(p["budget"]))
    return {"at_risk": at_risk, "over_budget": over_budget, "over_allocated": over_people}
