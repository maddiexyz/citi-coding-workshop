#!/usr/bin/env python3
"""
Load the ACME demo data (spec.py) into a running deployment through its
public API only: no AWS credentials, no database access.

    python3 tests/seed/seed_api.py BASE_URL [--reset] [--dry-run] [--delay SECONDS]

BASE_URL is the site (CloudFront URL) or the local proxy (http://localhost:3001);
the API is BASE_URL/api. The admin password is asked with getpass and kept in
memory only; the email comes from SEED_ADMIN_EMAIL or ADMIN_EMAIL when set,
else it is asked for too. Each step runs as the user who would really do it:

1. admin: departments, sign-in accounts (random passwords, kept in memory),
   people and their links to accounts;
2. each project manager: their projects (owner comes from the token), team
   lead, budget, deliverables, dependencies, allocations, spend;
3. assignees and team leads: deliverable statuses (so the activity log shows
   who did what); the project manager then closes completed/cancelled projects;
4. admin: admin-only changes (a person goes on leave).

Idempotent: everything is matched on project codes, emails and names and
skipped when it exists, so a second run writes nothing. --reset deletes only
the seeded data, as the admin. --dry-run prints the plan and calls nothing.

Gentle: one request at a time, a pause after every write, backoff on 429 and
5xx. A failed sign-in is never retried (only failures count towards the
rate limit): the run stops and says so. Any unexpected 400/403 stops the run
with the step, the user and the response.
"""

import argparse
import getpass
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spec as demo  # noqa: E402  pylint: disable=wrong-import-position

CREDENTIALS_FILE = Path(__file__).resolve().parent / ".demo-credentials"
TIMEOUT = 30
MAX_ATTEMPTS = 4


class SeedError(Exception):
    """A problem the seeder won't work around: report it and stop."""


def today() -> date:
    """Today in UTC, the time zone the app's database decides "today" in."""
    return datetime.now(timezone.utc).date()


def day(offset: int) -> str:
    """A spec day offset as an ISO date."""
    return (today() + timedelta(days=offset)).isoformat()


class Api:  # pylint: disable=too-few-public-methods
    """HTTP calls to BASE_URL/api with retries, pacing and a write counter."""

    def __init__(self, base_url: str, delay: float):
        if urllib.parse.urlsplit(base_url).scheme not in ("http", "https"):
            raise SeedError(f"Base URL must start with http:// or https://, not {base_url!r}")
        self.base = base_url.rstrip("/") + "/api"
        self.delay = delay
        self.writes = 0

    @staticmethod
    def _send(request: urllib.request.Request):
        """One HTTP exchange: (status, headers, decoded body). Non-JSON bodies (e.g. a proxy error page) are kept
        as text so they can be reported."""
        try:
            # The scheme is checked to be http(s) in __init__
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:  # nosec B310
                status, raw, headers = response.status, response.read(), response.headers
        except urllib.error.HTTPError as error:
            status, raw, headers = error.code, error.read(), error.headers
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            payload = {"non_json_body": raw[:200].decode(errors="replace")}
        return status, headers, payload

    # pylint: disable-next=too-many-arguments,too-many-locals
    def call(self, method: str, path: str, *, token=None, cookie=None, body=None, query=None):
        """Send one request; returns (status, headers, decoded body). Retries 429 and, for safe methods, 5xx."""
        url = self.base + path
        if query:
            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Accept": "application/json", "User-Agent": "acme-demo-seeder"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if cookie:
            headers["Cookie"] = cookie
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                status, resp_headers, payload = self._send(
                    urllib.request.Request(url, data=data, method=method, headers=headers))
            except (urllib.error.URLError, TimeoutError) as error:
                if method == "GET" and attempt < MAX_ATTEMPTS:
                    time.sleep(2 ** attempt)
                    continue
                raise SeedError(f"Cannot reach {url}: {error}") from error
            # Sign-in calls are never retried: a 429 there means "stop"
            retryable = status == 429 or (status >= 500 and method in ("GET", "PUT", "DELETE"))
            if retryable and not path.startswith("/auth/") and attempt < MAX_ATTEMPTS:
                wait = min(int(resp_headers.get("Retry-After") or 2 ** attempt), 60)
                print(f"    … {status} from {method} {path}, waiting {wait}s")
                time.sleep(wait)
                continue
            if method != "GET":
                self.writes += 0 if path.startswith("/auth/") else 1
                time.sleep(self.delay)
            return status, resp_headers, payload
        raise SeedError(f"{method} {path}: still failing after {MAX_ATTEMPTS} attempts")


