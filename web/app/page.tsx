"use client";

import { useRos } from "@/hooks/useRos";
import { useSystemStats } from "@/hooks/useSystemStats";
import ConnectionBadge from "@/components/ConnectionBadge";
import LogViewer from "@/components/LogViewer";
import SystemStatsPanel from "@/components/SystemStatsPanel";

export default function Home() {
  const { status, logs, clearLogs } = useRos();
  const { stats, cpuHistory, memHistory, error: statsError } = useSystemStats();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ROS2 System Monitor
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time system &amp; log monitor ·{" "}
            <code className="text-gray-400">/rosout</code>
          </p>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {/* System stats */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          System Resources
        </h2>
        <SystemStatsPanel
          stats={stats}
          cpuHistory={cpuHistory}
          memHistory={memHistory}
          error={statsError}
        />
      </section>

      {/* Logs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">
          Log Messages
        </h2>
        <LogViewer logs={logs} onClear={clearLogs} />
      </section>
    </main>
  );
}
