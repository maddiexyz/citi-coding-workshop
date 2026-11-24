# ACME Project Tracking

Sign in, then manage projects, their deliverables (with dependencies), the
people allocated to them and their budgets, with role-based permissions
enforced by the backend and every change kept in an audit log.

Built so far: Increment 1 (sign-in, projects), Increment A (deliverables,
dependencies, project team lead), Increment B (people, allocations,
over-allocation), Increment C (audit log, budgets) and Increment D (at-risk
dashboard, user management, refresh tokens, sign-in rate limiting). Plan and progress: [PLAN.md](./PLAN.md).

## Run locally

```sh
export ADMIN_EMAIL=admin@acme.test        # first admin user (seeded once)
export ADMIN_PASSWORD='choose-a-password'
./bin/start-dev.sh                        # http://localhost:3000
```

`start-dev.sh` applies database migrations (`bin/migrate.sh`), seeds the admin,
copies shared backend code into each service (`bin/sync-common.sh`), installs
Python dependencies, deploys the Lambdas to LocalStack and starts the proxy and
the React dev server.

## Deploy to AWS

```sh
export ADMIN_EMAIL=you@acme.example                 # first admin user (seeded once)
read -rs ADMIN_PASSWORD && export ADMIN_PASSWORD    # typed, not echoed or saved
./bin/deploy-backend.sh                             # Lambdas, CloudFront, migrations
./bin/deploy-frontend.sh                            # React build to S3 + CloudFront
```

Then sign in at the CloudFront URL (`terraform -chdir=infra output -raw website_url`).

`deploy-backend.sh` refreshes the workshop credentials, runs `terraform apply`,
then `bin/migrate-cloud.sh`. Aurora is only reachable inside the VPC, so
migrations run in a private Lambda (`backend/_migrate`, `infra/migrate.tf`)
with no Function URL and no CloudFront route. It applies the same
`backend/_db/migrations/*.sql` files, tracked in the same `schema_migrations`
table as `bin/migrate.sh`, and seeds the admin. The password is bcrypt-hashed
on your machine and only the hash is sent in the invoke payload, so it is not
stored in Terraform state, Lambda settings or logs. Running it again is safe:
applied migrations are skipped and an existing admin is never overwritten.

The API routes use their own CloudFront cache policy (`infra/cloudfront.tf`)
because CloudFront only forwards the `Authorization` header when it is part of
the cache key. Nothing is cached: the default TTL is 0 and the Lambdas send no
`Cache-Control`.

## Test

```sh
# Backend: real handlers against a throwaway "acme_test" PostgreSQL database
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/tests/requirements-dev.txt
backend/.venv/bin/pytest backend/tests

# Coverage (fails under 80%)
backend/.venv/bin/pytest backend/tests --cov --cov-config=backend/.coveragerc
(cd frontend && npm run coverage)

# Frontend
cd frontend && npm test

# End to end (Cypress against a production build and the running local stack)
(cd frontend && npm run e2e)

# Load test: tests/load/run.sh local (smoke) or cloud (asks for an account)

# Acceptance checks with curl against the running local stack
# (creates throwaway accept-*@acme.test users and removes them afterwards)
tests/acceptance/increment_a.sh
tests/acceptance/increment_b.sh
tests/acceptance/increment_c.sh
tests/acceptance/increment_d.sh

# Sign-in, refresh cookie and sign-out against the deployed site
# (asks for an account's email and password; nothing is stored)
tests/acceptance/cloud_auth_check.sh
```

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Schema | `backend/_db/migrations/*.sql` | Applied once each, tracked in `schema_migrations`: locally by `bin/migrate.sh` (psql), in AWS by the `backend/_migrate` Lambda (`bin/migrate-cloud.sh`) |
| Admin seed | `backend/_db/seed_admin.sql`, `backend/_migrate` | Reads `ADMIN_EMAIL` / `ADMIN_PASSWORD`; never overwrites an existing user |
| Shared backend code | `backend/_common/` | Routing, JSON errors, DB, JWT, bcrypt, permissions, validation |
| Auth service | `backend/auth/` → `/api/auth` | `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`; rate limiting |
| Projects service | `backend/projects/` → `/api/projects` | CRUD with `?status=` and `?q=` filters; `team_lead_id`; progress counts |
| Deliverables service | `backend/deliverables/` → `/api/deliverables` | CRUD with `?project_id&status&blocked&overdue&due_before&q`; `/{id}/dependencies` |
| Users service | `backend/users/` → `/api/users` | Admin CRUD, `PUT /{id}/password`; `GET ?role&active&q` also for project managers (pickers) |
| Dashboard service | `backend/dashboard/` → `/api/dashboard` | `GET /summary`, `GET /at-risk?q&flag&severity` (everyone) |
| At-risk logic | `backend/_common/risk.py` | Risk signals computed at query time |
| Resources service | `backend/resources/` → `/api/resources` | People: CRUD (admin), `?q&department&active&over_allocated&week`, `/{id}/load?from&to` |
| Allocations service | `backend/allocations/` → `/api/allocations` | Hours per week on a project: CRUD (admin, owning PM), `?project_id&resource_id&active_on` |
| Budget service | `backend/budget/` → `/api/budget` | `GET /summary?project_id` (everyone); spend entries CRUD (admin, owning PM; delete admin) with `?category&from&to&q` |
| Audit service | `backend/audit/` → `/api/audit` | Change history `?project_id&entity_type&entity_id&actor&from&to&limit` (admin; owning PM for their project) |
| Audit helper | `backend/_common/audit.py` | `audit.record(...)` inside `db.transaction()` next to every write |
| Frontend | `frontend/src/` | `services/` API calls, `auth/` session and rules, `pages/`, `components/` |