class Session:  # pylint: disable=too-few-public-methods
    """One signed-in user: access token plus the refresh cookie for when it expires."""

    def __init__(self, api: Api, email: str, password: str):
        self.api, self.email = api, email
        status, headers, body = api.call("POST", "/auth/login", body={"email": email, "password": password})
        if status == 429:
            raise SeedError(f"Sign-in for {email} is rate limited: {body}. Wait and run again; not retrying.")
        if status != 200:
            raise SeedError(f"Sign-in failed for {email} ({status}): {body}. Not retrying.")
        self._take(headers, body)

    def _take(self, headers, body):
        self.token = body["token"]
        self.user = body["user"]
        set_cookie = headers.get("Set-Cookie", "")
        self.cookie = set_cookie.split(";", 1)[0] if set_cookie.startswith("acme_refresh=") else None

    # pylint: disable-next=too-many-arguments
    def call(self, step: str, method: str, path: str, *, body=None, query=None, ok=(200, 201, 204)):
        """Call as this user; refresh the access token once if it expired. Unexpected statuses stop the run."""
        status, _, data = self.api.call(method, path, token=self.token, body=body, query=query)
        if status == 401 and self.cookie:
            refreshed, headers, fresh = self.api.call("POST", "/auth/refresh", cookie=self.cookie)
            if refreshed != 200:
                raise SeedError(f"{step}: session for {self.email} expired and could not be refreshed ({refreshed})")
            self._take(headers, fresh)
            status, _, data = self.api.call(method, path, token=self.token, body=body, query=query)
        if status not in ok:
            raise SeedError(f"{step}: {method} {path} as {self.email} returned {status}: {json.dumps(data)}")
        return status, data


