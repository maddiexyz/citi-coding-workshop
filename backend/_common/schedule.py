"""
Schedule engine: forecast a project's completion date with the critical path method.

Pure: no database access and no clock. The caller passes the deliverables,
the dependency edges and "today"; the same inputs always give the same answer.

Rules:
- Calendar: Monday to Friday are working days, no holidays. A weekend "today"
  (or earliest start) rolls forward to Monday.
- A remaining deliverable (not_started or in_progress) needs
  max(1, ceil(estimate x (1 - progress/100))) more working days.
- A remaining deliverable without an estimate is scheduled with the median
  estimate of the project's estimated deliverables and marked "assumed".
  When no remaining deliverable has an estimate there is no forecast.
- A not-started deliverable starts on the latest of: today, its earliest
  start, the project's start date, and the working day after its last
  predecessor finishes. An in-progress deliverable is already running: it
  continues from today.
- Done deliverables finished on their completion date and hold nothing up.
  Cancelled deliverables take no time: what waited on them waits on their
  predecessors instead.
- Forecast end = the latest finish. Float = how many working days a
  deliverable can slip without moving the forecast end; float 0 = critical.
- Confidence = share of remaining deliverables with an estimate
  (high >= 80%, medium >= 50%, otherwise low).
- SPI (schedule performance index) = earned / planned work. Work is weighted
  by estimate; earned = estimate x progress; planned = the part of each
  deliverable's planned window (the "estimate" working days ending on its due
  date) that has elapsed by today.
"""

import math
import statistics
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

REMAINING = ("not_started", "in_progress")
HIGH_CONFIDENCE = 0.8
MEDIUM_CONFIDENCE = 0.5


