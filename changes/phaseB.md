# Increment B – Resources, allocations and over-allocation

Branch `feature/increment-b`. Plan: [docs/PLAN.md](../docs/PLAN.md).

## What changed
- **Database (migration 004):** `resources` (weekly_hours 0–60, optional
  unique user link), `allocations` (hours_per_week 0–80, dates, an exclusion
  constraint so one person can't have overlapping allocations on the same
  project), `deliverables.assignee_resource_id`, the `resource_weekly_load()`
  function and the assignee in `deliverable_details`.
- **Backend:** `resources` service (CRUD for admins, this week's load and
  over-allocated filter, weekly load for a date range) and `allocations`
  service (CRUD for admin and the owning PM; dates within the project; 409 on
  overlap; over-capacity saves succeed and return `warnings`). Deliverables
  accept and filter by assignee. Shared `number` and `boolean` validators keep
  decimals exact.
- **Frontend:** People page and person page (next 8 weeks of load); project
  Allocations tab with an over-allocation warning after saving and an info
  banner for people over-allocated this week; assignee picker, column and
  filter for deliverables; main navigation.
- **Tests:** backend 93, frontend 62; `tests/acceptance/increment_b.sh`.

## Decisions
- Only admins manage people; admins and the owning PM manage allocations;
  the assigned team lead reads them.
- Typo caps: weekly_hours ≤ 60, hours_per_week ≤ 80. Over capacity is a
  warning, never a block.
- Overlapping allocations of the same person on the same project are
  rejected (409); allocation dates must be within the project's dates (400).
- Weeks start on Monday; partial weeks count in full; cancelled projects
  don't count.

## Known gaps
- No history of allocation changes yet (audit log in Increment C).
