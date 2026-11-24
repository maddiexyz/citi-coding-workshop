# Audit against docs/full-stack.md

Read-only audit of `main` at `1ab1008` (`git describe`: `v1.0-6-g1ab1008`),
2026-11-25. No tracked file was changed apart from this report. Every check ran
against the **local stack**, which was already running; the cloud deployment
was not called. Data created for checks was removed afterwards: 0 `accept-*`
users, 0 `ACC-*` projects and 0 `load-test*` users left, checked with psql.
Scratch output is in `/tmp/audit/`.

Legend: ✅ met · 🟡 partial · ❌ not met · ⚪ not verified in this audit.

## Scores

| Competency | Score | Main reason |
| --- | --- | --- |
| 1. Implementation | 8.0 | Full CRUD across 10 services verified locally. Cloud and reproducible deploy are documented but ⚪ here (cloud off-limits) |
| 2. Design | 8.0 | Responsive MUI, axe-clean in light and dark (one flaky check), clean per-service API. Error body omits `details` against the documented contract |
| 3. Code | 8.0 | Per-domain services plus `_common`, lint clean. No React error boundary; 2 duplicate-code notices |
| 4. Testing | 8.5 | 193 + 239 unit/integration tests, 95% / 93% coverage, 98 curl checks, 27 E2E, load local + cloud. One E2E test flaky; only one 500-path test |
| 5. Experience | 8.0 | Thorough README, change notes and decisions. Release hygiene gaps: no tag after v1.0, `phase1_1.md` has no section 4 |
| **Technical average** | **8.1** | |
| Curious | 8.0 | Measured before deciding (bcrypt cost from CloudWatch, risk rules mirrored in the seeder spec) |
| Observant | 8.5 | Caught a theme override, clock skew between Python and the DB, completed projects missing from `/at-risk` |
| Driven | 8.5 | v1.0 freeze, cloud seeded and load-tested, every increment documented |
| **Soft-skill average** | **8.3** | Inferred from repo artifacts and history only: reviewer judgment, not measured |
| **Overall** | **8.2: Good** | (8.1 + 8.3) / 2 |

## Top five fixes (for v2)

1. **Add a React error boundary and recover from failed chunk loads.**
   `src/App.jsx` lazy-loads routes inside `Suspense` but has no boundary
   (`grep -rlE "ErrorBoundary|componentDidCatch|errorElement" src` finds
   nothing). A render error leaves a blank page. So does a missing chunk, which
   is likely: `deploy-frontend.sh` syncs with `--delete`, so a tab left open
   over a redeploy breaks on its next navigation. Fix: a root boundary with a
   friendly message and a reload button; reload once on `ChunkLoadError`.
2. **Fix the flaky dark-mode accessibility test.** The full E2E run failed
   `09-accessibility.cy.js › dark mode › login page` with contrast 1.07:1
   (`#070707` on `#121212`) on the Email and Password labels. That colour is
   the light theme's label colour, so axe ran before the scheme switch had
   finished. The failure screenshot shows readable labels, and 3 reruns of
   the spec passed. Fix: wait for the dark palette to apply, or disable
   transitions in E2E, before running axe.
3. **Make the error body match the documented contract.** CLAUDE.md specifies
   `{"error": {"code", "message", "details"}}`, but `backend/_common/http.py:185`
   adds `details` only when it is non-empty. So 401, 403, 404, 405,
   `invalid_json` and `invalid_id` responses have no `details` key (7 checks
   below). The frontend copes (`api.js:96`: `error.details ?? {}`). Fix:
   always send `details` (`{}`), and assert the full shape in one test per
   status.
4. **Release hygiene.**
   - Tag the post-freeze state: `main` is 6 commits past `v1.0` (seeder and
     cloud results) with nothing marking it.
   - Add the missing **section 4 (My work)** to `changes/phase1_1.md`; its
     headings run 1, 2, 3, 5, … 11.
