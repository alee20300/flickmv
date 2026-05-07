#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

PORT="${PORT:-5002}"
RUN_TELEGRAM="${RUN_TELEGRAM:-0}"
NVM_BIN="/home/alee20300/.nvm/versions/node/v24.14.0/bin"
export PATH="$NVM_BIN:$PATH"
NPM_BIN="$(command -v npm || true)"

if [ -z "$NPM_BIN" ]; then
  NPM_BIN="$NVM_BIN/npm"
fi

mkdir -p .pids

echo "MovieFlix launcher"
echo "Directory: $APP_DIR"
echo "Port: $PORT"

if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP -sTCP:LISTEN -n -P | grep -q ":${PORT}"; then
    echo "Port ${PORT} in use. Stopping old app process..."
  fi
fi

pkill -f "/home/alee20300/movieflixdash/server/app.js" || true

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  "$NPM_BIN" install
fi

echo "Building frontend (esbuild)..."
"$NPM_BIN" run build

echo "Starting dashboard backend..."
nohup env PORT="$PORT" "$NPM_BIN" start > /tmp/movieflix-app.log 2>&1 </dev/null &
echo $! > .pids/dashboard.pid

echo "Dashboard started (log: /tmp/movieflix-app.log)"

if [ "$RUN_TELEGRAM" = "1" ]; then
  echo "Starting Telegram bot..."
  nohup "$NPM_BIN" run telegram:bot > /tmp/telegram-bot.log 2>&1 </dev/null &
  echo $! > .pids/telegram-bot.pid
  echo "Telegram bot started (log: /tmp/telegram-bot.log)"
fi

sleep 2
echo "LOCAL: $(curl -sI http://127.0.0.1:${PORT}/ | head -n 1)"
