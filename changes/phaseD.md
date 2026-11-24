# Increment D – At-risk dashboard, user management and auth hardening

Branch `feature/increment-d`. Plan: [docs/PLAN.md](../docs/PLAN.md).

## What changed
- **Dashboard:** `dashboard` service (`/summary`, `/at-risk`) and the new home
  page: summary cards, projects needing attention with their risk reasons
  and a separate over-budget flag, over-allocated people this week.
  Risk signals live in `_common/risk.py` and are computed at query time.
- **User management:** `users` service gains admin create, edit (role,
  active), password reset and delete, with no self-lockout, 409 for users who
  own projects, session revocation on role change/deactivation/reset, and
  audit entries without password data. Users page for admins. The `users`
  Lambda gets 1024 MB for bcrypt.
- **Auth hardening (migration 007):** 15-minute access tokens; rotated
  refresh tokens in an HttpOnly, Secure, SameSite=Strict cookie on
  `/api/auth` (`/refresh`, `/logout`); sign-in rate limit (5 per email, 20 per
  IP, 15 minutes, 429 + Retry-After). The frontend refreshes once on an
  expired token and retries, restores sessions from the cookie, and signs
  out on the server.
- **Local proxy:** forwards cookies and allows credentials for the calling
  origin.
- **Tests:** backend 162 (including `test_packaging.py`, which checks every
  service's requirements cover what it imports), frontend 100;
  `tests/acceptance/increment_d.sh` (19 checks), `tests/acceptance/cloud_auth_check.sh`
  (asks for credentials, stores nothing).

## Found and fixed while verifying
- The deployed `users` Lambda returned 502: its requirements lacked `bcrypt`
  (tests passed because the test environment has every package). Fixed, and
  `test_packaging.py` now guards every service.
- LocalStack ignores the Function URL `cookies` field, so no refresh cookie
  reached the browser locally. A single cookie is now sent as a `Set-Cookie`
  header, which AWS and LocalStack both forward.
- In the cloud the rate limiter sees the viewer's real IP (checked against
  this machine's public IP), so `CloudFront-Viewer-Address` is forwarded.

## Decisions
- At-risk signals: late (high), overdue deliverable, schedule slip
  (`AT_RISK_SLIP_POINTS`, default 20), blocked due within 7 days,
  over-allocated person this week. Over budget is a separate flag. Only
  active projects and planned ones that have started are evaluated.
- Refresh tokens: HttpOnly cookie, rotated on every use, hashed at rest,
  12-hour lifetime; `/refresh` re-reads active status and role.
- Viewer IP for rate limiting from `CloudFront-Viewer-Address`, never from
  `X-Forwarded-For`.

## Known gaps
- No refresh-token reuse detection (stretch goal).
