export interface CoreUsage {
  name: string;
  percent: number;
}

export interface MemoryInfo {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  buffers_mb: number;
  cached_mb: number;
  percent: number;
}

export interface SwapInfo {
  total_mb: number;
  used_mb: number;
  percent: number;
}

export interface LoadAvg {
  one: number;
  five: number;
  fifteen: number;
}

export interface SystemStats {
  cpu_percent: number;
  cores: CoreUsage[];
  memory: MemoryInfo;
  swap: SwapInfo;
  load_avg: LoadAvg;
}
