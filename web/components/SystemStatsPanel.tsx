"use client";

import type { SystemStats } from "@/types/system";

// Per-interface bandwidth history type
interface BandwidthHistory {
  rx: number[];
  tx: number[];
}

// ── Tiny sparkline (pure SVG) ────────────────────────────────────────────────
function Sparkline({
  data,
  color,
  height = 40,
  width = 200,
  maxValue,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
  maxValue?: number;
}) {
  if (data.length < 2) return null;

  const max = maxValue ?? Math.max(...data, 1);
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
      />
      {/* Filled area under the curve */}
      <polygon
        fill={color}
        fillOpacity="0.1"
        points={`0,${height} ${points} ${(data.length - 1) * step},${height}`}
      />
    </svg>
  );
}

// ── Dual sparkline for RX/TX ─────────────────────────────────────────────────
function DualSparkline({
  rxData,
  txData,
  height = 40,
  width = 200,
}: {
  rxData: number[];
  txData: number[];
  height?: number;
  width?: number;
}) {
  if (rxData.length < 2 && txData.length < 2) return null;

  const allData = [...rxData, ...txData];
  const max = Math.max(...allData, 1);
  const step = width / (Math.max(rxData.length, txData.length) - 1);

  const toPoints = (data: number[]) =>
    data.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ height }}
      preserveAspectRatio="none"
    >
      {/* RX (download) in green */}
      {rxData.length >= 2 && (
        <>
          <polyline fill="none" stroke="#22c55e" strokeWidth="1.5" points={toPoints(rxData)} />
          <polygon
            fill="#22c55e"
            fillOpacity="0.1"
            points={`0,${height} ${toPoints(rxData)} ${(rxData.length - 1) * step},${height}`}
          />
        </>
      )}
      {/* TX (upload) in blue */}
      {txData.length >= 2 && (
        <>
          <polyline fill="none" stroke="#3b82f6" strokeWidth="1.5" points={toPoints(txData)} />
          <polygon
            fill="#3b82f6"
            fillOpacity="0.1"
            points={`0,${height} ${toPoints(txData)} ${(txData.length - 1) * step},${height}`}
          />
        </>
      )}
    </svg>
  );
}

