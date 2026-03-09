#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$WORKSPACE_DIR/chat-logs"

DATE="$(date -u +%Y-%m-%d)"
TIME="$(date -u +%H:%M:%S)"
LOG_FILE="$LOG_DIR/$DATE.log"

SENDER="$1"
SENDER_ID="$2"
shift 2
MSG="$*"

mkdir -p "$LOG_DIR"
printf '[%s] %s (%s): %s\n' "$TIME" "$SENDER" "$SENDER_ID" "$MSG" >> "$LOG_FILE"
