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
| What should I tell the sponsor, and what do we do next? | Project → *Overview* → *AI briefing*: a short status report written by Gemini from the project's own data, every point showing its source. See [AI project briefing](#ai-project-briefing) |

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

## AI project briefing

v2.1. On a project's Overview, admins, project managers and team leads can
press **Generate AI briefing**. Google Gemini (`gemini-3.5-flash`) writes a short status report
for a sponsor: a headline, why the project is where it is, and up to three
next steps. Every point carries chips for the facts it rests on (*Forecast*,
*Critical path*, *Budget*, a deliverable…); hovering or focusing a chip shows
the exact data. *Copy* puts it on the clipboard as plain text.

- **Grounded.** The model sees only facts the app already computes: the
  forecast, critical path, SPI, budget, risk reasons and the open
  deliverables, each with an id. It must cite those ids, and the backend
  drops any point that cites none of them. The overall status chip (on track,
  at risk, late, complete) comes from the app's own rules, never from the model.
- **No personal data.** Person names and emails are not sent; a deliverable
  is only "assigned" or "unassigned". Deliverable titles are user text, so the
  prompt tells the model to treat the facts as data, not instructions, and the
  reply is held to a JSON schema. What is sent: the project's code, name and
  dates, the forecast, SPI, budget figures, risk messages, and the titles,
  status, progress, estimates and dates of open deliverables.
- **Free-tier data note.** On Gemini's free tier, Google may use what is sent
  and returned to improve its products, and human reviewers may read it; on
  the paid tier it doesn't. That is one more reason no personal data is sent;
  use a paid-tier key for anything confidential.
- **Two steps, because of the network.** The Lambdas sit in a VPC with no
  route to the internet, and the database is only reachable from inside it.
  So the projects service (inside) builds the facts and signs them with an
  HMAC bound to the user and valid for two minutes:
  `POST /api/projects/{id}/briefing-facts`. The new `ai` service, the only
  Lambda outside the VPC and with no database settings, checks the signature
  and calls the Gemini API (`generateContent`, standard library only, the key
  in the `x-goog-api-key` header, never in the URL or the logs):
  `POST /api/ai/briefing`. Facts can't be edited
  in the browser or replayed by someone else.
- **Cost control.** Only made on request, never on page load; 20 briefings
  per user per hour (429 after that, counted in `ai_usage`); viewers can't ask
  for one. A briefing is a few thousand tokens on a Flash model.
  Nothing generated is stored.
