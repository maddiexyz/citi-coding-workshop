#!/usr/bin/env bash
# Script: Sync Shared Backend Code
# Purpose: Copy backend/_common into every Python service as common/
# Usage: ./sync-common.sh
#
# Each Lambda package (and each LocalStack hot-reload mount) contains only
# its own service folder, so shared code has to be copied in. The copies are
# gitignored; always edit backend/_common.

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Copy backend/_common into each backend/<service>/common (Python services only)"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/../backend" > /dev/null 2>&1 || exit 1; pwd -P)"

shopt -s nullglob
for func in "$BACKEND_DIR"/*/function.py; do
    svc_dir="$(dirname "$func")"
    case "$(basename "$svc_dir")" in _*|.*) continue ;; esac
    rm -rf "$svc_dir/common"
    mkdir -p "$svc_dir/common"
    cp "$BACKEND_DIR"/_common/*.py "$svc_dir/common/"
    echo "  Synced shared code into $(basename "$svc_dir")/common"
done
