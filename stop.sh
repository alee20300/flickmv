#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

stop_pid() {
  local pid_file="$1"
  if [ -f "$pid_file" ]; then
    local pid
    pid="$(cat "$pid_file" | tr -d '[:space:]')"
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid"
      echo "Stopped $(basename "$pid_file") (pid $pid)"
    fi
    rm -f "$pid_file"
  fi
}

stop_pid ".pids/dashboard.pid"
stop_pid ".pids/telegram-bot.pid"

echo "Done."
