"""
Budget service: actual spend entries and the budget summary of a project.

Routes (served at /api/budget; every route needs a Bearer token):
    GET    /summary  ?project_id      -> planned, actual, remaining, burn %, over budget, by category  (everyone)
    GET    /         ?project_id&category&from&to&q -> {"items": [...]}   (admin, owning PM)
    GET    /{id}                      -> entry                            (admin, owning PM)
    POST   /         entry fields     -> 201 entry                        (admin, owning PM)
    PUT    /{id}     entry fields     -> entry                            (admin, owning PM)
    DELETE /{id}                      -> 204                              (admin)

Entry fields: project_id (create only), category, amount (>= 0, 2 decimals),
spent_on, description. The planned budget is set on the project
(PUT /api/projects/{id} budget_planned). Amounts are exact decimals sent as
strings; the currency (APP_CURRENCY) is for display only, with no conversion.
Every change is written to the audit log in the same transaction.
"""

import os
from decimal import Decimal

from common import audit, db
from common.auth import require_auth
from common.http import ApiError, Request, json_response, make_handler, parse_id
from common.permissions import can_delete_budget_entries, can_manage_budget
from common.validation import Validator

CATEGORIES = ("labor", "software", "hardware", "travel", "other")
MAX_AMOUNT = Decimal("9999999999.99")


def currency() -> str:
    """The app-wide display currency (ISO 4217 code)."""
    return os.getenv("APP_CURRENCY", "USD")


def load_project(project_id: int, *, missing_status: int = 404) -> dict:
    """Load the project fields needed for permissions."""
    project = db.fetch_one("SELECT id, code, owner_id, team_lead_id FROM projects WHERE id = %s", (project_id,))
    if not project:
        if missing_status == 400:
            raise ApiError(400, "validation_error", "Some fields are invalid", {"project_id": "Project not found"})
        raise ApiError(404, "not_found", "Project not found")
    return project


def require_manage(request: Request, project: dict) -> None:
    """403 unless the user may see and change this project's spend entries."""
    if not can_manage_budget(request.user, project):
        raise ApiError(403, "forbidden", "Only an admin or the project's manager can see and change spend entries")


def project_id_param(request: Request) -> int:
    """The required ?project_id query parameter."""
    raw = request.query.get("project_id")
    if not raw:
        raise ApiError(400, "validation_error", "Invalid filter", {"project_id": "This field is required"})
    return parse_id(raw, "Project id")


def validate_entry(data: dict) -> dict:
    """
    Validate spend entry fields.

    Raises:
        ApiError: 400 with a message per invalid field.
    """
    validator = Validator(data)
    validator.choice("category", CATEGORIES)
    validator.number("amount", required=True, minimum=Decimal(0), maximum=MAX_AMOUNT)
    spent_on = validator.date("spent_on")
    if spent_on is None and "spent_on" not in validator.errors:
        validator.add_error("spent_on", "This field is required")
    validator.string("description", max_length=500)
    validator.raise_if_errors()
    return validator.clean


def find_entry(entry_id: int) -> dict:
    """Load one spend entry or raise 404."""
    row = db.fetch_one("SELECT * FROM budget_entries WHERE id = %s", (entry_id,))
    if not row:
        raise ApiError(404, "not_found", "Budget entry not found")
    return row


@require_auth
def get_summary(request: Request) -> dict:
    """Planned vs actual for a project. Everyone signed in may read it."""
    project = load_project(project_id_param(request))
    summary = db.fetch_one(
        "SELECT budget_planned, actual_spend, remaining, burn_pct, over_budget, budget_entry_count"
        " FROM project_details WHERE id = %s",
        (project["id"],),
    )
    by_category = db.fetch_all(
        """
        SELECT c.category, coalesce(sum(b.amount), 0)::numeric(12,2) AS amount
        FROM unnest(enum_range(NULL::spend_category)) AS c(category)
        LEFT JOIN budget_entries b ON b.category = c.category AND b.project_id = %s
        GROUP BY c.category ORDER BY c.category
        """,
        (project["id"],),
    )
    return json_response(200, {
        "project_id": project["id"],
        "currency": currency(),
        "budget_set": bool(summary["budget_planned"]),
        "budget_planned": summary["budget_planned"],
        "actual": summary["actual_spend"],
        "remaining": summary["remaining"],
        "burn_pct": summary["burn_pct"],
        "over_budget": summary["over_budget"],
        "entry_count": summary["budget_entry_count"],
        "by_category": by_category,
    })


