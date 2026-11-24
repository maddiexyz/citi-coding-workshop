# ACME Project Tracker – working rules

## Guide
- Requirements and rubric: docs/full-stack.md. Plan and progress: docs/PLAN.md. Compliance map: docs/COMPLIANCE.md.
- Per-increment changes and decisions: changes/phase1.md, changes/phaseA.md … phaseE.md. Setup and trade-offs: docs/acme-project-tracking.md.

## Architecture (do not change without asking)
- Each folder under backend/ with requirements.txt is a Lambda at /api/<folder>; folders starting with `_` are not.
- Shared code lives in backend/_common (copied into each service as common/ by bin/sync-common.sh; edit _common only).
- Migrations: backend/_db/migrations/*.sql, applied by bin/migrate.sh locally and the _migrate Lambda in AWS (bin/migrate-cloud.sh, run by deploy-backend.sh).
- users and resources are separate tables. Derived values (at-risk, over-allocation, budget burn) are computed, never stored.
- Over-allocation is flagged, never blocked.

## Definition of done (every increment)
- Endpoints follow POST/GET/GET {id}/PUT {id}/DELETE {id}; status codes 201/200/204/400/404/500, 401/403 for auth, 409 for duplicates, 405 for unsupported methods. Errors use the shared shape `{"error": {"code", "message", "details"}}`.
- RBAC rules added to backend/_common/permissions.py and mirrored in frontend/src/auth/permissions.js.
- Search/filter for every new list. Responsive MUI screens with loading, empty and error states.
- Tests: backend unit + integration (real DB), validation and 401/403 cases, frontend component tests.
  - Backend: `backend/.venv/bin/pytest backend/tests`
  - Frontend: `cd frontend && npm test`
- Security scan and linters pass (scoped to our code; service folders also contain installed pip packages):
  - `bandit -r backend/_common backend/_migrate backend/*/function.py`
  - `flake8 --max-line-length 120` and `pylint --max-line-length 120` on the same files
  - `cd frontend && npm run lint`
- README updated (what changed, decisions, known gaps): docs/acme-project-tracking.md and a changes/phase<increment>.md summary.
- Works locally (bin/start-dev.sh) and redeployed to the cloud; verify with curl.
- Small commits on a feature branch. Do not push unless asked; push to the `mine` remote, never `origin` (Citi's repo).

## Cloud (shared workshop account, wiped after the event)
- Never run bin/cleanup-environment.sh: it destroys the organizer-created Aurora and CloudFront.
- Never change Aurora capacity or auto-pause (e.g. `min_capacity` in infra/rds.tf) without asking, and confirm again even after a yes.
- deploy-backend.sh / deploy-frontend.sh may be run as needed.
