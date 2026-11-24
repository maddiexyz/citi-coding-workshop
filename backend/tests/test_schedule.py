"""Unit tests for the pure schedule engine; every expected date is worked out by hand.

Calendar used below (2026): Wed 25 Nov (today), Thu 26, Fri 27, Mon 30,
Tue 1 Dec, Wed 2, Thu 3, Fri 4, Mon 7, Tue 8.
"""
from datetime import date, datetime, timezone

import pytest

from common import schedule

TODAY = date(2026, 11, 25)   # a Wednesday


def item(key, estimate=None, status="not_started", **extra):
    return {"id": key, "status": status, "estimate_days": estimate, "earliest_start": None,
            "progress_pct": 0, "completed_at": None, "due_date": None, **extra}


def dates(result):
    return {i["id"]: (i["start"], i["finish"]) for i in result["items"]}


def floats(result):
    return {i["id"]: i["float_days"] for i in result["items"]}


def test_working_day_helpers():
    saturday = date(2026, 11, 28)
    assert schedule.next_working_day(saturday) == date(2026, 11, 30)
    assert schedule.next_working_day(TODAY) == TODAY
    assert schedule.add_working_days(date(2026, 11, 27), 1) == date(2026, 11, 30)
    assert schedule.add_working_days(TODAY, 5) == date(2026, 12, 2)
    assert schedule.working_days_between(TODAY, date(2026, 12, 2)) == 5
    assert schedule.working_days_between(date(2026, 11, 27), date(2026, 11, 30)) == 1


def test_linear_chain_runs_back_to_back_and_is_all_critical():
    result = schedule.compute([item("A", 3), item("B", 2), item("C", 4)], [("B", "A"), ("C", "B")], TODAY)
    assert dates(result) == {
        "A": (date(2026, 11, 25), date(2026, 11, 27)),
        "B": (date(2026, 11, 30), date(2026, 12, 1)),
        "C": (date(2026, 12, 2), date(2026, 12, 7)),
    }
    assert result["forecast_end"] == date(2026, 12, 7)
    assert result["critical_path"] == ["A", "B", "C"]
    assert floats(result) == {"A": 0, "B": 0, "C": 0}
    assert result["status"] == "on_track" and result["slip_days"] is None
    assert result["confidence"] == {"level": "high", "estimated": 3, "remaining": 3}


def test_diamond_takes_the_longer_branch():
    result = schedule.compute(
        [item("A", 2), item("B", 5), item("C", 1), item("D", 1)],
        [("B", "A"), ("C", "A"), ("D", "B"), ("D", "C")], TODAY)
    assert dates(result) == {
        "A": (date(2026, 11, 25), date(2026, 11, 26)),
        "B": (date(2026, 11, 27), date(2026, 12, 3)),
        "C": (date(2026, 11, 27), date(2026, 11, 27)),
        "D": (date(2026, 12, 4), date(2026, 12, 4)),
    }
    assert result["critical_path"] == ["A", "B", "D"]
    assert floats(result) == {"A": 0, "B": 0, "C": 4, "D": 0}
    assert [i["id"] for i in result["items"] if i["critical"]] == ["A", "B", "D"]


def test_parallel_branches_the_longest_one_sets_the_end():
    result = schedule.compute([item("A", 3), item("B", 6)], [], TODAY)
    assert dates(result)["A"] == (date(2026, 11, 25), date(2026, 11, 27))
    assert dates(result)["B"] == (date(2026, 11, 25), date(2026, 12, 2))
    assert result["forecast_end"] == date(2026, 12, 2)
    assert result["critical_path"] == ["B"]
    assert floats(result) == {"A": 3, "B": 0}


