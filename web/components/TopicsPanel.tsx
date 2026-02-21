"use client";

import { ConnectionStatus } from "@/types/ros";

interface TopicInfo {
  name: string;
  type: string;
}

interface TopicsPanelProps {
  topics: TopicInfo[];
  status: ConnectionStatus;
}

export default function TopicsPanel({ topics, status }: TopicsPanelProps) {
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

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 text-center">
        <p className="text-gray-400">No topics discovered yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50">
      <div className="border-b border-gray-700 px-4 py-3">
        <h3 className="text-sm font-medium text-gray-300">
          Active Topics ({topics.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700 text-left text-xs uppercase tracking-wider text-gray-500">
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Message Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {topics.map((topic) => (
              <tr key={topic.name} className="hover:bg-gray-700/50">
                <td className="px-4 py-3">
                  <code className="text-sm text-gray-200">{topic.name}</code>
                </td>
                <td className="px-4 py-3">
                  <code className="text-sm text-gray-400">{topic.type}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