@require_auth
def list_entries(request: Request) -> dict:
    """List a project's spend entries, filtered by category, date range and text."""
    project = load_project(project_id_param(request))
    require_manage(request, project)
    query = request.query
    filters = Validator({"from": query.get("from"), "to": query.get("to")})
    first, last = filters.date("from"), filters.date("to")
    category = query.get("category") or None
    if category and category not in CATEGORIES:
        filters.add_error("category", f"Must be one of: {', '.join(CATEGORIES)}")
    if filters.errors:
        raise ApiError(400, "validation_error", "Invalid filter", filters.errors)
    text = (query.get("q") or "").strip()
    items = db.fetch_all(
        """
        SELECT * FROM budget_entries
        WHERE project_id = %(project_id)s
          AND (%(category)s::spend_category IS NULL OR category = %(category)s::spend_category)
          AND (%(first)s::date IS NULL OR spent_on >= %(first)s)
          AND (%(last)s::date IS NULL OR spent_on <= %(last)s)
          AND (%(search)s::text IS NULL OR description ILIKE %(search)s)
        ORDER BY spent_on DESC, id DESC
        """,
        {"project_id": project["id"], "category": category, "first": first, "last": last,
         "search": db.like_pattern(text) if text else None},
    )
    return json_response(200, {"items": items, "currency": currency()})


@require_auth
def get_entry(request: Request, entry_id: str) -> dict:
    """Return one spend entry."""
    entry = find_entry(parse_id(entry_id, "Entry id"))
    require_manage(request, load_project(entry["project_id"]))
    return json_response(200, entry)


@require_auth
def create_entry(request: Request) -> dict:
    """Record actual spend on a project."""
    body = request.json()
    validator = Validator(body)
    project_id = validator.integer("project_id", required=True)
    validator.raise_if_errors()
    project = load_project(project_id, missing_status=400)
    require_manage(request, project)
    data = validate_entry(body)
    with db.transaction():
        row = db.fetch_one(
            """
            INSERT INTO budget_entries (project_id, category, amount, spent_on, description, created_by)
            VALUES (%(project_id)s, %(category)s, %(amount)s, %(spent_on)s, %(description)s, %(created_by)s)
            RETURNING *
            """,
            {**data, "project_id": project["id"], "created_by": request.user.id},
        )
        audit.record(request.user, "create", "budget_entry", row["id"], project_id=project["id"], new=row,
                     summary=f"Recorded {row['amount']} {currency()} of {row['category']} spend")
    return json_response(201, row)


@require_auth
def update_entry(request: Request, entry_id: str) -> dict:
    """Replace a spend entry's fields (it stays on its project)."""
    entry = find_entry(parse_id(entry_id, "Entry id"))
    require_manage(request, load_project(entry["project_id"]))
    data = validate_entry(request.json())
    with db.transaction():
        after = db.fetch_one(
            """
            UPDATE budget_entries
            SET category = %(category)s, amount = %(amount)s, spent_on = %(spent_on)s,
                description = %(description)s, updated_at = now()
            WHERE id = %(id)s
            RETURNING *
            """,
            {**data, "id": entry["id"]},
        )
        audit.record(request.user, "update", "budget_entry", entry["id"], project_id=entry["project_id"],
                     old=entry, new=after, summary="Updated a spend entry")
    return json_response(200, after)


@require_auth
def delete_entry(request: Request, entry_id: str) -> dict:
    """Delete a spend entry (admin only)."""
    entry = find_entry(parse_id(entry_id, "Entry id"))
    if not can_delete_budget_entries(request.user):
        raise ApiError(403, "forbidden", "Only an admin can delete spend entries")
    with db.transaction():
        db.execute("DELETE FROM budget_entries WHERE id = %s", (entry["id"],))
        audit.record(request.user, "delete", "budget_entry", entry["id"], project_id=entry["project_id"],
                     old=entry, summary=f"Deleted a {entry['amount']} {currency()} spend entry")
    return json_response(204)


handler = make_handler([
    ("GET", "/summary", get_summary),
    ("GET", "/", list_entries),
    ("POST", "/", create_entry),
    ("GET", "/{entry_id}", get_entry),
    ("PUT", "/{entry_id}", update_entry),
    ("DELETE", "/{entry_id}", delete_entry),
])
