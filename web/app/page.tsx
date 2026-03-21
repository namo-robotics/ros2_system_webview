"use client";

import { useState } from "react";
import { useRos } from "@/hooks/useRos";
import { useSystemStats } from "@/hooks/useSystemStats";
import ConnectionBadge from "@/components/ConnectionBadge";
import LogViewer from "@/components/LogViewer";
import SystemStatsPanel from "@/components/SystemStatsPanel";
import NodesPanel from "@/components/NodesPanel";
import TopicsPanel from "@/components/TopicsPanel";
import Tabs, { Tab } from "@/components/Tabs";

const TABS: Tab[] = [
  {
    id: "resources",
    label: "Resource Webview",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    id: "logs",
    label: "Log Viewer",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: "nodes",
    label: "Nodes",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
  },
  {
    id: "topics",
    label: "Topics",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState("resources");
  const { status, logs, clearLogs, nodes, topics, echoOnce } = useRos();
  const { stats, cpuHistory, memHistory, netHistory, usbHistory, error: statsError } = useSystemStats();

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            ROS2 System Webview
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Real-time system &amp; log monitor
          </p>
        </div>
        <ConnectionBadge status={status} />
      </div>

      {/* Tabs */}
      <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "resources" && (
          <SystemStatsPanel
            stats={stats}
            cpuHistory={cpuHistory}
            memHistory={memHistory}
            netHistory={netHistory}
            usbHistory={usbHistory}
            error={statsError}
          />
        )}

        {activeTab === "logs" && (
          <LogViewer logs={logs} onClear={clearLogs} />
        )}

        {activeTab === "nodes" && (
          <NodesPanel nodes={nodes} status={status} />
        )}

        {activeTab === "topics" && (
          <TopicsPanel topics={topics} status={status} echoOnce={echoOnce} />
        )}
      </div>
    </main>
  );
}
