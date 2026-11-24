# Fixes after the v1.1 audit

Progress on the top five fixes in `docs/AUDIT.md`. The audit itself stays
as the snapshot it was; this file tracks what changed since.

| # | Fix | Status |
| --- | --- | --- |
| 1 | React error boundary and recovery from failed chunk loads | Done (below) |
| 2 | Flaky dark-mode accessibility test | Done (below): root cause was a light flash on load |
| 3 | Always send `details` in error responses | Done (below) |
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

## 2. Flaky dark-mode accessibility test
- **Symptom:** in the audit's full E2E run, `09-accessibility › dark mode ›
  login page` failed with contrast 1.07:1 (`#070707` on `#121212`) on the
  Email and Password labels, then passed on 3 reruns.
- **Root cause (an app bug, not just the test):** with `colorSchemes` and
  no CSS variables, MUI's ThemeProvider first renders the default (light)
  scheme and switches to the stored mode in an effect, to suit server
  rendering (`@mui/system/cssVars/useCurrentColorScheme.js`: `isClient` is
  false until the effect runs). So every load in dark mode painted light
  first, and the input labels' 200 ms colour transition was sometimes still
  running when axe checked. Users saw the same light flash.
- **Fix:** `noSsr` (this app only renders in the browser), set once in
  `themeProviderProps` in `frontend/src/theme.js` and used by `main.jsx` and
  the tests. The stored mode now applies from the first render.
- **Test:**
  - New `ColorModeToggle.test.jsx` case: with dark stored, no render may see
    the light palette. It fails without `noSsr` (checked) and passes with it.
  - The accessibility spec now also waits for the page background to match
    the mode before running axe.
- **Verified:** `09-accessibility.cy.js` passed 5 runs out of 5 (4/4 tests
  each); `12-departments-and-theme.cy.js` passed; ESLint clean.
- Not yet deployed: the cloud gets it with the next `bin/deploy-frontend.sh`.

## 3. `details` in every error response
- `error_response` in `backend/_common/http.py` (the one place every service
  builds errors, including 404, 405 and the 500 handler) now always sends
  `details`: per-field messages for validation errors, `{}` otherwise. That
  matches the shape in CLAUDE.md; before, `details` was left out unless
  there were field errors.
- No client change needed: `frontend/src/services/api.js` already treated a
  missing `details` as `{}`.
- Test: `test_every_error_has_code_message_and_details`
  (`backend/tests/test_projects_api.py`) checks 400, 401, 403, 404, 405, 409
  and 500 all have exactly `code`, `message`, `details`. It fails without
  the fix (checked).
- Verified:
  - Backend suite 194 passed, coverage 95.46%; flake8, pylint 10.00 and
    bandit clean on `http.py`.
  - Locally (after `bin/sync-common.sh`), the audit's contract checks
    (`/tmp/audit/api_checks.sh`) now pass 27/27, up from 20/27.
- Not yet deployed: the cloud gets it with the next `bin/deploy-backend.sh`.
