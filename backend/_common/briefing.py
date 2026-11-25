"""
AI project briefing: the facts a briefing may use, the signed bundle that
carries them to the ai service, and the check of the model's reply.

Pure: no database or network access. The projects service (inside the VPC,
next to the database) builds the facts and signs them; the ai service
(outside the VPC, so it can reach the model API) verifies the signature, asks
the model and keeps only the points that cite facts it was given. Person
names and emails never appear in the facts.
"""

import hashlib
import hmac
import json
import os
from datetime import date, datetime, timezone
from typing import Any, Optional

STATUSES = ("on_track", "at_risk", "late", "complete")
TOKEN_TTL_SECONDS = 120
MAX_DELIVERABLE_FACTS = 25
MAX_TITLE = 120
MAX_POINTS = 5
MAX_ACTIONS = 3
MAX_TEXT = 400


class BriefingError(Exception):
    """The signed facts or the model's reply can't be used."""


def _clip(text: Any, limit: int = MAX_TITLE) -> str:
    """One line of user-written text, at most ``limit`` characters."""
    value = " ".join(str(text or "").split())
    return value if len(value) <= limit else value[:limit - 1] + "…"


def _iso(value: Any) -> Optional[str]:
    """A date as YYYY-MM-DD, or None."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    return str(value)[:10] if value else None


def _days(count: int) -> str:
    return f"{count} day{'s' if abs(count) != 1 else ''}"


def _money(value: Any, currency: str) -> str:
    return f"{currency} {float(value):,.0f}"


def status_of(project: dict, outlook: dict, reasons: list[dict]) -> str:
    """
    The overall status the briefing reports, decided from the app's own data
    (never by the model): complete, late, at_risk or on_track.
    """
    if project.get("status") == "completed" or outlook.get("status") == "complete":
        return "complete"
    if any(r["type"] in ("late", "forecast_late") for r in reasons):
        return "late"
    return "at_risk" if reasons else "on_track"


def _project_fact(project: dict, today: date) -> dict:
    done, total = project.get("deliverables_done") or 0, project.get("deliverables_total") or 0
    text = (f"{project['code']} {_clip(project['name'])}: status {project['status']}, "
            f"start {_iso(project.get('start_date')) or 'not set'}, "
            f"planned end {_iso(project.get('end_date')) or 'not set'}, "
            f"today {_iso(today)}; {done} of {total} deliverables done.")
    return {"id": "project", "label": "Project", "text": text}


def _forecast_facts(outlook: dict) -> list[dict]:
    status = outlook.get("status")
    confidence = outlook.get("confidence") or {}
    if status == "complete":
        text = f"All deliverables are done; the last finished on {_iso(outlook.get('forecast_end'))}."
    elif status in ("no_estimates", "no_deliverables"):
        text = "No forecast: no remaining deliverable has an estimate."
    else:
        slip = outlook.get("slip_days")
        if slip is None:
            when = "the project has no planned end date"
        elif slip > 0:
            when = f"{_days(slip)} after the planned end"
        elif slip < 0:
            when = f"{_days(-slip)} before the planned end"
        else:
            when = "on the planned end date"
        text = (f"Forecast to finish on {_iso(outlook.get('forecast_end'))}, {when}. "
                f"Confidence {confidence.get('level')}: {confidence.get('estimated')} of "
                f"{confidence.get('remaining')} remaining deliverables have an estimate.")
    found = [{"id": "forecast", "label": "Forecast", "text": text}]
    titles = {item["id"]: item.get("title") for item in outlook.get("items", [])}
    path = [titles.get(i) for i in outlook.get("critical_path") or [] if titles.get(i)]
    if path and status not in ("complete", "no_estimates", "no_deliverables"):
        found.append({"id": "critical_path", "label": "Critical path",
                      "text": "Critical path (any delay here moves the finish date): "
                              + " → ".join(_clip(t, 60) for t in path) + "."})
    spi = outlook.get("spi") or {}
    if spi.get("explanation"):
        found.append({"id": "spi", "label": "SPI", "text": spi["explanation"]})
    return found


def _budget_fact(project: dict, currency: str) -> Optional[dict]:
    if project.get("budget_planned") is None:
        return None
    text = (f"Budget {_money(project['budget_planned'], currency)}, "
            f"spent {_money(project.get('actual_spend') or 0, currency)}"
            f" ({project.get('burn_pct') or 0}% burned), remaining {_money(project.get('remaining') or 0, currency)}"
            f"{'; over budget' if project.get('over_budget') else ''}.")
    return {"id": "budget", "label": "Budget", "text": text}


def _risk_text(reason: dict) -> str:
    """The risk message, without the names that some reasons carry."""
    if reason["type"] == "over_allocated_resource":
        people = len(reason.get("details", {}).get("people") or [])
        return f"{people} {'person' if people == 1 else 'people'} on this project over-allocated this week."
    return reason["message"] + "."


def _deliverable_facts(outlook: dict, deliverables: list[dict]) -> list[dict]:
    items = {item["id"]: item for item in outlook.get("items", [])}
    open_rows = [d for d in deliverables if d["status"] not in ("done", "cancelled")]
    open_rows.sort(key=lambda d: (not items.get(d["id"], {}).get("critical"),
                                  _iso(items.get(d["id"], {}).get("finish")) or "9999", d["id"]))
    found = []
    for row in open_rows[:MAX_DELIVERABLE_FACTS]:
        item = items.get(row["id"], {})
        parts = [row["status"].replace("_", " "), f"progress {row.get('progress_pct') or 0}%"]
        if row.get("estimate_days"):
            parts.append(f"estimate {_days(row['estimate_days'])}")
        if row.get("due_date"):
            parts.append(f"due {_iso(row['due_date'])}")
        if item.get("finish"):
            parts.append(f"forecast finish {_iso(item['finish'])}")
        if item.get("critical"):
            parts.append("on the critical path")
        if row.get("is_overdue"):
            parts.append("overdue")
        if row.get("is_blocked"):
            parts.append("blocked by an unfinished predecessor")
        parts.append("assigned" if row.get("assignee_resource_id") else "unassigned")
        found.append({"id": f"deliverable:{row['id']}", "label": _clip(row["title"], 40),
                      "text": f"Deliverable \"{_clip(row['title'])}\": {', '.join(parts)}."})
    return found


# pylint: disable-next=too-many-arguments,too-many-positional-arguments
def facts(project: dict, outlook: dict, reasons: list[dict], deliverables: list[dict], today: date,
          currency: Optional[str] = None) -> list[dict]:
    """
    Every fact a briefing may cite, as ``{id, label, text}``.

    Args:
        project: The project_details row.
        outlook: The project's forecast (common.forecast.for_projects).
        reasons: The project's risk_reasons (common.risk.evaluate).
        deliverables: The project's deliverable_details rows.
        today: The database's today.
        currency: Display currency (default APP_CURRENCY).
    """
    currency = currency or os.getenv("APP_CURRENCY", "INR")
    result = [_project_fact(project, today), *_forecast_facts(outlook)]
    budget = _budget_fact(project, currency)
    if budget:
        result.append(budget)
    result += [{"id": f"risk:{r['type']}", "label": "Risk", "text": _risk_text(r)} for r in reasons]
    result += _deliverable_facts(outlook, deliverables)
    return result


# Signed bundle -----------------------------------------------------------------

def _key() -> bytes:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET is not configured")
    # A key of its own, so a facts signature can never pass as anything else
    return hmac.new(secret.encode(), b"acme-briefing-facts", hashlib.sha256).digest()


def _signature(bundle: dict, user_id: int, expires: int) -> str:
    message = json.dumps({"bundle": bundle, "user": user_id, "exp": expires},
                         sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(_key(), message.encode(), hashlib.sha256).hexdigest()


def sign(bundle: dict, user_id: int, now: Optional[datetime] = None) -> str:
    """A token binding this bundle (project_id, status, facts) to one user for two minutes."""
    now = now or datetime.now(timezone.utc)
    expires = int(now.timestamp()) + TOKEN_TTL_SECONDS
    return f"{expires}.{_signature(bundle, user_id, expires)}"


def verify(token: Any, bundle: Any, user_id: int, now: Optional[datetime] = None) -> None:
    """
    Check that the bundle is exactly what the projects service signed for this user, and recent.

    Raises:
        BriefingError: the token is malformed, expired, for another user, or the bundle changed.
    """
    if not isinstance(token, str) or not isinstance(bundle, dict):
        raise BriefingError("Missing or malformed facts")
    expires, _, signature = token.partition(".")
    if not expires.isdigit() or not signature:
        raise BriefingError("Malformed facts token")
    now = now or datetime.now(timezone.utc)
    if int(expires) < int(now.timestamp()):
        raise BriefingError("The facts have expired, please try again")
    if not hmac.compare_digest(signature, _signature(bundle, user_id, int(expires))):
        raise BriefingError("The facts don't match their signature")


# The model's reply ---------------------------------------------------------------

REPLY_SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string"},
        "points": {"type": "array", "items": {
            "type": "object",
            "properties": {"text": {"type": "string"}, "sources": {"type": "array", "items": {"type": "string"}}},
            "required": ["text", "sources"], "additionalProperties": False}},
        "actions": {"type": "array", "items": {
            "type": "object",
            "properties": {"text": {"type": "string"}, "sources": {"type": "array", "items": {"type": "string"}}},
            "required": ["text", "sources"], "additionalProperties": False}},
    },
    "required": ["headline", "points", "actions"],
    "additionalProperties": False,
}


def _items(raw: Any, known: set[str], limit: int) -> list[dict]:
    kept = []
    for entry in raw if isinstance(raw, list) else []:
        if not isinstance(entry, dict) or not isinstance(entry.get("text"), str):
            continue
        sources = [s for s in dict.fromkeys(entry.get("sources") or []) if isinstance(s, str) and s in known]
        text = _clip(entry["text"], MAX_TEXT)
        if sources and text:
            kept.append({"text": text, "sources": sources})
    return kept[:limit]


def parse(reply: Any, fact_list: list[dict]) -> dict:
    """
    Keep only the grounded parts of the model's reply: points and actions that
    cite at least one known fact (unknown citations are removed).

    Raises:
        BriefingError: the reply isn't JSON of the expected shape, or nothing grounded is left.
    """
    if isinstance(reply, str):
        try:
            reply = json.loads(reply)
        except ValueError as exc:
            raise BriefingError("The reply was not valid JSON") from exc
    if not isinstance(reply, dict) or not isinstance(reply.get("headline"), str):
        raise BriefingError("The reply did not have the expected shape")
    known = {f["id"] for f in fact_list}
    points = _items(reply.get("points"), known, MAX_POINTS)
    if not points or not reply["headline"].strip():
        raise BriefingError("The reply had no points grounded in the facts")
    return {"headline": _clip(reply["headline"], 200), "points": points,
            "actions": _items(reply.get("actions"), known, MAX_ACTIONS)}
