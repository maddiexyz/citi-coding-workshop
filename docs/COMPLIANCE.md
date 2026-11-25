# Compliance with docs/full-stack.md

Each requirement of the [Full Stack Guide](./full-stack.md), with its status
and where the evidence is. Status: ✅ met · 🟡 partly · ❌ not done (with the
reason). Numbers are from the last run (see [README → Test](../README.md#test)).

## The brief's pain points

The [problem statement](./problem-statement.md) lists seven questions (mapped
in the [README](../README.md#what-it-answers)) and three consequences of
ACME's fragmented tracking:

| Pain point | Status | Evidence |
| --- | --- | --- |
| Missed deadlines | ✅ | At-risk dashboard with reasons (`backend/_common/risk.py`, `test_dashboard_risk.py`) |
| Resource conflicts | ✅ | Over-allocation flags per person and week (`test_resources_allocations.py`, Cypress `04-allocations`) |
| "Difficulty in forecasting project completion dates" | ✅ (v2.0) | Critical-path forecast per project with confidence and SPI: `backend/_common/schedule.py` (pure, `test_schedule.py` with hand-computed dates), `GET /api/projects/{id}/forecast` (`test_forecast_api.py`), `forecast_late` risk reason, Overview card, projects-list column and Timeline tab (`ForecastCard.test.jsx`, `TimelinePanel.test.jsx`, Cypress `13-forecast`, axe on the Timeline in `09-accessibility`) |

## Technical competencies

### 1. Implementation
| Requirement | Status | Evidence |
| --- | --- | --- |
| Runs locally and in the cloud | ✅ | `bin/start-dev.sh`; deployed at the CloudFront URL; `tests/acceptance/*.sh` locally, cloud route checks in `changes/phase*.md` |
| Complete CRUD from UI to database | ✅ | Projects, deliverables (+ dependencies), people, allocations, budget entries, users; Cypress specs 02–07 |
| Infrastructure (API, storage, database) configured correctly | ✅ | `infra/`: CloudFront routes per service with `Authorization` and cookie forwarding, client-side routes via a CloudFront function, private migrate Lambda, 1024 MB for bcrypt services |
| Reproducible deploy with verifiable output | ✅ | Second `deploy-backend.sh` reports *No changes*, no migrations, admin seed skipped; `deploy-frontend.sh` syncs with `--delete`; a fresh clone following only the README runs and passes every suite (`changes/phaseE.md`) |

### 2. Design
| Requirement | Status | Evidence |
| --- | --- | --- |
| Intuitive, responsive, accessible | ✅ | Tables on desktop, cards under 900 px (Cypress `08-mobile`); axe WCAG 2 A/AA clean on every page and tab (Cypress `09-accessibility`); palette contrast test (`src/theme.test.js`) |
| Clear information architecture, low-friction flows | ✅ | Dashboard → project → tabs (kept in the URL); dialogs for child records; confirmations list what a delete removes |
| Consistent design | ✅ | One theme (`src/theme.js`), shared chips, list/table/card patterns, loading/empty/error states on every list |
| Clean backend/frontend boundary, maintainable API contracts | ✅ | Route contracts in each service docstring; one error shape; frontend `services/` layer with contract tests (`clients.test.js`) |

### 3. Code
| Requirement | Status | Evidence |
| --- | --- | --- |
| Modular, organised by feature | ✅ | One Lambda per domain; `_common` by concern; frontend `components/<feature>/`, `pages/`, `services/` |
| Error handling, validation, edge cases in both layers | ✅ | Backend validators and 400/401/403/404/405/409/429; frontend validation mirrors it; network errors handled in `api.js` |
| Naming, formatting, linting | ✅ | `backend/.flake8`, `backend/.pylintrc`, `frontend/eslint.config.js`; all clean; bandit clean |
| Reuse over copy-paste | ✅ | `_common` (http, db, auth, sessions, permissions, validation, audit, risk); shared React components and hooks (`useDebouncedValue`, `StatusChip`, `ConfirmDialog`) |

### 4. Testing
| Requirement | Status | Evidence |
| --- | --- | --- |
| Unit and integration tests for business logic and API contracts | ✅ | 275 backend tests, the service ones against real PostgreSQL; the schedule engine is a pure function with hand-computed cases |
| Frontend behaviour for core journeys and error states | ✅ | 272 Vitest tests; 28 Cypress tests |
| Manual/automated validation end to end through persistence | ✅ | Cypress against the local stack; curl acceptance scripts |
| Test artifacts documented | ✅ | README test table; `changes/phase*.md`; this file |

### 5. Experience
| Requirement | Status | Evidence |
| --- | --- | --- |
| Set up and run locally with documented commands | ✅ | README *Run it locally* |
| README explains architecture, trade-offs, assumptions | ✅ | README; `docs/acme-project-tracking.md`; `docs/PLAN.md` |
| Smooth interactions with loading, success, failure feedback | ✅ | Spinners, snackbars, inline field errors, warnings that explain (over-allocation, rate limit) |
| Ownership, communication, pragmatic decisions | ✅ | Plan with decisions, per-increment notes, small commits |

## Testing expectations

| Expectation | Status | Evidence |
| --- | --- | --- |
| Backend unit tests | ✅ | e.g. `test_project_permissions.py`, `test_packaging.py` |
| Backend integration tests with a real database | ✅ | every service test runs against PostgreSQL |
| Backend error-handling tests | ✅ | validation, 401/403/404/409/429 cases in every test file |
| Frontend component tests (guide: Jest + RTL) | ✅ | Vitest + React Testing Library (Jest-compatible API) |
| Frontend API tests with mocked responses | ✅ | `services/api.test.js`, `services/clients.test.js` |
| End-to-end tests (Cypress or Selenium) | ✅ | `frontend/cypress/e2e/*` (31 tests) |
| Load testing (Artillery or JMeter) | ✅ | `tests/load/` scenario and runner. Local smoke: 548 requests, all 200, p95 36 ms. Cloud profile (`tests/load/run.sh cloud`, 2026-11-25, peak 20 new users per second): 6,340 requests, all 200, 0 failed virtual users, p95 55 ms, p99 518 ms (Lambda cold starts during the ramp). A local run at the cloud profile overloaded LocalStack (one container and DB connection per concurrent request), which is why the local profile is a smoke test |
| Performance monitoring | 🟡 | CloudWatch duration reports used to size the auth Lambda (4.6 s → 0.55 s per login); no dashboards or alarms |

### Coverage goals
| Goal | Target | Measured |
| --- | --- | --- |
| Backend | 80% | 96% lines+branches, 275 tests (gate in `backend/.coveragerc`) |
| Frontend | 80% | 93% lines, 91% statements, 87% branches, 86% functions, 288 tests (gate in `vite.config.js`) |
| API endpoints, all CRUD | 90% | every service 92–99% (allocations 96, audit 98, auth 97, budget 93, dashboard 93, deliverables 99, projects 98, resources 93, users 92); every API client covered by `clients.test.js` |
| Error handling | 90% | every error status has tests; remaining uncovered lines are mostly defensive branches (e.g. reconnect after a lost DB connection) |
| Critical user paths, end to end | 100% | every path listed in the README is a Cypress test |

## Implementation expectations

| Area | Status | Notes |
| --- | --- | --- |
| Backend: store data, auth, APIs, business logic | ✅ | |
| Backend: real-time capabilities | 🟡 | Polling: the dashboard refreshes every 30 s while visible (paused when the tab is hidden), with an *Updated hh:mm* label and a refresh button; no push channel |
| Backend: async tasks where sync isn't feasible | ✅ (n/a) | All operations finish within a request |
| Data persistence: create/update/delete/read accurate; DB errors handled | ✅ | Unique, exclusion, restrict and FK violations become 409; others a generic 500 with the detail logged |
| Validation: required, formats, references, messages, malformed input | ✅ | |
| API design: methods, status codes, JSON, consistent errors, filters | ✅ | Search/filter on every list |
| Frontend: responsive, performance, state and feedback, accessibility | ✅ | Pages lazy-loaded; no chunk over 500 kB; light and dark mode, both checked by axe and by palette contrast tests |
| Frontend: AI features | ✅ (v2.1) | AI project briefing: Claude Haiku 5.5 writes a sponsor status report from the app's computed facts, each point citing its sources (ungrounded points dropped); signed facts from the projects service, model call from the `ai` Lambda outside the VPC; viewers excluded, 20 per user per hour. `test_briefing.py`, `test_briefing_api.py`, `BriefingCard.test.jsx`, Cypress `14-briefing` (axe in light and dark mode) |
| Frontend: PWA | ❌ | Beyond the brief |
| Auth: JWT, hashing, token on every endpoint, expiry **and refresh**, clear errors | ✅ | 15-minute access tokens; rotated HttpOnly refresh cookie; `token_expired` vs `invalid_token`. On the deployed site, `tests/acceptance/cloud_auth_check.sh` passed 11/11 (2026-11-25): cookie flags, rotation, old-token and post-logout refusal |
| RBAC: roles, restricted endpoints, read-only roles, no escalation, consistent 403 | ✅ | Role re-read from the database on every request |
| Admin manages users and roles | ✅ | Users page and `/api/users` |
| Frontend validation: required marked, before submit, near the field, blocks submit, disabled while saving | ✅ | |
| Error handling: consistent structure, friendly messages, network errors, no inconsistent state | ✅ | Writes and their audit entries share one transaction |
