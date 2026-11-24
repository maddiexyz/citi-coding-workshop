#!/usr/bin/env bash
# Script: Demo Data (local only)
# Purpose: Fill the LOCAL database with a small company that shows every feature
# Usage: ./seed-demo.sh [--reset]
#
# Safe to run again: existing rows are left alone. Refuses to run unless
# PostgreSQL is on this machine, so it can never touch the cloud database.
#
# Demo accounts get DEMO_PASSWORD if it is set; otherwise one random password
# is generated, printed once, and never stored anywhere but as a bcrypt hash.
#
# --reset removes the demo data (DEMO-* projects, demo people and accounts)
# before seeding again.

set -euo pipefail

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi

export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres123}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"

case "$PGHOST" in
    localhost|127.0.0.1|::1) ;;
    *) echo "✗ Refusing to seed demo data on $PGHOST: this script is for the local database only."; exit 1 ;;
esac
if [ "${IS_LOCAL:-true}" = "false" ]; then
    echo "✗ Refusing to seed demo data: IS_LOCAL=false."; exit 1
fi

PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1)
"${PSQL[@]}" -At -c "SELECT 1 FROM schema_migrations WHERE version = '008_departments'" | grep -q 1 \
    || { echo "✗ Run ./bin/start-dev.sh (or ./bin/migrate.sh) first: migrations up to 008 are needed."; exit 1; }

if [ "${1:-}" = "--reset" ]; then
    "${PSQL[@]}" <<'SQL'
DELETE FROM projects WHERE code LIKE 'DEMO-%';
DELETE FROM resources WHERE email LIKE '%@demo.acme.test';
DELETE FROM login_attempts WHERE email_lower LIKE '%@demo.acme.test';
DELETE FROM users WHERE email LIKE '%@demo.acme.test';
SQL
    echo "  ✓ Demo data removed"
fi

NEW_USERS=$("${PSQL[@]}" -At -c "SELECT count(*) FROM users WHERE email LIKE '%@demo.acme.test'")
PASSWORD="${DEMO_PASSWORD:-}"
GENERATED=false
if [ -z "$PASSWORD" ]; then
    PASSWORD="$(head -c 15 /dev/urandom | base64 | tr -d '/+=')Aa1!"
    GENERATED=true
fi

"${PSQL[@]}" -v demo_password="$PASSWORD" <<'SQL'
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Departments
INSERT INTO departments (name) VALUES ('Engineering'), ('Finance'), ('Operations')
ON CONFLICT ((lower(name))) DO NOTHING;

-- One account per role (the admin comes from ADMIN_EMAIL in start-dev.sh)
INSERT INTO users (email, password_hash, full_name, role)
SELECT email, crypt(:'demo_password', gen_salt('bf', 12)), full_name, role::user_role
FROM (VALUES
    ('asha.pm@demo.acme.test',     'Asha Rao',    'project_manager'),
    ('vikram.pm@demo.acme.test',   'Vikram Iyer', 'project_manager'),
    ('meera.lead@demo.acme.test',  'Meera Nair',  'team_lead'),
    ('rahul.viewer@demo.acme.test','Rahul Sen',   'viewer')
) AS u(email, full_name, role)
ON CONFLICT (email) DO NOTHING;

-- People, linked to the accounts above (Arjun has no account)
INSERT INTO resources (full_name, email, title, department_id, weekly_hours, user_id)
SELECT r.full_name, r.email, r.title, d.id, r.hours, u.id
FROM (VALUES
    ('Asha Rao',    'asha.pm@demo.acme.test',     'Programme manager', 'Finance',     40, 'asha.pm@demo.acme.test'),
    ('Vikram Iyer', 'vikram.pm@demo.acme.test',   'Delivery manager',  'Engineering', 40, 'vikram.pm@demo.acme.test'),
    ('Meera Nair',  'meera.lead@demo.acme.test',  'Tech lead',         'Engineering', 40, 'meera.lead@demo.acme.test'),
    ('Rahul Sen',   'rahul.viewer@demo.acme.test','Analyst',           'Finance',     40, 'rahul.viewer@demo.acme.test'),
    ('Arjun Das',   'arjun@demo.acme.test',       'Data engineer',     'Engineering', 40, NULL)
) AS r(full_name, email, title, department, hours, account)
JOIN departments d ON d.name = r.department
LEFT JOIN users u ON u.email = r.account
ON CONFLICT (email) DO NOTHING;

