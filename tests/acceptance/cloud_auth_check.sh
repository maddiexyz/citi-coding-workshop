#!/usr/bin/env bash
# Check sign-in, the refresh cookie and sign-out against the deployed site.
# Asks for an existing account's email and password (not echoed, not stored).
# Usage: tests/acceptance/cloud_auth_check.sh [https://your-distribution.cloudfront.net]
set -u
SITE="${1:-$(terraform -chdir="$(dirname "$0")/../../infra" output -raw website_url 2>/dev/null)}"
[ -n "$SITE" ] || { echo "Usage: $0 https://<cloudfront-domain>"; exit 1; }
BASE="${SITE%/}/api"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; umask 077
PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "PASS  $1"; }
bad() { FAIL=$((FAIL + 1)); echo "FAIL  $1"; }

read -rp "Email: " EMAIL
read -rsp "Password: " PASSWORD; echo
jq -nc --arg e "$EMAIL" --arg p "$PASSWORD" '{email: $e, password: $p}' > "$TMP/login.json"
unset PASSWORD

code=$(curl -s -c "$TMP/jar" -D "$TMP/h1" -o "$TMP/b1" -w "%{http_code}" -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" --data-binary "@$TMP/login.json")
rm -f "$TMP/login.json"
[ "$code" = 200 ] && ok "login -> 200" || { bad "login -> $code $(head -c 200 "$TMP/b1")"; exit 1; }
cookie_line="$(grep -i '^set-cookie: acme_refresh=' "$TMP/h1")"
for flag in HttpOnly Secure SameSite=Strict Path=/api/auth; do
  echo "$cookie_line" | grep -qi "$flag" && ok "refresh cookie has $flag" || bad "refresh cookie lacks $flag"
done
TOKEN="$(jq -r .token "$TMP/b1")"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/dashboard/summary" -H "Authorization: Bearer $TOKEN")
[ "$code" = 200 ] && ok "dashboard with the access token -> 200" || bad "dashboard -> $code"
OLD="$(awk '$6 == "acme_refresh" {print $7}' "$TMP/jar")"
code=$(curl -s -b "$TMP/jar" -c "$TMP/jar" -o "$TMP/b2" -w "%{http_code}" -X POST "$BASE/auth/refresh")
[ "$code" = 200 ] && ok "refresh through CloudFront -> 200" || bad "refresh -> $code $(head -c 200 "$TMP/b2")"
NEW="$(awk '$6 == "acme_refresh" {print $7}' "$TMP/jar")"
[ -n "$NEW" ] && [ "$NEW" != "$OLD" ] && ok "cookie rotated" || bad "cookie not rotated"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/refresh" -H "Cookie: acme_refresh=$OLD")
[ "$code" = 401 ] && ok "old refresh token refused -> 401" || bad "old token -> $code"
code=$(curl -s -b "$TMP/jar" -c "$TMP/jar" -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/logout")
[ "$code" = 204 ] && ok "logout -> 204" || bad "logout -> $code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/auth/refresh" -H "Cookie: acme_refresh=$NEW")
[ "$code" = 401 ] && ok "refresh after logout -> 401" || bad "after logout -> $code"
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
