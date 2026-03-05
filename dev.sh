#!/usr/bin/env bash
set -e

# Load nvm if available
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$SCRIPT_DIR/web"

# Source the colcon workspace so ros2 run can find the package
if [ -f "$SCRIPT_DIR/install/setup.bash" ]; then
  echo "▶ Sourcing install/setup.bash"
  source "$SCRIPT_DIR/install/setup.bash"
else
  echo "⚠  install/setup.bash not found — run 'colcon build' first"
  exit 1
fi

cleanup() {
  echo ""
  echo "Shutting down…"
  kill 0 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

# 1) rosbridge websocket server (needs a sourced ROS 2 workspace)
echo "▶ Starting rosbridge_websocket on ws://localhost:9090"
ros2 launch rosbridge_server rosbridge_websocket_launch.xml &

# 2) Next.js dev server
echo "▶ Starting Next.js dev server on http://localhost:3000"
cd "$WEB_DIR"
npm run dev &

# 3) C++ HTTP server for /api/system (needs a colcon build + source)
echo "▶ Starting http_server on http://localhost:2525 (system stats API)"
ros2 run system_webview http_server &

wait
