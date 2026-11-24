# ACME Project Tracker

A project-tracking platform for ACME Inc.: projects, deliverables and their
dependencies, people and their allocations, budgets, and a dashboard that
explains which projects are at risk, with role-based access control.

Built for the coding workshop (Full Stack track). The brief is in
[docs/problem-statement.md](./docs/problem-statement.md); the workshop's own
guides are in [docs/README.md](./docs/README.md) and the rubric is
[docs/full-stack.md](./docs/full-stack.md).

## What it answers

| Business question | Where |
| --- | --- |
| What is the current status of each active project? | Projects list (status, progress, burn; filter by department or *Mine*); Dashboard (refreshes every 30 s) |
| Which projects are at risk of missing their deadlines? | Dashboard → *Projects needing attention*, with the reasons (filter by department); My work → *My projects* |
| How are resources allocated across projects? | Project → *Allocations*; People → *Group by department*; a person's next 8 weeks; My work → *My allocations* |
| What are the key deliverables and their completion status? | Project → *Deliverables* (status, due date, blocked, overdue) and progress bar; My work → *My deliverables* |
| Which team members are over-allocated across multiple projects? | People (*over-allocated this week* filter, per-department counts); Dashboard; warning when saving an allocation |
| What is the dependency chain between deliverables? | Project → Deliverables → *Chain* (the whole chain, blocked and overdue highlighted); cycles are rejected |
| How much budget has been consumed versus planned? | Project → *Budget* in ₹ (planned, spent, remaining, burn %, by category); burn in the projects list |
| When will each project really finish? (the brief's "difficulty in forecasting project completion dates") | Project → *Overview* → *Completion forecast* and → *Timeline*; *Forecast end* in the projects list; a late forecast is an at-risk reason on the Dashboard. See [Completion forecast](#completion-forecast) |

## Completion forecast

The [brief](./docs/problem-statement.md) says the fragmentation "leads to
missed deadlines, resource conflicts, and difficulty in forecasting project
completion dates". v2.0 answers that last part.

- **Inputs, per deliverable**: an *estimate* (working days of duration), an
  optional *earliest start*, and a *progress %*. Editors set all three; the
  deliverable's assignee can update its status and progress.
- **Forecast**: the critical path method over the project's dependency chains,
  on a Monday–Friday calendar, starting from today (the database's date). A
  deliverable needs `estimate × (1 − progress)` more working days and starts
  once everything it depends on is forecast to finish. The project's forecast
  end is the latest finish, shown next to the planned end with the slip in days.
- **Critical path**: the chain of deliverables that sets the forecast end; a
  day lost on any of them moves the end by a day. It is listed on the
  Overview, marked *Critical* in the deliverables list and chain view, and
  drawn solid on the Timeline. Everything else shows its *float* (how far it
  can slip without moving the end).
- **Confidence**: the share of remaining deliverables that have an estimate:
  high from 80%, medium from 50%, otherwise low. Deliverables without one are
  assumed to take the project's median estimate. With no estimates at all
  there is no forecast.
- **At risk**: a forecast past the end date adds the reason *Forecast to
  finish N days after its end date* to the project's risk reasons (Dashboard,
  My work), at high or medium confidence only.
- **SPI** (schedule performance index) = work done ÷ work planned by today,
  weighted by estimate. 1.00 is on plan, 0.80 is about 20% behind. The plan
  for each deliverable is its estimate, ending on its due date.
- **Timeline** tab: a Gantt chart of the remaining deliverables (forecast
  bars, due dates, today, planned end, critical path), also as a table; a list
  on mobile.

The calculation is a pure function (`backend/_common/schedule.py`, no database
access) with hand-computed unit tests; nothing derived is stored. API:
`GET /api/projects/{id}/forecast`; the projects list carries `forecast_end`,
`forecast_status`, `forecast_slip_days` and `forecast_confidence`.

Limitations:
- **Duration-based, no resource levelling.** Deliverables that do not depend
  on each other are assumed to run in parallel, however many share an
  assignee. Over-allocation is still flagged separately.
- **No holiday calendar.** Every Monday to Friday is a working day.
- **Estimate-based, not velocity-based.** The forecast trusts the estimates
  and the reported progress; it does not learn from how long past
  deliverables really took.
- SPI assumes each deliverable is planned as late as its due date allows, so
  work started early reads as ahead of plan.
- The local SQL demo (`bin/seed-demo.sh`, DEMO-* projects) has no estimates;
  the API seeder below does.

## Architecture

```mermaid
graph LR
    Browser["Browser<br/>React + MUI"] --> CF["CloudFront<br/>(local: Vite :3000 / proxy :3001)"]
    CF -->|/| S3["S3 website bucket"]
    CF -->|/api/{service}| L["Lambda per service<br/>auth · projects · deliverables · resources<br/>allocations · budget · audit · users · dashboard"]
    L --> DB[("Aurora PostgreSQL<br/>(local: PostgreSQL :5432)")]
    M["Private migrate Lambda<br/>(no URL)"] --> DB
```

- **Backend:** Python 3.13 Lambdas. Each folder under `backend/` with a
  `requirements.txt` is a service at `/api/<folder>`; shared code lives in
  `backend/_common` (routing and JSON errors, DB, JWT and sessions,
  permissions, validation, audit, risk). Folders starting with `_` are not
  services.
- **Database:** PostgreSQL. Migrations in `backend/_db/migrations`, applied by
  `bin/migrate.sh` locally and by the private `_migrate` Lambda in AWS.
  Derived values (blocked, overdue, progress, over-allocation, burn, at-risk)
  are computed by views and queries, never stored.
- **Frontend:** React 19, Material UI, react-responsive, react-router; every
  page is loaded on demand.
- **Infrastructure:** Terraform (`infra/`), deployed with `bin/deploy-*.sh`.

Details, data model and trade-offs: [docs/acme-project-tracking.md](./docs/acme-project-tracking.md).

## Run it locally

Prerequisites: the workshop VDI set up as in [docs/validation.md](./docs/validation.md)
(`~/.bashrc` exports `AWS_REGION`, `EVENT_ID`, `PARTICIPANT_ID`,
`PARTICIPANT_CODE` and the LocalStack token), Docker, Node 22, Python 3.13 and `psql`.

```sh
source ~/.bashrc
export ADMIN_EMAIL=admin@acme.test                     # first admin, created once
read -rsp "Admin password: " ADMIN_PASSWORD && echo && export ADMIN_PASSWORD
./bin/start-dev.sh                                     # keeps running; open http://localhost:3000
```

`start-dev.sh` starts PostgreSQL and LocalStack, applies the migrations, seeds
the admin, deploys every Lambda to LocalStack and starts the API proxy (:3001)
and the React dev server (:3000). It does not exit; stop it with Ctrl+C.
Sign in as the admin and create other users on the *Users* page.

## Demo walkthrough

Fill the **local** database with a small company (it refuses to run against
anything but a local PostgreSQL):

```sh
read -rsp "Demo password: " DEMO_PASSWORD && echo && export DEMO_PASSWORD   # or leave unset: one is generated and printed once
./bin/seed-demo.sh                # safe to repeat; ./bin/seed-demo.sh --reset starts the demo over
```

Accounts (all `@demo.acme.test`, password from `DEMO_PASSWORD`): `asha.pm` and
`vikram.pm` (project managers), `meera.lead` (team lead), `rahul.viewer`
(viewer); the admin is the one from `ADMIN_EMAIL`. Dates are relative to
today, so the demo always shows the same situations.

| Question | Sign in as | Go to | You'll see |
| --- | --- | --- | --- |
| Status of each active project | any | Projects | Three DEMO projects with status, progress and budget burn |
| Which projects are at risk | admin (Dashboard) or `asha.pm` (My work) | Dashboard → *Projects needing attention* | DEMO-PAY late (high), DEMO-DATA schedule slip and a blocked deliverable due soon, DEMO-OPS with an over-allocated person |
| How resources are allocated | any | People → *Group by department*; a person's page | Allocated hours against capacity per department and per week |
| Key deliverables and completion | `meera.lead` | My work, then DEMO-DATA → Deliverables | Deliverables assigned to Meera (overdue, blocked, due soon); progress per project |
| Who is over-allocated | any | People → *Over-allocated this week* | Arjun Das: 50 h booked against 40 h (DEMO-DATA + DEMO-OPS) |
| Dependency chain | any | DEMO-DATA → Deliverables → *Chain* | Ingest pipeline → Data model → Executive dashboards, with the blocked ones highlighted |
| Budget consumed vs planned | `asha.pm` | DEMO-OPS → Budget | ₹6,25,000 spent of ₹5,00,000 planned: over budget, with spend by category |

## Demo data (any deployment, through the API)

`tests/seed/run.sh` fills a running deployment (the cloud site or the local
proxy) with a realistic ACME India dataset, using only the public API: no AWS
credentials, no database access.

```sh
tests/seed/run.sh https://<your-site>.cloudfront.net --dry-run   # the plan and counts; sends nothing
tests/seed/run.sh https://<your-site>.cloudfront.net             # asks for an admin email and password
tests/seed/run.sh https://<your-site>.cloudfront.net --reset     # removes only the seeded data
```

The admin password is read with a hidden prompt and kept in memory only
(the email is taken from `SEED_ADMIN_EMAIL`, else the `ADMIN_EMAIL` you export for
the deploy, and printed so you can check it; otherwise it is asked for). A failed sign-in is never
retried: the run stops and says why, so it can't trip the rate limit.

**What gets created** (the same on every run: fixed random seed, dates relative to today):

| Entity | Count | Notes |
| --- | --- | --- |
| Departments | 7 | Engineering, Finance, Operations, Sales, Human Resources, Data & Analytics, Customer Support |
| People | 36 | Indian names, job titles, mostly 40 h a week, a few part-time; one goes on leave (inactive) |
| Accounts | 7 | 3 project managers, 2 team leads, 2 viewers (`firstname.lastname@acme.example`), linked to their people |
| Projects | 13 | `ACME-*`, owned by the seeded PMs, budgets in ₹ (two without), one completed, one cancelled, one planned |
| Deliverables | 154 | With assignees and 62 dependencies (no cycles) |
| Allocations | 27 | Three people over capacity this week |
| Spend entries | 50 | Across labour, software, hardware, travel and other |

Every step runs as the user who would really do it: the admin creates
departments, accounts and people; each PM signs in and creates their own
projects (the owner comes from the token), deliverables, dependencies,
allocations and spend; assignees and team leads then move their deliverables
on, so the activity log shows who did what; finally the admin deactivates a
person. Sessions are reused and refreshed with the refresh cookie.

Afterwards the dashboard shows these seeded projects (on top of anything
already there): **6 at risk**: ACME-PAY late, ACME-DWH schedule slip and
overdue work, ACME-APP a blocked deliverable due in 3 days, ACME-WMS and
ACME-SUP an over-allocated person, and ACME-TRN a late forecast. It also shows **2 over budget** (ACME-HRP,
and the completed ACME-ANL) and **3 over-allocated people** (Aditya Rao, Suresh
Babu, Farhan Qureshi). CRM and LOG are on track; SEC and LOG have no
budget. The run ends by checking those numbers against the live dashboard.

**Forecast demo path** (v2.0; every seeded deliverable has an estimate and
progress, and those not yet started an earliest start two weeks before their
due date):

| Step | Go to | You'll see |
| --- | --- | --- |
| 1 | Projects | *Forecast end* per project: ACME-TRN about 10 days late, ACME-PAY late, the others about 9–11 days early |
| 2 | ACME-TRN (Learning platform) → Overview | Forecast end after the planned end, high confidence, and the critical path *Integration → Security review → User acceptance testing*: 42 working days of work that cannot start before late January. SPI is above 1: the work so far is on plan, which is exactly why the forecast is needed |
| 3 | ACME-TRN → Timeline | The three critical bars running past the *Planned end* line; the other deliverables with float |
| 4 | ACME-TRN → Deliverables → Chain | The same three marked *Critical* |
| 5 | Dashboard | ACME-TRN under *Projects needing attention*: *Forecast to finish N days after its end date* |
| 6 | ACME-CRM (CRM migration) → Overview | On track: forecast end about 10 days before the planned end |
| 7 | Sign in as the team lead (Arjun Nair) → My work → a deliverable | The assignee can change only *Status* and *Progress %* |

**Upgrading seeded data from v1.x**: run the seeder again. It gives every
seeded deliverable that has no estimate yet its estimate, earliest start and
progress (154 writes, as the admin) and changes nothing else; a further run
writes nothing. Each filled deliverable gets an activity-log entry.

Demo accounts: one per role (Ananya Iyer, PM; Arjun Nair, team lead; Vikram
Singh, viewer) are written with their generated passwords to
`tests/seed/.demo-credentials` (mode 600, gitignored). The other accounts get
random passwords that are never shown; an admin can reset them on the Users page.

Behaviour: one request at a time with a short pause after each write
(`--delay`, default 0.2 s), backoff on 429 and 5xx. Anything that already
exists (matched on project codes, emails and names) is skipped, so a second
run writes nothing. Any unexpected 400 or 403 stops the run with the step,
the user and the response. `--reset` deletes, as the admin, the `ACME-*`
projects (with their deliverables, allocations and spend), then the seeded
people, accounts and the departments nothing else uses.

Limitations:
- The API can't backdate records, so every audit entry and "created" date carries the seeding date.
- The data is a snapshot relative to the day it was seeded: as days pass, projects drift (a deliverable due in 3 days becomes overdue, and forecasts move later as unstarted work slides). `--reset` and seed again to get the intended mix back.
- `--dry-run` prints the plan for an empty system; it does not preview what a rerun would fill.
- If a seeded account's password is unknown (seeded from another machine), the admin sets a new random one before acting as that user.
- A department with a seeded name that existed before is reused, and kept by `--reset` while other data uses it.

## Deploy to AWS

```sh
export ADMIN_EMAIL=you@acme.example
read -rsp "Admin password: " ADMIN_PASSWORD && echo && export ADMIN_PASSWORD
./bin/deploy-backend.sh      # Lambdas, CloudFront, migrations + admin seed
./bin/deploy-frontend.sh     # React build → S3 (stale files removed) → CloudFront
```

Both scripts are safe to repeat: a second `deploy-backend.sh` reports *No
changes*, no migrations and an existing admin. Never run
`bin/cleanup-environment.sh` on the shared workshop stack.

## Test

| What | Command | Result |
| --- | --- | --- |
| Backend unit + integration (real PostgreSQL), coverage gate 80% | `backend/.venv/bin/pytest backend/tests --cov --cov-config=backend/.coveragerc` | 233 passed, **96%** |
| Frontend components, pages and API clients, coverage gate 80% | `cd frontend && npm run coverage` | 272 passed, **93%** lines, 91% statements, 87% branches, 86% functions |
| End-to-end (Cypress, production build, local stack) incl. axe WCAG 2 A/AA | `cd frontend && npm run e2e` | 13 specs, 28 tests passed (v2.0 adds the forecast spec and axe on the Timeline chart and table in light and dark) |
| API acceptance (curl, local stack) | `tests/acceptance/increment_{a,b,c,d}.sh` | 20 + 15 + 18 + 19 checks passed |
| Sign-in, refresh cookie, sign-out on the deployed site | `tests/acceptance/cloud_auth_check.sh` (asks for an account) | 11 passed, 0 failed (2026-11-25) |
| Load (Artillery) | `tests/load/run.sh local` (smoke) / `cloud` (asks for an account) | local: 556 requests, all 200, p95 34 ms. Cloud (2026-11-25, peak 20 new users/s): 6,340 requests, all 200, 0 failed, p95 55 ms, p99 518 ms |
| v1.1 API acceptance | `tests/acceptance/v1_1.sh` | 26 checks passed |
| Demo data generator (deterministic, no cycles, owners, mix of states, the forecast story on every weekday) | `backend/.venv/bin/pytest tests/seed` | 18 passed |
| Lint and security | `cd backend && .venv/bin/flake8 . && .venv/bin/bandit -r _common _migrate */function.py`; `cd frontend && npm run lint` | clean |

One-time setup for the backend tests:
`python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/tests/requirements-dev.txt`.

Critical paths covered end to end: sign in / stay signed in / refresh / sign
out / rate limit; project CRUD and roles; deliverables and the dependency
cycle error; over-allocation warning; budget, burn and activity; dashboard
reasons; user administration; mobile layout; accessibility of every page;
the completion forecast (late project, critical path, timeline, estimates
changed in the form).

## Roles

| Role | Can |
| --- | --- |
| Admin | Everything, including users and roles, departments, people, and deleting spend |
| Project manager | Create projects; manage their own projects' team lead, department, deliverables, allocations and budget; delete their projects while they have no spend |
| Team lead | Read everything; create and edit (not delete) deliverables and dependencies in projects they lead |
| Viewer | Read everything except spend line items, change history and the user list |
| Anyone who is a deliverable's assignee | Change that deliverable's status and progress % (nothing else on it) |

Everyone can change their own password (*Account* in the user menu) and sees
their own work on *My work*, the landing page for everyone but admins.

Every request is checked by the backend (401 / 403); the UI only hides what a
role can't do. Full matrix: [docs/acme-project-tracking.md](./docs/acme-project-tracking.md#roles).

## Releases

| Tag | What it adds | Notes |
| --- | --- | --- |
| `v1.0` | Increments 1 and A–E plus the v1.1 round: projects, deliverables and dependency chains, people and allocations, budgets in ₹, audit log, at-risk dashboard, users, sessions, My work, departments, light/dark mode | [changes/phase1_1.md](./changes/phase1_1.md) and earlier `changes/phase*.md` |
| `v1.1` | The API demo-data seeder (`tests/seed`), the cloud seed, sign-in check and load test results, and a read-only audit against the rubric | [changes/seed_data.md](./changes/seed_data.md), [docs/AUDIT.md](./docs/AUDIT.md) |
| `v1.2` | The audit's five fixes, all deployed (listed below) | [changes/post_audit.md](./changes/post_audit.md) |
| `v2.0` | Completion-date forecasting: estimates and progress on deliverables, critical-path forecast with confidence and SPI, late-forecast risk reason, *Forecast end* in the projects list, Timeline tab, seeded forecast demo | [Completion forecast](#completion-forecast), [changes/phaseF.md](./changes/phaseF.md) |

What changed in `v1.2`:
- **Error boundary.** A page that fails to render or load shows *Something
  went wrong* with *Reload page* and *Go to home page*, instead of a blank
  screen, and the navigation keeps working. A tab left open across a
  redeploy reloads itself once to pick up the new version, with a 30 s guard
  so it can't loop.
- **No light flash in dark mode.** The stored colour mode is applied from
  the first render. This also fixed the flaky dark-mode accessibility test.
- **One error shape.** Every API error now has `code`, `message` and
  `details` (`{}` when there are no field errors), as documented.
- **Seeder.** The admin email can come from the `ADMIN_EMAIL` you export for
  the deploy. The password is still always typed.
- **Change notes.** `changes/phase1_1.md` gained its missing section 4 (My work).

## Decisions and known gaps

Decisions, assumptions and their reasons are in [docs/PLAN.md](./docs/PLAN.md)
and the per-increment notes in [changes/](./changes/). Known gaps:

- No offline/PWA support or AI features; "real time" is 30-second polling on the dashboard.
- One currency (INR), display only; no audit-log retention policy.
- Refresh tokens are rotated but reuse of an old one doesn't revoke the session family.
- Each concurrent Lambda holds its own database connection; at high
  concurrency an RDS Proxy would be needed (see the load test notes).
- Over-allocation counts partial weeks in full.
- The forecast is duration-based without resource levelling, has no holiday
  calendar, and is estimate-based rather than velocity-based
  (see [Completion forecast](#completion-forecast)).

## Repository map

| Path | Contents |
| --- | --- |
| `backend/` | Lambda services, `_common` shared code, `_db` migrations, `_migrate`, tests |
| `frontend/` | React app (`src/`), Cypress suite (`cypress/`) |
| `infra/` | Terraform |
| `bin/` | Dev, migration and deploy scripts |
| `tests/` | curl acceptance scripts, the Artillery load test, the API demo-data seeder |
| `docs/` | Workshop guides, project docs, plan, compliance, audit |
| `changes/` | What changed in each increment, the seeder and the audit fixes |

## License

See [LICENSE](./LICENSE). Contributing to the workshop template: [CONTRIBUTING.md](./CONTRIBUTING.md).
