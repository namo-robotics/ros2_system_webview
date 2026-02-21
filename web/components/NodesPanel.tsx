"use client";

import { ConnectionStatus } from "@/types/ros";

interface NodeInfo {
  name: string;
}

interface NodesPanelProps {
  nodes: NodeInfo[];
  status: ConnectionStatus;
}

export default function NodesPanel({ nodes, status }: NodesPanelProps) {
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

  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 text-center">
        <p className="text-gray-400">No nodes discovered yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50">
      <div className="border-b border-gray-700 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-300">
          Active Nodes ({nodes.length})
        </h3>
      </div>
      <ul className="divide-y divide-gray-700">
        {nodes.map((node) => (
          <li
            key={node.name}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50"
          >
            <span className="flex h-2 w-2 rounded-full bg-green-500" />
            <code className="text-sm text-gray-200">{node.name}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}