// ── Gauge bar ────────────────────────────────────────────────────────────────
function GaugeBar({
  percent,
  color,
  label,
  detail,
}: {
  percent: number;
  color: string;
  label: string;
  detail?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-gray-300">{label}</span>
        <span className="font-mono text-gray-400">
          {clamped.toFixed(1)}%
          {detail && <span className="ml-1.5 text-gray-600">{detail}</span>}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Per-core mini bars ───────────────────────────────────────────────────────
function CoreBars({ cores }: { cores: SystemStats["cores"] }) {
  return (
    <div className="grid grid-cols-4 gap-x-4 gap-y-1 sm:grid-cols-8">
      {cores.map((core) => {
        const clamped = Math.max(0, Math.min(100, core.percent));
        const hue = 200 - clamped * 1.2; // blue → red as load increases
        return (
          <div key={core.name} className="flex flex-col items-center gap-0.5">
            <div className="h-10 w-full overflow-hidden rounded bg-gray-800 relative">
              <div
                className="absolute bottom-0 w-full rounded transition-all duration-500"
                style={{
                  height: `${clamped}%`,
                  backgroundColor: `hsl(${hue}, 80%, 55%)`,
                }}
              />
            </div>
            <span className="text-[10px] text-gray-600 font-mono">
              {core.name.replace("cpu", "")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Format MB helper ─────────────────────────────────────────────────────────
function fmtMB(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

// ── Format bytes/sec helper ──────────────────────────────────────────────────
function fmtBps(bps: number): string {
  if (bps >= 1024 * 1024 * 1024) return `${(bps / (1024 * 1024 * 1024)).toFixed(1)} GB/s`;
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${bps.toFixed(0)} B/s`;
}

// ── Format total bytes helper ────────────────────────────────────────────────
function fmtBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ── Network interface type detection ─────────────────────────────────────────
interface InterfaceInfo {
  type: string;
  icon: string;
  color: string;
}

function getInterfaceInfo(name: string): InterfaceInfo {
  // Common interface naming patterns
  if (name.startsWith("wl") || name.startsWith("wlan")) {
    return { type: "Wi-Fi", icon: "📶", color: "text-purple-400" };
  }
  if (name.startsWith("eth") || name.startsWith("en")) {
    return { type: "Ethernet", icon: "🔌", color: "text-blue-400" };
  }
  if (name.startsWith("docker") || name.startsWith("br-")) {
    return { type: "Docker", icon: "🐳", color: "text-cyan-400" };
  }
  if (name.startsWith("veth")) {
    return { type: "Container", icon: "📦", color: "text-cyan-400" };
  }
  if (name.startsWith("wg") || name.startsWith("tun") || name.startsWith("tap")) {
    return { type: "VPN", icon: "🔒", color: "text-green-400" };
  }
  if (name.startsWith("virbr") || name.startsWith("vnet")) {
    return { type: "Virtual", icon: "💻", color: "text-yellow-400" };
  }
  if (name === "lo") {
    return { type: "Loopback", icon: "🔄", color: "text-gray-400" };
  }
  return { type: "Network", icon: "🌐", color: "text-gray-400" };
}

// ── USB speed description ────────────────────────────────────────────────────
function getUsbSpeedInfo(speedMbps: number): { label: string; generation: string } {
  if (speedMbps >= 10000) return { label: "10 Gbps", generation: "USB 3.2 Gen 2x2" };
  if (speedMbps >= 5000) return { label: "5 Gbps", generation: "USB 3.0" };
  if (speedMbps >= 480) return { label: "480 Mbps", generation: "USB 2.0 Hi-Speed" };
  if (speedMbps >= 12) return { label: "12 Mbps", generation: "USB 1.1 Full-Speed" };
  return { label: `${speedMbps} Mbps`, generation: "USB 1.0" };
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function SystemStatsPanel({
  stats,
  cpuHistory,
  memHistory,
  netHistory,
  usbHistory,
  error,
}: {
  stats: SystemStats | null;
  cpuHistory: number[];
  memHistory: number[];
  netHistory: Record<string, BandwidthHistory>;
  usbHistory: Record<string, BandwidthHistory>;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-red-900/40 bg-red-950/30 px-4 py-3 text-sm text-red-400">
        System stats unavailable: {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-36 rounded-lg bg-gray-900" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* CPU card */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">CPU</h3>
          <span className="text-xs text-gray-500 font-mono">
            load {stats.load_avg.one} / {stats.load_avg.five} / {stats.load_avg.fifteen}
          </span>
        </div>
        <GaugeBar
          percent={stats.cpu_percent}
          color="#3b82f6"
          label="Overall"
        />
        <Sparkline data={cpuHistory} color="#3b82f6" maxValue={100} />
        <CoreBars cores={stats.cores} />
      </div>

      {/* Memory card */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Memory</h3>
        <GaugeBar
          percent={stats.memory.percent}
          color="#a855f7"
          label="RAM"
          detail={`${fmtMB(stats.memory.used_mb)} / ${fmtMB(stats.memory.total_mb)}`}
        />
        <Sparkline data={memHistory} color="#a855f7" maxValue={100} />
        <div className="flex gap-4 text-[11px] text-gray-500 font-mono">
          <span>Buffers: {fmtMB(stats.memory.buffers_mb)}</span>
          <span>Cached: {fmtMB(stats.memory.cached_mb)}</span>
        </div>
      </div>

      {/* Swap card */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-300">Swap</h3>
        {stats.swap.total_mb > 0 ? (
          <>
            <GaugeBar
              percent={stats.swap.percent}
              color="#f59e0b"
              label="Usage"
              detail={`${fmtMB(stats.swap.used_mb)} / ${fmtMB(stats.swap.total_mb)}`}
            />
          </>
        ) : (
          <p className="text-xs text-gray-600 italic">No swap configured</p>
        )}
        <div className="mt-auto space-y-1">
          <h4 className="text-xs font-medium text-gray-400">Load Average</h4>
          <div className="flex gap-4 text-xs font-mono text-gray-300">
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold">{stats.load_avg.one}</span>
              <span className="text-[10px] text-gray-600">1m</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold">{stats.load_avg.five}</span>
              <span className="text-[10px] text-gray-600">5m</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-semibold">{stats.load_avg.fifteen}</span>
              <span className="text-[10px] text-gray-600">15m</span>
            </div>
          </div>
        </div>
      </div>

      {/* Network card */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-300">Network Interfaces</h3>
          <div className="flex gap-3 text-[10px]">
            <span className="text-green-500">● Download</span>
            <span className="text-blue-500">● Upload</span>
          </div>
        </div>
        {stats.network && stats.network.length > 0 ? (
          <div className="space-y-4">
            {stats.network.map((iface) => {
              const history = netHistory[iface.name] || { rx: [], tx: [] };
              const ifInfo = getInterfaceInfo(iface.name);
              // Calculate bandwidth utilization if link speed is known
              const linkSpeedBytesPerSec = iface.speed_mbps > 0 ? (iface.speed_mbps * 1000000) / 8 : 0;
              const totalBps = iface.rx_bytes_per_sec + iface.tx_bytes_per_sec;
              const utilizationPercent = linkSpeedBytesPerSec > 0 ? Math.min(100, (totalBps / linkSpeedBytesPerSec) * 100) : -1;
              
              return (
                <div key={iface.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{ifInfo.icon}</span>
                      <div>
                        <span className={`text-xs font-medium ${ifInfo.color}`}>{ifInfo.type}</span>
                        <span className="text-[10px] text-gray-600 ml-1.5 font-mono">({iface.name})</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-right">
                      {iface.speed_mbps > 0 ? (
                        <span className="text-gray-400">
                          Link: {iface.speed_mbps >= 1000 ? `${iface.speed_mbps / 1000} Gbps` : `${iface.speed_mbps} Mbps`}
                        </span>
                      ) : (
                        <span className="text-gray-600 italic">Speed unknown</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Bandwidth utilization bar */}
                  {utilizationPercent >= 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-gray-500">Bandwidth utilization</span>
                        <span className="text-gray-400 font-mono">{utilizationPercent.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${utilizationPercent}%`,
                            backgroundColor: utilizationPercent > 80 ? '#ef4444' : utilizationPercent > 50 ? '#f59e0b' : '#22c55e'
                          }}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="flex justify-between text-xs font-mono bg-gray-800/50 rounded px-2 py-1">
                    <span className="text-green-500">↓ {fmtBps(iface.rx_bytes_per_sec)}</span>
                    <span className="text-gray-500 text-[10px]">
                      {linkSpeedBytesPerSec > 0 ? `of ${fmtBps(linkSpeedBytesPerSec)}` : 'Current'}
                    </span>
                    <span className="text-blue-500">↑ {fmtBps(iface.tx_bytes_per_sec)}</span>
                  </div>
                  <DualSparkline rxData={history.rx} txData={history.tx} height={30} />
                  <div className="text-[10px] text-gray-600">
                    Total transferred: ↓ {fmtBytes(iface.rx_bytes)} &nbsp; ↑ {fmtBytes(iface.tx_bytes)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 italic">No network interfaces detected</p>
        )}
      </div>

      {/* USB Buses & Devices card */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 space-y-3 lg:col-span-2">
        <h3 className="text-sm font-semibold text-gray-300">USB Controllers & Devices</h3>
        {stats.usb_buses && stats.usb_buses.length > 0 ? (
          <div className="space-y-4">
            {stats.usb_buses.map((bus) => {
              const busDevices = stats.usb.filter((d) => d.bus_num === bus.bus_num);
              const busBytesPerSec = (bus.speed_mbps * 1000000) / 8;
              const claimedPercent = bus.speed_mbps > 0 ? (bus.claimed_bw_mbps / bus.speed_mbps) * 100 : 0;
              const isOversubscribed = claimedPercent > 100;
              const isNearCapacity = claimedPercent > 70 && !isOversubscribed;
              
              // Real-time usage from usbmon (if available)
              const actualUsagePercent = bus.usbmon_available && busBytesPerSec > 0
                ? Math.min(100, (bus.actual_bytes_per_sec / busBytesPerSec) * 100)
                : -1;
              const isActualHigh = actualUsagePercent > 70;
              const isActualCritical = actualUsagePercent > 90;
              
              return (
                <div key={bus.bus_num} className="space-y-2">
                  {/* Bus header */}
                  <div className="flex items-center justify-between bg-gray-800/50 rounded px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🔌</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-300">
                            USB {bus.version} Bus {bus.bus_num}
                          </span>
                          {bus.usbmon_available && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-900/50 text-green-400">
                              📊 Live
                            </span>
                          )}
                          {isActualCritical && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 animate-pulse">
                              🔥 Saturated
                            </span>
                          )}
                          {isOversubscribed && !bus.usbmon_available && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 animate-pulse">
                              ⚠️ Oversubscribed
                            </span>
                          )}
                          {isNearCapacity && !bus.usbmon_available && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/50 text-yellow-400">
                              ⚡ High Load
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-500">{bus.controller}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">
                        Capacity: {fmtBps(busBytesPerSec)}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {bus.device_count} device{bus.device_count !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  
                  {/* Real-time bandwidth usage (from usbmon) */}
                  {bus.usbmon_available && (
                    <div className="px-2">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-green-400">📊 Real-time usage</span>
                        <span className={`font-mono ${isActualCritical ? 'text-red-400' : isActualHigh ? 'text-yellow-400' : 'text-green-400'}`}>
                          {fmtBps(bus.actual_bytes_per_sec)} ({actualUsagePercent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(0, actualUsagePercent)}%`,
                            backgroundColor: isActualCritical ? '#ef4444' : isActualHigh ? '#f59e0b' : '#22c55e'
                          }}
                        />
                      </div>
                      {isActualCritical && (
                        <div className="text-[10px] text-red-400 mt-1">
                          🔥 USB bus is near saturation! Cameras or devices may be dropping frames.
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Claimed bandwidth (shown when usbmon not available, or as secondary info) */}
                  <div className="px-2">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-gray-500">
                        {bus.usbmon_available ? 'Claimed (theoretical)' : 'Claimed bandwidth'}
                      </span>
                      <span className={`font-mono ${!bus.usbmon_available && isOversubscribed ? 'text-red-400' : !bus.usbmon_available && isNearCapacity ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {bus.claimed_bw_mbps} / {bus.speed_mbps} Mbps ({claimedPercent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, claimedPercent)}%`,
                          backgroundColor: !bus.usbmon_available && isOversubscribed ? '#ef4444' : !bus.usbmon_available && isNearCapacity ? '#f59e0b' : '#6b7280'
                        }}
                      />
                    </div>
                    {isOversubscribed && !bus.usbmon_available && (
                      <div className="text-[10px] text-red-400 mt-1">
                        ⚠️ Devices may experience bandwidth contention. Consider moving devices to different USB controllers.
                      </div>
                    )}
                    {!bus.usbmon_available && bus.device_count > 0 && (
                      <div className="text-[10px] text-gray-600 mt-1 italic">
                        💡 For real-time monitoring, run with debugfs: sudo mount -t debugfs none /sys/kernel/debug
                      </div>
                    )}
                  </div>
                  
                  {/* Devices on this bus */}
                  {busDevices.length > 0 && (
                    <div className="pl-4 space-y-2">
                      {busDevices.map((dev) => {
                        const history = usbHistory[dev.bus_port] || { rx: [], tx: [] };
                        const speedInfo = getUsbSpeedInfo(dev.speed_mbps);
                        const devBytesPerSec = (dev.speed_mbps * 1000000) / 8;
                        const totalIoBps = dev.read_bytes_per_sec + dev.write_bytes_per_sec;
                        const devUtilization = dev.is_storage && devBytesPerSec > 0 
                          ? Math.min(100, (totalIoBps / devBytesPerSec) * 100) 
                          : -1;
                        
                        // Get device type icon
                        const getDeviceIcon = (devClass: string) => {
                          switch(devClass) {
                            case 'Video': return '📷';
                            case 'Audio': return '🎤';
                            case 'Audio/Video': return '🎥';
                            case 'Storage': return '💾';
                            case 'HID': return '⌨️';
                            case 'Network': return '📡';
                            case 'Wireless': return '📶';
                            case 'Hub': return '🔌';
                            case 'Imaging': return '🖨️';
                            case 'Printer': return '🖨️';
                            default: return '🔧';
                          }
                        };
                        
                        return (
                          <div key={dev.bus_port} className="border-l-2 border-gray-700 pl-3 py-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-sm shrink-0">{getDeviceIcon(dev.dev_class)}</span>
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-gray-300 truncate">
                                    {dev.product}
                                  </div>
                                  <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                    {dev.dev_class && <span className="text-gray-400">{dev.dev_class}</span>}
                                    <span>•</span>
                                    <span>{speedInfo.generation}</span>
                                    <span>•</span>
                                    <span>Port {dev.bus_port}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-[10px] text-gray-500 shrink-0 text-right">
                                <div>{fmtBps(devBytesPerSec)}</div>
                                {dev.manufacturer && (
                                  <div className="text-gray-600 truncate max-w-[80px]">{dev.manufacturer}</div>
                                )}
                              </div>
                            </div>
                            
                            {/* Storage device I/O stats */}
                            {dev.is_storage && (
                              <div className="mt-2 space-y-1 bg-gray-800/30 rounded p-2">
                                {devUtilization >= 0 && (
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 overflow-hidden rounded-full bg-gray-700">
                                      <div
                                        className="h-full rounded-full transition-all duration-500"
                                        style={{
                                          width: `${devUtilization}%`,
                                          backgroundColor: devUtilization > 80 ? '#ef4444' : devUtilization > 50 ? '#f59e0b' : '#22c55e'
                                        }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-mono w-12 text-right">
                                      {devUtilization.toFixed(0)}%
                                    </span>
                                  </div>
                                )}
                                <div className="flex justify-between text-[10px] font-mono">
                                  <span className="text-green-500">R: {fmtBps(dev.read_bytes_per_sec)}</span>
                                  <span className="text-blue-500">W: {fmtBps(dev.write_bytes_per_sec)}</span>
                                </div>
                                <DualSparkline rxData={history.rx} txData={history.tx} height={20} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 italic">No USB controllers detected</p>
        )}
      </div>
    </div>
  );
}