Each folder directly under `backend/` with a `requirements.txt` becomes its own
Lambda at `/api/<folder>`. A Lambda only contains its own folder, so
`backend/_common` is copied into each service as `common/` (gitignored; edit
`_common`, not the copies).

### Roles

| Role | Projects | Deliverables and dependencies | People | Allocations | Budget | Activity (audit) | Users |
| --- | --- | --- | --- | --- | --- | --- | --- |
| admin | Create, edit and delete any project | Everything | Create, edit, delete | Everything | Everything, including deleting spend | Everything | Create, edit roles, deactivate, reset passwords, delete |
| project_manager | Create; edit projects they own (team lead, planned budget); delete them only while they have no spend | Everything in projects they own | Read | In projects they own | In projects they own: summary, spend entries, record and edit (not delete) | Projects they own | — (pickers only) |
| team_lead | Read only | In projects where they are the team lead: create, edit, change status and manage dependencies; **not** delete | Read | Read | Summary only | — | — |
| viewer | Read only | Read only | Read | Read | Summary only | — | — |

Everyone signed in sees the dashboard.

Every signed-in user can read everything. The user is re-read from the
database on every request, so deactivating a user or changing a role takes
effect immediately, not when the token expires.

Rules live in `backend/_common/permissions.py`. The UI mirrors them in
`frontend/src/auth/permissions.js` only to hide buttons; every request is
checked by the backend (401 without a valid token, 403 when not allowed).

### API errors

Every error has the same shape:

```json
{ "error": { "code": "validation_error", "message": "Some fields are invalid",
             "details": { "end_date": "End date must be on or after the start date" } } }
```

### Deliverables and dependencies

- A deliverable belongs to one project; statuses are `not_started`,
  `in_progress`, `done`, `cancelled`.
- "A depends on B" means A cannot finish before B. Dependencies stay inside
  one project. Adding one that would close a loop returns `409
  dependency_cycle` with the loop, e.g. `C → A → B → C`; the check runs in a
  transaction with the project row locked, so two people can't each add half
  of a cycle.
- **Computed, never stored:** *blocked* (a predecessor is not done or
  cancelled), *overdue* (due date passed and not done or cancelled) and the
  project's progress (done / total, ignoring cancelled). They live in the
  `deliverable_details` and `project_details` views.

### People, allocations and over-allocation

- A *resource* is a person who does project work, with a weekly capacity
  (`weekly_hours`, at most 60). It is separate from a sign-in *user*; a
  resource can optionally be linked to one user.
- An *allocation* gives a person a number of hours per week (at most 80) on a
  project between two dates, which must fall within the project's dates.
  The same person can't have two overlapping allocations on the same project
  (409: edit the existing one); overlapping allocations on different projects
  are what over-allocation is about.
- **Over-allocation is flagged, never blocked.** Weeks start on Monday; an
  allocation counts its full hours in every week it touches, even partly.
  Allocations on cancelled projects don't count. When a person's hours in a
  week exceed their capacity, the save still succeeds and the response lists
  the weeks in `warnings`; the UI explains it. All load figures come from the
  `resource_weekly_load()` SQL function at query time.
- A person with allocations can't be deleted (409); set them inactive
  instead. Inactive people can't get new allocations or deliverables.
- Hours and other decimals are sent as strings (`"37.50"`), never floats.

### Budget

- Each project has one approved amount, `budget_planned`. Spend entries
  record **actual** spend only, with a category (labor, software, hardware,
  travel, other), an amount and a date. Labor is entered by hand; allocation
  hours and budget money are independent.
- Burn % = actual ÷ planned. The summary also shows the remaining amount,
  an over-budget flag (actual > planned) and spend by category. With no
  planned budget (empty or 0) it says *No budget set* instead of dividing by
  zero. All of this is computed in the `project_details` view.
