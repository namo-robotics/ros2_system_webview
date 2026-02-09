export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL" | "UNKNOWN";

export interface RosLogMessage {
  name: string;
  level: number;
  msg: string;
  file: string;
  line: number;
  stamp: {
    sec: number;
    nanosec: number;
  };
}

export interface LogEntry {
  id: number;
  nodeName: string;
  level: LogLevel;
  message: string;
  file: string;
  line: number;
  timestamp: Date;
}

export type ConnectionStatus = "connecting" | "connected" | "error" | "closed";

/** Map ROS2 numeric log levels to human-readable strings (rcl_interfaces/msg/Log) */
export const LOG_LEVEL_MAP: Record<number, LogLevel> = {
  10: "DEBUG",
  20: "INFO",
  30: "WARN",
  40: "ERROR",
  50: "FATAL",
};

export const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
  UNKNOWN: 5,
};
