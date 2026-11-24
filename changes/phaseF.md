# Phase F (v2.0): completion-date forecasting

Branch `feature/v2`, from `main` at `v1.2`. Plan: the approved plan for this
phase (summarised below); brief: [docs/problem-statement.md](../docs/problem-statement.md).

The brief names "difficulty in forecasting project completion dates" as one
result of ACME's fragmented tracking. v1.2 answered the seven questions but
not this. v2.0 does.

## What changed

1. **Schedule fields on deliverables.** Migration
   `009_deliverable_estimates.sql` adds `estimate_days` (working days, 1–365),
   `earliest_start` and `progress_pct` (0–100, 100 for done ones) and rebuilds
   the `deliverable_details` view. The deliverable form has the three fields.
2. **Assignee progress.** The v1.1 self-update rule now covers status *and*
   progress (`can_update_deliverable_progress`, mirrored in
   `frontend/src/auth/permissions.js`); any other change is still a 403 that
   names the fields.
3. **The schedule engine** (`backend/_common/schedule.py`): the critical path
   method as a pure function, with no database access and no clock. Forward
   pass for the dates, backward pass for float, the critical path traced back
   from the last finisher, confidence, and SPI.
4. **Forecast API.** `GET /api/projects/{id}/forecast` (any signed-in role),
   served by the existing projects Lambda through `backend/_common/forecast.py`
   (two queries per call). `GET /api/projects` adds `forecast_end`,
   `forecast_status`, `forecast_slip_days` and `forecast_confidence`.
5. **Risk signal.** `forecast_late` in `risk_reasons` when the forecast ends
   after the end date, with the slip in days, at high or medium confidence.
6. **UI.** *Completion forecast* card on the project Overview (planned end,
   forecast end, slip, confidence, SPI with a plain-language explanation,
   critical path); *Critical* chips in the deliverables list and chain view;
   estimate and progress in the deliverables list; *Forecast end* with a slip
   chip in the projects table and cards; a *Timeline* tab (SVG Gantt with
   forecast bars, float, due dates, today, planned end and the critical path;
   table view; list on mobile).
7. **Demo data.** `tests/seed/spec.py` gives every deliverable an estimate and
   progress (and an earliest start when not started). ACME-TRN forecasts about
   10 days late through *Integration → Security review → User acceptance
   testing*; ACME-CRM is on track. The seeder fills the new fields on
   deliverables seeded by v1.x and changes nothing else.
8. **Docs.** `docs/problem-statement.md` (the brief), README forecast section
   and demo path, `docs/COMPLIANCE.md`, `docs/acme-project-tracking.md`.

## Tests

| Suite | Result |
| --- | --- |
| Backend (`pytest backend/tests --cov`) | 233 passed, 96% (was 194, 95%); `schedule.py` 99%, `forecast.py` and `deliverables/function.py` 100% |
| Frontend (`npm run coverage`) | 272 passed, 93.6% lines (was 251); `components/forecast` 100% lines |
| Cypress (`npm run e2e`) | 13 specs, 28 tests: new `13-forecast`; `09-accessibility` now checks the forecast card, the Timeline chart and its table in light and dark; `08-mobile` the Timeline list; `11` the assignee's progress |
| Seed (`pytest tests/seed`) | 18 passed (was 9): the forecast story on each of the seven weekdays |
| curl acceptance (local stack) | 20 + 15 + 18 + 19 + 26 passed, unchanged scripts (their v1.x-shaped PUTs still work) |
| Lint and security | flake8, pylint (10.00 on the new modules; the one duplicate-code note predates this phase), bandit, eslint: clean |

Engine unit tests (`backend/tests/test_schedule.py`) use a fixed "today"
(Wed 25 Nov 2026) and dates worked out by hand: linear chain, diamond,
parallel branches, done and cancelled items, earliest start (rolled off a
weekend), project start in the future, weekend crossing and a weekend today,
progress, missing estimates and each confidence level, no estimates, empty and
all-cancelled projects, everything done, slip against the planned end, SPI
(ahead, behind, project-window fallback, cancelled excluded), a cycle.

Seeder check, on a scratch database through the real handlers: seeded with
the v1.2 seeder and API (438 writes), migrated to 009, then the v2 seeder:
154 writes (one per deliverable), dashboard check 6 / 6 at risk; second run
0 writes; every column of every other table, and every other column of
`deliverables` except `updated_at`, identical before and after.

## Decisions made on your behalf

| Item | Decision | Why |
| --- | --- | --- |
| Deliverables without an estimate | Scheduled with the project's median estimate and marked *assumed*; no forecast when no remaining deliverable has an estimate | A forecast that ignores unestimated work would be optimistic; the median keeps it honest and the confidence level says how much is assumed |
| Confidence | Share of remaining deliverables with an estimate: high ≥ 80%, medium ≥ 50%, else low | As asked; simple enough to explain in one line in the UI |
| When a late forecast is a risk | High or medium confidence only | Projects without estimates (all v1.x data) keep exactly the risk reasons they had |
| SPI baseline | Each deliverable is planned as `estimate` working days ending on its due date (the project's dates when it has none) | There is no stored baseline schedule; due dates are the plan the app already has. Known effect: work started early reads as ahead |
| In-progress work | Continues from today and does not wait for unfinished predecessors | It has already started; holding it back would contradict its status |
| Cancelled deliverables | Take no time; successors wait on the cancelled one's predecessors | Removing them should not disconnect the chain |
| Minimum remaining duration | One working day until the deliverable is marked done | 100% progress that is not "done" still needs closing |
| PUT and the new fields | Left out = unchanged (your change to the plan); explicit `null` clears estimate and earliest start; `done` forces 100% | A v1.x client must never clear them; tested with a v1.2-shaped PUT |
| Where the endpoint lives | The projects service | No new Lambda, as asked |
| Seeded late project | ACME-TRN, using its existing dependencies only | A rerun then needs no new dependencies, so "nothing else is touched" holds |
| Seeder refill rule | Only deliverables with no estimate are filled | Earliest starts are relative to the seeding day; refilling on every run would rewrite them daily |
| List column | Shown for planned, active and on-hold projects that have a forecast; "—" otherwise | A "forecast" for a completed or cancelled project is noise |
| Timeline | Remaining deliverables only | Done work has no forecast bar; the API cannot backdate completion in demo data |

## Known gaps

- Duration-based schedule without resource levelling; no holiday calendar;
  estimate-based, not velocity-based.
- The local SQL demo (`bin/seed-demo.sh`) has no estimates.
- `GET /api/projects` now runs two more queries per call to compute the
  summaries (batched, not per project).
- Risk reasons other than the message are not rendered specially for
  `forecast_late` on the dashboard (it shows the message, like other reasons
  without a deliverable list).

## Release

@@RELEASE@@