5. **Let the seeder reuse `ADMIN_EMAIL`.** `tests/seed/seed_api.py:521` reads
   only `SEED_ADMIN_EMAIL`, while the deploy docs export `ADMIN_EMAIL`.
   Falling back to `ADMIN_EMAIL` is a one-line change. Whether to also read
   `ADMIN_PASSWORD` from the environment is **the owner's call**: the seeder
   brief required a getpass prompt that never stores the password, so the
   current behaviour is deliberate.

Not fixes but rubric gaps to weigh for v2 scope: no PWA, no AI features,
real-time is polling only, and no async task handling (see the checklist).

## Commands and results

| Check | Command | Result (quoted) |
| --- | --- | --- |
| Backend unit + integration, coverage | `backend/.venv/bin/pytest backend/tests --cov --cov-config=backend/.coveragerc` | `193 passed, 1 warning in 65.26s`; `Required test coverage of 80.0% reached. Total coverage: 95.47%` |
| Frontend tests, coverage | `cd frontend && npm run coverage` | `Test Files 29 passed (29)`, `Tests 239 passed (239)`; `All files \| 90.65 \| 86.08 \| 84.78 \| 92.88` (statements, branches, functions, lines) |
| End to end (Cypress + axe) | `cd frontend && npm run e2e` | `✖ 1 of 12 failed (8%) 01:55 27 26 1`; exit 1. Failure: see fix 2 |
| Same spec, rerun ×3 | `npm run e2e -- --spec cypress/e2e/09-accessibility.cy.js` | `✔ 09-accessibility.cy.js … 4 4` on all 3 runs |
| Curl acceptance | `tests/acceptance/increment_{a,b,c,d}.sh`, `v1_1.sh` | `20 passed, 0 failed`; `15 passed`; `18 passed`; `19 passed`; `26 passed, 0 failed` |
| Seeder generator | `backend/.venv/bin/pytest tests/seed` | `9 passed in 0.03s` |
| Audit API contract checks (this audit) | `/tmp/audit/api_checks.sh` (reuses `tests/acceptance/lib.sh`) | `RESULT: 20 passed, 7 failed`. All 7 are the missing `details` key; every status code was right |
| Load, local smoke | `tests/load/run.sh local` | `http.codes.200: 556`, `http.requests: 556`, median 16.9 ms, p95 34.1 ms, p99 262.5 ms, `vusers.failed: 0` in every period |
| bandit | `bandit -r backend/_common backend/_migrate backend/*/function.py` | exit 0, no issues. Warnings only: comment text after `nosec` parsed as test ids, and `nosec encountered (B105), but no failed test` at `auth/function.py:56-59` |
| flake8 | `flake8 --max-line-length 120` (same files) | exit 0 |
| pylint | `cd backend && .venv/bin/pylint _common _migrate */function.py` (uses `backend/.pylintrc`) | `rated at 9.99/10`: `users/function.py:1:0: R0801: Similar lines in 2 files` ×2 (the same 6-line "load the project, require manage" block in budget and allocations). Each service alone: 10.00. From the repo root without the rc: 9.97 (also flags `unused-argument`, which the rc disables) |
| Seeder lint | flake8, pylint, bandit on `tests/seed` | flake8 exit 0; `rated at 10.00/10`; bandit exit 0 |
| ESLint | `cd frontend && npm run lint` | exit 0 |

Not run, because they call the cloud: `tests/acceptance/cloud_auth_check.sh`
and `tests/load/run.sh cloud`. Their earlier results (11/11; 6,340 requests,
0 failed) are recorded in `changes/phase1_1.md`, but this audit did not
re-verify them (⚪).

## Checklist against docs/full-stack.md

