#!/usr/bin/env bash
# Script: PostgreSQL Migrations
# Purpose: Apply pending SQL migrations and seed the admin user (local development)
# Usage: ./migrate.sh

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Apply pending SQL migrations from backend/_db/migrations, then seed the admin user"
    echo ""
    echo "Environment:"
    echo "  PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE"
    echo "                  Connection settings (default: local dev database)"
    echo "  ADMIN_EMAIL     Email of the admin user to seed (seed is skipped if unset)"
    echo "  ADMIN_PASSWORD  Password of the admin user to seed"
    echo "  ADMIN_NAME      Display name of the admin user (default: Administrator)"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"
DB_DIR="$PROJECT_ROOT/backend/_db"

# Defaults match the local values Terraform injects into the Lambdas (infra/locals.tf)
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres123}"
export PGDATABASE="${PGDATABASE:-postgres}"

# Hide "already exists, skipping" notices on re-runs
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
PSQL=(psql --quiet --no-psqlrc -v ON_ERROR_STOP=1)

# Track applied migrations so each file runs exactly once
"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);"

APPLIED=0
for file in "$DB_DIR"/migrations/*.sql; do
    version="$(basename "$file" .sql)"
    already=$(echo "SELECT 1 FROM schema_migrations WHERE version = :'version';" \
        | "${PSQL[@]}" -At -v version="$version" -f -)
    if [ "$already" = "1" ]; then
        continue
    fi
    echo "  Applying migration $version..."
    # Migration and its bookkeeping row commit together, or not at all
    { cat "$file"; echo "INSERT INTO schema_migrations (version) VALUES (:'version');"; } \
        | "${PSQL[@]}" --single-transaction -v version="$version" -f -
    APPLIED=$((APPLIED + 1))
done
echo "  ✓ Migrations up to date ($APPLIED applied)"

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
    "${PSQL[@]}" \
        -v admin_email="$ADMIN_EMAIL" \
        -v admin_password="$ADMIN_PASSWORD" \
        -v admin_name="${ADMIN_NAME:-Administrator}" \
        -f "$DB_DIR/seed_admin.sql"
    echo "  ✓ Admin user ensured ($ADMIN_EMAIL)"
else
    echo "  ⚠ ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin seed"
fi
