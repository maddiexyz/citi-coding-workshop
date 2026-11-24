#!/usr/bin/env bash
# Script: Cloud Database Migrations
# Purpose: Run the private migrations Lambda (infra/migrate.tf) and seed the admin user
# Usage: ./migrate-cloud.sh [aws|local]
#
# Aurora is only reachable inside the VPC, so instead of psql (bin/migrate.sh)
# this invokes a Lambda that runs there. Called by deploy-backend.sh after
# terraform apply; safe to run again at any time.
#
# The admin password never leaves this machine: it is bcrypt-hashed locally
# and only the hash is sent in the invoke payload. Nothing is stored in
# Terraform state or Lambda environment variables.

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [aws|local]"
    echo "Apply database migrations through the migrations Lambda, then seed the admin user"
    echo ""
    echo "Arguments:"
    echo "  aws             Current AWS credentials (default)"
    echo "  local           LocalStack"
    echo ""
    echo "Environment:"
    echo "  ADMIN_EMAIL     Email of the admin user to seed (seed is skipped if unset)"
    echo "  ADMIN_PASSWORD  Password of the admin user to seed (hashed locally)"
    echo "  ADMIN_NAME      Display name of the admin user (default: Administrator)"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." > /dev/null 2>&1 || exit 1; pwd -P)"

if [ "${1:-aws}" = "local" ]; then
    # Same settings as deploy-backend.sh local (the S3 one is for the Terraform state)
    export AWS_ENDPOINT_URL="http://localhost.localstack.cloud:4566"
    export AWS_ENDPOINT_URL_S3="http://s3.localhost.localstack.cloud:4566"
    export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_REGION=us-east-1
    unset AWS_SESSION_TOKEN
fi

FUNCTION_NAME="$(terraform -chdir="$PROJECT_ROOT/infra" output -raw migrate_function_name 2>/dev/null || true)"
if [ -z "$FUNCTION_NAME" ]; then
    echo "  ✗ No migrate_function_name output; run terraform apply (deploy-backend.sh) first"
    exit 1
fi

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
umask 077
PAYLOAD="$WORK_DIR/payload.json"

# Python with bcrypt: the backend test venv if present, else a throwaway venv
find_bcrypt_python() {
    for py in "$PROJECT_ROOT/backend/.venv/bin/python" python3; do
        if "$py" -c "import bcrypt" > /dev/null 2>&1; then
            echo "$py"
            return
        fi
    done
    python3 -m venv "$WORK_DIR/venv" > /dev/null \
        && "$WORK_DIR/venv/bin/pip" install --quiet bcrypt==5.0.0 > /dev/null \
        && echo "$WORK_DIR/venv/bin/python"
}

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
    PYTHON="$(find_bcrypt_python)"
    [ -n "$PYTHON" ] || { echo "  ✗ Could not find or install bcrypt to hash the admin password"; exit 1; }
    # Values reach Python through the environment, not the command line (visible in ps)
    ADMIN_NAME="${ADMIN_NAME:-Administrator}" "$PYTHON" -c '
import json, os, sys, bcrypt
hashed = bcrypt.hashpw(os.environ["ADMIN_PASSWORD"].encode(), bcrypt.gensalt(12)).decode()
json.dump({"admin": {"email": os.environ["ADMIN_EMAIL"], "password_hash": hashed,
                     "full_name": os.environ["ADMIN_NAME"]}}, sys.stdout)
' > "$PAYLOAD"
else
    echo "  ⚠ ADMIN_EMAIL / ADMIN_PASSWORD not set, skipping admin seed"
    echo '{}' > "$PAYLOAD"
fi

echo "  Running migrations Lambda $FUNCTION_NAME..."
FUNCTION_ERROR="$(aws lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 150 \
    --payload "fileb://$PAYLOAD" \
    --query FunctionError --output text \
    "$WORK_DIR/result.json")"

if [ "$FUNCTION_ERROR" != "None" ] && [ -n "$FUNCTION_ERROR" ]; then
    echo "  ✗ Migrations failed: $(cat "$WORK_DIR/result.json")"
    echo "    Logs: aws logs tail /aws/lambda/$FUNCTION_NAME --since 10m"
    exit 1
fi
echo "  ✓ $(cat "$WORK_DIR/result.json")"
