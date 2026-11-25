# ACME Project Tracker – plan for increments A–E

## Progress
- [x] A. Deliverables + dependencies
- [x] B. Resources + allocations + over-allocation
- [x] C. Audit log, then budget
- [x] D. At-risk dashboard + user management + auth hardening
- [x] E. Hardening (coverage, Cypress, Artillery, accessibility, README, compliance, reproducibility); cloud load run and cloud sign-in check left for the owner
- [x] F. v2.0 completion-date forecasting (estimates and progress, critical-path forecast, confidence, SPI, late-forecast risk, list column, Timeline tab, seeded demo): see `changes/phaseF.md`; cloud reseed left for the owner
- [x] G. v2.1 AI project briefing (signed facts, `ai` Lambda outside the VPC, Gemini Flash, grounded points with sources): see `changes/phaseG.md`

## Context
Increments 1 and 1.5 are done and deployed: sign-in, projects CRUD with RBAC, and the AWS deploy.
The final goal is the problem statement's seven questions:

| Question | Answered by |
|---|---|
| Status of each active project | 1 (done), D dashboard |
| Which projects are at risk | D |
| How resources are allocated | B |
| Key deliverables and their completion | A |
| Who is over-allocated | B, D |
| Dependency chain between deliverables | A |
| Budget consumed vs planned | C, D |

CLAUDE.md rules apply throughout:
- Each `backend/<folder>` with a `requirements.txt` becomes a Lambda.
- Shared code goes in `backend/_common`.
- Migrations live in `backend/_db/migrations`.
- Derived values are computed, never stored.
- Over-allocation is flagged, never blocked.
- Never run destroy or cleanup.

## Decisions (from you)
- **Team lead scope:** `projects.team_lead_id`, set only by admin or the owning PM, and it must be an active user with role `team_lead`.
  - The assigned team lead may create and edit deliverables, change their status, and manage dependencies in that project.
  - The team lead may **not** delete deliverables. Deleting stays with admin and the owning PM.
- **Delete:**
  - Hard delete returning 204; a project's children cascade.
  - From increment C, the audit entry for a project delete stores the project plus its children (or their counts), in the same transaction.
  - The UI confirm dialog lists what will be removed.
  - The README says: retire a project by setting its status to completed or cancelled; use delete only to remove mistakes.
- **Budget:**
  - `projects.budget_planned` holds one approved amount. `budget_entries` hold actual spend only, with category `labor | software | hardware | travel | other`.
  - Amounts are `NUMERIC(12,2)` and must be ≥ 0. One app-wide currency from config, for display only; multi-currency is a known gap.
  - Burn % = actual / planned. Also show the remaining amount and an over-budget flag. Show "No budget set" when planned is 0 or empty.
  - Labor cost is entered by hand. Allocation hours and budget money stay independent.
  - Changes to `budget_planned` and to entries are audited with old and new values.
- **Budget visibility:**
  - Everyone signed in sees the budget summary.
  - Admin and the owning PM see line items and can write them.
  - Only admin deletes entries.
  - Stretch goal, not now: `hourly_rate` for a labor-cost forecast.
- **Resources and allocations:**
  - Only admin creates, edits and deletes resources.
  - Admin and the owning PM manage allocations; the assigned team lead can view them.
  - Everyone reads both.
- **At-risk:**
  - **Which projects:** active ones, and planned ones whose start_date has passed.
  - **Signals:**
    - **late:** past end_date and not completed or cancelled. This is the highest severity.
    - **overdue_deliverable**
    - **schedule_slip:** % of deliverables done lags % of time elapsed by more than `AT_RISK_SLIP_POINTS`, default 20. Skipped when the project has no deliverables or hasn't started.
    - **blocked_due_soon:** a blocked deliverable due within 7 days.
    - **over_allocated_resource:** a resource on the project is over-allocated in the current week.
  - Over-budget is a **separate** flag, not an at-risk signal.
  - The response includes `risk_reasons` with details. Everything is computed at query time.
- **Refresh tokens:**
  - Stored in an HttpOnly, Secure, SameSite=Strict cookie with `Path=/api/auth`, rotated on every use, and stored hashed in `refresh_tokens`.
  - Locally, the proxy forwards `Cookie` and `Set-Cookie`, auth calls use `credentials: 'include'`, and CORS sends credentials for an explicit origin.
  - In the cloud, CloudFront `/api/*` forwards the cookie, and the Lambda sets it through the Function URL `cookies` field.
  - `/refresh` re-reads `is_active` and the role from the database. `/logout` revokes the token and clears the cookie.
  - Stretch goal, not now: revoke all of a user's tokens when an old one is reused.
