"use client";

import { useMemo, useState } from "react";
import type { LogEntry, LogLevel } from "@/types/ros";
import NodeSection from "./NodeSection";

const ALL_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

interface LogViewerProps {
  logs: LogEntry[];
  onClear: () => void;
}

export default function LogViewer({ logs, onClear }: LogViewerProps) {
  const [filterLevel, setFilterLevel] = useState<LogLevel | "ALL">("ALL");
  const [filterNode, setFilterNode] = useState("");

  // Group logs by node
  const grouped = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const entry of logs) {
      if (filterLevel !== "ALL" && entry.level !== filterLevel) continue;
      if (filterNode && !entry.nodeName.toLowerCase().includes(filterNode.toLowerCase())) continue;
      const arr = map.get(entry.nodeName) || [];
      arr.push(entry);
      map.set(entry.nodeName, arr);
    }
    return map;
  }, [logs, filterLevel, filterNode]);

  const nodeNames = useMemo(() => {
    const set = new Set<string>();
    for (const entry of logs) set.add(entry.nodeName);
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Level filter */}
        <div className="flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-900 p-1">
          <button
            onClick={() => setFilterLevel("ALL")}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              filterLevel === "ALL"
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            All
          </button>
          {ALL_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filterLevel === level
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        {/* Node filter */}
        <input
          type="text"
          placeholder="Filter by node…"
          value={filterNode}
          onChange={(e) => setFilterNode(e.target.value)}
          className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 outline-none focus:border-gray-600"
        />

        {/* Clear */}
        <button
          onClick={onClear}
          className="ml-auto rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
        >
          Clear Logs
        </button>

        {/* Count */}
        <span className="text-xs text-gray-600">
          {logs.length} total · {grouped.size} node{grouped.size !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Node sections */}
      {grouped.size === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-16 text-gray-600">
          <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p className="text-sm">Waiting for log messages…</p>
          <p className="mt-1 text-xs text-gray-700">
            Messages from <code className="text-gray-500">/rosout</code> will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(grouped.entries()).map(([nodeName, entries]) => (
            <NodeSection key={nodeName} nodeName={nodeName} entries={entries} />
          ))}
        </div>
      )}
    </div>
  );
}
