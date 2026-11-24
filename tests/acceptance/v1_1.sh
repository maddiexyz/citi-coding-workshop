#!/usr/bin/env bash
# v1.1 acceptance: departments, "me" filters, assignee status, own password, chain, INR.
# Usage: tests/acceptance/v1_1.sh   (local stack from bin/start-dev.sh)
source "$(dirname "$0")/lib.sh"

make_user admin admin; make_user pm project_manager; make_user lead team_lead; make_user viewer viewer
ADMIN="$(login admin)"; PM="$(login pm)"; LEAD="$(login lead)"; VIEWER="$(login viewer)"

echo "== Departments"
req POST /departments "$PM" '{"name":"Accept Finance"}'; check "PM cannot create a department -> 403" 403
req POST /departments "$ADMIN" '{"name":"  Accept Finance "}'; check "admin creates a department (trimmed)" 201 '.name == "Accept Finance"'
DEP="$(body .id)"
req POST /departments "$ADMIN" '{"name":"accept finance"}'; check "same name in other case -> 409" 409
req GET /departments "$VIEWER"; check "everyone lists departments" 200 'any(.items[]; .name == "Accept Finance")'
req POST /resources "$ADMIN" "{\"full_name\":\"Accept Lee\",\"email\":\"accept-lee@acme.test\",\"department_id\":$DEP,\"user_id\":$(user_id lead)}"
check "person in the department, linked to the team lead" 201 '.department_name == "Accept Finance"'
LEE="$(body .id)"
req POST /projects "$PM" "{\"code\":\"ACC-V1\",\"name\":\"Acceptance v1.1\",\"status\":\"active\",\"department_id\":$DEP,\"team_lead_id\":$(user_id lead),\"budget_planned\":\"120000\"}"
check "project in the department" 201 '.department_name == "Accept Finance"'
P="$(body .id)"
req GET "/projects?department_id=$DEP" "$VIEWER"; check "projects filter by department" 200 '[.items[].code] == ["ACC-V1"]'
req GET "/resources?department_id=$DEP" "$VIEWER"; check "people filter by department" 200 '[.items[].full_name] == ["Accept Lee"]'
req DELETE "/departments/$DEP" "$ADMIN"; check "department in use -> 409" 409

echo "== Identity and Mine filters"
req GET /auth/me "$LEAD"; check "/me returns the linked resource_id" 200 ".user.resource_id == $LEE"
req GET "/projects?owner=me" "$PM"; check "owner=me" 200 'any(.items[]; .code == "ACC-V1")'
req GET "/projects?team_lead=me" "$LEAD"; check "team_lead=me" 200 'any(.items[]; .code == "ACC-V1")'
req GET "/projects?owner=$(user_id pm)" "$VIEWER"; check "owner=<id> is refused -> 400" 400
req POST /deliverables "$PM" "{\"project_id\":$P,\"title\":\"Spec\",\"assignee_resource_id\":$LEE}"; D="$(body .id)"
req GET "/deliverables?assignee=me" "$LEAD"; check "assignee=me" 200 '[.items[].title] == ["Spec"]'
req GET "/deliverables?assignee=me" "$VIEWER"; check "assignee=me without a linked person -> empty" 200 '.items == []'

echo "== Assignee updates the status of their own deliverable"
make_user lee2 viewer; LEE2="$(login lee2)"
req PUT "/resources/$LEE" "$ADMIN" "{\"full_name\":\"Accept Lee\",\"email\":\"accept-lee@acme.test\",\"department_id\":$DEP,\"user_id\":$(user_id lee2)}"
check "relink the person to a viewer account" 200
req PUT "/deliverables/$D" "$LEE2" "{\"title\":\"Spec\",\"status\":\"done\",\"assignee_resource_id\":$LEE}"; check "assignee (a viewer) sets status -> 200" 200 '.status == "done"'
req PUT "/deliverables/$D" "$LEE2" "{\"title\":\"Renamed\",\"status\":\"done\",\"assignee_resource_id\":$LEE}"; check "assignee renames -> 403" 403 '.error.details.title'
req PUT "/deliverables/$D" "$VIEWER" "{\"title\":\"Spec\",\"status\":\"in_progress\",\"assignee_resource_id\":$LEE}"; check "someone else -> 403" 403
req GET "/audit?entity_type=deliverable&entity_id=$D" "$ADMIN"; check "status change audited" 200 'any(.items[]; .actor_name == "Accept lee2" and .new_values.status == "done")'

echo "== Dependency chain"
req POST /deliverables "$PM" "{\"project_id\":$P,\"title\":\"Build\"}"; B="$(body .id)"
req POST "/deliverables/$B/dependencies" "$PM" "{\"depends_on_id\":$D}"
req GET "/deliverables/chain?project_id=$P" "$VIEWER"; check "chain: Spec then Build under it" 200 '[.rows[] | [.depth, .id]] == [[0,'"$D"'],[1,'"$B"']]'

echo "== Own password"
req POST /auth/password "$VIEWER" '{"current_password":"wrong-one-x","new_password":"Brand-new-pass-2"}'; check "wrong current password -> 400 on the field" 400 '.error.details.current_password == "Incorrect password"'
req POST /auth/password "$VIEWER" "$(jq -nc --arg p "$PW" '{current_password:$p,new_password:"short"}')"; check "weak new password -> 400" 400 '.error.details.new_password'
req POST /auth/password "$VIEWER" "$(jq -nc --arg p "$PW" '{current_password:$p,new_password:"Brand-new-pass-2"}')"; check "password changed -> 204" 204
req POST /auth/login "" '{"email":"accept-viewer@acme.test","password":"Brand-new-pass-2"}'; check "signs in with the new password" 200

echo "== INR"
req POST /budget "$PM" "{\"project_id\":$P,\"category\":\"labor\",\"amount\":\"150000\",\"spent_on\":\"2030-01-01\"}"
req GET "/budget/summary?project_id=$P" "$VIEWER"; check "currency INR, over budget" 200 '.currency == "INR" and .over_budget == true'

finish
