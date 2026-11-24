# Demo-data seeder (feature/seed-data)

Fills any deployment (local proxy or the CloudFront site) with a realistic
ACME India dataset through the public API only. Usage, contents and
limitations: README → *Demo data (any deployment, through the API)*.

## Files
- `tests/seed/spec.py`: the data and its generator, pure functions with a
  fixed seed and dates as day offsets from today. `expected_flags()` applies
  the dashboard rules (backend/_common/risk.py) to the spec, so the intended
  states can be tested and checked against the live dashboard. Later fields
  (deliverable estimates and progress in v2) go here without touching the loader.
- `tests/seed/seed_api.py`: the loader (standard library only; `requests`
  isn't a dev dependency).
- `tests/seed/run.sh <base-url> [--reset] [--dry-run]`.
- `tests/seed/test_spec.py`: 9 generator tests.
- `.gitignore`: `tests/seed/.demo-credentials`.

## Verified locally (http://localhost:3001)
Signed in as a temporary local admin (`accept-seeder@acme.test`, created and
removed in the local database for the check), never the owner's account.

| Run | Result |
| --- | --- |
| `--dry-run` | Plan printed: 7 departments, 7 accounts, 36 people, 13 projects, 154 deliverables, 62 dependencies, 27 allocations, 50 spend entries; nothing sent |
| first run | Everything created (4 departments new, 3 reused from the local demo), 79 status updates by assignees and team leads, 2 projects closed, 1 person deactivated; 435 writes in about 105 s at the default 0.2 s pace |
| dashboard check | at-risk 5/5, over-budget 2/2, over-allocated 3/3 (seeded data against the spec's prediction) |
| second run | 0 created, every entity reported as already there, no writes |
| API checks | Ananya Iyer `projects?owner=me` → ACME-APP, CRM, KYC, SUP; Arjun Nair `team_lead=me` → APP, PAY, SEC, WMS; viewer POST /projects → 403; activity log entries by 8 different people (3 PMs, 2 team leads, 2 viewers, the admin) |
| `--reset` | 13 projects, 36 people, 7 accounts and 4 departments removed. Engineering, Finance and Operations kept (the `DEMO-*` data uses them). The database matches the snapshot taken before seeding: existing admin, `DEMO-*`, other projects and counts unchanged |

Lint: flake8 and pylint 10.00 on `tests/seed`; bandit clean on the seeder
(the test file is not scanned, like `backend/tests`).

## Decisions made on your behalf
| Decision | Why |
| --- | --- |
| Emails `firstname.lastname@acme.example` | `.example` is reserved: no real mailbox can receive anything |
| Departments matched on name ignoring case and reused if present; `--reset` only removes those nothing else uses | Locally three of them already belong to the `bin/seed-demo.sh` data |
| Deliverables created as *not started*, then moved on by the assignee (or the project's team lead, else its PM) | So the activity log shows realistic actors, as the brief asks |
| Completed and cancelled projects are closed by their PM after the deliverables are done | Closing first would hide them from the at-risk rules mid-seed |
| A seeded account whose password isn't known (seeded elsewhere) gets a new random one from the admin before the seeder acts as it | Passwords live in memory only, and that's the only API way to sign in again |
| The run prints a dashboard check (seeded data vs the spec's prediction) | Turns "what should I see" into a ✓/✗ at the end of every run |
| Over-budget checked through the projects list, not `/dashboard/at-risk` | The at-risk list leaves out completed projects (ACME-ANL is completed and over budget) |
| Generator tests in `tests/seed`, run with the backend venv | They need no database; keeps the seeder self-contained |

## Not done here
- The cloud run was done by the owner on 2026-11-25: everything created, all three
  dashboard checks ✓. Results are in `changes/phase1_1.md` → *Cloud demo data*.
