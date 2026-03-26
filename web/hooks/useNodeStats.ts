"use client";

import { useEffect, useState, useRef } from "react";
import type { NodeStats, NodeStatsResponse } from "@/types/ros";

interface UseNodeStatsOptions {
  /** Base URL of the stats API (default: same origin) */
  url?: string;
  /** Polling interval in ms (default: 1000) */
  interval?: number;
}

export function useNodeStats({
  url = "",
  interval = 1000,
}: UseNodeStatsOptions = {}) {
  const [nodeStats, setNodeStats] = useState<NodeStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${url}/api/nodes`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: NodeStatsResponse = await res.json();
        setNodeStats(data.nodes || []);
        setError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "fetch failed";
        setError(message);
      }
    };

    // Fetch immediately, then on interval
    fetchStats();
    timerRef.current = setInterval(fetchStats, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [url, interval]);

  return { nodeStats, error };
}
