# Fixes after the v1.1 audit

Progress on the top five fixes in `docs/AUDIT.md`. The audit itself stays
as the snapshot it was; this file tracks what changed since.

| # | Fix | Status |
| --- | --- | --- |
| 1 | React error boundary and recovery from failed chunk loads | Done (below) |
| 2 | Flaky dark-mode accessibility test | Open |
| 3 | Always send `details` in error responses | Open |
| 4 | Release hygiene: tag after v1.0, section 4 of `phase1_1.md` | Done: `v1.1` tag on `f578680`; section 4 added |
| 5 | Seeder falls back to `ADMIN_EMAIL` | Done: see `changes/seed_data.md` |

## 1. Error boundary
- `frontend/src/components/ErrorBoundary.jsx` catches errors while a page
  renders or lazy-loads, and shows an alert ("Something went wrong") with
  *Reload page* and *Go to home page* instead of a blank screen. Used twice:
  - **Per page** (`Page` in `App.jsx`): inside the app frame, so the
    navigation keeps working; keyed on the path, so going to another page
    clears the error.
  - **At the root** (`main.jsx`, `fullPage`): for errors in the frame, the
    sign-in page or the providers.
- **Failed chunk loads** (`frontend/src/utils/chunkError.js`) are
  recognised by name or message (Chrome, Firefox, Safari, webpack wording).
  - The page reloads once by itself, to pick up the new build after a
    redeploy (`deploy-frontend.sh` deletes the old chunks, so a tab left
    open breaks on its next navigation).
  - A timestamp in `sessionStorage` allows at most one automatic reload per
    30 s, so a chunk that is really missing shows "A new version of ACME
    Projects is available" instead of looping. Without storage it never
    reloads by itself.
- Unexpected errors are logged with the component stack (`console.error`).
- Tests: `ErrorBoundary.test.jsx` (10). It covers the children, the
  fallback and reload button, the automatic reload happening only once,
  recovery on a new path, the recognised messages and the guard. ESLint is
  clean and the production build succeeds.
- Not yet deployed: the cloud gets it with the next `bin/deploy-frontend.sh`.
