"use client";

import { useState, useMemo } from "react";
import { ConnectionStatus, NodeStats } from "@/types/ros";

interface NodeInfo {
  name: string;
}

type SortField = "name" | "cpu" | "memory" | "io";
type SortDirection = "asc" | "desc";

interface NodesPanelProps {
  nodes: NodeInfo[];
  nodeStats: NodeStats[];
  status: ConnectionStatus;
}

/** Format bytes per second to human-readable string */
function formatBandwidth(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

/** Sort icon component */
function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <span className={`ml-1 inline-block ${active ? "text-blue-400" : "text-gray-500"}`}>
      {active ? (direction === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}

interface MergedNode {
  key: string;  // Unique identifier for React key
  name: string;
  stats?: NodeStats;
}

export default function NodesPanel({ nodes, nodeStats, status }: NodesPanelProps) {
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Merge nodes with their stats, using PID for uniqueness
  const mergedNodes = useMemo((): MergedNode[] => {
    const result: MergedNode[] = [];
    const seenPids = new Set<number>();

    // Add all nodes from stats (they have PIDs for unique keys)
    for (const stat of nodeStats) {
      seenPids.add(stat.pid);
      result.push({
        key: `pid-${stat.pid}`,
        name: stat.name,
        stats: stat,
      });
    }

    // Add nodes from rosbridge that don't have stats (use name + index as key)
    const nodeNamesFromStats = new Set(nodeStats.map((s) => s.name));
    let idx = 0;
    for (const n of nodes) {
      if (!nodeNamesFromStats.has(n.name)) {
        result.push({
          key: `ros-${n.name}-${idx++}`,
          name: n.name,
          stats: undefined,
        });
      }
    }

    return result;
  }, [nodes, nodeStats]);

  // Sort the merged nodes
  const sortedNodes = useMemo(() => {
    const sorted = [...mergedNodes];
    sorted.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "cpu":
          comparison = (a.stats?.cpu_percent ?? 0) - (b.stats?.cpu_percent ?? 0);
          break;
        case "memory":
          comparison = (a.stats?.mem_mb ?? 0) - (b.stats?.mem_mb ?? 0);
          break;
        case "io":
          const aIo = (a.stats?.read_bytes_per_sec ?? 0) + (a.stats?.write_bytes_per_sec ?? 0);
          const bIo = (b.stats?.read_bytes_per_sec ?? 0) + (b.stats?.write_bytes_per_sec ?? 0);
          comparison = aIo - bIo;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return sorted;
  }, [mergedNodes, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "name" ? "asc" : "desc");
    }
  };

  if (status !== "connected") {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 text-center">
        <p className="text-gray-400">
          {status === "connecting"
            ? "Connecting to rosbridge..."
            : "Not connected to rosbridge"}
        </p>
      </div>
    );
  }

  if (sortedNodes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 text-center">
        <p className="text-gray-400">No nodes discovered yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden">
      <div className="border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-300">
            Active Nodes ({sortedNodes.length})
          </h3>
          <span className="text-xs text-gray-500" title="Per-process network stats require eBPF which is not available">
            Note: Per-node network bandwidth not available (Linux limitation)
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800/80">
            <tr>
              <th
                className="px-4 py-3 text-left font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 select-none"
                onClick={() => handleSort("name")}
              >
                Node Name
                <SortIcon active={sortField === "name"} direction={sortDirection} />
              </th>
              <th
                className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 select-none whitespace-nowrap"
                onClick={() => handleSort("cpu")}
                title="CPU usage as percentage of one core (100% = 1 full core)"
              >
                CPU %
                <SortIcon active={sortField === "cpu"} direction={sortDirection} />
              </th>
              <th
                className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 select-none whitespace-nowrap"
                onClick={() => handleSort("memory")}
              >
                Memory
                <SortIcon active={sortField === "memory"} direction={sortDirection} />
              </th>
              <th
                className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:bg-gray-700/50 select-none whitespace-nowrap"
                onClick={() => handleSort("io")}
                title="Disk read/write bandwidth"
              >
                Disk
                <SortIcon active={sortField === "io"} direction={sortDirection} />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {sortedNodes.map((node) => (
              <tr
                key={node.key}
                className="hover:bg-gray-700/50 transition-colors"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <code className="text-gray-200 break-all">{node.name}</code>
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {node.stats ? (
                    <span className={node.stats.cpu_percent > 50 ? "text-amber-400" : "text-gray-300"}>
                      {node.stats.cpu_percent.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {node.stats ? (
                    <div className="flex flex-col items-end">
                      <span className="text-gray-300">{node.stats.mem_mb.toFixed(1)} MB</span>
                      <span className="text-xs text-gray-500">{node.stats.mem_percent.toFixed(1)}%</span>
                    </div>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {node.stats ? (
                    <div className="flex flex-col items-end text-xs">
                      <span className="text-green-400">R {formatBandwidth(node.stats.read_bytes_per_sec)}</span>
                      <span className="text-blue-400">W {formatBandwidth(node.stats.write_bytes_per_sec)}</span>
                    </div>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
