# Increment E – Hardening

Branch `feature/increment-e`. Plan: [docs/PLAN.md](../docs/PLAN.md).

## What changed
- **Coverage:** frontend 57% → 92% lines (191 tests: every API client, every
  page, dialogs, flows); backend 95% (163 tests). Gates fail below 80%:
  `vite.config.js` thresholds, `backend/.coveragerc`. Every service ≥ 92%.
- **End to end:** Cypress suite (9 specs, 19 tests) covering every critical
  path, run by `npm run e2e` against a production build and the local stack,
  with throwaway `e2e-*` users seeded and removed by Cypress tasks.
- **Accessibility:** cypress-axe on every page and tab (WCAG 2 A/AA). Fixed
  the two violations it found: warning chips at 3.1:1 contrast (warning
  colour now `#b45309`, 5.0:1, with a palette contrast test) and a progress
  bar placed directly inside a `<dl>` row.
- **Bundle:** pages load on demand and libraries are split; main bundle
  507 kB → 220 kB, no chunk over 500 kB.
- **Load test:** Artillery scenario (`tests/load/`) with a modest cloud
  profile and a local smoke profile.
- **Lint config in the repo:** `backend/.flake8`, `backend/.pylintrc`;
  ESLint knows Cypress and Node files.
- **Docs:** project README replaces the workshop template; `docs/COMPLIANCE.md`
  maps every guide requirement to evidence.

## Reproducibility
- Deploying the backend twice: both runs *No changes*, no migrations, admin
  seed skipped. The frontend deploy removes stale files (`s3 sync --delete`).
- **Fresh clone following only the README** (2026-11-25): cloned the branch
  into an empty folder (no uncommitted files, `node_modules`, `.venv` or
  `ENVIRONMENT.config`), ran the README's three commands, and the stack came
  up in about 4 minutes. From the clone: seeded admin signs in; acceptance
  scripts 72/72; backend 163 tests (after the fix below), 95%; frontend 191
  tests, 92% lines; Cypress 19/19; load smoke 548 requests, all 200, p95 36 ms.
- **Migrations from an empty database:** the clone's `bin/migrate.sh` on a
  new database applied all 7 migrations and seeded the admin; a second run
  applied nothing. (The stack itself used the existing local database rather
  than wiping it.)

## Found along the way
- **Two clocks for "today":** SQL decided overdue with `current_date` (the
  database's UTC date) while Python decided late and "this week" with the
  machine's date (IST). After midnight IST they disagreed and 3 tests failed
  in the fresh clone. `db.today()` now makes the database the only clock, in
  the app and the tests.
- A first local load run at the cloud profile made LocalStack start one
  Lambda container per concurrent request until PostgreSQL's 100-connection
  limit was reached. In AWS the same holds per Lambda instance, so very high
  concurrency would need an RDS Proxy; the local profile is now a light smoke test.

## Pending (needs the owner)
- `tests/load/run.sh cloud` and `tests/acceptance/cloud_auth_check.sh`
  (both ask for an account's credentials).
