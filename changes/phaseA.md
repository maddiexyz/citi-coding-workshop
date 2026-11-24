# Increment A – Deliverables and dependencies

Branch `feature/increment-a`. Plan: [docs/PLAN.md](../docs/PLAN.md).

## What changed
- **Carry-over fixes from the audit**
  - CloudFront: a viewer-request function rewrites client-side routes to
    `/index.html`; the 404 custom error response is gone, so API 404s stay JSON
    and reloading `/projects/12` works.
  - Every request re-reads the user: a deleted or inactive account gets 401
    (was a 500), and role changes apply immediately.
  - Ids accept ASCII digits only (`²` was a 500).
- **Database (migration 003):** `projects.team_lead_id`, `deliverables`,
  `deliverable_dependencies`; views `deliverable_details` (blocked, overdue,
  predecessor and successor counts) and `project_details` (team lead,
  progress).
- **Backend:** `deliverables` service (CRUD, filters, dependencies with a
  cycle check under a project lock); read-only `users` service for pickers;
  shared helpers in `_common` (`parse_id`, `parse_bool`, `like_pattern`,
  `db.transaction()`, integer validator, Decimal-safe JSON).
- **Frontend:** project detail page (Overview, Deliverables tabs, tab kept in
  the URL); deliverable table/cards, filters, create/edit/view dialog,
  dependency chain and picker with inline cycle errors; team lead picker on the
  project form; progress in the projects list.
- **Tests:** backend 60, frontend 40; `tests/acceptance/increment_a.sh`
  (20 curl checks).

## Decisions
- The assigned team lead can create and edit deliverables and manage
  dependencies, but not delete; only admin or the owning PM sets the team lead,
  who must be an active `team_lead` user.
- Dependencies stay within one project.
- Hard delete with cascade; retire projects by status.

## Known gaps
- Deliverable assignees arrive with resources in Increment B.
- No audit trail yet (Increment C).
