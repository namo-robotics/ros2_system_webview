"use client";

import type { SystemStats } from "@/types/system";

// ── Tiny sparkline (pure SVG) ────────────────────────────────────────────────
function Sparkline({
  data,
  color,
  height = 40,
  width = 200,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;

  const max = 100;
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

// ── Main export ──────────────────────────────────────────────────────────────
export default function SystemStatsPanel({
  stats,
  cpuHistory,
  memHistory,
  error,
}: {
  stats: SystemStats | null;
  cpuHistory: number[];
  memHistory: number[];
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
        {[...Array(3)].map((_, i) => (
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
        <Sparkline data={cpuHistory} color="#3b82f6" />
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
        <Sparkline data={memHistory} color="#a855f7" />
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
    </div>
  );
}
