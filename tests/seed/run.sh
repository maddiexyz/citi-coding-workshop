#!/usr/bin/env bash
# Seed ACME demo data through the public API (see tests/seed/seed_api.py).
# Usage: tests/seed/run.sh <base-url> [--reset] [--dry-run]
#   tests/seed/run.sh http://localhost:3001 --dry-run
#   tests/seed/run.sh https://xxxx.cloudfront.net
# Admin email from SEED_ADMIN_EMAIL, else ADMIN_EMAIL, else asked; the password is always
# asked for (never echoed or stored).
set -euo pipefail
if [ $# -lt 1 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
fi
exec python3 "$(dirname "$0")/seed_api.py" "$@"
