"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ROSLIB from "roslib";
import type {
  ConnectionStatus,
  LogEntry,
  RosLogMessage,
  LogLevel,
  LOG_LEVEL_MAP,
} from "@/types/ros";

const LOG_LEVELS: Record<number, LogLevel> = {
  10: "DEBUG",
  20: "INFO",
  30: "WARN",
  40: "ERROR",
  50: "FATAL",
};

const MAX_LOGS = 5000;

interface UseRosOptions {
  url?: string;
}

export function useRos({ url = "ws://localhost:9090" }: UseRosOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const nextId = useRef(0);
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const topicRef = useRef<ROSLIB.Topic | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
    nextId.current = 0;
  }, []);

  useEffect(() => {
    const ros = new ROSLIB.Ros({ url });
    rosRef.current = ros;

    ros.on("connection", () => setStatus("connected"));
    ros.on("error", () => setStatus("error"));
    ros.on("close", () => setStatus("closed"));

    const topic = new ROSLIB.Topic({
      ros,
      name: "/rosout",
      messageType: "rcl_interfaces/msg/Log",
    });
    topicRef.current = topic;

    topic.subscribe((message: RosLogMessage) => {
      const entry: LogEntry = {
        id: nextId.current++,
        nodeName: message.name || "unknown_node",
        level: LOG_LEVELS[message.level] || "UNKNOWN",
        message: message.msg,
        file: message.file,
        line: message.line,
        timestamp: new Date(
          message.stamp.sec * 1000 + message.stamp.nanosec / 1e6
        ),
      };

      setLogs((prev) => {
        const next = [...prev, entry];
        // Cap the log buffer to prevent memory issues
        return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
      });
    });

    return () => {
      topic.unsubscribe();
      ros.close();
    };
  }, [url]);

  return { status, logs, clearLogs };
}