class Seeder:  # pylint: disable=too-many-instance-attributes
    """Creates (or removes) the spec through the API, as the right user for each step."""

    def __init__(self, api: Api, admin: Session, plan: dict):
        self.api, self.admin, self.plan = api, admin, plan
        self.passwords: dict[str, str] = {}      # in memory only
        self.sessions: dict[str, Session] = {}
        self.counts: dict[str, list[int]] = {}   # entity -> [created, existing]
        self.ids: dict[str, dict] = {"department": {}, "user": {}, "person": {}, "project": {}}

    # --- helpers ---------------------------------------------------------------------------

    def count(self, entity: str, created: bool) -> None:
        """Tally one entity as created or already there."""
        self.counts.setdefault(entity, [0, 0])[0 if created else 1] += 1

    def as_user(self, email: str) -> Session:
        """A session for a seeded user, signing in once. If the password isn't known (a
        previous run created the account), the admin sets a new one first."""
        if email not in self.sessions:
            if email not in self.passwords:
                password = new_password()
                self.admin.call("set a password to act as this user", "PUT",
                                f"/users/{self.ids['user'][email]}/password", body={"password": password})
                self.passwords[email] = password
                self.write_credentials()
            self.sessions[email] = Session(self.api, email, self.passwords[email])
        return self.sessions[email]

    def write_credentials(self) -> None:
        """The named demo accounts (one per role) and their passwords, for the person running the seeder."""
        lines = [f"{u['role']}\t{u['email']}\t{self.passwords[u['email']]}"
                 for u in self.plan["users"] if u["demo"] and u["email"] in self.passwords]
        if not lines:
            return
        existing = {}
        if CREDENTIALS_FILE.exists():
            for line in CREDENTIALS_FILE.read_text().splitlines():
                if line and not line.startswith("#"):
                    existing[line.split("\t")[1]] = line
        for line in lines:
            existing[line.split("\t")[1]] = line
        CREDENTIALS_FILE.write_text("# role\temail\tpassword (demo accounts only; never commit)\n"
                                    + "\n".join(existing.values()) + "\n")
        CREDENTIALS_FILE.chmod(0o600)

    # --- step 1: admin ---------------------------------------------------------------------

    def departments(self):
        """Step 1a (admin): departments, matched on name ignoring case."""
        print("1. Admin: departments, accounts, people")
        _, data = self.admin.call("list departments", "GET", "/departments")
        existing = {d["name"].lower(): d["id"] for d in data["items"]}
        for name in self.plan["departments"]:
            if name.lower() in existing:
                self.ids["department"][name] = existing[name.lower()]
                self.count("departments", False)
                continue
            _, created = self.admin.call(f"create department {name}", "POST", "/departments", body={"name": name})
            self.ids["department"][name] = created["id"]
            self.count("departments", True)

    def users(self):
        """Step 1b (admin): sign-in accounts with random passwords, matched on email."""
        _, data = self.admin.call("list accounts", "GET", "/users", query={"q": f"@{demo.EMAIL_DOMAIN}"})
        existing = {u["email"]: u["id"] for u in data["items"]}
        for u in self.plan["users"]:
            if u["email"] in existing:
                self.ids["user"][u["email"]] = existing[u["email"]]
                self.count("accounts", False)
                continue
            password = new_password()
            _, created = self.admin.call(f"create account {u['email']}", "POST", "/users", body={
                "email": u["email"], "full_name": u["full_name"], "role": u["role"], "password": password})
            self.passwords[u["email"]] = password
            self.ids["user"][u["email"]] = created["id"]
            self.count("accounts", True)
        self.write_credentials()

    def people(self):
        """Step 1c (admin): people with department and capacity, linked to their accounts."""
        _, data = self.admin.call("list people", "GET", "/resources", query={"q": f"@{demo.EMAIL_DOMAIN}"})
        existing = {r["email"]: r for r in data["items"]}
        account_of = {u["person"]: u["email"] for u in self.plan["users"]}
        for p in self.plan["people"]:
            user_id = self.ids["user"].get(account_of.get(p["email"]))
            body = {"full_name": p["full_name"], "email": p["email"], "title": p["title"],
                    "department_id": self.ids["department"][p["department"]], "weekly_hours": p["weekly_hours"],
                    "user_id": user_id, "is_active": True}
            current = existing.get(p["email"])
            if current:
                self.ids["person"][p["email"]] = current["id"]
                self.count("people", False)
                if user_id and current["user_id"] != user_id:   # link an account created after the person
                    self.admin.call(f"link {p['email']} to their account", "PUT", f"/resources/{current['id']}",
                                    body={**body, "is_active": current["is_active"]})
                continue
            _, created = self.admin.call(f"create person {p['email']}", "POST", "/resources", body=body)
            self.ids["person"][p["email"]] = created["id"]
            self.count("people", True)

    # --- step 2: project managers ----------------------------------------------------------

    def projects(self):
        """Step 2 (each PM): their projects, matched on code, then everything inside them."""
        print("2. Project managers: projects, deliverables, dependencies, allocations, spend")
        _, data = self.admin.call("list projects", "GET", "/projects", query={"q": demo.CODE_PREFIX})
        existing = {p["code"]: p for p in data["items"]}
        for p in self.plan["projects"]:
            current = existing.get(p["code"])
            if current:
                self.ids["project"][p["code"]] = current["id"]
                self.count("projects", False)
            else:
                pm = self.as_user(p["owner"])
                _, current = pm.call(f"create project {p['code']}", "POST", "/projects", body={
                    "code": p["code"], "name": p["name"], "description": p["description"],
                    "status": "planned" if p["status"] == "planned" else "active",
                    "start_date": day(p["start"]), "end_date": day(p["end"]),
                    "team_lead_id": self.ids["user"].get(p["team_lead"]),
                    "department_id": self.ids["department"][p["department"]], "budget_planned": p["budget"]})
                self.ids["project"][p["code"]] = current["id"]
                self.count("projects", True)
            self.project_content(p)
            print(f"   {p['code']}: done")

    def project_content(self, p: dict):  # pylint: disable=too-many-locals
        """Deliverables, dependencies, allocations and spend of one project, as its manager."""
        pid = self.ids["project"][p["code"]]

        def pm() -> Session:
            """The project's manager, signed in only once something needs writing."""
            return self.as_user(p["owner"])

        _, data = self.admin.call("list deliverables", "GET", "/deliverables", query={"project_id": pid})
        by_title = {d["title"]: d for d in data["items"]}
        for d in (x for x in self.plan["deliverables"] if x["project"] == p["code"]):
            schedule = {"estimate_days": d["estimate"],
                        "earliest_start": None if d["earliest_start"] is None else day(d["earliest_start"])}
            if d["title"] in by_title:
                self.count("deliverables", False)
                by_title[d["title"]] = self.fill_schedule(p, d, by_title[d["title"]], schedule)
                continue
            _, created = pm().call(f"create deliverable {p['code']} / {d['title']}", "POST", "/deliverables", body={
                "project_id": pid, "title": d["title"], "status": "not_started", "due_date": day(d["due"]),
                "assignee_resource_id": self.ids["person"][d["assignee"]], **schedule})
            by_title[d["title"]] = created
            self.count("deliverables", True)
        self.ids.setdefault("deliverables", {})[p["code"]] = by_title

        _, chain = self.admin.call("read dependency chain", "GET", "/deliverables/chain", query={"project_id": pid})
        edges = {(row["path"][-1], row["path"][-2]) for row in chain["rows"] if len(row["path"]) > 1}
        for dep in (x for x in self.plan["dependencies"] if x["project"] == p["code"]):
            later, earlier = by_title[dep["deliverable"]]["id"], by_title[dep["depends_on"]]["id"]
            if (later, earlier) in edges:
                self.count("dependencies", False)
                continue
            pm().call(f"add dependency {p['code']} / {dep['deliverable']} → {dep['depends_on']}", "POST",
                      f"/deliverables/{later}/dependencies", body={"depends_on_id": earlier})
            self.count("dependencies", True)

        _, data = self.admin.call("list allocations", "GET", "/allocations", query={"project_id": pid})
        allocated = {a["resource_id"] for a in data["items"]}
        for a in (x for x in self.plan["allocations"] if x["project"] == p["code"]):
            person = self.ids["person"][a["person"]]
            if person in allocated:
                self.count("allocations", False)
                continue
            pm().call(f"allocate {a['person']} to {p['code']}", "POST", "/allocations", body={
                "project_id": pid, "resource_id": person, "hours_per_week": a["hours"],
                "start_date": day(a["start"]), "end_date": day(a["end"]), "note": a["note"]})
            self.count("allocations", True)

        entries = [x for x in self.plan["spend"] if x["project"] == p["code"]]
        if entries:
            _, data = self.admin.call("list spend", "GET", "/budget", query={"project_id": pid})
            recorded = {e["description"] for e in data["items"]}
            for e in entries:
                if e["description"] in recorded:
                    self.count("spend entries", False)
                    continue
                pm().call(f"record spend {e['description']}", "POST", "/budget", body={
                    "project_id": pid, "category": e["category"], "amount": e["amount"],
                    "spent_on": day(e["spent_on"]), "description": e["description"]})
                self.count("spend entries", True)

    def fill_schedule(self, p: dict, d: dict, current: dict, schedule: dict) -> dict:
        """
        v2: give a deliverable seeded by an earlier version its estimate, earliest
        start and progress, as the admin. Only a deliverable without an estimate
        is touched (so a rerun on a later day rewrites nothing), and every other
        field is sent back exactly as it is.
        """
        if current.get("estimate_days") is not None:
            self.count("schedule fields", False)
            return current
        body = {"title": current["title"], "description": current.get("description"), "status": current["status"],
                "due_date": current["due_date"], "assignee_resource_id": current["assignee_resource_id"], **schedule}
        if current["status"] == d["status"]:        # otherwise step 3 sets the progress with the status
            body["progress_pct"] = d["progress"]
        _, updated = self.admin.call(f"fill estimate of {p['code']} / {d['title']}", "PUT",
                                     f"/deliverables/{current['id']}", body=body)
        self.count("schedule fields", True)
        return updated

    # --- step 3: assignees and team leads --------------------------------------------------

    def statuses(self):
        """Step 3: assignees (or the team lead, else the PM) move deliverables on; PMs close projects."""
        print("3. Assignees and team leads: deliverable statuses; managers close finished projects")
        account_of = {u["person"]: u["email"] for u in self.plan["users"]}
        projects = {p["code"]: p for p in self.plan["projects"]}
        for d in self.plan["deliverables"]:
            current = self.ids["deliverables"][d["project"]][d["title"]]
            if current["status"] == d["status"]:
                continue
            project = projects[d["project"]]
            actor = account_of.get(d["assignee"]) or project["team_lead"] or project["owner"]
            # The schedule fields are left out: the API keeps them, and an assignee may not change them
            body = {"title": current["title"], "description": current.get("description"), "status": d["status"],
                    "due_date": current["due_date"], "assignee_resource_id": current["assignee_resource_id"],
                    "progress_pct": d["progress"]}
            self.as_user(actor).call(f"set status of {d['project']} / {d['title']} to {d['status']}", "PUT",
                                     f"/deliverables/{current['id']}", body=body)
            self.count("status updates", True)
        _, data = self.admin.call("list projects", "GET", "/projects", query={"q": demo.CODE_PREFIX})
        current = {p["code"]: p for p in data["items"]}
        for p in self.plan["projects"]:
            now = current[p["code"]]
            if now["status"] == p["status"]:
                continue
            fields = ("code", "name", "description", "start_date", "end_date", "team_lead_id", "department_id",
                      "budget_planned")
            self.as_user(p["owner"]).call(f"mark {p['code']} {p['status']}", "PUT", f"/projects/{now['id']}",
                                          body={**{f: now[f] for f in fields}, "status": p["status"]})
            self.count("project status changes", True)

    # --- step 4: admin ---------------------------------------------------------------------

    def admin_changes(self):
        """Step 4 (admin): admin-only changes, e.g. a person going on leave."""
        print("4. Admin: people going on leave")
        _, data = self.admin.call("list people", "GET", "/resources", query={"q": f"@{demo.EMAIL_DOMAIN}"})
        people = {r["email"]: r for r in data["items"]}
        for email in self.plan["deactivate"]:
            person = people[email]
            if not person["is_active"]:
                continue
            fields = ("full_name", "email", "title", "department_id", "weekly_hours", "user_id")
            self.admin.call(f"deactivate {email}", "PUT", f"/resources/{person['id']}",
                            body={**{f: person[f] for f in fields}, "is_active": False})
            self.count("people deactivated", True)

    # --- reset -----------------------------------------------------------------------------

    def reset(self):  # pylint: disable=too-many-branches
        """Delete only the seeded data, as the admin, in dependency order."""
        print("Removing the seeded data (as the admin)")
        removed: dict[str, int] = {}
        kept = []
        _, data = self.admin.call("list projects", "GET", "/projects", query={"q": demo.CODE_PREFIX})
        codes = {p["code"] for p in self.plan["projects"]}
        for p in data["items"]:
            if p["code"] in codes:   # deletes its deliverables, dependencies, allocations and spend too
                self.admin.call(f"delete project {p['code']}", "DELETE", f"/projects/{p['id']}", ok=(204, 404))
                removed["projects"] = removed.get("projects", 0) + 1
        _, data = self.admin.call("list people", "GET", "/resources", query={"q": f"@{demo.EMAIL_DOMAIN}"})
        emails = {p["email"] for p in self.plan["people"]}
        for r in data["items"]:
            if r["email"] in emails:
                self.admin.call(f"delete person {r['email']}", "DELETE", f"/resources/{r['id']}", ok=(204, 404))
                removed["people"] = removed.get("people", 0) + 1
        _, data = self.admin.call("list accounts", "GET", "/users", query={"q": f"@{demo.EMAIL_DOMAIN}"})
        accounts = {u["email"] for u in self.plan["users"]}
        for u in data["items"]:
            if u["email"] in accounts:
                self.admin.call(f"delete account {u['email']}", "DELETE", f"/users/{u['id']}", ok=(204, 404))
                removed["accounts"] = removed.get("accounts", 0) + 1
        _, data = self.admin.call("list departments", "GET", "/departments")
        names = {n.lower() for n in self.plan["departments"]}
        for d in data["items"]:
            if d["name"].lower() not in names:
                continue
            if d["resource_count"] or d["project_count"]:   # other data (e.g. bin/seed-demo.sh) still uses it
                kept.append(d["name"])
                continue
            status, _ = self.admin.call(f"delete department {d['name']}", "DELETE", f"/departments/{d['id']}",
                                        ok=(204, 404, 409))
            if status == 409:   # also used by data the seeder didn't create
                kept.append(d["name"])
            else:
                removed["departments"] = removed.get("departments", 0) + 1
        if CREDENTIALS_FILE.exists():
            CREDENTIALS_FILE.unlink()
        for entity, n in removed.items():
            print(f"   {entity:<12} {n} removed")
        if kept:
            print(f"   departments kept because other data still uses them: {', '.join(kept)}")

    # --- summary ---------------------------------------------------------------------------

    def summary(self):  # pylint: disable=too-many-locals
        """Counts per entity, and the dashboard compared with what the spec predicts."""
        expected = demo.expected_flags(self.plan, today())
        print("\nSummary (created / already there)")
        for entity, (created, existing) in self.counts.items():
            print(f"   {entity:<24} {created:>4} / {existing}")
        print(f"   writes this run: {self.api.writes}")
        _, board = self.admin.call("read dashboard", "GET", "/dashboard/summary")
        _, flagged = self.admin.call("read at-risk projects", "GET", "/dashboard/at-risk")
        seeded_at_risk = sorted(p["code"] for p in flagged["items"]
                                if p["code"].startswith(demo.CODE_PREFIX) and p["is_at_risk"])
        # Over budget from the projects list: /at-risk leaves out completed projects
        _, listed = self.admin.call("list projects", "GET", "/projects", query={"q": demo.CODE_PREFIX})
        codes = {p["code"] for p in self.plan["projects"]}
        seeded_over_budget = sorted(p["code"] for p in listed["items"] if p["code"] in codes and p["over_budget"])
        _, over = self.admin.call("read over-allocated people", "GET", "/resources",
                                  query={"over_allocated": "true", "q": f"@{demo.EMAIL_DOMAIN}"})
        seeded_over = sorted(r["email"] for r in over["items"])
        rows = [("at-risk projects", seeded_at_risk, sorted(expected["at_risk"]), board["at_risk"]),
                ("over-budget projects", seeded_over_budget, expected["over_budget"], board["over_budget"]),
                ("over-allocated people", seeded_over, expected["over_allocated"],
                 len(board["over_allocated_people"]))]
        print("\nDashboard check (seeded data / expected; whole dashboard)")
        for label, seen, wanted, total in rows:
            mark = "✓" if seen == wanted else "✗"
            print(f"   {mark} {label:<22} {len(seen)} / {len(wanted)}   (dashboard total {total})")
            if seen != wanted:
                print(f"       seen {seen}\n       expected {wanted}")