- **Dependencies:** same project only.
- **Deleting a project with budget entries:** admin only. The owning PM gets 403 and should set the status to cancelled instead.
- **Allocation rules:**
  - An allocation that overlaps an existing one for the same resource on the same project gets 409 (edit the existing one instead).
  - Allocation dates outside the project's start_date–end_date get 400.
- **Typo caps:** `resources.weekly_hours` > 0 and ≤ 60; `allocations.hours_per_week` > 0 and ≤ 80. Going over a person's capacity across allocations stays a warning, never a block.
- **"Redeploy from scratch" (increment E)** means proving reproducibility. Never destroy, never wipe the cloud database.

## Assumptions (tell me if any are wrong)
- **Deliverable status:** `not_started | in_progress | done | cancelled`.
  - `blocked` is computed: the deliverable has any predecessor not done.
  - `overdue` is computed: due_date has passed and status isn't done or cancelled.
- **Over-allocation:**
  - Weeks run Monday to Sunday, using dates only.
  - An allocation counts its full `hours_per_week` in every week it overlaps.
  - A resource is over-allocated in a week when its total hours exceed `weekly_hours`.
- **Resources:** a resource that has allocations can't be deleted (409 "remove allocations or deactivate"). Resources have an `is_active` flag.
- **Users:**
  - Users are hard-deleted, but a user who still owns projects gets 409 ("reassign first"). Deactivating (`is_active`) is the normal route.
  - An admin can't demote or deactivate themselves, or the last admin.
- **The audit log is readable** by admin (everything) and the owning PM (their own projects).
- **Login rate limit:** 5 failed attempts per email and 20 per IP in 15 minutes → `429 rate_limited` with `Retry-After`. Attempts are stored in Postgres, because Lambda memory isn't shared between instances.
- **Access token lifetime** drops to 15 minutes once refresh tokens exist.
- **One new Lambda per area:** `deliverables`, `resources`, `allocations`, `budget`, `audit`, `users`, `dashboard`. Each folder gets its CloudFront route automatically.

## Shared groundwork, reused by every increment
- **`_common/db.py`:** add a `transaction()` context manager on the shared connection. Needed for the cycle check, project-row locks, audit-in-same-transaction and token rotation.
- **`_common/http.py`:**
  - Encode `Decimal` as a string in `_json_default`.
  - Support a `cookies` list in `json_response`.
  - Move the shared id helper here as `parse_id` (ASCII digits only).
- **`_common/permissions.py`:** add one function per rule, mirrored in `frontend/src/auth/permissions.js` with matching tests.
- **`_common/validation.py`:** add `Validator` methods for `number` (min/max, precision) and `reference` (row exists → 400).
- **Frontend reuse:**
  - `apiRequest` in `services/api.js`
  - `ConfirmDialog`, `ProjectStatusChip`, the table/card pattern (`ProjectTable`/`ProjectCardList`) and `ProjectFilters`
  - `useMediaQuery` from react-responsive
  - `utils/format.js` (add currency and hours formatting)

---

## Increment A: deliverables and dependencies
**A0. Carry-over fixes from the audit** (skip any already done):
- **CloudFront routing:** a CloudFront Function on the default behaviour rewrites paths with no file extension to `/index.html`, and the 404 custom error rule is removed. This fixes reloading on deep links (currently S3 403) and API 404s arriving as 200 HTML.
- **Ghost user:** a token for a user who no longer exists gets 401, not 500.
- **`parse_id`:** ASCII digits only.
- Tests for both backend fixes.

**Migration `003_deliverables.sql`:**
- `projects.team_lead_id INT NULL REFERENCES users ON DELETE SET NULL`
- Enum `deliverable_status`.
- `deliverables`:
  - `id`, `project_id` (FK, cascade), `title` (required, max 200), `description`, `status` (default not_started), `due_date DATE`, `completed_at`
  - `created_by` (FK users), `created_at`, `updated_at`
  - Indexes on `(project_id)` and `(due_date)`
