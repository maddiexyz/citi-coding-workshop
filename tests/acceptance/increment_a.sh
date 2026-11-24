#!/usr/bin/env bash
# Increment A acceptance: deliverables, dependencies, team lead rules.
# Usage: tests/acceptance/increment_a.sh   (local stack from bin/start-dev.sh)
source "$(dirname "$0")/lib.sh"

make_user admin admin; make_user pm project_manager; make_user lead team_lead
make_user lead2 team_lead; make_user viewer viewer
ADMIN="$(login admin)"; PM="$(login pm)"; LEAD="$(login lead)"; LEAD2="$(login lead2)"; VIEWER="$(login viewer)"

echo "== Project with a team lead"
req POST /projects "$PM" "{\"code\":\"ACC-A1\",\"name\":\"Acceptance A\",\"team_lead_id\":$(user_id viewer)}"
check "team_lead_id must be a team lead -> 400" 400 '.error.details.team_lead_id'
req POST /projects "$PM" "{\"code\":\"ACC-A1\",\"name\":\"Acceptance A\",\"status\":\"active\",\"team_lead_id\":$(user_id lead)}"
check "PM creates project with team lead -> 201" 201 '.team_lead_name == "Accept lead"'
P="$(body .id)"
req GET "/users?role=team_lead&active=true" "$PM"; check "PM lists team leads for the picker" 200 'any(.items[]; .email == "accept-lead@acme.test")'
req GET /users "$VIEWER"; check "viewer cannot list users -> 403" 403

echo "== Deliverables"
for t in A B C; do req POST /deliverables "$PM" "{\"project_id\":$P,\"title\":\"$t\"}"; eval "$t=$(body .id)"; done
check "PM creates deliverables -> 201" 201
req POST "/deliverables/$A/dependencies" "$PM" "{\"depends_on_id\":$B}"; check "A depends on B -> 201" 201
req POST "/deliverables/$B/dependencies" "$PM" "{\"depends_on_id\":$C}"; check "B depends on C -> 201" 201
req POST "/deliverables/$C/dependencies" "$PM" "{\"depends_on_id\":$A}"
check "C depends on A -> 409 dependency_cycle with path" 409 '.error.code == "dependency_cycle" and .error.details.depends_on_id == "C → A → B → C"'
req GET "/deliverables?project_id=$P&blocked=true" "$VIEWER"; check "?blocked=true returns A and B" 200 '[.items[].title] | sort == ["A","B"]'
req GET "/deliverables/$B" "$VIEWER"; check "chain: B depends on C, needed by A" 200 '.predecessors[0].title == "C" and .successors[0].title == "A"'
req POST /deliverables "$VIEWER" "{\"project_id\":$P,\"title\":\"x\"}"; check "viewer POST -> 403" 403 '.error.code == "forbidden"'
req PUT "/deliverables/$A" "$LEAD" '{"title":"A","status":"in_progress"}'; check "assigned team lead PUT -> 200" 200 '.status == "in_progress"'
req DELETE "/deliverables/$A" "$LEAD"; check "assigned team lead DELETE -> 403" 403
req PUT "/deliverables/$A" "$LEAD2" '{"title":"A"}'; check "unassigned team lead PUT -> 403" 403
req POST /deliverables "$PM" '{"project_id":999999,"title":"x"}'; check "unknown project -> 400" 400 '.error.details.project_id'
req GET /deliverables/%C2%B2 "$VIEWER"; check "non-ASCII id -> 400 invalid_id" 400 '.error.code == "invalid_id"'
req PUT "/deliverables/$C" "$PM" '{"title":"C","status":"done"}'; check "finish C" 200 '.completed_at != null'
req GET "/deliverables/$B" "$VIEWER"; check "B no longer blocked" 200 '.is_blocked == false'
req GET "/projects/$P" "$VIEWER"; check "project progress 1 / 3" 200 '.deliverables_done == 1 and .deliverables_total == 3'
req DELETE "/deliverables/$A" "$ADMIN"; check "admin deletes A -> 204" 204

finish
