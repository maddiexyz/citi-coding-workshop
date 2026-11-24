"""
Dashboard service: portfolio health at a glance. Everyone signed in may read it.

Routes (served at /api/dashboard; every route needs a Bearer token):
    GET /summary                    -> counts: projects by status, at risk, over budget,
                                       overdue deliverables, over-allocated people this week
    GET /at-risk  ?q&flag&severity  -> {"items": [...]} projects at risk and/or over budget,
                                       each with risk_reasons and over_budget

All figures are computed at query time (see common.risk); nothing is stored.
"""

from datetime import timedelta

from common import db, risk
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler

FLAGS = ("at_risk", "over_budget")
SEVERITIES = ("high", "medium")


@require_auth
def get_summary(_request: Request) -> dict:
    """Counts for the summary cards."""
    today = db.today()
    week = today - timedelta(days=today.weekday())
    evaluated = risk.evaluate()
    by_status = db.fetch_all(
        """
        SELECT s.status, count(p.id) AS count
        FROM unnest(enum_range(NULL::project_status)) AS s(status)
        LEFT JOIN projects p ON p.status = s.status
        GROUP BY s.status ORDER BY s.status
        """)
    counts = db.fetch_one(
        """
        SELECT
            (SELECT count(*) FROM project_details WHERE over_budget) AS over_budget,
            (SELECT count(*) FROM deliverable_details WHERE is_overdue) AS overdue_deliverables,
            (SELECT count(*) FROM deliverable_details WHERE is_blocked
                AND status NOT IN ('done', 'cancelled')) AS blocked_deliverables
        """)
    over_allocated = db.fetch_all(
        """
        SELECT r.id, r.full_name, l.total_hours, l.weekly_hours, l.over_by
        FROM resource_weekly_load(%s, %s) l JOIN resources r ON r.id = l.resource_id
        WHERE l.over_by > 0 ORDER BY l.over_by DESC, r.full_name
        """, (week, week))
    return json_response(200, {
        "projects_by_status": by_status,
        "active_projects": next((s["count"] for s in by_status if s["status"] == "active"), 0),
        "at_risk": sum(1 for p in evaluated if p["is_at_risk"]),
        "high_risk": sum(1 for p in evaluated if p["severity"] == "high"),
        "over_budget": counts["over_budget"],
        "overdue_deliverables": counts["overdue_deliverables"],
        "blocked_deliverables": counts["blocked_deliverables"],
        "over_allocated_people": over_allocated,
        "week_start": week,
    })


@require_auth
def get_at_risk(request: Request) -> dict:
    """Projects that are at risk or over budget, most severe first."""
    flag = request.query.get("flag") or None
    severity = request.query.get("severity") or None
    errors = {}
    if flag and flag not in FLAGS:
        errors["flag"] = f"Must be one of: {', '.join(FLAGS)}"
    if severity and severity not in SEVERITIES:
        errors["severity"] = f"Must be one of: {', '.join(SEVERITIES)}"
    if errors:
        raise ApiError(400, "validation_error", "Invalid filter", errors)
    text = (request.query.get("q") or "").strip().lower()

    items = []
    for project in risk.evaluate():
        if not (project["is_at_risk"] or project["over_budget"]):
            continue
        if flag == "at_risk" and not project["is_at_risk"]:
            continue
        if flag == "over_budget" and not project["over_budget"]:
            continue
        if severity and project["severity"] != severity:
            continue
        if text and text not in project["code"].lower() and text not in project["name"].lower():
            continue
        items.append(project)
    items.sort(key=lambda p: (-risk.SEVERITY_ORDER.get(p["severity"], 0), -len(p["risk_reasons"]), p["code"]))
    return json_response(200, {"items": items})


handler = make_handler([
    ("GET", "/summary", get_summary),
    ("GET", "/at-risk", get_at_risk),
])
