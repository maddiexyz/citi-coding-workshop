# ACME Project Tracker

A project-tracking platform for ACME Inc.: projects, deliverables and their
dependencies, people and their allocations, budgets, and a dashboard that
explains which projects are at risk, with role-based access control.

Built for the coding workshop (Full Stack track). The workshop's own guides
are in [docs/README.md](./docs/README.md); the rubric is
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
(`SEED_ADMIN_EMAIL` skips the email question). A failed sign-in is never
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
already there): **5 at risk**: ACME-PAY late, ACME-DWH schedule slip and
overdue work, ACME-APP a blocked deliverable due in 3 days, ACME-WMS and
ACME-SUP an over-allocated person. It also shows **2 over budget** (ACME-HRP,
and the completed ACME-ANL) and **3 over-allocated people** (Aditya Rao, Suresh
Babu, Farhan Qureshi). CRM, LOG and TRN are on track; SEC and LOG have no
budget. The run ends by checking those numbers against the live dashboard.

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
- The data is a snapshot relative to the day it was seeded: as days pass, projects drift (a deliverable due in 3 days becomes overdue). `--reset` and seed again to get the intended mix back.
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
| Backend unit + integration (real PostgreSQL), coverage gate 80% | `backend/.venv/bin/pytest backend/tests --cov --cov-config=backend/.coveragerc` | 193 passed, **95%** |
| Frontend components, pages and API clients, coverage gate 80% | `cd frontend && npm run coverage` | 239 passed, **93%** lines, 91% statements, 86% branches, 85% functions |
| End-to-end (Cypress, production build, local stack) incl. axe WCAG 2 A/AA | `cd frontend && npm run e2e` | 12 specs, 27 tests passed |
| API acceptance (curl, local stack) | `tests/acceptance/increment_{a,b,c,d}.sh` | 20 + 15 + 18 + 19 checks passed |
| Sign-in, refresh cookie, sign-out on the deployed site | `tests/acceptance/cloud_auth_check.sh` | asks for an account |
| Load (Artillery) | `tests/load/run.sh local` (smoke) / `cloud` (asks for an account) | local: 548 requests, all 200, p95 36 ms |
| v1.1 API acceptance | `tests/acceptance/v1_1.sh` | 26 checks passed |
| Demo data generator (deterministic, no cycles, owners, mix of states) | `backend/.venv/bin/pytest tests/seed` | 9 passed |
| Lint and security | `cd backend && .venv/bin/flake8 . && .venv/bin/bandit -r _common _migrate */function.py`; `cd frontend && npm run lint` | clean |

One-time setup for the backend tests:
`python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/tests/requirements-dev.txt`.

Critical paths covered end to end: sign in / stay signed in / refresh / sign
out / rate limit; project CRUD and roles; deliverables and the dependency
cycle error; over-allocation warning; budget, burn and activity; dashboard
reasons; user administration; mobile layout; accessibility of every page.

## Roles

| Role | Can |
| --- | --- |
| Admin | Everything, including users and roles, departments, people, and deleting spend |
| Project manager | Create projects; manage their own projects' team lead, department, deliverables, allocations and budget; delete their projects while they have no spend |
| Team lead | Read everything; create and edit (not delete) deliverables and dependencies in projects they lead |
| Viewer | Read everything except spend line items, change history and the user list |
| Anyone who is a deliverable's assignee | Change that deliverable's status (nothing else on it) |

Everyone can change their own password (*Account* in the user menu) and sees
their own work on *My work*, the landing page for everyone but admins.

Every request is checked by the backend (401 / 403); the UI only hides what a
role can't do. Full matrix: [docs/acme-project-tracking.md](./docs/acme-project-tracking.md#roles).

## Decisions and known gaps

Decisions, assumptions and their reasons are in [docs/PLAN.md](./docs/PLAN.md)
and the per-increment notes in [changes/](./changes/). Known gaps:

- No offline/PWA support or AI features; "real time" is 30-second polling on the dashboard.
- One currency (INR), display only; no audit-log retention policy.
- Refresh tokens are rotated but reuse of an old one doesn't revoke the session family.
- Each concurrent Lambda holds its own database connection; at high
  concurrency an RDS Proxy would be needed (see the load test notes).
- Over-allocation counts partial weeks in full.

## Repository map

| Path | Contents |
| --- | --- |
| `backend/` | Lambda services, `_common` shared code, `_db` migrations, `_migrate`, tests |
| `frontend/` | React app (`src/`), Cypress suite (`cypress/`) |
| `infra/` | Terraform |
| `bin/` | Dev, migration and deploy scripts |
| `tests/` | curl acceptance scripts, the Artillery load test, the API demo-data seeder |
| `docs/` | Workshop guides, project docs, plan, compliance |
| `changes/` | What changed in each increment |

## License

See [LICENSE](./LICENSE). Contributing to the workshop template: [CONTRIBUTING.md](./CONTRIBUTING.md).
