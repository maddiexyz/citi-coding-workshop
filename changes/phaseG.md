# Phase G (v2.1): AI project briefing

Branch `v2.1`, from `main` after `v2.0`. The organizers asked for AI
features; the rubric lists "Intelligent features with AI integration".

## What changed

1. **Briefing facts** (`backend/_common/briefing.py`, pure): the facts a
   briefing may use, each with a stable id: the project, the forecast, the
   critical path, SPI, the budget, each risk reason and up to 25 open
   deliverables (critical ones first). No names or emails. The overall status
   (on track, at risk, late, complete) is decided by the app, not the model.
2. **Signed facts endpoint.** `POST /api/projects/{id}/briefing-facts` in the
   existing projects service: admin, project managers and team leads; 20 per
   user per hour (migration `010_ai_usage.sql`); returns the facts and an HMAC
   token bound to the user for two minutes.
3. **The `ai` service** (`backend/ai/`, `POST /api/ai/briefing`): checks the
   access token and the HMAC, asks `claude-haiku-5-5` for JSON against a
   schema, and keeps only points and actions that cite known facts.
4. **Infra.** The `ai` Lambda runs outside the VPC (`no_vpc_functions` in
   `infra/locals.tf`) and gets no database settings; `ai_enabled` (default
   false), `ai_model_id` and a sensitive `anthropic_api_key` are its only new
   settings. No IAM, VPC, Aurora or CloudFront changes.
5. **UI.** *AI briefing* card under the forecast on the project Overview:
   generate on request, status chip and headline, points and next steps with
   source chips (the tooltip shows the exact fact), *Copy*, and messages for
   each failure. Hidden for viewers.
6. **README:** using the API directly with curl (earlier v2.1 commit) and the
   AI briefing section.

## Decisions made on your behalf
- **Why two Lambdas.** The pre-flight showed the organizers' Lambda role has
  no Bedrock permission and the VPC has no NAT gateway or Bedrock endpoint.
  A Lambda outside the VPC has internet access but no database, so the
  projects service (inside) signs the facts and the `ai` Lambda (outside)
  only talks to the model.
- **Anthropic API, Haiku 5.5.** You offered a Gemini or an Anthropic key; the
  model call is in one module (`backend/ai/function.py`), so changing provider
  touches only that file.
- **The model doesn't choose the status chip**, and a point without a known
  source is dropped rather than shown.
- **Viewers can't generate briefings**, to keep spend down; they still see
  the forecast it is built from.
- **No database check in the `ai` Lambda.** It trusts the access token's
  signature and expiry; the facts token, issued after the projects service's
  full check, is what makes a call possible.
- **The key lives in the Lambda's environment** (your choice); it is also in
  the Terraform state.

## Tests
- `test_briefing.py` (21): facts for each project shape, no personal data,
  clipping, signing and verification, the reply check.
- `test_briefing_api.py` (20): the facts endpoint (shape, roles, 404, 405,
  the hourly limit, usage row) and the ai service with a fake model (grounding,
  model setting, 400/401/403/405, AI off, refusal, `max_tokens`, unusable
  replies, SDK errors, client timeouts).
- `BriefingCard.test.jsx` and `briefingApi.test.js`: states, sources, copy,
  every error message, viewers, the permission mirror.
- Cypress `14-briefing`: real signed facts from the local stack, the model
  call stubbed, axe in light and dark mode, viewer refused.