def new_password() -> str:
    """A random password that meets the app's rule (never printed)."""
    return secrets.token_urlsafe(18) + "Aa1!"


def rupees(amount: str) -> str:
    """Indian digit grouping, as the app shows it: ₹18,00,000."""
    digits = str(int(float(amount)))
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        head, groups = head[:-2], [head[-2:]] + groups
    return "₹" + ",".join(([head] if head else []) + groups + [tail])


def print_plan(plan: dict) -> None:
    """--dry-run: what would be created on an empty system (nothing is called)."""
    expected = demo.expected_flags(plan, today())
    print("Dry run: nothing is sent. On an empty system this creates:")
    for key in ("departments", "users", "people", "projects", "deliverables", "dependencies", "allocations",
                "spend"):
        print(f"   {key:<14} {len(plan[key])}")
    print(f"   then: deliverable status updates by assignees and team leads, "
          f"{sum(p['status'] in ('completed', 'cancelled') for p in plan['projects'])} projects closed, "
          f"{len(plan['deactivate'])} person deactivated")
    print("\nProjects:")
    for p in plan["projects"]:
        budget = rupees(p["budget"]) if p["budget"] else "no budget"
        print(f"   {p['code']:<10} {p['name']:<32} {p['status']:<10} {p['archetype']:<15} {budget}")
    print("\nAccounts (passwords are generated at run time; demo accounts go to tests/seed/.demo-credentials):")
    for u in plan["users"]:
        print(f"   {u['role']:<16} {u['email']}{'   (demo account)' if u['demo'] else ''}")
    print(f"\nExpected afterwards: {len(expected['at_risk'])} at-risk projects {sorted(expected['at_risk'])}, "
          f"{len(expected['over_budget'])} over budget {expected['over_budget']}, "
          f"{len(expected['over_allocated'])} over-allocated people")
    print("Anything that already exists (matched on codes, emails and names) is skipped.")