-- Projects (dates relative to the database's today)
INSERT INTO projects (code, name, description, status, start_date, end_date, owner_id, team_lead_id,
                      department_id, budget_planned)
SELECT p.code, p.name, p.description, 'active', current_date + p.start_offset, current_date + p.end_offset,
       owner.id, lead.id, d.id, p.budget
FROM (VALUES
    ('DEMO-PAY', 'Payments revamp', 'New payment gateway for retail customers. Ended last week, not finished: late.',
     -90, -5, 'asha.pm@demo.acme.test', 'meera.lead@demo.acme.test', 'Finance', 1200000.00),
    ('DEMO-DATA', 'Data platform', 'Half the schedule is gone and nothing is done yet: schedule slip, with a blocked dependency chain.',
     -50, 50, 'vikram.pm@demo.acme.test', 'meera.lead@demo.acme.test', 'Engineering', 2500000.00),
    ('DEMO-OPS', 'Warehouse automation', 'Spent more than planned: over budget.',
     -20, 120, 'asha.pm@demo.acme.test', NULL, 'Operations', 500000.00)
) AS p(code, name, description, start_offset, end_offset, owner_email, lead_email, department, budget)
JOIN users owner ON owner.email = p.owner_email
LEFT JOIN users lead ON lead.email = p.lead_email
JOIN departments d ON d.name = p.department
ON CONFLICT (code) DO NOTHING;

-- Deliverables
INSERT INTO deliverables (project_id, title, status, due_date, assignee_resource_id, completed_at)
SELECT p.id, x.title, x.status::deliverable_status, current_date + x.due_offset, r.id,
       CASE WHEN x.status = 'done' THEN now() END
FROM (VALUES
    ('DEMO-PAY',  'Gateway integration',  'in_progress', -10, 'meera.lead@demo.acme.test'),
    ('DEMO-PAY',  'PCI audit',            'not_started',  -3, 'rahul.viewer@demo.acme.test'),
    ('DEMO-PAY',  'Merchant onboarding',  'done',        -30, 'vikram.pm@demo.acme.test'),
    ('DEMO-DATA', 'Ingest pipeline',      'in_progress',  10, 'arjun@demo.acme.test'),
    ('DEMO-DATA', 'Data model',           'not_started',   5, 'meera.lead@demo.acme.test'),
    ('DEMO-DATA', 'Executive dashboards', 'not_started',  20, 'meera.lead@demo.acme.test'),
    ('DEMO-DATA', 'Access controls',      'not_started',  30, 'arjun@demo.acme.test'),
    ('DEMO-OPS',  'Conveyor controller',  'in_progress',  40, 'arjun@demo.acme.test')
) AS x(code, title, status, due_offset, assignee)
JOIN projects p ON p.code = x.code
LEFT JOIN resources r ON r.email = x.assignee
WHERE NOT EXISTS (SELECT 1 FROM deliverables d WHERE d.project_id = p.id AND d.title = x.title);

-- Dependency chain: Ingest pipeline → Data model → Executive dashboards
INSERT INTO deliverable_dependencies (deliverable_id, depends_on_id)
SELECT later.id, earlier.id
FROM (VALUES ('Data model', 'Ingest pipeline'), ('Executive dashboards', 'Data model')) AS c(later, earlier)
JOIN projects p ON p.code = 'DEMO-DATA'
JOIN deliverables later ON later.project_id = p.id AND later.title = c.later
JOIN deliverables earlier ON earlier.project_id = p.id AND earlier.title = c.earlier
ON CONFLICT DO NOTHING;

-- Allocations: Arjun is booked 30 h + 20 h this week against 40 h (over-allocated)
INSERT INTO allocations (project_id, resource_id, hours_per_week, start_date, end_date, note)
SELECT p.id, r.id, a.hours, date_trunc('week', current_date)::date + a.start_offset,
       date_trunc('week', current_date)::date + a.end_offset, a.note
FROM (VALUES
    ('DEMO-DATA', 'arjun@demo.acme.test',      30, -7, 27, 'Pipeline build'),
    ('DEMO-OPS',  'arjun@demo.acme.test',      20,  0, 13, 'Controller firmware'),
    ('DEMO-DATA', 'meera.lead@demo.acme.test', 20, -7, 41, 'Technical lead'),
    ('DEMO-PAY',  'meera.lead@demo.acme.test', 15, -14, -6, 'Gateway support'),
    ('DEMO-PAY',  'rahul.viewer@demo.acme.test', 10, -14, -6, 'Audit preparation')
) AS a(code, email, hours, start_offset, end_offset, note)
JOIN projects p ON p.code = a.code
JOIN resources r ON r.email = a.email
WHERE NOT EXISTS (SELECT 1 FROM allocations x WHERE x.project_id = p.id AND x.resource_id = r.id);

-- Spend (INR)
INSERT INTO budget_entries (project_id, category, amount, spent_on, description)
SELECT p.id, b.category::spend_category, b.amount, current_date + b.day_offset, b.description
FROM (VALUES
    ('DEMO-PAY',  'labor',    450000.00, -40, 'Contract developers'),
    ('DEMO-PAY',  'software', 120000.00, -60, 'Gateway licence'),
    ('DEMO-DATA', 'software', 300000.00, -30, 'Cloud warehouse'),
    ('DEMO-DATA', 'labor',    250000.00, -10, 'Data engineering'),
    ('DEMO-OPS',  'hardware', 525000.00, -15, 'Conveyor sensors'),
    ('DEMO-OPS',  'travel',   100000.00,  -5, 'Site visits')
) AS b(code, category, amount, day_offset, description)
JOIN projects p ON p.code = b.code
WHERE NOT EXISTS (SELECT 1 FROM budget_entries x WHERE x.project_id = p.id AND x.description = b.description);
COMMIT;
SQL

echo "  ✓ Demo data ready: departments, 4 accounts, 5 people, 3 projects (DEMO-*)"
echo "    Accounts: asha.pm@ / vikram.pm@ (project managers), meera.lead@ (team lead), rahul.viewer@ (viewer) — all @demo.acme.test"
if [ "$NEW_USERS" = "0" ]; then
    if [ "$GENERATED" = true ]; then
        echo "    Password for all demo accounts (shown once, not stored): $PASSWORD"
    else
        echo "    Password for all demo accounts: the DEMO_PASSWORD you set"
    fi
else
    echo "    Demo accounts already existed; their passwords were not changed."
fi