def day_index(day: date) -> int:
    """Number of working days before ``day`` (a weekend day counts as the following Monday)."""
    ordinal = day.toordinal() - 1          # date(1, 1, 1) is a Monday
    return (ordinal // 7) * 5 + min(ordinal % 7, 5)


def index_day(index: int) -> date:
    """The working day with this index (inverse of day_index for working days)."""
    return date.fromordinal((index // 5) * 7 + index % 5 + 1)


def next_working_day(day: date) -> date:
    """``day`` itself if it is a working day, otherwise the following Monday."""
    return index_day(day_index(day))


def add_working_days(day: date, count: int) -> date:
    """The working day ``count`` working days after ``day`` (rolled forward first)."""
    return index_day(day_index(day) + count)


def working_days_between(start: date, end: date) -> int:
    """Working days from ``start`` up to (not including) ``end``; negative when end is earlier."""
    return day_index(end) - day_index(start)


def _as_date(value) -> Optional[date]:
    return value.date() if isinstance(value, datetime) else value


def _topological_order(ids: list, predecessors: dict) -> list:
    """Order the ids so every deliverable comes after what it depends on."""
    waiting = {i: len(predecessors[i]) for i in ids}
    successors: dict = {i: [] for i in ids}
    for i in ids:
        for pred in predecessors[i]:
            successors[pred].append(i)
    ready = sorted(i for i in ids if not waiting[i])
    order = []
    while ready:
        current = ready.pop(0)
        order.append(current)
        for nxt in sorted(successors[current]):
            waiting[nxt] -= 1
            if not waiting[nxt]:
                ready.append(nxt)
    if len(order) != len(ids):
        raise ValueError("The dependencies contain a cycle")
    return order


def _confidence(estimated: int, remaining: int) -> dict:
    level = None
    if remaining:
        share = estimated / remaining
        level = "high" if share >= HIGH_CONFIDENCE else "medium" if share >= MEDIUM_CONFIDENCE else "low"
    return {"level": level, "estimated": estimated, "remaining": remaining}


def _spi(items: list, fallback: Optional[int], today: date,
         project_start: Optional[date], project_end: Optional[date]) -> dict:
    """Earned and planned work (in working days of estimate) and their ratio."""
    earned = planned = 0.0
    now = day_index(today)
    for item in items:
        weight = item.get("estimate_days") or fallback
        if item["status"] == "cancelled" or not weight:
            continue
        due = _as_date(item.get("due_date"))
        if due:
            window_end = day_index(due + timedelta(days=1))
            window_start = window_end - weight
        elif project_start and project_end and project_end >= project_start:
            window_start = day_index(project_start)
            window_end = day_index(project_end + timedelta(days=1))
        else:
            continue                        # no baseline to compare against
        length = max(window_end - window_start, 1)
        share = min(max(now - window_start, 0), length) / length
        progress = 100 if item["status"] == "done" else (item.get("progress_pct") or 0)
        planned += weight * share
        earned += weight * progress / 100
    value = round(earned / planned, 2) if planned > 0 else None
    if value is None:
        text = "No work was planned to be done by today, so there is nothing to compare yet."
    elif value >= 1:
        text = (f"SPI {value:.2f}: {earned:.1f} working days of work done against {planned:.1f} planned by today"
                " - on or ahead of plan.")
    else:
        text = (f"SPI {value:.2f}: {earned:.1f} working days of work done against {planned:.1f} planned by today"
                f" - about {round((1 - value) * 100)}% behind plan.")
    return {"value": value, "earned": round(earned, 1), "planned": round(planned, 1), "explanation": text}


def _driving_predecessor(node, predecessors: dict, state: dict):
    """The remaining predecessor whose finish sets this node's start (looking through cancelled ones)."""
    target = state[node]["start_index"] if state[node]["kind"] == "remaining" else state[node]["gate"]
    for pred in sorted(predecessors[node]):
        info = state[pred]
        if info["gate"] is None or info["gate"] != target:
            continue
        if info["kind"] == "remaining":
            return pred
        found = _driving_predecessor(pred, predecessors, state)   # cancelled: look further back
        if found is not None:
            return found
    return None


def compute(deliverables: Iterable[dict], edges: Iterable[tuple],  # pylint: disable=too-many-locals,too-many-branches,too-many-statements
            today: date, project_start: Optional[date] = None, project_end: Optional[date] = None) -> dict:
    """
    Forecast one project.

    Args:
        deliverables: Dicts with id, status, estimate_days, earliest_start, progress_pct,
            completed_at and due_date (missing keys count as None).
        edges: (deliverable_id, depends_on_id) pairs; pairs naming unknown ids are ignored.
        today: The current date.
        project_start: The project's start date (nothing not yet started begins before it).
        project_end: The project's planned end date (for the slip and SPI).

    Returns:
        forecast_end, planned_end, slip_days (calendar days; None without both dates), status
        (on_track, late, complete, no_estimates or no_deliverables), confidence, spi,
        critical_path (ids in order) and items (one per deliverable, in schedule order).

    Raises:
        ValueError: The dependencies contain a cycle.
    """
    items = list(deliverables)
    by_id = {item["id"]: item for item in items}
    predecessors: dict = {i: set() for i in by_id}
    for deliverable_id, depends_on_id in edges:
        if deliverable_id in by_id and depends_on_id in by_id:
            predecessors[deliverable_id].add(depends_on_id)
    order = _topological_order(list(by_id), predecessors)

    remaining = [i for i in items if i["status"] in REMAINING]
    estimated = [i for i in remaining if i.get("estimate_days")]
    known = [i["estimate_days"] for i in items if i["status"] != "cancelled" and i.get("estimate_days")]
    fallback = math.ceil(statistics.median(known)) if known else None
    result = {
        "today": today, "planned_end": project_end, "forecast_end": None, "slip_days": None,
        "confidence": _confidence(len(estimated), len(remaining)),
        "spi": _spi(items, fallback, today, project_start, project_end),
        "critical_path": [], "items": [],
    }
    done_dates = [_as_date(i.get("completed_at")) for i in items if i["status"] == "done" and i.get("completed_at")]

    def plain_items() -> list:
        return [{"id": i, "start": None,
                 "finish": _as_date(by_id[i].get("completed_at")) if by_id[i]["status"] == "done" else None,
                 "remaining_days": 0 if by_id[i]["status"] not in REMAINING else None,
                 "float_days": None, "critical": False, "assumed": False} for i in order]

    if not items:
        return {**result, "status": "no_deliverables"}
    if not remaining:
        if not any(i["status"] == "done" for i in items):
            return {**result, "status": "no_deliverables", "items": plain_items()}
        end = max(done_dates) if done_dates else None
        slip = (end - project_end).days if end and project_end else None
        return {**result, "status": "complete", "forecast_end": end, "slip_days": slip, "items": plain_items()}
    if not estimated:
        return {**result, "status": "no_estimates", "items": plain_items()}

    # Forward pass. "gate" = the first working-day index at which successors may start.
    base = day_index(today)
    floor = max(base, day_index(project_start)) if project_start else base
    state: dict = {}
    for node in order:
        item = by_id[node]
        gates = [state[p]["gate"] for p in predecessors[node] if state[p]["gate"] is not None]
        if item["status"] == "done":
            state[node] = {"kind": "done", "gate": None}
        elif item["status"] == "cancelled":
            state[node] = {"kind": "cancelled", "gate": max(gates) if gates else None}
        else:
            estimate = item.get("estimate_days") or fallback
            duration = max(1, math.ceil(estimate * (1 - (item.get("progress_pct") or 0) / 100)))
            if item["status"] == "in_progress":
                start = base
            else:
                earliest = _as_date(item.get("earliest_start"))
                start = max([floor, *gates, *([day_index(earliest)] if earliest else [])])
            state[node] = {"kind": "remaining", "start_index": start, "duration": duration,
                           "gate": start + duration, "assumed": not item.get("estimate_days"),
                           "running": item["status"] == "in_progress"}
    end_gate = max(s["gate"] for s in state.values() if s["kind"] == "remaining")

    # Backward pass: the latest gate each deliverable can have without moving the end.
    successors: dict = {i: [] for i in by_id}
    for node, preds in predecessors.items():
        for pred in preds:
            successors[pred].append(node)
    for node in reversed(order):
        info = state[node]
        if info["kind"] == "done":
            continue
        limits = []
        for nxt in successors[node]:
            after = state[nxt]
            if after["kind"] == "remaining" and not after["running"]:
                limits.append(after["late_gate"] - after["duration"])
            elif after["kind"] == "cancelled":
                limits.append(after["late_gate"])
        info["late_gate"] = min(limits) if limits else end_gate
        if info["kind"] == "remaining":
            info["float"] = info["late_gate"] - info["gate"]

    # Critical path: from the last finisher back through whatever set each start.
    last = min(n for n in order if state[n]["kind"] == "remaining" and state[n]["gate"] == end_gate)
    path = [last]
    while not state[path[0]]["running"]:
        previous = _driving_predecessor(path[0], predecessors, state)
        if previous is None:
            break
        path.insert(0, previous)

    out = []
    for node in order:
        info = state[node]
        if info["kind"] == "remaining":
            out.append({"id": node, "start": index_day(info["start_index"]),
                        "finish": index_day(info["gate"] - 1), "remaining_days": info["duration"],
                        "float_days": info["float"], "critical": info["float"] == 0, "assumed": info["assumed"]})
        else:
            out.append({"id": node, "start": None,
                        "finish": _as_date(by_id[node].get("completed_at")) if info["kind"] == "done" else None,
                        "remaining_days": 0, "float_days": None, "critical": False, "assumed": False})
    forecast_end = index_day(end_gate - 1)
    slip = (forecast_end - project_end).days if project_end else None
    return {**result, "status": "late" if slip and slip > 0 else "on_track", "forecast_end": forecast_end,
            "slip_days": slip, "critical_path": path, "items": out}
