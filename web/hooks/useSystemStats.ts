"use client";

import { useEffect, useState, useRef } from "react";
import type { SystemStats } from "@/types/system";

const HISTORY_SIZE = 60; // keep last 60 samples (≈ 60 s at 1 s interval)

interface UseSystemStatsOptions {
  /** Base URL of the system stats API (default: same origin) */
  url?: string;
  /** Polling interval in ms (default: 1000) */
  interval?: number;
}

export function useSystemStats({
  url = "",
  interval = 1000,
}: UseSystemStatsOptions = {}) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${url}/api/system`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: SystemStats = await res.json();
        setStats(data);
        setError(null);

        setCpuHistory((prev) => {
          const next = [...prev, data.cpu_percent];
          return next.length > HISTORY_SIZE ? next.slice(-HISTORY_SIZE) : next;
        });
        setMemHistory((prev) => {
          const next = [...prev, data.memory.percent];
          return next.length > HISTORY_SIZE ? next.slice(-HISTORY_SIZE) : next;
        });
      } catch (err: any) {
        setError(err.message ?? "fetch failed");
      }
    };

    // Fetch immediately, then on interval
    fetchStats();
    timerRef.current = setInterval(fetchStats, interval);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [url, interval]);

  return { stats, cpuHistory, memHistory, error };
}
