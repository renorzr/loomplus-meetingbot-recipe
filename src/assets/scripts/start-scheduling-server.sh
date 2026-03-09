#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${SCHEDULER_BOT_TOKEN:-}" ]; then
  echo "SCHEDULER_BOT_TOKEN is required" >&2
  exit 1
fi

exec node "$SCRIPT_DIR/scheduling-callback-server.mjs"
