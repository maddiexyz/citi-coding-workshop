# ACME Project Tracking – Increment 1

Sign in, then list, filter, create, edit and delete projects, with
role-based permissions enforced by the backend.

## Run locally

```sh
export ADMIN_EMAIL=admin@acme.test        # first admin user (seeded once)
export ADMIN_PASSWORD='choose-a-password'
./bin/start-dev.sh                        # http://localhost:3000
```

`start-dev.sh` applies database migrations (`bin/migrate.sh`), seeds the admin,
copies shared backend code into each service (`bin/sync-common.sh`), installs
Python dependencies, deploys the Lambdas to LocalStack and starts the proxy and
the React dev server.

## Test

```sh
# Backend: real handlers against a throwaway "acme_test" PostgreSQL database
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/tests/requirements-dev.txt
backend/.venv/bin/pytest backend/tests

# Frontend
cd frontend && npm test
```

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Schema | `backend/_db/migrations/*.sql` | Applied once each by `bin/migrate.sh`, tracked in `schema_migrations` |
| Admin seed | `backend/_db/seed_admin.sql` | Reads `ADMIN_EMAIL` / `ADMIN_PASSWORD`; never overwrites an existing user |
| Shared backend code | `backend/_common/` | Routing, JSON errors, DB, JWT, bcrypt, permissions, validation |
| Auth service | `backend/auth/` → `/api/auth` | `POST /login`, `GET /me` |
| Projects service | `backend/projects/` → `/api/projects` | CRUD with `?status=` and `?q=` filters |
| Frontend | `frontend/src/` | `services/` API calls, `auth/` session and rules, `pages/`, `components/` |

Each folder directly under `backend/` with a `requirements.txt` becomes its own
Lambda at `/api/<folder>`. A Lambda only contains its own folder, so
`backend/_common` is copied into each service as `common/` (gitignored; edit
`_common`, not the copies).

### Roles

| Role | Projects |
| --- | --- |
| admin | Create, edit and delete any project |
| project_manager | Create; edit and delete only projects they own |
| team_lead | Read only (for now) |
| viewer | Read only |

Rules live in `backend/_common/permissions.py`. The UI mirrors them in
`frontend/src/auth/permissions.js` only to hide buttons; every request is
checked by the backend (401 without a valid token, 403 when not allowed).

### API errors

Every error has the same shape:

```json
{ "error": { "code": "validation_error", "message": "Some fields are invalid",
             "details": { "end_date": "End date must be on or after the start date" } } }
```

## Trade-offs and known gaps

- **Access tokens only (30 minutes), no refresh token.** When a token expires,
  the next request returns 401 and the UI asks the user to sign in again. A role
  change or deactivation takes effect when the token expires.
- **Token in `sessionStorage`.** It is cleared when the tab closes and readable
  by scripts on the page, so XSS protection matters (React escapes output by
  default).
- **Migrations run from your machine with `psql`.** In the cloud, Aurora is
  inside the VPC, so running migrations there is still to do.
- **No user management yet.** Create other users with SQL, e.g.
  `INSERT INTO users (email, password_hash, full_name, role) VALUES ('pm@acme.test', crypt('…', gen_salt('bf', 12)), 'Pat PM', 'project_manager');`
- **Compiled dependencies** (`bcrypt`, `psycopg[binary]`) are installed for the
  Lambda's Python 3.13 by `start-dev.sh`. Cloud packaging by Terraform builds
  with your local Python, so build cloud packages with Python 3.13.
