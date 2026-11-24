# Increment C – Audit log, then budget

Branch `feature/increment-c`. Plan: [docs/PLAN.md](../docs/PLAN.md).

## What changed
- **Audit log (migration 005):** `audit_log` with actor (id and name),
  action, entity, project, summary, old/new values and details.
  `_common/audit.py` records every write in projects, deliverables,
  dependencies, resources, allocations and spend entries inside the same
  transaction; updates store only changed fields; a project delete stores a
  snapshot of what it removed. New `audit` service (admin; owning PM for
  their projects).
- **Budget (migration 006):** `projects.budget_planned` and `budget_entries`
  (`NUMERIC(12,2)`, fixed categories). `project_details` computes actual,
  remaining, burn % and over-budget; no budget set means no division. New
  `budget` service: summary for everyone, entries for admin and the owning
  PM, deletes for admin. `APP_CURRENCY` (Terraform `app_currency`, default
  USD) is display-only.
- **Rule:** a project with spend entries can only be deleted by an admin
  (owning PM gets 403 and is told to set the status to cancelled).
- **Frontend:** Budget tab (summary, burn bar, category breakdown; spend
  entries with filters and dialog for admin/owning PM), Activity tab (old →
  new), planned budget on the project form, burn chip in the projects list,
  delete dialog listing what will be removed, delete hidden when not allowed.
- **Tests:** backend 117 (including rollback when the audit write fails),
  frontend 81; `tests/acceptance/increment_c.sh`.

## Decisions
- Everyone signed in sees the budget summary; admin and the owning PM see
  line items and write; only admin deletes entries.
- One planned amount per project; spend is categorised; labor entered by
  hand; capacity and money are independent.
- Audit entries are written by the app (not triggers) so they name the app
  user, and in the same transaction so they can't drift from the data.

## Known gaps
- Single currency, display only. No audit retention policy. Forecast labor
  cost from allocations (`hourly_rate`) is a stretch goal.
