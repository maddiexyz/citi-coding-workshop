#!/usr/bin/env bash
# Increment C acceptance: budget (planned vs actual), audit log, budget-aware project delete.
# Usage: tests/acceptance/increment_c.sh   (local stack from bin/start-dev.sh)
source "$(dirname "$0")/lib.sh"

make_user admin admin; make_user pm project_manager; make_user lead team_lead; make_user viewer viewer
ADMIN="$(login admin)"; PM="$(login pm)"; LEAD="$(login lead)"; VIEWER="$(login viewer)"

echo "== Budget"
req POST /projects "$PM" '{"code":"ACC-C1","name":"Acceptance C","status":"active","budget_planned":"1000"}'
check "PM creates project with planned budget" 201 '.budget_planned == "1000.00" and .burn_pct == "0.0"'
P="$(body .id)"
spend() { req POST /budget "$1" "{\"project_id\":$P,\"category\":\"$2\",\"amount\":\"$3\",\"spent_on\":\"2030-01-15\"}"; }
spend "$PM" labor 600; check "PM records 600 labor -> 201" 201 '.amount == "600.00"'
E1="$(body .id)"
spend "$PM" software 500; check "PM records 500 software -> 201" 201
spend "$PM" labor -1; check "negative amount -> 400" 400 '.error.details.amount'
spend "$LEAD" labor 5; check "team lead cannot record spend -> 403" 403
req GET "/budget/summary?project_id=$P" "$VIEWER"
check "viewer sees summary: burn 110, over budget, remaining -100" 200 '.burn_pct == "110.0" and .over_budget == true and .remaining == "-100.00"'
req GET "/budget?project_id=$P" "$VIEWER"; check "viewer cannot see line items -> 403" 403
req GET "/budget?project_id=$P&category=software" "$PM"; check "PM filters entries by category" 200 '[.items[].amount] == ["500.00"]'
req DELETE "/budget/$E1" "$PM"; check "PM cannot delete spend -> 403" 403
req POST /projects "$PM" '{"code":"ACC-C0","name":"No budget"}'; P0="$(body .id)"
req GET "/budget/summary?project_id=$P0" "$VIEWER"; check "no budget set -> burn null, not a division by zero" 200 '.budget_set == false and .burn_pct == null'

echo "== Audit"
req PUT "/projects/$P" "$PM" '{"code":"ACC-C1","name":"Acceptance C","status":"active","budget_planned":"1500"}'; check "PM raises planned budget" 200 '.over_budget == false'
req GET "/audit?project_id=$P&entity_type=project" "$PM"
check "audit shows budget_planned 1000 -> 1500" 200 '.items[0].old_values == {"budget_planned":"1000.00"} and .items[0].new_values == {"budget_planned":"1500.00"}'
req GET "/audit?project_id=$P" "$VIEWER"; check "viewer cannot read audit -> 403" 403
req GET "/audit?project_id=$P&entity_type=budget_entry" "$ADMIN"; check "admin sees 2 spend entries recorded" 200 '(.items | length) == 2'

echo "== Deleting a project with spend"
req DELETE "/projects/$P" "$PM"; check "owning PM cannot delete a project with spend -> 403" 403 '.error.message | test("cancelled")'
req DELETE "/projects/$P0" "$PM"; check "owning PM deletes a project without spend -> 204" 204
req DELETE "/projects/$P" "$ADMIN"; check "admin deletes the project with spend -> 204" 204
req GET "/audit?entity_type=project&entity_id=$P" "$ADMIN"
check "delete kept a snapshot with the spend entries" 200 '.items[0].action == "delete" and (.items[0].details.budget_entries | length) == 2'

finish
