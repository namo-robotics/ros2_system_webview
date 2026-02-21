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

export interface NodeInfo {
  name: string;
}

export interface TopicInfo {
  name: string;
  type: string;
}

interface UseRosOptions {
  url?: string;
}

export function useRos({ url = "ws://localhost:9090" }: UseRosOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [topics, setTopics] = useState<TopicInfo[]>([]);
  const nextId = useRef(0);
  const rosRef = useRef<ROSLIB.Ros | null>(null);
  const topicRef = useRef<ROSLIB.Topic | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
    nextId.current = 0;
  }, []);

  const fetchNodes = useCallback(() => {
    const ros = rosRef.current;
    if (!ros) return;

    const nodesService = new ROSLIB.Service({
      ros,
      name: "/rosapi/nodes",
      serviceType: "rosapi/Nodes",
    });

    nodesService.callService(new ROSLIB.ServiceRequest({}), (result: { nodes: string[] }) => {
      setNodes(result.nodes.map((name) => ({ name })));
    });
  }, []);

  const fetchTopics = useCallback(() => {
    const ros = rosRef.current;
    if (!ros) return;

    const topicsService = new ROSLIB.Service({
      ros,
      name: "/rosapi/topics",
      serviceType: "rosapi/Topics",
    });

    topicsService.callService(new ROSLIB.ServiceRequest({}), (result: { topics: string[]; types: string[] }) => {
      const topicList: TopicInfo[] = result.topics.map((name, i) => ({
        name,
        type: result.types[i] || "unknown",
      }));
      setTopics(topicList);
    });
  }, []);

  const refreshGraph = useCallback(() => {
    fetchNodes();
    fetchTopics();
  }, [fetchNodes, fetchTopics]);

  useEffect(() => {
    const ros = new ROSLIB.Ros({ url });
    rosRef.current = ros;

    ros.on("connection", () => {
      setStatus("connected");
      // Fetch nodes and topics on connection
      setTimeout(() => {
        fetchNodes();
        fetchTopics();
      }, 500);
    });
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

    // Periodically refresh nodes and topics
    const interval = setInterval(() => {
      if (rosRef.current) {
        fetchNodes();
        fetchTopics();
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      topic.unsubscribe();
      ros.close();
    };
  }, [url, fetchNodes, fetchTopics]);

  const echoOnce = useCallback((topicName: string, topicType: string): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const ros = rosRef.current;
      if (!ros) {
        reject(new Error("Not connected to ROS"));
        return;
      }

      const topic = new ROSLIB.Topic({
        ros,
        name: topicName,
        messageType: topicType,
      });

      const timeout = setTimeout(() => {
        topic.unsubscribe();
        reject(new Error("Timeout waiting for message"));
      }, 5000);

      topic.subscribe((message: unknown) => {
        clearTimeout(timeout);
        topic.unsubscribe();
        resolve(message);
      });
    });
  }, []);

  return { status, logs, clearLogs, nodes, topics, refreshGraph, echoOnce };
}
