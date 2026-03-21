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

// Per-interface bandwidth history: { [ifaceName]: { rx: number[], tx: number[] } }
interface BandwidthHistory {
  rx: number[];
  tx: number[];
}

export function useSystemStats({
  url = "",
  interval = 1000,
}: UseSystemStatsOptions = {}) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [netHistory, setNetHistory] = useState<Record<string, BandwidthHistory>>({});
  const [usbHistory, setUsbHistory] = useState<Record<string, BandwidthHistory>>({});
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

        // Update network bandwidth history per interface
        setNetHistory((prev) => {
          const updated = { ...prev };
          for (const iface of data.network || []) {
            const existing = updated[iface.name] || { rx: [], tx: [] };
            const newRx = [...existing.rx, iface.rx_bytes_per_sec];
            const newTx = [...existing.tx, iface.tx_bytes_per_sec];
            updated[iface.name] = {
              rx: newRx.length > HISTORY_SIZE ? newRx.slice(-HISTORY_SIZE) : newRx,
              tx: newTx.length > HISTORY_SIZE ? newTx.slice(-HISTORY_SIZE) : newTx,
            };
          }
          return updated;
        });

        // Update USB bandwidth history per device (only for storage devices)
        setUsbHistory((prev) => {
          const updated = { ...prev };
          for (const dev of data.usb || []) {
            if (dev.is_storage) {
              const key = dev.bus_port;
              const existing = updated[key] || { rx: [], tx: [] };
              const newRx = [...existing.rx, dev.read_bytes_per_sec];
              const newTx = [...existing.tx, dev.write_bytes_per_sec];
              updated[key] = {
                rx: newRx.length > HISTORY_SIZE ? newRx.slice(-HISTORY_SIZE) : newRx,
                tx: newTx.length > HISTORY_SIZE ? newTx.slice(-HISTORY_SIZE) : newTx,
              };
            }
          }
          return updated;
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

  return { stats, cpuHistory, memHistory, netHistory, usbHistory, error };
}