### Evaluation expectations
| Item | | Evidence |
| --- | --- | --- |
| Runs locally | ✅ | All suites above ran against the running local stack |
| Runs in the cloud | ⚪ | Not called (audit rule). Documented in `changes/phase1_1.md` (freeze deploy, cloud checks) |
| Complete CRUD from UI to DB | ✅ | E2E specs 02–07 pass; API round trip with psql checks: `create -> 201`, `row persisted in PostgreSQL`, `update persisted`, `delete -> 204`, `row removed from PostgreSQL` |
| Infrastructure configured | 🟡 | `infra/` reviewed, local stack works; cloud side ⚪ |
| Reproducible deploy | ⚪ | Second deploy "No changes" recorded at the freeze; not re-run |
| Responsive, accessible | ✅ | `08-mobile.cy.js` passes; axe WCAG 2 A/AA on every page in light and dark (one flaky check, fix 2) |
| Clear information architecture | ✅ | Role-based landing (My work / Dashboard), nav order, per-project tabs; judged from the E2E flows |
| Consistent design | ✅ | One MUI theme with light/dark schemes (`frontend/src/theme.js`) |
| Clean API boundaries | 🟡 | One Lambda per domain, `{"items": [...]}` lists, consistent codes; error `details` inconsistent (fix 3) |
| Modular code | ✅ | 11 services, 10 shared modules in `backend/_common`; frontend split into components, pages, services and utils |
| Error handling in both layers | 🟡 | Backend: validation, 409, rollback on failure (`test_a_failed_audit_write_rolls_back_the_change` → 500, no row). Frontend: network error handled (`api.js:84`), no error boundary (fix 1) |
| Linting conventions | ✅ | flake8, ESLint and bandit clean; pylint 9.99 (duplicate code) |
| Reuse over copy-paste | 🟡 | Strong shared layer; pylint R0801 finds one 6-line duplicate (budget/allocations) |
| Tests cover business logic and contracts | ✅ | 193 backend tests (risk rules, cycles, over-allocation, auth), 98 curl checks |
| Frontend journeys and error states | ✅ | 239 component tests; 27 E2E |
| Manual end-to-end validation | ✅ | Curl round trip with database checks (above) |
| Test artifacts documented | ✅ | README test table, `docs/COMPLIANCE.md`, `changes/*.md` |
| Documented local setup | ✅ | README → Run it locally. A fresh-clone check is recorded in `changes/phaseE.md` (not re-run) |
| Architecture, trade-offs, assumptions | ✅ | README, `docs/acme-project-tracking.md`, `docs/PLAN.md` |
| Loading / success / failure feedback | ✅ | Loading, empty and error states per page (component tests); dashboard "Updated" time |
| Ownership and communication | 🟡 | Strong change notes; release hygiene gaps (fix 4) |

### Backend capabilities
| Item | | Evidence |
| --- | --- | --- |
| Store and manage data | ✅ | PostgreSQL, migrations 001–008 |
| Authenticate and authorize | ✅ | JWT + rotated refresh cookie; `garbage token -> 401 invalid_token`; RBAC 403s |
| API endpoints | ✅ | POST/GET/GET {id}/PUT/DELETE per service |
| Business logic | ✅ | At-risk rules, dependency cycles, over-allocation, budget burn |
| Real-time | 🟡 | 30 s polling on the dashboard only; no push |
| Async tasks | ❌ | None. The only SQS queues are Lambda dead-letter queues (`infra/lambda.tf:49,70`) from the template |

### Data persistence, validation, API design
| Item | | Evidence |
| --- | --- | --- |
| Create, update, delete, retrieve persist | ✅ | psql checks in the round trip above |
| Database errors handled | ✅ | Audit failure → 500 with rollback (backend test); generic message to the client (`http.py:271`) |
| Required fields | ✅ | `missing required fields -> 400 naming them` |
| Formats and constraints | ✅ | `impossible date -> 400`, `negative budget -> 400`, `invalid filter value -> 400` |
| References exist | ✅ | `unknown reference -> 400` (`department_id`) |
| Duplicates | ✅ | `duplicate code (case-insensitive) -> 409` |
| Meaningful messages | ✅ | e.g. `"Project id must be a positive number"`, `"You can only edit projects you own"` |
| Malformed input | ✅ | `malformed JSON -> 400` (`invalid_json`) |
| Methods and status codes | ✅ | 201/200/204/400/404/405/409 all observed as specified |
| JSON responses | ✅ | `success responses are application/json` |
| Consistent error format | 🟡 | `code` and `message` always present; `details` only on validation errors (fix 3) |
| Filtering | ✅ | `filter q + status finds it`; every list has search and filters |

