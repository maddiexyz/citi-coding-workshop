#!/usr/bin/env bash
# Run the Artillery load test.
#   tests/load/run.sh local          against the local stack (creates and removes a throwaway user)
#   tests/load/run.sh cloud [URL]    against the deployed site (asks for an account; nothing is stored)
# Writes a JSON report and an HTML summary to tests/load/results/.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd -P)"
MODE="${1:-local}"
mkdir -p "$DIR/results"
STAMP="$(date +%Y%m%d-%H%M%S)-$MODE"

if [ "$MODE" = local ]; then
  export LOAD_TARGET="http://localhost:3001"
  export PGPASSWORD="${PGPASSWORD:-postgres123}"
  PSQL=(psql -h "${PGHOST:-localhost}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -qAt -v ON_ERROR_STOP=1)
  LOAD_EMAIL="load-test@acme.test"
  LOAD_PASSWORD="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')Aa1!"
  cleanup() {
    "${PSQL[@]}" -c "DELETE FROM login_attempts WHERE email_lower = 'load-test@acme.test'" \
                 -c "DELETE FROM users WHERE email = 'load-test@acme.test'" > /dev/null
  }
  trap cleanup EXIT
  cleanup
  echo "INSERT INTO users (email, password_hash, full_name, role) VALUES ('load-test@acme.test', crypt(:'p', gen_salt('bf', 12)), 'Load Test', 'viewer');" \
    | "${PSQL[@]}" -v p="$LOAD_PASSWORD" -f - > /dev/null
elif [ "$MODE" = cloud ]; then
  export LOAD_TARGET="${2:-$(terraform -chdir="$DIR/../../infra" output -raw website_url)}"
  read -rp "Email of an existing account: " LOAD_EMAIL
  read -rsp "Password: " LOAD_PASSWORD; echo
else
  echo "Usage: $0 local|cloud [URL]"; exit 1
fi
export LOAD_EMAIL LOAD_PASSWORD

echo "Load test ($MODE profile) against $LOAD_TARGET..."
npx --yes artillery@2 run -e "$MODE" --output "$DIR/results/$STAMP.json" "$DIR/api.yml"
npx --yes artillery@2 report --output "$DIR/results/$STAMP.html" "$DIR/results/$STAMP.json" > /dev/null 2>&1 || true
echo "Report: $DIR/results/$STAMP.json"
