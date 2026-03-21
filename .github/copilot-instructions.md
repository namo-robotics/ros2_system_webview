# Copilot Instructions for ros2_system_webview

## Architecture Overview

This is a ROS 2 system monitoring dashboard with a **dual-stack architecture**:

- **C++ backend** ([src/http_server.cpp](../src/http_server.cpp)): Single ROS 2 node serving system stats via HTTP REST API on port 2525. Reads directly from Linux `/proc` and `/sys` filesystems.
- **Next.js frontend** ([web/](../web/)): React 19 + TypeScript + Tailwind CSS app that polls the stats API and connects to rosbridge for ROS graph data.
- **rosbridge_server**: External ROS 2 package providing WebSocket bridge on port 9090 for browser↔ROS communication.

**Data flow pattern**:
- System stats (CPU, memory, network, USB) → HTTP polling every 1s to `/api/system`
- ROS data (logs, nodes, topics) → WebSocket subscription via roslib to rosbridge port 9090

## Build & Development

```bash
# Full build (frontend + ROS package)
./build.sh

# ROS-only rebuild (skip npm)
./build.sh --no-npm

# Development mode (hot-reload + all services)
colcon build --packages-select system_webview && source install/setup.bash
./dev.sh
# → UI: http://localhost:3000  API: http://localhost:2525  rosbridge: ws://localhost:9090

# Production launch
ros2 launch system_webview main.launch.py http_port:=2525
```

The compiled `web/out/` is committed to the repo so ROS build farm (no npm) works. Always run `./build.sh` after frontend changes.

## Frontend Patterns

**Hooks pattern** - All data fetching lives in `web/hooks/`:
- `useSystemStats.ts` → HTTP polling with history tracking for sparkline graphs
- `useRos.ts` → roslib WebSocket connection, `/rosout` subscription, node/topic discovery

**Component structure**:
- `SystemStatsPanel.tsx` → Resource cards with `Sparkline`, `GaugeBar`, `CoreBars` sub-components
- Panels receive data from hooks via props (lifted state in `page.tsx`)

**Conventions**:
- Use `"use client"` directive for all components (Next.js App Router)
- TypeScript interfaces in `web/types/` matching JSON from C++ backend exactly
- Tailwind for styling; dark theme with gray-800/900 backgrounds

## Backend Patterns

**System stats collection** in `http_server.cpp`:
- Parse `/proc/stat` → CPU usage delta calculation between samples
- Parse `/proc/meminfo` → Memory/swap stats
- Parse `/proc/net/dev` → Network interface bandwidth
- Parse `/sys/bus/usb/devices/` + `/sys/block/*/stat` → USB device I/O

**Adding new metrics**: Follow the pattern of existing structs (`read_*` function → struct → add to `build_system_json()`). Remember to:
1. Store previous sample in `stats_mtx`-protected state for delta calculations
2. Update TypeScript interface in `web/types/system.ts` to match

**Libraries**: Uses cpp-httplib (header-only) for HTTP serving, ament_index_cpp for finding installed resources.

## ROS 2 Conventions

- **CMakeLists.txt**: ament_cmake build type with `pkg_check_modules` for cpp-httplib
- **Launch files**: Python launch in `launch/`, uses `DeclareLaunchArgument` for configurable ports
- **Package resources**: Static web files installed to `share/${PROJECT_NAME}/web`

## Key Port Assignments

| Service | Port | Configurable |
|---------|------|--------------|
| HTTP server (UI + API) | 2525 | Yes (`http_port` launch arg) |
| rosbridge WebSocket | 9090 | No (hardcoded in frontend) |
| Next.js dev server | 3000 | N/A (dev only) |
