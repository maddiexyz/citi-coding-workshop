# ACME Project Tracking

Sign in, then manage projects, their deliverables (with dependencies), the
people allocated to them and their budgets, with role-based permissions
enforced by the backend and every change kept in an audit log.

Built so far: Increment 1 (sign-in, projects), Increment A (deliverables,
dependencies, project team lead), Increment B (people, allocations,
over-allocation) and Increment C (audit log, budgets). Plan and progress: [PLAN.md](./PLAN.md).

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

# Frontend
cd frontend && npm test

# Acceptance checks with curl against the running local stack
# (creates throwaway accept-*@acme.test users and removes them afterwards)
tests/acceptance/increment_a.sh
tests/acceptance/increment_b.sh
tests/acceptance/increment_c.sh
```

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Schema | `backend/_db/migrations/*.sql` | Applied once each, tracked in `schema_migrations`: locally by `bin/migrate.sh` (psql), in AWS by the `backend/_migrate` Lambda (`bin/migrate-cloud.sh`) |
| Admin seed | `backend/_db/seed_admin.sql`, `backend/_migrate` | Reads `ADMIN_EMAIL` / `ADMIN_PASSWORD`; never overwrites an existing user |
| Shared backend code | `backend/_common/` | Routing, JSON errors, DB, JWT, bcrypt, permissions, validation |
| Auth service | `backend/auth/` → `/api/auth` | `POST /login`, `GET /me` |
| Projects service | `backend/projects/` → `/api/projects` | CRUD with `?status=` and `?q=` filters; `team_lead_id`; progress counts |
| Deliverables service | `backend/deliverables/` → `/api/deliverables` | CRUD with `?project_id&status&blocked&overdue&due_before&q`; `/{id}/dependencies` |
| Users service | `backend/users/` → `/api/users` | `GET ?role&active&q` for pickers (admin, project managers) |
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

| Role | Projects | Deliverables and dependencies | People | Allocations | Budget | Activity (audit) |
| --- | --- | --- | --- | --- | --- | --- |
| admin | Create, edit and delete any project | Everything | Create, edit, delete | Everything | Everything, including deleting spend | Everything |
| project_manager | Create; edit projects they own (team lead, planned budget); delete them only while they have no spend | Everything in projects they own | Read | In projects they own | In projects they own: summary, spend entries, record and edit (not delete) | Projects they own |
| team_lead | Read only | In projects where they are the team lead: create, edit, change status and manage dependencies; **not** delete | Read | Read | Summary only | — |
| viewer | Read only | Read only | Read | Read | Summary only | — |

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

### Deleting

Deleting a project also deletes its deliverables, dependencies, allocations
and spend entries; the confirmation lists them first. Once a project has
spend entries only an admin can delete it. To retire a project, set its
status to *completed* or *cancelled*; use delete only to remove mistakes.

## Trade-offs and known gaps

- **Access tokens only (30 minutes), no refresh token yet** (planned in
  Increment D). When a token expires, the next request returns 401 and the UI
  asks the user to sign in again.
- **Token in `sessionStorage`.** It is cleared when the tab closes and readable
  by scripts on the page, so XSS protection matters (React escapes output by
  default).
- **Two migration runners.** `bin/migrate.sh` (psql, local) and the
  `backend/_migrate` Lambda (AWS) apply the same files with the same
  bookkeeping. The Lambda exists only because Aurora is not reachable from
  outside the VPC.
- **No user management screen yet** (Increment D).
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
