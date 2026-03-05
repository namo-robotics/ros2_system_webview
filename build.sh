#!/usr/bin/env bash
set -e

# ── Full build: frontend + colcon ─────────────────────────────────────────────
# Usage:
#   ./build.sh            Build frontend and ROS package
#   ./build.sh --no-npm   Skip frontend, only rebuild the ROS package
#   ./build.sh --clean    Clean build/install/log dirs before building

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load nvm if available (for npm)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

BUILD_FRONTEND=true
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --no-npm)   BUILD_FRONTEND=false ;;
    --clean)    CLEAN=true ;;
    -h|--help)
      echo "Usage: ./build.sh [--no-npm] [--clean]"
      echo "  --no-npm   Skip the frontend build (use existing web/out/)"
      echo "  --clean    Remove build/install/log before building"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (try --help)"
      exit 1
      ;;
  esac
done

# ── Source ROS 2 underlay ──────────────────────────────────────────────────────
if [ -z "$AMENT_PREFIX_PATH" ]; then
  if [ -f "/opt/ros/${ROS_DISTRO}/setup.bash" ]; then
    echo "▶ Sourcing /opt/ros/${ROS_DISTRO}/setup.bash"
    source "/opt/ros/${ROS_DISTRO}/setup.bash"
  else
    echo "⚠  ROS 2 environment not found. Source your ROS setup.bash first."
    exit 1
  fi
fi

# ── Clean ──────────────────────────────────────────────────────────────────────
if $CLEAN; then
  echo "▶ Cleaning build/ install/ log/"
  rm -rf "$SCRIPT_DIR/build" "$SCRIPT_DIR/install" "$SCRIPT_DIR/log"
fi

# ── Frontend build ─────────────────────────────────────────────────────────────
if $BUILD_FRONTEND; then
  echo "▶ Building Next.js frontend"
  cd "$SCRIPT_DIR/web"
  npm install
  npm run build
  cd "$SCRIPT_DIR"
  echo "✔ Frontend built → web/out/"
else
  if [ ! -d "$SCRIPT_DIR/web/out" ]; then
    echo "⚠  web/out/ not found and --no-npm was set. Build the frontend first."
    exit 1
  fi
  echo "▶ Skipping frontend build (using existing web/out/)"
fi

# ── Colcon build ───────────────────────────────────────────────────────────────
echo "▶ Building ROS package"
cd "$SCRIPT_DIR"
colcon build --packages-select system_webview --symlink-install

echo ""
echo "✔ Build complete. To run:"
echo "  source install/setup.bash"
echo "  ros2 launch system_webview main.launch.py"
