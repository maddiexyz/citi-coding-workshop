# v1.1 – Final round before freezing v1

Branch `feature/v1.1` (from `feature/increment-e`).

## 1. Departments
- Migration 008: `departments` (name unique case-insensitively, stored
  trimmed); one department per distinct trimmed `resources.department`
  value; `resources.department_id` set from it; the migration aborts before
  dropping the text column if any non-blank value is unmapped.
  `projects.department_id` added; `project_details` exposes
  `department_name`.
- `departments` service: `GET /api/departments` (everyone, with people and
  project counts), `POST`/`PUT`/`DELETE` admin only, `409` while in use,
  audited. Resources, projects and the dashboard at-risk list filter by
  `?department_id=`; searching people also matches the department name.
- People page: department filter, *Group by department* (headcount,
  allocated vs capacity this week, over-allocated count); admins get a
  *Departments* dialog to add, rename and delete. Project form: department
  select; projects list and dashboard: department filter; project overview
  shows the department.

## 2. Identity and "(you)"
- `/api/auth/me` (and the user returned by login and refresh) includes
  `resource_id`, the person linked to the account, or null.
- `useYou()` (`frontend/src/auth/useYou.js`) labels names as "Name (you)":
  project owner and team lead (list, cards, overview), deliverable assignee,
  people list and person page, allocations, activity log, users list.

## 3. "Mine" filters
- `GET /api/projects?owner=me` / `?team_lead=me`, `GET /api/deliverables?assignee=me`,
  `GET /api/allocations?resource=me`. "me" is resolved from the token; any
  other value for `owner`, `team_lead` or `resource` is a 400. A user with no
  linked person gets an empty list for `assignee=me` and `resource=me`.
- Projects list: *All projects* / *Owned by me* (project managers) or *Led
  by me* (team leads), kept in the URL as `?mine=1`; hidden for viewers and
  admins.

## 5. Assignees update their own deliverables
- Rule `can_update_deliverable_status` in `backend/_common/permissions.py`,
  mirrored as `canUpdateDeliverableStatus` in `frontend/src/auth/permissions.js`:
  the user whose linked person is a deliverable's assignee may change its
  status. A `PUT` from them that changes any other field is a 403 naming the
  fields; other people's deliverables are a 403; creating and deleting are
  unchanged. Changes are audited as usual.
- The deliverable dialog opens in an *Update status* mode for them: every
  field but the status is locked, with a note explaining why.

## 6. Change own password
- `POST /api/auth/password {current_password, new_password}`: the same
  strength rule as the admin reset (now shared in
  `_common/passwords.check_new_password`), and the new password must differ
  from the current one. A wrong current password is a 400 on
  `current_password` and counts towards the sign-in rate limit (5 per email
  in 15 minutes, then 429). On success every other refresh token is revoked
  and the current session (its cookie) is kept; audited without password
  data.
- *Account* page (`/account`) from a new user menu in the app bar (the name
  button now opens *Account* and *Sign out*).

## 7. INR and Indian formatting
- Terraform `app_currency` now defaults to `INR`; the same variable feeds
  the LocalStack Lambdas (`start-dev.sh`) and AWS, and the budget service's
  fallback is `INR` too.
- `formatMoney` uses `en-IN` (`₹1,20,000.00`); dates (`7 Jan 2030`), hours
  and timestamps use `en-IN` too (`LOCALE` in `utils/format.js`). "Today"
  still comes only from the database.

## 8. Light and dark mode
- `src/theme.js` uses MUI `colorSchemes` (light and dark), default mode
  `system`; the choice is kept by MUI in `localStorage` (`mui-mode`).
- `ColorModeToggle` (app bar and login page) cycles light → dark → system,
  with an `aria-label` and tooltip naming the current and next mode.
- Dark palette: lighter primary, warning, error, success and secondary with
  dark text on them. Contrast threshold 4.5 in both schemes so MUI picks AA
  text colours. The one hardcoded colour (over-allocated week rows) and the
  login page's light grey now come from the theme.
- Tests: `theme.test.js` checks every palette colour against its text and
  against the page and paper backgrounds in both schemes (AA); toggle cycle
  and persistence; the Cypress axe spec runs every page in light and dark.

## Decisions made on your behalf
| Item | Decision | Why |
| --- | --- | --- |
| 1 | When existing values differ only in case or spaces, keep the most used spelling; ties prefer Title Case, then byte order | Deterministic regardless of database collation; "Finance" beats "finance"/"FINANCE" |
| 1 | Blank or whitespace-only department values become "no department" | There is no name to keep |
| 1 | Departments are managed in a dialog on the People page, not a separate page | "Small admin UI"; keeps the navigation short |
| 1 | People grouping is done in the browser from the filtered list | The list already has capacity and this week's hours; no extra endpoint |
| 3 | The Mine toggle is hidden for admins as well as viewers | The brief names PMs and team leads; admins manage everything |
| 3 | `assignee=me` / `resource=me` with no linked person return nothing | "Mine" must never widen to everything |
| 5 | The assignee uses the same `PUT /api/deliverables/{id}` with unchanged values (no separate status endpoint) | One contract; the server compares field by field and names any field that may not change |
| 6 | Wrong current-password attempts share the sign-in failure counter for that email | One limit for guessing a password, wherever it is guessed |
| 6 | Sign out moved into the user menu with Account | A single "user menu" as the brief describes |
| 7 | Two decimals are kept in amounts (`₹1,20,000.00`) | Amounts are stored to the paisa; hiding them would round displayed spend |
| 8 | Dark palette: primary #90caf9, warning #fbbf24, error #f87171, success #4ade80, secondary #ce93d8 | Lighter tints that pass AA as text on #121212 and with dark text on them |
| 8 | The toggle is an icon button whose label says the current mode and the next one | Screen-reader users hear both what is on and what a press does |