- `deliverable_dependencies`:
  - `deliverable_id` and `depends_on_id`, both FKs with cascade; together they're the primary key.
  - `CHECK (deliverable_id <> depends_on_id)`
- View `deliverable_details`:
  - Adds `project_code`, `is_blocked` (via EXISTS on predecessors) and `is_overdue`.
  - Adds predecessor and successor counts.
- `project_details` gains:
  - `team_lead_name`
  - `deliverables_total`, `deliverables_done`

**Endpoints:**
| Method and path | Roles |
|---|---|
| `GET /api/deliverables?project_id&status&blocked&overdue&due_before&q` | all |
| `GET /api/deliverables/{id}` (includes predecessors and successors) | all |
| `POST` / `PUT /api/deliverables/{id}` | admin, owning PM, assigned team lead |
| `DELETE /api/deliverables/{id}` | admin, owning PM |
| `GET /api/deliverables/{id}/dependencies` | all |
| `POST /api/deliverables/{id}/dependencies {depends_on_id}` | admin, owning PM, assigned team lead |
| `DELETE /api/deliverables/{id}/dependencies/{depends_on_id}` | admin, owning PM, assigned team lead |
| `PUT /api/projects/{id}` now accepts `team_lead_id` | admin, owning PM; anyone else setting it gets 403. A value that isn't an active team lead gets 400 |
| `GET /api/users?role=team_lead&active=true` (read-only picker; full CRUD comes in D) | admin, PM |

**Cycle check:** inside a transaction:
1. Lock the project row (`SELECT … FOR UPDATE`).
2. Check both deliverables belong to the same project; if not → 400.
3. Run a recursive CTE from `depends_on_id` following dependencies. If it reaches `deliverable_id` → `409 dependency_cycle`, with the cycle path in `details`.
4. A duplicate edge → 409.

**Frontend:**
- `pages/ProjectDetailPage` (`/projects/:id`) with tabs: Overview (team lead, progress bar done/total) and Deliverables. Later increments add Allocations, Budget and Activity.
- `components/deliverables/`:
  - `DeliverableTable` and `DeliverableCardList`
  - `DeliverableFilters`: status, blocked, overdue, search
  - `DeliverableFormDialog`
  - `DependencyEditor`: autocomplete over the same project's deliverables, with the cycle error shown inline
  - `DependencyChain`: predecessors → this → successors
  - `BlockedChip` and `OverdueChip`
- Loading, empty and error states everywhere.
- `ProjectFormPage` gets a team lead select. The projects list links to the detail page and shows progress.

**Tests:**
- **Backend:**
  - CRUD integration tests and validation (required title, dates, status enum, unknown project → 400).
  - The full role matrix: an assigned versus unassigned team lead, a team lead trying to delete (403), and a `team_lead_id` that isn't a team lead (400).
  - The cycle check: self, direct, indirect, cross-project, and duplicate edges.
  - The computed blocked and overdue flags, and children cascading when a project is deleted.
- **Frontend:**
  - Validation in the form dialog.
  - The cycle error in the dependency editor.
  - Buttons per role on the detail page.
  - Permission-mirror tests.

**Acceptance checks:**
- **curl:**
  - Deliverables A, B and C, with A→B and B→C, then C→A → 409.
  - `?blocked=true` returns A and B.
  - A viewer POST → 403.
  - The assigned team lead: PUT → 200, DELETE → 403.
  - An unassigned team lead: PUT → 403.
  - Reloading `/projects/1` in the cloud → 200 HTML.
  - A missing id in the cloud → JSON 404.
- **UI:**
  - The detail tabs on desktop and mobile.
  - Adding a dependency shows the chain.
  - The cycle error appears next to the field.

**Risks:**
- The cycle check could race with a concurrent edit; the transaction plus the project lock prevent that.
- The CloudFront change takes about 5–10 minutes to roll out.
- Each new Lambda adds a cold start.

## Increment B: resources, allocations and over-allocation
**Migration `004_resources.sql`:**
- `resources`:
  - `id`, `full_name`, `email`, `department`, `title`
  - `user_id INT NULL UNIQUE REFERENCES users ON DELETE SET NULL`
  - `weekly_hours NUMERIC(5,2) DEFAULT 40 CHECK (> 0 AND <= 60)`, `is_active`, timestamps