- **Off by default.** It needs `TF_VAR_ai_enabled=true` and a Gemini API key
  in `~/.gemini-key` at deploy time (see [Deploy to AWS](#deploy-to-aws)). Without them the
  card says the briefing isn't available and nothing else changes.

Limitations:
- Answers vary between runs, and a model can still misread a fact; the card
  says "check before sharing" and shows the sources so a reader can.
- The `ai` Lambda can't reach the database, so it checks the access token's
  signature and expiry but can't re-read the account; the signed facts, which
  the projects service issued after its full check two minutes earlier, close
  that gap.
- Locally the model call needs internet access from LocalStack and a key;
  the Cypress spec stubs it.

## Architecture

```mermaid
graph LR
    Browser["Browser<br/>React + MUI"] --> CF["CloudFront<br/>(local: Vite :3000 / proxy :3001)"]
    CF -->|/| S3["S3 website bucket"]
    CF -->|/api/{service}| L["Lambda per service<br/>auth · projects · deliverables · resources<br/>allocations · budget · audit · users · dashboard"]
    L --> DB[("Aurora PostgreSQL<br/>(local: PostgreSQL :5432)")]
    CF -->|/api/ai| AI["ai Lambda<br/>(outside the VPC, no database)"]
    AI --> Gemini["Gemini API<br/>gemini-3.5-flash"]
    M["Private migrate Lambda<br/>(no URL)"] --> DB
```

- **Backend:** Python 3.13 Lambdas. Each folder under `backend/` with a
  `requirements.txt` is a service at `/api/<folder>`; shared code lives in
  `backend/_common` (routing and JSON errors, DB, JWT and sessions,
  permissions, validation, audit, risk). Folders starting with `_` are not
  services. All run inside the VPC except `ai`, which needs the internet for
  the model API and has no database access.
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
| 8 | As the admin, ACME-TRN → Overview → *Generate AI briefing* (v2.1, needs AI switched on) | A *Late* briefing naming the critical path and the slip, with source chips; hover *Critical path* to see the exact chain it used |

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

To switch the AI briefing on, put a Gemini API key in `~/.gemini-key` (outside
the repo, readable only by you) and enable it before `deploy-backend.sh`. The
script reads the key from that file without printing it; it ends up in the
`ai` Lambda's settings and the Terraform state, never in the repo:

```sh
read -rsp "Gemini API key: " k && echo && (umask 077; printf %s "$k" > ~/.gemini-key) && unset k
export TF_VAR_ai_enabled=true            # TF_VAR_ai_model_id=... for another Gemini model
```

Deploying again without `TF_VAR_ai_enabled=true` (or without the key file)
switches it off.

Both scripts are safe to repeat: a second `deploy-backend.sh` reports *No
changes*, no migrations and an existing admin. Never run
`bin/cleanup-environment.sh` on the shared workshop stack.

## Test

| What | Command | Result |
| --- | --- | --- |
| Backend unit + integration (real PostgreSQL), coverage gate 80% | `backend/.venv/bin/pytest backend/tests --cov --cov-config=backend/.coveragerc` | 275 passed, **96%** |
| Frontend components, pages and API clients, coverage gate 80% | `cd frontend && npm run coverage` | 288 passed, **93%** lines, 91% statements, 87% branches, 86% functions |
| End-to-end (Cypress, production build, local stack) incl. axe WCAG 2 A/AA | `cd frontend && npm run e2e` | 14 specs, 31 tests passed (v2.0 adds the forecast spec and axe on the Timeline; v2.1 the AI briefing spec, with the model call stubbed, in light and dark) |
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

## Use the API directly (curl)

The API is plain JSON, so it works without the React app: sign in once, then
send the token as a Bearer header. Ids below (`7`, `12`, `30`, `31`) are
examples. `jq` is used only to pick the token out of the response.

```sh
BASE=https://<your-cloudfront-domain>/api      # local: http://localhost:3001/api

# Sign in: the token is valid for 15 minutes; jar.txt keeps the refresh cookie
TOKEN=$(curl -s -c jar.txt -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "you@acme.example", "password": "your-password"}' | jq -r .token)
```

Read (lists come back as `{"items": [...]}`):

```sh
curl -s "$BASE/auth/me" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/projects?status=active&q=crm" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/projects/7" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/projects/7/forecast" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/deliverables?project_id=7&overdue=true" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/deliverables?assignee=me" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/dashboard/summary" -H "Authorization: Bearer $TOKEN"
curl -s "$BASE/dashboard/at-risk?severity=medium" -H "Authorization: Bearer $TOKEN"
```

Write:

```sh
# Create a project (201)
curl -s -X POST "$BASE/projects" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"code": "ACME-NEW", "name": "New project", "status": "active",
       "start_date": "2026-12-01", "end_date": "2027-03-31"}'

# Create a deliverable in it (201)
curl -s -X POST "$BASE/deliverables" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id": 7, "title": "Integration", "due_date": "2027-01-15",
       "assignee_resource_id": 12, "estimate_days": 15}'

# Make deliverable 31 depend on deliverable 30 (201)
curl -s -X POST "$BASE/deliverables/31/dependencies" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"depends_on_id": 30}'

# Update a deliverable (200)
curl -s -X PUT "$BASE/deliverables/31" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title": "Integration", "status": "in_progress", "due_date": "2027-01-15",
       "assignee_resource_id": 12, "progress_pct": 40}'

# Allocate a person to a project (201); over-capacity weeks come back as "warnings"
curl -s -X POST "$BASE/allocations" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id": 7, "resource_id": 12, "hours_per_week": 20,
       "start_date": "2026-12-01", "end_date": "2027-01-31"}'

# Record spend (201); amounts are strings so they stay exact
curl -s -X POST "$BASE/budget" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"project_id": 7, "category": "software", "amount": "125000.00",
       "spent_on": "2026-11-20", "description": "Licences"}'

# Delete (204, empty body)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/deliverables/31" \
  -H "Authorization: Bearer $TOKEN"
```

PUT replaces the record, so send every field, not only the one that changes.
The exception is `estimate_days`, `earliest_start` and `progress_pct` on a
deliverable, which keep their stored value when left out.

Stay signed in, and sign out:

```sh
# A new token and a new refresh cookie; the old cookie stops working
TOKEN=$(curl -s -b jar.txt -c jar.txt -X POST "$BASE/auth/refresh" | jq -r .token)
curl -s -b jar.txt -c jar.txt -X POST "$BASE/auth/logout"
```

Errors share one shape; add `-i` to see the status line:

```json
{"error": {"code": "validation_error", "message": "Some fields are invalid",
           "details": {"title": "This field is required"}}}
```

| Status | Meaning |
| --- | --- |
| 400 | Validation failed; `details` names the fields |
| 401 | Missing, invalid or expired token |
| 403 | Signed in, but the role may not do this |
| 404 | No such record |
| 405 | Method not supported on this route |
| 409 | Duplicate, overlap or still in use |
| 429 | Too many failed sign-ins; see `Retry-After` |

The role rules above apply here too, and every write is recorded in the
activity log under the account that signed in. Every route of every service
is listed at the top of its `backend/<service>/function.py`.

## Releases

| Tag | What it adds | Notes |
| --- | --- | --- |
| `v1.0` | Increments 1 and A–E plus the v1.1 round: projects, deliverables and dependency chains, people and allocations, budgets in ₹, audit log, at-risk dashboard, users, sessions, My work, departments, light/dark mode | [changes/phase1_1.md](./changes/phase1_1.md) and earlier `changes/phase*.md` |
| `v1.1` | The API demo-data seeder (`tests/seed`), the cloud seed, sign-in check and load test results, and a read-only audit against the rubric | [changes/seed_data.md](./changes/seed_data.md), [docs/AUDIT.md](./docs/AUDIT.md) |
| `v1.2` | The audit's five fixes, all deployed (listed below) | [changes/post_audit.md](./changes/post_audit.md) |
| `v2.0` | Completion-date forecasting: estimates and progress on deliverables, critical-path forecast with confidence and SPI, late-forecast risk reason, *Forecast end* in the projects list, Timeline tab, seeded forecast demo | [Completion forecast](#completion-forecast), [changes/phaseF.md](./changes/phaseF.md) |
| `v2.1` | AI project briefing (Gemini Flash, grounded in the app's facts, sources shown), the `ai` Lambda outside the VPC, using the API with curl | [AI project briefing](#ai-project-briefing), [changes/phaseG.md](./changes/phaseG.md) |
| `v2.2` | UI polish, visual only: refined theme (type scale, palette, cards, chips, tables; WCAG AA in light and dark), login page with tagline, dashboard summary cards with icons and written status, featured forecast and AI briefing cards. Frontend only; backend unchanged | merge of branch `ui/polish` |

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

- No offline/PWA support; "real time" is 30-second polling on the dashboard.
- The AI briefing is one feature, not an assistant: no chat or questions
  across projects, and it is off unless a key is configured (see
  [AI project briefing](#ai-project-briefing)).
- One currency (INR), display only; no audit-log retention policy.
- Refresh tokens are rotated but reuse of an old one doesn't revoke the session family.
- Each concurrent Lambda holds its own database connection; at high
  concurrency an RDS Proxy would be needed (see the load test notes).
- Over-allocation counts partial weeks in full.
- The forecast is duration-based without resource levelling, has no holiday
  calendar, and is estimate-based rather than velocity-based
  (see [Completion forecast](#completion-forecast)).
- One global role per person: a team lead can't be a plain member on another
  project, and a PM can't lead someone else's project. Next step: a
  `project_members` table (lead or member per project), with permission checks
  against the project role instead of the global role.
- No role for ordinary employees: people who only do the work get the viewer
  role. Assignees can still update their own deliverables, because that rule
  checks assignment, not role. A member role comes with per-project roles.

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
