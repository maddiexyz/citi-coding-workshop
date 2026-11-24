"""
At-risk signals for projects, computed at query time (never stored).

Evaluated projects: status active, plus planned projects whose start date
has passed. A project is at risk when any of these fire:

- late (high): past its end date and not completed or cancelled
- overdue_deliverable: a deliverable is past its due date and not done
- schedule_slip: % of deliverables done lags % of time elapsed by more than
  AT_RISK_SLIP_POINTS (default 20); skipped with no deliverables, no end date
  or before the start
- blocked_due_soon: a blocked deliverable is due within 7 days
- over_allocated_resource: someone allocated to it this week is over capacity

Over budget is a separate flag, not an at-risk signal. Each fired signal
comes back in risk_reasons with details, so the UI can say why.
"""

import os
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from . import db

BLOCKED_SOON_DAYS = 7
SEVERITY_ORDER = {"high": 2, "medium": 1}


def slip_threshold() -> Decimal:
    """Percentage points by which progress may lag elapsed time before it counts."""
    return Decimal(os.getenv("AT_RISK_SLIP_POINTS", "20"))


def _group(rows: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row.pop("project_id"), []).append(row)
    return grouped


def schedule_slip(project: dict, today: date) -> Optional[dict]:
    """The slip reason for one project, or None."""
    total, start, end = project["deliverables_total"], project["start_date"], project["end_date"]
    if not total or not start or not end or start > today or end <= start:
        return None
    elapsed = min(Decimal((today - start).days) / Decimal((end - start).days), Decimal(1)) * 100
    done = Decimal(project["deliverables_done"]) / Decimal(total) * 100
    gap = elapsed - done
    if gap <= slip_threshold():
        return None
    return {"type": "schedule_slip", "severity": "medium",
            "message": f"{done:.0f}% of deliverables done with {elapsed:.0f}% of the time gone",
            "details": {"done_pct": round(done, 1), "elapsed_pct": round(elapsed, 1),
                        "gap_points": round(gap, 1), "threshold": slip_threshold()}}


def evaluate(project_ids: Optional[list[int]] = None) -> list[dict]:
    """
    Evaluate projects and return each with is_at_risk, severity and risk_reasons.

    Args:
        project_ids: Limit to these projects (default: every evaluated project).
    """
    today = date.today()
    week = today - timedelta(days=today.weekday())
    projects = db.fetch_all(
        """
        SELECT id, code, name, status, start_date, end_date, owner_id, owner_name, team_lead_name,
               deliverables_total, deliverables_done, budget_planned, actual_spend, burn_pct, over_budget
        FROM project_details
        WHERE (status = 'active' OR (status = 'planned' AND start_date <= current_date))
          AND (%(ids)s::bigint[] IS NULL OR id = ANY(%(ids)s))
        ORDER BY code
        """,
        {"ids": project_ids},
    )
    ids = [p["id"] for p in projects]
    overdue = _group(db.fetch_all(
        "SELECT project_id, id, title, due_date FROM deliverable_details"
        " WHERE is_overdue AND project_id = ANY(%s) ORDER BY due_date, id", (ids,)))
    blocked = _group(db.fetch_all(
        """
        SELECT project_id, id, title, due_date FROM deliverable_details
        WHERE is_blocked AND status NOT IN ('done', 'cancelled') AND project_id = ANY(%s)
          AND due_date BETWEEN current_date AND current_date + %s
        ORDER BY due_date, id
        """, (ids, BLOCKED_SOON_DAYS)))
    overloaded = _group(db.fetch_all(
        """
        SELECT DISTINCT a.project_id, r.id AS resource_id, r.full_name, l.total_hours, l.weekly_hours, l.over_by
        FROM allocations a
        JOIN resource_weekly_load(%(week)s, %(week)s) l ON l.resource_id = a.resource_id AND l.over_by > 0
        JOIN resources r ON r.id = a.resource_id
        WHERE a.project_id = ANY(%(ids)s) AND a.start_date <= %(week)s + 6 AND a.end_date >= %(week)s
        ORDER BY r.full_name
        """, {"week": week, "ids": ids}))

    results = []
    for project in projects:
        reasons = []
        if project["end_date"] and project["end_date"] < today:
            days = (today - project["end_date"]).days
            reasons.append({"type": "late", "severity": "high",
                            "message": f"Past its end date by {days} day{'s' if days != 1 else ''}",
                            "details": {"end_date": project["end_date"], "days_late": days}})
        if project["id"] in overdue:
            items = overdue[project["id"]]
            reasons.append({"type": "overdue_deliverable", "severity": "medium",
                            "message": f"{len(items)} overdue deliverable{'s' if len(items) != 1 else ''}",
                            "details": {"deliverables": items}})
        slip = schedule_slip(project, today)
        if slip:
            reasons.append(slip)
        if project["id"] in blocked:
            items = blocked[project["id"]]
            reasons.append({"type": "blocked_due_soon", "severity": "medium",
                            "message": f"{len(items)} blocked deliverable{'s' if len(items) != 1 else ''} due within "
                                       f"{BLOCKED_SOON_DAYS} days",
                            "details": {"deliverables": items}})
        if project["id"] in overloaded:
            people = overloaded[project["id"]]
            reasons.append({"type": "over_allocated_resource", "severity": "medium",
                            "message": f"{', '.join(p['full_name'] for p in people)} over-allocated this week",
                            "details": {"people": people, "week_start": week}})
        severity = max((r["severity"] for r in reasons), key=SEVERITY_ORDER.get, default=None)
        results.append({**project, "is_at_risk": bool(reasons), "severity": severity, "risk_reasons": reasons})
    return results
