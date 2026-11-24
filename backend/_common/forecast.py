"""
Completion forecasts for projects, computed at query time (never stored).

Loads each project's deliverables and dependency links in two batched queries
and hands them to the pure schedule engine (common.schedule), which does the
critical-path calculation. "Today" is the database's current date, passed in
by the caller.
"""

from datetime import date

from . import db, schedule

FLAG_CONFIDENCE = ("high", "medium")   # a late forecast only counts as a risk at these levels
ITEM_FIELDS = ("title", "status", "due_date", "estimate_days", "earliest_start", "progress_pct",
               "assignee_resource_id", "assignee_name")


def for_projects(projects: list[dict], today: date) -> dict[int, dict]:
    """
    Forecast each of the given projects.

    Args:
        projects: Project rows (need ``id``, ``start_date`` and ``end_date``).
        today: The current date (use ``db.today()``).

    Returns:
        project id -> the schedule.compute() result, with each item carrying the
        deliverable's title, status, due date, estimate, progress and assignee.
    """
    ids = [p["id"] for p in projects]
    deliverables: dict[int, list[dict]] = {i: [] for i in ids}
    edges: dict[int, list[tuple]] = {i: [] for i in ids}
    if ids:
        for row in db.fetch_all(
                "SELECT id, project_id, title, status, due_date, completed_at, estimate_days, earliest_start,"
                " progress_pct, assignee_resource_id, assignee_name"
                " FROM deliverable_details WHERE project_id = ANY(%s) ORDER BY id", (ids,)):
            deliverables[row["project_id"]].append(row)
        for row in db.fetch_all(
                "SELECT d.project_id, dep.deliverable_id, dep.depends_on_id FROM deliverable_dependencies dep"
                " JOIN deliverables d ON d.id = dep.deliverable_id WHERE d.project_id = ANY(%s)", (ids,)):
            edges[row["project_id"]].append((row["deliverable_id"], row["depends_on_id"]))
    results = {}
    for project in projects:
        rows = {row["id"]: row for row in deliverables[project["id"]]}
        result = schedule.compute(rows.values(), edges[project["id"]], today,
                                  project_start=project["start_date"], project_end=project["end_date"])
        result["items"] = [{**item, **{f: rows[item["id"]][f] for f in ITEM_FIELDS}} for item in result["items"]]
        results[project["id"]] = result
    return results


def is_flagged(result: dict) -> bool:
    """True when the forecast is past the planned end and enough of the remaining work is estimated."""
    return result["status"] == "late" and result["confidence"]["level"] in FLAG_CONFIDENCE


def summary(result: dict) -> dict:
    """The few forecast fields shown next to a project in a list."""
    return {"forecast_end": result["forecast_end"], "forecast_status": result["status"],
            "forecast_slip_days": result["slip_days"], "forecast_confidence": result["confidence"]["level"]}