def test_done_items_hold_nothing_up_and_cancelled_items_are_bridged():
    finished = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)
    result = schedule.compute(
        [item("A", 5, status="done", completed_at=finished), item("B", 2),
         item("X", 3), item("Y", 9, status="cancelled"), item("Z", 1)],
        [("B", "A"), ("Y", "X"), ("Z", "Y")], TODAY)
    assert dates(result) == {
        "A": (None, date(2026, 11, 20)),
        "B": (date(2026, 11, 25), date(2026, 11, 26)),
        "X": (date(2026, 11, 25), date(2026, 11, 27)),
        "Y": (None, None),
        "Z": (date(2026, 11, 30), date(2026, 11, 30)),   # waits for X through the cancelled Y
    }
    assert result["forecast_end"] == date(2026, 11, 30)
    assert result["critical_path"] == ["X", "Z"]
    assert floats(result) == {"A": None, "B": 2, "X": 0, "Y": None, "Z": 0}
    assert result["confidence"]["remaining"] == 3


def test_earliest_start_delays_a_deliverable_and_rolls_off_the_weekend():
    result = schedule.compute([item("A", 2, earliest_start=date(2026, 12, 5)), item("B", 1)], [("A", "B")], TODAY)
    assert dates(result)["A"] == (date(2026, 12, 7), date(2026, 12, 8))   # Sat 5 Dec -> Mon 7 Dec
    assert dates(result)["B"] == (date(2026, 11, 25), date(2026, 11, 25))
    assert floats(result) == {"A": 0, "B": 7}       # B could finish as late as Fri 4 Dec
    assert result["critical_path"] == ["A"]          # the earliest start, not B, sets A's start


def test_project_start_in_the_future_delays_work_not_yet_started():
    result = schedule.compute([item("A", 1)], [], TODAY, project_start=date(2026, 12, 1))
    assert dates(result)["A"] == (date(2026, 12, 1), date(2026, 12, 1))


def test_work_crosses_the_weekend_and_a_weekend_today_starts_on_monday():
    friday = schedule.compute([item("A", 2)], [], date(2026, 11, 27))
    assert dates(friday)["A"] == (date(2026, 11, 27), date(2026, 11, 30))
    saturday = schedule.compute([item("A", 1)], [], date(2026, 11, 28))
    assert dates(saturday)["A"] == (date(2026, 11, 30), date(2026, 11, 30))


def test_progress_shortens_the_remaining_work_and_running_items_continue_from_today():
    result = schedule.compute(
        [item("A", 4), item("B", 10, status="in_progress", progress_pct=50),
         item("C", 3, status="in_progress", progress_pct=100)],
        [("B", "A")], TODAY)
    # B is already running, so it does not wait for A: 5 days left, Wed 25 Nov - Tue 1 Dec
    assert dates(result)["B"] == (date(2026, 11, 25), date(2026, 12, 1))
    assert dates(result)["C"] == (date(2026, 11, 25), date(2026, 11, 25))   # at least one day until marked done
    assert result["forecast_end"] == date(2026, 12, 1)
    assert result["critical_path"] == ["B"]
    assert floats(result)["A"] == 1   # A (Wed-Mon) may slip a day; it no longer drives B


def test_missing_estimates_use_the_median_and_lower_the_confidence():
    result = schedule.compute([item("A", 4), item("B", 2), item("C")], [], TODAY)
    assert dates(result)["C"] == (date(2026, 11, 25), date(2026, 11, 27))   # median of 4 and 2 = 3 days
    assert [i["assumed"] for i in result["items"]] == [False, False, True]
    assert result["confidence"] == {"level": "medium", "estimated": 2, "remaining": 3}

    high = schedule.compute([item(n, 1) for n in "ABCD"] + [item("E")], [], TODAY)
    assert high["confidence"]["level"] == "high"
    low = schedule.compute([item("A", 1), item("B"), item("C")], [], TODAY)
    assert low["confidence"]["level"] == "low"


def test_no_estimates_means_no_forecast():
    result = schedule.compute([item("A"), item("B")], [("B", "A")], TODAY, project_end=date(2026, 11, 1))
    assert result["status"] == "no_estimates"
    assert result["forecast_end"] is None and result["slip_days"] is None
    assert result["critical_path"] == []
    assert result["confidence"] == {"level": "low", "estimated": 0, "remaining": 2}