### Frontend capabilities
| Item | | Evidence |
| --- | --- | --- |
| Responsive | ✅ | `08-mobile.cy.js` |
| Performance | 🟡 | API p95 34 ms locally; routes lazy-loaded. No Lighthouse performance run in this audit |
| Real-time | 🟡 | Polling (above) |
| Accessibility | ✅ | axe A/AA in both schemes; flaky timing (fix 2) |
| State management and feedback | ✅ | Loading, empty and error states; disabled submit while saving (34 `disabled={…saving…}` sites) |
| PWA | ❌ | No manifest or service worker (`frontend/public/` holds only `react.svg`, `vite.svg`) |
| AI features | ❌ | None |
| Required fields marked, errors near fields | ✅ | `required` in 9 form components, 11 `helperText` error sites; covered by component tests (not individually re-verified) |

### Authentication and RBAC
| Item | | Evidence |
| --- | --- | --- |
| Secure login, hashing | ✅ | bcrypt; `wrong password -> 401 "Invalid email or password"` |
| Token on every endpoint | ✅ | `no token -> 401` |
| Expiry and refresh | ✅ | `increment_d.sh` 19/19 (refresh rotation, reuse refused); cloud ⚪ |
| Clear errors | ✅ | `unauthorized`, `invalid_token`, `token_expired`, `invalid_credentials` |
| Roles, restricted endpoints | ✅ | 4 roles; `viewer update -> 403`, `viewer delete -> 403` |
| No privilege escalation | ✅ | `PM promotes self to admin -> 403`; `admin demotes self -> rejected` (400); role read from the DB, not the token (backend test) |
| Consistent "access denied" | 🟡 | Always `403 forbidden` with a message; no `details` (fix 3) |
| UI hides disallowed actions | ✅ | Mirrored `permissions.js` with tests; viewer read-only E2E |

### Coverage goals
| Goal | | Evidence |
| --- | --- | --- |
| Backend ≥ 80% | ✅ | 95.47% |
| Frontend ≥ 80% | ✅ | 92.88% lines, 90.65% statements, 86.08% branches, 84.78% functions |
| API CRUD ≥ 90% | ✅ | Every service file 91–100%: users 91, budget 93, resources 94, departments 94, dashboard 94, allocations 96, projects 98, auth 98, audit 98, deliverables 100 |
| Error handling ≥ 90% | 🟡 | No separate measure exists. Validation, auth and RBAC errors are covered widely; the 500 path by one test |
| Critical paths 100% E2E | 🟡 | 12 specs map the critical paths in the README; one flaky (fix 2) |

## Earlier review notes, checked
| Note | Result |
| --- | --- |
| No tag after v1.0 | Confirmed: `git tag` → `v1.0` only; `git describe` → `v1.0-6-g1ab1008` |
| `phase1_1.md` has no section 4 | Confirmed: headings `## 3. "Mine" filters` then `## 5. Assignees update their own deliverables` |
| Seeder ignores `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Confirmed: `seed_api.py:521` `os.environ.get("SEED_ADMIN_EMAIL") or input(...)`; `:522` always `getpass`. The password part was required by the seeder brief (fix 5) |
| README test table matches reality | Backend 193 / 95%, frontend 239 / 93% lines and E2E 12 specs / 27 tests match. The README doesn't mention that the E2E run had one flaky failure |