- Amounts are `NUMERIC(12,2)`, sent as exact strings like `"1234.50"`, and
  must be ≥ 0. One currency for the whole app (`app_currency` in Terraform,
  default `USD`) is used for display only; there is no conversion.

### Audit log

Every create, update and delete through the API writes an `audit_log` entry
**in the same transaction** as the change, with who did it, when, and the old
and new values (only the changed fields for updates). If writing the entry
fails, the change is rolled back. Deleting a project keeps a snapshot of the
project and what was removed with it (deliverables, dependency count,
allocations, spend entries). The project's **Activity** tab shows it.

### Dashboard and at-risk projects

The dashboard (the home page) shows active projects, how many are at risk or
over budget, overdue and blocked deliverables, and who is over-allocated
this week. "Projects needing attention" lists each flagged project with the
reasons. Only active projects, and planned ones whose start date has
passed, are evaluated. Signals (computed at query time, never stored):

| Signal | Fires when | Severity |
| --- | --- | --- |
| late | past its end date and not completed or cancelled | high |
| overdue_deliverable | a deliverable is past its due date and not done | medium |
| schedule_slip | % of deliverables done lags % of time elapsed by more than `AT_RISK_SLIP_POINTS` (default 20); skipped without deliverables, without an end date, or before the start | medium |
| blocked_due_soon | a blocked deliverable is due within 7 days | medium |
| over_allocated_resource | someone allocated to it this week is over capacity | medium |

**Over budget is a separate flag**, shown next to the at-risk flag, not a
reason for it.

### Sign-in, sessions and users

- **Access token:** a 15-minute JWT in the `Authorization` header, kept in
  `sessionStorage`. Every request re-reads the user, so deactivation and role
  changes apply immediately.
- **Refresh token:** a random token in the `acme_refresh` cookie
  (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth`, 12 hours), stored
  only as a SHA-256 hash and rotated on every use. When the access token
  expires, the app refreshes once and retries; a new tab or a reload restores
  the session from the cookie. `/refresh` re-reads the account (deactivated
  users are refused, the current role is used); `/logout` revokes the token
  and clears the cookie.
- **Rate limiting:** after 5 failed sign-ins for one email, or 20 from one IP,
  within 15 minutes, further attempts get `429 rate_limited` with
  `Retry-After` (also for unknown emails, so it reveals nothing). The IP
  comes from `CloudFront-Viewer-Address`, never from `X-Forwarded-For`,
  which a browser can forge.
- **User management (admin):** create users with an initial password (at
  least 10 characters), change role and active, reset passwords, delete.
  An admin can't change their own role, deactivate or delete themselves;
  users who own projects can't be deleted (reassign or deactivate). Role
  changes, deactivation and password resets revoke the user's sessions.
  Password data never appears in responses or the audit log.

### Deleting

Deleting a project also deletes its deliverables, dependencies, allocations
and spend entries; the confirmation lists them first. Once a project has
spend entries only an admin can delete it. To retire a project, set its
status to *completed* or *cancelled*; use delete only to remove mistakes.

## Trade-offs and known gaps

- **Access token in `sessionStorage`.** Readable by scripts on the page, so
  XSS protection matters (React escapes output by default); it is short-lived
  (15 minutes) and the long-lived refresh token is in an HttpOnly cookie.
- **No reuse detection for refresh tokens** (stretch goal): a stolen,
  already-rotated token is refused, but its use doesn't revoke the rest of
  that user's sessions.
- **Two migration runners.** `bin/migrate.sh` (psql, local) and the
  `backend/_migrate` Lambda (AWS) apply the same files with the same
  bookkeeping. The Lambda exists only because Aurora is not reachable from
  outside the VPC.
- **Rate-limit IP behind CloudFront** relies on the `CloudFront-Viewer-Address`
  header; if it isn't forwarded, the per-IP limit counts CloudFront's address
  (the per-email limit still applies).
- **Single currency.** Amounts are shown in one configured currency with no
  conversion; multi-currency budgets are out of scope.
- **Audit log grows forever** (no retention policy yet) and records changes
  made through the API only, not direct SQL.
- **Partial weeks count in full** for over-allocation: a two-day allocation of
  20 h/week adds 20 h to that week. Simple and predictable, but it can flag a
  week that is really fine. Create other users with SQL, e.g.
  `INSERT INTO users (email, password_hash, full_name, role) VALUES ('pm@acme.test', crypt('…', gen_salt('bf', 12)), 'Pat PM', 'project_manager');`
- **Compiled dependencies** (`bcrypt`, `psycopg[binary]`) must match the
  Lambda runtime (Python 3.13, x86_64). `start-dev.sh` installs wheels for that
  target; for AWS, Terraform's Lambda module builds with the `python3.13`
  interpreter, which must be installed locally.
- **First request after Aurora pauses** can take ~15 seconds while it resumes;
  the database connection timeout is 30 seconds to cover that.
