#!/usr/bin/env bash
# Increment B acceptance: resources, allocations, over-allocation warnings, assignees.
# Usage: tests/acceptance/increment_b.sh   (local stack from bin/start-dev.sh)
source "$(dirname "$0")/lib.sh"

make_user admin admin; make_user pm project_manager; make_user lead team_lead; make_user viewer viewer
ADMIN="$(login admin)"; PM="$(login pm)"; LEAD="$(login lead)"; VIEWER="$(login viewer)"
WEEK=2030-01-07   # a Monday

echo "== Resources"
req POST /resources "$PM" '{"full_name":"Accept Pat"}'; check "PM cannot create a resource -> 403" 403
req POST /resources "$ADMIN" '{"full_name":"Accept Pat","weekly_hours":61}'; check "weekly_hours over 60 -> 400" 400 '.error.details.weekly_hours'
req POST /resources "$ADMIN" '{"full_name":"Accept Pat","weekly_hours":40,"department":"Data"}'; check "admin creates resource -> 201" 201 '.weekly_hours == "40.00"'
PAT="$(body .id)"

echo "== Allocations"
req POST /projects "$PM" '{"code":"ACC-B1","name":"Acceptance B1","status":"active","start_date":"2030-01-01","end_date":"2030-06-30"}'; P1="$(body .id)"
req POST /projects "$ADMIN" '{"code":"ACC-B2","name":"Acceptance B2","status":"active"}'; P2="$(body .id)"
alloc() { req POST /allocations "$1" "{\"project_id\":$2,\"resource_id\":$PAT,\"hours_per_week\":$3,\"start_date\":\"$4\",\"end_date\":\"$5\"}"; }
alloc "$PM" "$P1" 30 2030-01-07 2030-01-13; check "30 h on P1 -> 201, no warnings" 201 '.warnings == []'
alloc "$ADMIN" "$P2" 20 2030-01-07 2030-01-20; check "20 h on P2 same week -> 201 with over_by 10" 201 '.warnings == [{"week_start":"2030-01-07","total_hours":"50.00","weekly_hours":"40.00","over_by":"10.00"}]'
alloc "$PM" "$P1" 5 2030-01-10 2030-01-20; check "overlapping allocation on same project -> 409" 409 '.error.code == "allocation_overlap"'
alloc "$PM" "$P1" 5 2029-12-30 2030-01-03; check "starts before the project -> 400" 400 '.error.details.start_date'
alloc "$PM" "$P1" 81 2030-02-04 2030-02-10; check "hours_per_week over 80 -> 400" 400 '.error.details.hours_per_week'
alloc "$LEAD" "$P1" 5 2030-02-04 2030-02-10; check "team lead cannot allocate -> 403" 403
req GET "/resources?over_allocated=true&week=$WEEK" "$VIEWER"; check "?over_allocated=true lists Pat" 200 'any(.items[]; .full_name == "Accept Pat")'
req GET "/resources/$PAT/load?from=$WEEK&to=2030-01-14" "$VIEWER"; check "weekly load 50 then 20" 200 '[.weeks[].total_hours] == ["50.00","20.00"]'
req GET "/allocations?project_id=$P1" "$LEAD"; check "team lead reads allocations" 200 '(.items | length) == 1'
req DELETE "/resources/$PAT" "$ADMIN"; check "resource with allocations cannot be deleted -> 409" 409

echo "== Deliverable assignee"
req POST /deliverables "$PM" "{\"project_id\":$P1,\"title\":\"Spec\",\"assignee_resource_id\":$PAT}"; check "assign deliverable -> 201" 201 '.assignee_name == "Accept Pat"'
req GET "/deliverables?assignee=$PAT" "$VIEWER"; check "filter deliverables by assignee" 200 '[.items[].title] == ["Spec"]'

finish