def admin_email() -> str:
    """The admin's email: SEED_ADMIN_EMAIL, else ADMIN_EMAIL (as exported for the deploy), else asked for.
    Printed when it comes from the environment, so a wrong account is caught before the password prompt."""
    for name in ("SEED_ADMIN_EMAIL", "ADMIN_EMAIL"):
        value = (os.environ.get(name) or "").strip()
        if value:
            print(f"Admin email: {value} (from {name})")
            return value
    return input("Admin email: ").strip()


def main(argv=None) -> int:
    """Parse arguments and run the seeder; returns the exit code."""
    parser = argparse.ArgumentParser(description="Seed ACME demo data through the public API.")
    parser.add_argument("base_url", help="site or proxy URL, e.g. https://xxxx.cloudfront.net or http://localhost:3001")
    parser.add_argument("--reset", action="store_true", help="delete only the seeded data")
    parser.add_argument("--dry-run", action="store_true", help="print the plan; call nothing")
    parser.add_argument("--delay", type=float, default=0.2, help="pause after each write, in seconds (default 0.2)")
    args = parser.parse_args(argv)
    plan = demo.build()
    if args.dry_run:
        print_plan(plan)
        return 0

    try:
        api = Api(args.base_url, args.delay)
        email = admin_email()
        password = getpass.getpass("Admin password: ")
        if not email or not password:
            # Never send an empty sign-in: a failed one counts towards the rate limit
            raise SeedError("An admin email and password are needed; nothing was sent")
        admin = Session(api, email, password)
        del password
        if admin.user["role"] != "admin":
            raise SeedError(f"{email} is not an admin")
        seeder = Seeder(api, admin, plan)
        if args.reset:
            seeder.reset()
            return 0
        started = time.monotonic()
        for step in (seeder.departments, seeder.users, seeder.people, seeder.projects, seeder.statuses,
                     seeder.admin_changes, seeder.summary):
            step()
        print(f"\nDone in {time.monotonic() - started:.0f}s.")
        if CREDENTIALS_FILE.exists():
            print(f"Demo account credentials (role, email, password): {CREDENTIALS_FILE}")
        return 0
    except SeedError as error:
        print(f"\n✗ {error}", file=sys.stderr)
        return 1
    except (EOFError, KeyboardInterrupt):
        print("\n✗ Stopped at the prompt; nothing more was sent", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
