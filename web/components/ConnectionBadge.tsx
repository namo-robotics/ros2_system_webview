"use client";

import type { ConnectionStatus as Status } from "@/types/ros";

const STATUS_CONFIG: Record<Status, { label: string; className: string }> = {
  connecting: {
    label: "Connecting…",
    className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  },
  connected: {
    label: "Connected",
    className: "bg-green-500/20 text-green-400 border-green-500/40",
  },
  error: {
    label: "Error",
    className: "bg-red-500/20 text-red-400 border-red-500/40",
  },
  closed: {
    label: "Disconnected",
    className: "bg-gray-500/20 text-gray-400 border-gray-500/40",
  },
};

export default function ConnectionBadge({ status }: { status: Status }) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${config.className}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${
          status === "connected"
            ? "bg-green-400 animate-pulse"
            : status === "connecting"
            ? "bg-yellow-400 animate-pulse"
            : status === "error"
            ? "bg-red-400"
            : "bg-gray-400"
        }`}
      />
      {config.label}
    </span>
  );
}