- `allocations`:
  - `id`, `project_id` (FK, cascade), `resource_id` (FK, restrict)
  - `hours_per_week NUMERIC(5,2) CHECK (> 0 AND <= 80)`, `start_date`, `end_date` (required, end ≥ start), `note`, timestamps
  - Index on `(resource_id, start_date, end_date)`
- `deliverables.assignee_resource_id` FK, ON DELETE SET NULL.
- SQL function `resource_weekly_load(from_date, to_date)`:
  - Built on `generate_series` over Monday-starting weeks.
  - Returns resource, week, total hours, weekly hours, `over_by` and the project breakdown.
  - Computed at query time.

**Endpoints:**
| Method and path | Roles |
|---|---|
| `GET /api/resources?q&department&active&over_allocated&week` | all |
| `GET /api/resources/{id}` (includes allocations) | all |
| `GET /api/resources/{id}/load?from&to` | all |
| `POST` / `PUT` / `DELETE /api/resources/{id}` (delete with allocations → 409) | admin |
| `GET /api/allocations?project_id&resource_id&active_on` | all |
| `POST` / `PUT` / `DELETE /api/allocations/{id}` | admin, owning PM |

POST and PUT on allocations:
- An overlap with the same resource on the same project gets 409 `allocation_overlap`.
- Dates outside the project's start and end dates get 400.

They return **201 or 200 plus `warnings: [{week, total_hours, weekly_hours, over_by}]`**. The allocation is saved even when it causes over-allocation.

Deliverable POST and PUT accept `assignee_resource_id`, which must be an existing active resource (otherwise 400). `GET /api/deliverables` gets an `assignee` filter.

**Frontend:**
- `pages/ResourcesPage`: list with filters and an over-allocated chip; create/edit dialog for admin only.
- `pages/ResourceDetailPage`: weekly load table (weeks × hours, with over-allocated weeks highlighted).
- A project Allocations tab: `AllocationTable`, `AllocationFormDialog` (shows the warning after saving: "Saved – Pat is over-allocated by 6 h in the week of …") and an `OverAllocationBanner`.
- An assignee picker and filter for deliverables.

**Tests:**
- **Load query:**
  - Week boundaries, partial overlaps, several projects and inactive resources.
  - Over-allocation produces a warning but the allocation is still saved (201).
