"use client";

import { useState, useMemo } from "react";
import type { LogEntry, LogLevel } from "@/types/ros";

const ALL_LEVELS: LogLevel[] = ["DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

const LEVEL_STYLES: Record<LogLevel, string> = {
  DEBUG: "text-gray-400",
  INFO: "text-blue-400",
  WARN: "text-amber-400",
  ERROR: "text-red-400",
  FATAL: "text-red-600 font-bold",
  UNKNOWN: "text-gray-500",
};

const LEVEL_BADGE: Record<LogLevel, string> = {
  DEBUG: "bg-gray-700 text-gray-300",
  INFO: "bg-blue-900/60 text-blue-300",
  WARN: "bg-amber-900/60 text-amber-300",
  ERROR: "bg-red-900/60 text-red-300",
  FATAL: "bg-red-800 text-red-200",
  UNKNOWN: "bg-gray-800 text-gray-400",
};

interface NodeSectionProps {
  nodeName: string;
  entries: LogEntry[];
}

export default function NodeSection({ nodeName, entries }: NodeSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [filterLevel, setFilterLevel] = useState<LogLevel | "ALL">("ALL");

  const filteredEntries = useMemo(() => {
    if (filterLevel === "ALL") return entries;
    return entries.filter((entry) => entry.level === filterLevel);
  }, [entries, filterLevel]);

  const lastLevel = entries.length > 0 ? entries[entries.length - 1].level : null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-800/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${
              expanded ? "rotate-90" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-mono text-sm font-semibold text-gray-200">
            {nodeName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {lastLevel && (
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${LEVEL_BADGE[lastLevel]}`}
            >
              {lastLevel}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {filterLevel === "ALL" ? entries.length : `${filteredEntries.length}/${entries.length}`} message{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
      </button>

      {/* Per-node level filter */}
      {expanded && (
        <div className="flex items-center gap-1 px-4 py-2 border-t border-gray-800 bg-gray-900">
          <span className="text-[10px] text-gray-500 mr-1">Filter:</span>
          <button
            onClick={() => setFilterLevel("ALL")}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
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
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                filterLevel === level
                  ? "bg-gray-700 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      )}

      {expanded && (
        <div className="max-h-80 overflow-y-auto border-t border-gray-800 bg-gray-950/50">
          {filteredEntries.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-600 italic">
              {entries.length === 0 ? "No messages yet" : "No messages match the selected filter"}
            </p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {filteredEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-gray-800/50 hover:bg-gray-800/30"
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-500 font-mono">
                      {entry.timestamp.toLocaleTimeString()}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={`inline-block w-12 rounded px-1.5 py-0.5 text-center text-[10px] font-medium uppercase ${LEVEL_BADGE[entry.level]}`}
                      >
                        {entry.level}
                      </span>
                    </td>
                    <td
                      className={`px-3 py-1.5 font-mono break-all ${LEVEL_STYLES[entry.level]}`}
                    >
                      {entry.message}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-600 font-mono text-[10px]">
                      {entry.file}:{entry.line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
