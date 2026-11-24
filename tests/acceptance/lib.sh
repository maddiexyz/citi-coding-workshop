#!/usr/bin/env bash
# Shared helpers for the curl acceptance scripts (local stack only).
#
# Creates throwaway users (one per role, emails accept-*@acme.test) directly in
# the local database with a random password, and removes everything they
# created on exit. Never run against the cloud database.
set -u
BASE="${BASE:-http://localhost:3001/api}"
export PGHOST="${PGHOST:-localhost}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}" \
       PGPASSWORD="${PGPASSWORD:-postgres123}" PGDATABASE="${PGDATABASE:-postgres}"
PSQL=(psql -qAt -v ON_ERROR_STOP=1)
PW="$(head -c 18 /dev/urandom | base64 | tr -d '/+=')Aa1!"
PASS=0; FAIL=0
TMP="$(mktemp -d)"

accept_cleanup() {
  "${PSQL[@]}" -c "DELETE FROM projects WHERE code LIKE 'ACC-%'" \
               -c "DELETE FROM users WHERE email LIKE 'accept-%@acme.test'" > /dev/null
  rm -rf "$TMP"
}
trap accept_cleanup EXIT

# make_user NAME ROLE -> creates accept-NAME@acme.test
make_user() {
  echo "INSERT INTO users (email, password_hash, full_name, role)
        VALUES (:'e', crypt(:'p', gen_salt('bf', 4)), :'n', :'r');" |
    "${PSQL[@]}" -v e="accept-$1@acme.test" -v p="$PW" -v n="Accept $1" -v r="$2" -f - > /dev/null
}
user_id() { "${PSQL[@]}" -c "SELECT id FROM users WHERE email = 'accept-$1@acme.test'"; }

# req METHOD PATH TOKEN [BODY] -> sets CODE, body in $TMP/body
req() {
  local args=(-s -o "$TMP/body" -w "%{http_code}" -X "$1" "$BASE$2")
  [ -n "$3" ] && args+=(-H "Authorization: Bearer $3")
  [ -n "${4:-}" ] && args+=(-H "Content-Type: application/json" --data-binary "$4")
  CODE="$(curl "${args[@]}")"
}
body() { jq -r "$1" "$TMP/body"; }

# check LABEL EXPECTED_STATUS [jq assertion]
check() {
  local ok=1
  [ "$CODE" = "$2" ] || ok=0
  if [ $ok = 1 ] && [ -n "${3:-}" ]; then jq -e "$3" "$TMP/body" > /dev/null 2>&1 || ok=0; fi
  if [ $ok = 1 ]; then PASS=$((PASS + 1)); printf "PASS  %-64s %s\n" "$1" "$CODE"
  else FAIL=$((FAIL + 1)); printf "FAIL  %-64s got %s want %s  %s\n" "$1" "$CODE" "$2" "$(head -c 240 "$TMP/body")"; fi
}

login() {
  req POST /auth/login "" "$(jq -nc --arg e "accept-$1@acme.test" --arg p "$PW" '{email: $e, password: $p}')"
  body '.token'
}

finish() { echo "RESULT: $PASS passed, $FAIL failed"; [ "$FAIL" = 0 ]; }
