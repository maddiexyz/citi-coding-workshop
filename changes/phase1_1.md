# v1.1 – Final round before freezing v1

Branch `feature/v1.1` (from `feature/increment-e`).

## 1. Departments
- Migration 008: `departments` (name unique case-insensitively, stored
  trimmed); one department per distinct trimmed `resources.department`
  value; `resources.department_id` set from it; the migration aborts before
  dropping the text column if any non-blank value is unmapped.
  `projects.department_id` added; `project_details` exposes
  `department_name`.
- `departments` service: `GET /api/departments` (everyone, with people and
  project counts), `POST`/`PUT`/`DELETE` admin only, `409` while in use,
  audited. Resources, projects and the dashboard at-risk list filter by
  `?department_id=`; searching people also matches the department name.
- People page: department filter, *Group by department* (headcount,
  allocated vs capacity this week, over-allocated count); admins get a
  *Departments* dialog to add, rename and delete. Project form: department
  select; projects list and dashboard: department filter; project overview
  shows the department.

## 2. Identity and "(you)"
- `/api/auth/me` (and the user returned by login and refresh) includes
  `resource_id`, the person linked to the account, or null.
- `useYou()` (`frontend/src/auth/useYou.js`) labels names as "Name (you)":
  project owner and team lead (list, cards, overview), deliverable assignee,
  people list and person page, allocations, activity log, users list.

## 3. "Mine" filters
- `GET /api/projects?owner=me` / `?team_lead=me`, `GET /api/deliverables?assignee=me`,
  `GET /api/allocations?resource=me`. "me" is resolved from the token; any
  other value for `owner`, `team_lead` or `resource` is a 400. A user with no
  linked person gets an empty list for `assignee=me` and `resource=me`.
- Projects list: *All projects* / *Owned by me* (project managers) or *Led
  by me* (team leads), kept in the URL as `?mine=1`; hidden for viewers and
  admins.

## Decisions made on your behalf
| Item | Decision | Why |
| --- | --- | --- |
| 1 | When existing values differ only in case or spaces, keep the most used spelling; ties prefer Title Case, then byte order | Deterministic regardless of database collation; "Finance" beats "finance"/"FINANCE" |
| 1 | Blank or whitespace-only department values become "no department" | There is no name to keep |
| 1 | Departments are managed in a dialog on the People page, not a separate page | "Small admin UI"; keeps the navigation short |
| 1 | People grouping is done in the browser from the filtered list | The list already has capacity and this week's hours; no extra endpoint |
| 3 | The Mine toggle is hidden for admins as well as viewers | The brief names PMs and team leads; admins manage everything |
| 3 | `assignee=me` / `resource=me` with no linked person return nothing | "Mine" must never widen to everything |