- **Validation:** hours > 0 and the 60/80 caps, dates (including outside the project's dates → 400), an overlap on the same project → 409, the resource exists, a user can be linked to only one resource, and the assignee foreign key.
- **Roles:** admin-only for resources; for allocations, a PM on someone else's project and a team lead both get 403.
- **Frontend:** the warning is displayed, and the resource form validates.

**Acceptance checks:**
- **curl:** resource with 40 h; 30 h on P1, then 20 h on P2 in the same week → 201 with `over_by: 10`; `?over_allocated=true` lists the resource.
- **UI:** the chip and the highlighted week appear.

**Risks:**
- What counts as a week and how partial weeks are handled must be clear: documented in the README and shown in the UI.
- Query cost is fine at workshop scale (indexed).

## Increment C: audit log, then budget
**Migration `005_audit_log.sql`:**
- `audit_log`:
  - `id BIGSERIAL`, `occurred_at`
  - `actor_user_id` (FK, set null), `action` (create, update or delete)
  - `entity_type`, `entity_id`, `project_id NULL`
  - `old_values JSONB`, `new_values JSONB`, `details JSONB`
  - Indexes on `(entity_type, entity_id)`, `(project_id, occurred_at)` and `(actor_user_id)`
- Written by `_common/audit.py record(...)` inside the **same transaction** as the change. It's written by the app, not by database triggers, so the actor is the app user.
- Added to every existing write: projects (including `team_lead_id`), deliverables, dependencies, resources, allocations.
- A project delete stores the project plus its children's rows (or their counts).

**Migration `006_budget.sql`:**
- `projects.budget_planned NUMERIC(12,2) NULL CHECK >= 0`
- Enum `spend_category`.
- `budget_entries`:
  - `id`, `project_id` (FK, cascade), `category`, `amount NUMERIC(12,2) CHECK >= 0`, `spent_on DATE NOT NULL`, `description`
  - `created_by`, timestamps
- `project_details` gains `actual_spend`, `remaining`, `burn_pct` (NULL when there's no budget) and `over_budget`.
- Currency: `APP_CURRENCY` env var plus `VITE_CURRENCY`, display only.

**Endpoints:**
| Method and path | Roles |
|---|---|
| `GET /api/budget/summary?project_id` (planned, actual, remaining, burn_pct or "no budget", over_budget, by_category) | all |
| `GET /api/budget?project_id&category&from&to&q` | admin, owning PM |
| `GET /api/budget/{id}` | admin, owning PM |
| `POST` / `PUT /api/budget/{id}` | admin, owning PM |
| `DELETE /api/budget/{id}` | admin |
| `DELETE /api/projects/{id}` once the project has budget entries | admin only (the owning PM gets 403: set the status to cancelled) |
| `budget_planned` through `PUT /api/projects/{id}` (audited old → new) | admin, owning PM |
| `GET /api/audit?project_id&entity_type&entity_id&actor&from&to` | admin; owning PM for own projects |

**Frontend:**
- **Budget tab:**
  - `BudgetSummaryCards` (planned, actual, remaining, a burn bar, an over-budget chip, "No budget set")
  - `CategoryBreakdown`
  - `BudgetEntryTable` with filters and a form dialog (admin and owning PM); delete for admin only
- **Project form:** a `budget_planned` field.
- **Activity tab** (admin and owning PM): `AuditList` showing old → new differences.
- **Projects list:** burn % and an over-budget chip.

**Tests:**
- **Amounts and burn:**
  - Exact decimal maths (e.g. 0.10 + 0.20) and negative amounts rejected.
  - Burn %, including planned = 0 or empty, and over-budget.
  - The category breakdown.
- **Roles:**
  - A team lead or viewer gets the summary (200) but line items return 403.
  - A PM who doesn't own the project gets 403.
  - A PM trying to delete an entry gets 403.
  - A project with budget entries: the owning PM's delete gets 403; admin's delete gets 204.
- **Audit:**
  - Every write leaves an audit row with old and new values.
  - A project delete leaves a snapshot.
  - Atomicity: if the audit insert fails, the change rolls back.

**Acceptance checks:**
- **curl:**
  - planned 1000; entries of 600 labor and 500 software → `burn_pct 110`, `over_budget: true`.
  - A viewer gets the summary (200) but entries return 403.
  - The audit shows `budget_planned` with old → new.
- **UI:** the Budget and Activity tabs.

**Risks:**
- Retrofitting audit touches every write.
- Decimal values must be sent as strings, never floats.
- Every write needs `transaction()`.

## Increment D: at-risk dashboard, user management and auth hardening
**Migration `007_auth_hardening.sql`:**
- `refresh_tokens`:
  - `id`, `user_id` (FK, cascade), `token_hash` (unique)
  - `expires_at`, `created_at`, `revoked_at`, `replaced_by`
- `login_attempts`:
  - `email_lower`, `ip`, `attempted_at`, `succeeded`
  - Indexes on `(email_lower, attempted_at)` and `(ip, attempted_at)`
  - Old rows are cleaned up on each write.
- The at-risk logic is in `_common/risk.py`: SQL per signal, assembled into `risk_reasons` (type, severity, details such as the deliverable or person).

**Endpoints:**
| Method and path | Roles |
|---|---|
| `GET /api/dashboard/summary` (counts by status, at-risk, over-budget, over-allocated people this week, overdue deliverables) | all |
| `GET /api/dashboard/at-risk?department&severity` (projects with `risk_reasons` and a separate `over_budget`) | all |
| `GET /api/users?q&role&active` | admin (PM for the read-only picker) |
| `POST` / `PUT /api/users/{id}` (role, name, is_active, password reset) | admin |
| `DELETE /api/users/{id}` (owns projects → 409; no self or last-admin changes) | admin |
| `POST /api/auth/login` (sets the refresh cookie), `POST /api/auth/refresh` (rotates; re-reads active status and role), `POST /api/auth/logout` | public / cookie |

New status code: **429**.

**Infra and proxy:**
- `bin/proxy-server.js` forwards `Cookie` and `Set-Cookie`, and sends CORS credentials for an explicit origin.
- The CloudFront API cache policy forwards the refresh cookie on `/api/auth*`.
- The rate limit takes the viewer IP from `CloudFront-Viewer-Address` or the first `X-Forwarded-For` entry, which is documented.

**Frontend:**
- `pages/DashboardPage` becomes the home page:
  - `SummaryCards`
  - `AtRiskTable` / cards with `RiskReasonChips` that expand to the details
  - An over-budget column
  - An `OverAllocatedPeople` card
- `pages/UsersPage` (admin only): filters, `UserFormDialog`, and a confirmation for role changes and deactivation.
- `api.js`: on `token_expired`, refresh once and retry; otherwise sign out. Logout calls `/logout`.
- The login page shows the 429 message with the retry time.

**Tests:**
- **At-risk signals:** each signal on its own, combinations, and the exclusions (completed, not started yet, no deliverables), plus the threshold setting.
- **Users:** the role matrix, and the last-admin and self protection.
- **Refresh tokens:**
  - Rotation (a token can't be reused), expired, revoked and deactivated users refused.
  - Logout clears the cookie.
- **Rate limit:** the 6th attempt gets 429, and it resets after the window (the clock is injected in tests).
- **Frontend:** refresh-and-retry, the dashboard's reasons, and the admin-only users page.

**Acceptance checks:**
- **curl, locally and in the cloud,** with a cookie jar (`-c`/`-b`):
  - The cookie flags are `HttpOnly; Secure; SameSite=Strict; Path=/api/auth`.
  - Refresh → 200 with a new cookie; reusing the old cookie → 401; logout clears it.
  - 6 bad logins → 429.
- **UI:**
  - The dashboard explains each flag.
  - Sessions survive past 15 minutes.

**Risks:**
- Cookies through the local proxy and through CloudFront (forwarding and caching).
- The Function URL `cookies` field.
- The source of the viewer IP behind CloudFront.
- Locking out the last admin.

## Increment E: hardening
- **Coverage gates:**
  - `pytest --cov-fail-under=80` (expected ≥ 90), and Vitest coverage thresholds at 80%.
  - `pytest-cov` and `@vitest/coverage-v8` added to the dev dependencies.
  - An endpoint and error-case coverage table: CRUD 90% or more, error cases 90% or more.
- **Cypress end-to-end tests**, with the critical paths listed and each one mapped to a spec, for 100% coverage:
  - login, refresh, logout
  - project CRUD
  - deliverables and the cycle error
  - the over-allocation warning
  - budget and burn
  - the dashboard reasons
  - user admin
  - read-only viewer
  - mobile viewport
- **Artillery load test** on login, the projects list and the dashboard. Kept modest because the account is shared, e.g. 10–20 requests per second for 2 minutes. Records p95 latency and errors.
- **Accessibility:** `cypress-axe` on every page, keyboard navigation, labels and contrast; Lighthouse accessibility score ≥ 90.
- **Bundle:** lazy-loaded routes, to clear the 583 kB warning.
- **Final README:**
  - The root README links to the docs.
  - Architecture, how to run, test and deploy.
  - Decisions, and known gaps (multi-currency, the forecast stretch goal, token-reuse detection).
  - A table of test results.
- **Compliance audit:** rerun the `docs/full-stack.md` audit; every item passes or is a documented gap.
- **Proof of reproducibility, with no destroy:**
  1. Fresh clone into a new folder, an empty local database, follow only the README, run `start-dev.sh`. Fix any dependence on uncommitted files or undocumented steps.
  2. Deploy twice; the second run must change nothing (no infra changes, no new migrations, admin seed reported as existing). Record the output and a curl check.
  3. `deploy-frontend.sh` already runs `aws s3 sync --delete`, so stale files are removed. Note it in the README.
  4. Never destroy or wipe the cloud database.
- **Risks:** the log groups changed by the organizers will make the second deploy show changes. Fix by matching their settings in Terraform, or document it as the one expected difference.

---

## Every increment ends with (per CLAUDE.md)
1. bandit, flake8, pylint and ESLint pass.
2. Backend and frontend tests are green.
3. `start-dev.sh` runs, plus the curl acceptance script.
4. `deploy-backend.sh` and `deploy-frontend.sh` complete, with a cloud curl check.
5. `docs/acme-project-tracking.md` and `changes/phaseN.md` are updated.
6. Small commits on `feature/increment-<x>`. Push only when asked, and only to `mine`.

## Way of working
Increments A–D run back to back, with recommended defaults for reversible choices. Work stops only for something destructive, security-weakening, or a blocker after two attempts. A five-line summary follows each increment.