def test_empty_project_and_all_cancelled():
    empty = schedule.compute([], [], TODAY)
    assert empty["status"] == "no_deliverables" and empty["forecast_end"] is None and empty["items"] == []
    assert empty["confidence"] == {"level": None, "estimated": 0, "remaining": 0}
    assert empty["spi"]["value"] is None
    cancelled = schedule.compute([item("A", 2, status="cancelled")], [], TODAY)
    assert cancelled["status"] == "no_deliverables"


def test_everything_done_reports_the_last_completion():
    result = schedule.compute(
        [item("A", 2, status="done", completed_at=datetime(2026, 11, 10, tzinfo=timezone.utc)),
         item("B", 2, status="done", completed_at=datetime(2026, 11, 18, tzinfo=timezone.utc))],
        [("B", "A")], TODAY, project_end=date(2026, 11, 20))
    assert result["status"] == "complete"
    assert result["forecast_end"] == date(2026, 11, 18) and result["slip_days"] == -2


def test_slip_against_the_planned_end():
    chain = [item("A", 3), item("B", 2), item("C", 4)]
    late = schedule.compute(chain, [("B", "A"), ("C", "B")], TODAY, project_end=date(2026, 11, 30))
    assert late["status"] == "late" and late["slip_days"] == 7      # Mon 7 Dec vs Mon 30 Nov
    on_time = schedule.compute(chain, [("B", "A"), ("C", "B")], TODAY, project_end=date(2026, 12, 7))
    assert on_time["status"] == "on_track" and on_time["slip_days"] == 0


def test_spi_compares_earned_with_planned_work():
    # 4-day item due Fri 27 Nov: planned window Tue 24 - Fri 27, so 1 day should be done by Wed 25
    ahead = schedule.compute([item("A", 4, status="in_progress", progress_pct=50, due_date=date(2026, 11, 27))],
                             [], TODAY)
    assert ahead["spi"]["planned"] == 1.0 and ahead["spi"]["earned"] == 2.0 and ahead["spi"]["value"] == 2.0
    assert "ahead" in ahead["spi"]["explanation"]

    # plus a finished 2-day item due last week: planned 2 + 1 = 3, earned 2 + 0 = 2
    behind = schedule.compute(
        [item("D", 2, status="done", due_date=date(2026, 11, 20), completed_at=datetime(2026, 11, 20)),
         item("A", 4, due_date=date(2026, 11, 27))], [], TODAY)
    assert behind["spi"]["planned"] == 3.0 and behind["spi"]["earned"] == 2.0 and behind["spi"]["value"] == 0.67
    assert "33% behind" in behind["spi"]["explanation"]


def test_spi_falls_back_to_the_project_window_and_skips_cancelled():
    # no due date: the window is the project, Mon 23 Nov - Fri 27 Nov (5 working days), 2 elapsed by Wed
    result = schedule.compute(
        [item("A", 10, status="in_progress", progress_pct=20), item("B", 50, status="cancelled")],
        [], TODAY, project_start=date(2026, 11, 23), project_end=date(2026, 11, 27))
    assert result["spi"]["planned"] == 4.0 and result["spi"]["earned"] == 2.0 and result["spi"]["value"] == 0.5
    nothing_due = schedule.compute([item("A", 3, due_date=date(2026, 12, 25))], [], TODAY)
    assert nothing_due["spi"]["value"] is None


def test_a_cycle_is_rejected_and_unknown_edges_are_ignored():
    with pytest.raises(ValueError):
        schedule.compute([item("A", 1), item("B", 1)], [("A", "B"), ("B", "A")], TODAY)
    result = schedule.compute([item("A", 1)], [("A", "missing")], TODAY)
    assert result["forecast_end"] == TODAY
