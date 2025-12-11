#!/bin/bash
# Deploy script, connect monitor, then start - all in one clean flow

set -e

SCRIPT_DIR="$(dirname "$0")"

# Load .env if it exists (strip inline comments)
if [ -f "$SCRIPT_DIR/../../.env" ]; then
  set -a
  source <(grep -v '^#' "$SCRIPT_DIR/../../.env" | sed 's/ *#.*//')
  set +a
fi

# Kill any existing monitor processes (Shelly only allows 1 debug stream)
if [ "${KILL_EXISTING_MONITORS:-true}" != "false" ]; then
  EXISTING=$(pgrep -f "monitor.ts" 2>/dev/null || true)
  if [ -n "$EXISTING" ]; then
    echo "⚠ Killing existing monitors: $EXISTING"
    pkill -f "monitor.ts" 2>/dev/null || true
    sleep 1
  fi
fi

# Build first (concat + minify)
npm run build --silent

# Deploy without starting (quiet mode suppresses redundant messages)
ts-node --project "$SCRIPT_DIR/../tsconfig.json" "$SCRIPT_DIR/deploy.ts" --skip-build --no-start --quiet

# Give websocket time to be ready
sleep 1

# Start monitor in background
ts-node --project "$SCRIPT_DIR/../tsconfig.json" "$SCRIPT_DIR/monitor.ts" --quiet -f "^(?!.*(shelly_|shos_)).*$" &
MONITOR_PID=$!

# Give monitor time to connect
sleep 2

# Start the script (quiet mode)
ts-node --project "$SCRIPT_DIR/../tsconfig.json" "$SCRIPT_DIR/deploy.ts" --start-only --quiet

# Bring monitor to foreground
wait $MONITOR_PID
