#!/usr/bin/env bash
# Increment D acceptance: dashboard, user management, refresh cookie, rate limit.
# Usage: tests/acceptance/increment_d.sh   (local stack from bin/start-dev.sh)
source "$(dirname "$0")/lib.sh"

make_user admin admin; make_user pm project_manager; make_user viewer viewer
ADMIN="$(login admin)"; PM="$(login pm)"; VIEWER="$(login viewer)"
TODAY="$(date +%F)"; PAST="$(date -d '-3 days' +%F)"

echo "== Dashboard"
req POST /projects "$PM" "{\"code\":\"ACC-D1\",\"name\":\"Acceptance late\",\"status\":\"active\",\"end_date\":\"$PAST\"}"; LATE="$(body .id)"
req GET /dashboard/summary "$VIEWER"; check "viewer reads the summary" 200 '.at_risk >= 1 and (.over_allocated_people | type == "array")'
req GET "/dashboard/at-risk?q=ACC-D1" "$VIEWER"
check "late project flagged high with a reason" 200 '.items[0].severity == "high" and .items[0].risk_reasons[0].type == "late"'
req GET "/dashboard/at-risk?flag=nope" "$VIEWER"; check "bad filter -> 400" 400

echo "== Users"
req POST /users "$PM" '{"email":"accept-new@acme.test","full_name":"Accept new","role":"viewer","password":"Long-enough-1"}'; check "PM cannot create users -> 403" 403
req POST /users "$ADMIN" '{"email":"accept-new@acme.test","full_name":"Accept new","role":"viewer","password":"short"}'; check "short password -> 400" 400 '.error.details.password'
req POST /users "$ADMIN" '{"email":"accept-new@acme.test","full_name":"Accept new","role":"viewer","password":"Long-enough-1"}'
check "admin creates user, no password in response" 201 '.role == "viewer" and (has("password_hash") | not)'
NEW="$(body .id)"
req PUT "/users/$(user_id admin)" "$ADMIN" '{"email":"accept-admin@acme.test","full_name":"Accept admin","role":"viewer"}'
check "admin cannot demote themselves -> 400" 400
req PUT "/users/$NEW/password" "$ADMIN" '{"password":"Brand-new-pass-2"}'; check "admin resets a password -> 204" 204
req DELETE "/users/$(user_id pm)" "$ADMIN"; check "user who owns projects cannot be deleted -> 409" 409

echo "== Sessions (refresh cookie)"
JAR="$TMP/jar"; export JAR
req POST /auth/login "" "$(jq -nc --arg p "$PW" '{email:"accept-viewer@acme.test",password:$p}')"; check "login -> 200" 200 '.expires_in == 900'
grep -i '^set-cookie: acme_refresh=' "$TMP/headers" | grep -qi 'HttpOnly' && grep -i '^set-cookie: acme_refresh=' "$TMP/headers" | grep -q 'SameSite=Strict' \
  && grep -i '^set-cookie: acme_refresh=' "$TMP/headers" | grep -q 'Path=/api/auth'
CODE=$([ $? = 0 ] && echo ok || echo missing); check "refresh cookie is HttpOnly, SameSite=Strict, Path=/api/auth" ok
OLD="$(awk '$6 == "acme_refresh" {print $7}' "$JAR")"
req POST /auth/refresh ""; check "refresh with the cookie -> new access token" 200 '.token | length > 20'
NEWC="$(awk '$6 == "acme_refresh" {print $7}' "$JAR")"
CODE=$([ -n "$NEWC" ] && [ "$NEWC" != "$OLD" ] && echo ok || echo same); check "refresh rotated the cookie" ok
unset JAR
curl -s -o "$TMP/body" -w "%{http_code}" -X POST "$BASE/auth/refresh" -H "Cookie: acme_refresh=$OLD" > "$TMP/code"; CODE="$(cat "$TMP/code")"
check "reusing the old refresh token -> 401" 401
JAR="$TMP/jar"; export JAR
req POST /auth/logout ""; check "logout -> 204" 204
unset JAR
curl -s -o "$TMP/body" -w "%{http_code}" -X POST "$BASE/auth/refresh" -H "Cookie: acme_refresh=$NEWC" > "$TMP/code"; CODE="$(cat "$TMP/code")"
check "refresh after logout -> 401" 401

echo "== Rate limit"
for i in 1 2 3 4 5; do req POST /auth/login "" '{"email":"nobody-d@acme.test","password":"wrong"}'; done
check "5th wrong password -> 401" 401
curl -s -D "$TMP/headers" -o "$TMP/body" -w "%{http_code}" -X POST "$BASE/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"nobody-d@acme.test","password":"wrong"}' > "$TMP/code"; CODE="$(cat "$TMP/code")"
check "6th attempt -> 429 rate_limited" 429 '.error.code == "rate_limited"'
CODE=$(grep -qi '^retry-after: [0-9]' "$TMP/headers" && echo ok || echo missing); check "429 has a Retry-After header" ok

finish
