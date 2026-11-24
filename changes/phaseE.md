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
- Fresh clone following only the README: pending (needs the running local
  stack stopped, since it uses the same ports).

## Found along the way
- A first local load run at the cloud profile made LocalStack start one
  Lambda container per concurrent request until PostgreSQL's 100-connection
  limit was reached. In AWS the same holds per Lambda instance, so very high
  concurrency would need an RDS Proxy; the local profile is now a light smoke test.

## Pending (needs the owner)
- `tests/load/run.sh cloud` and `tests/acceptance/cloud_auth_check.sh`
  (both ask for an account's credentials).
- The fresh-clone check above.
