"use client";

import React, { useState } from "react";
import { ConnectionStatus } from "@/types/ros";

interface TopicInfo {
  name: string;
  type: string;
}

interface EchoState {
  loading: boolean;
  message: unknown | null;
  error: string | null;
}

interface TopicsPanelProps {
  topics: TopicInfo[];
  status: ConnectionStatus;
  echoOnce: (topicName: string, topicType: string) => Promise<unknown>;
}

export default function TopicsPanel({ topics, status, echoOnce }: TopicsPanelProps) {
  const [echoStates, setEchoStates] = useState<Record<string, EchoState>>({});

  const handleEchoOnce = async (topic: TopicInfo) => {
    setEchoStates((prev) => ({
      ...prev,
      [topic.name]: { loading: true, message: null, error: null },
    }));

    try {
      const message = await echoOnce(topic.name, topic.type);
      setEchoStates((prev) => ({
        ...prev,
        [topic.name]: { loading: false, message, error: null },
      }));
    } catch (err) {
      setEchoStates((prev) => ({
        ...prev,
        [topic.name]: { loading: false, message: null, error: err instanceof Error ? err.message : "Unknown error" },
      }));
    }
  };

  const clearEcho = (topicName: string) => {
    setEchoStates((prev) => {
      const next = { ...prev };
      delete next[topicName];
      return next;
    });
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
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {topics.map((topic) => {
              const echoState = echoStates[topic.name];
              const hasEchoResult = echoState && (echoState.message !== null || echoState.error !== null);
              return (
                <React.Fragment key={topic.name}>
                  <tr className="hover:bg-gray-700/50">
                    <td className="px-4 py-3">
                      <code className="text-sm text-gray-200">{topic.name}</code>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-sm text-gray-400">{topic.type}</code>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleEchoOnce(topic)}
                        disabled={echoState?.loading}
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
                      >
                        {echoState?.loading ? "Waiting..." : "Echo Once"}
                      </button>
                      {echoState?.message !== null && echoState?.message !== undefined && (
                        <button
                          onClick={() => clearEcho(topic.name)}
                          className="ml-2 rounded bg-gray-600 px-2 py-1 text-xs font-medium text-white hover:bg-gray-500"
                        >
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                  {hasEchoResult && (
                    <tr className="bg-gray-900/50">
                      <td colSpan={3} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-gray-400">Echo result:</span>
                          <button
                            onClick={() => clearEcho(topic.name)}
                            className="text-xs text-gray-400 hover:text-gray-200"
                          >
                            ✕ Close
                          </button>
                        </div>
                        {echoState.error ? (
                          <div className="text-sm text-red-400">{echoState.error}</div>
                        ) : (
                          <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-300">
                            {JSON.stringify(echoState.message, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
