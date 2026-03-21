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

export interface NetworkStats {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  speed_mbps: number;  // Link speed in Mbps, -1 if unknown
}

export interface UsbDeviceStats {
  bus_port: string;
  bus_num: number;
  product: string;
  manufacturer: string;
  speed_mbps: number;
  dev_class: string;
  is_storage: boolean;
  block_dev: string;
  read_bytes: number;
  write_bytes: number;
  read_bytes_per_sec: number;
  write_bytes_per_sec: number;
}

export interface UsbBusStats {
  bus_num: number;
  speed_mbps: number;
  version: string;
  controller: string;
  device_count: number;
  claimed_bw_mbps: number;
  // Real-time traffic from usbmon (if available)
  usbmon_available: boolean;
  actual_bytes: number;
  actual_bytes_per_sec: number;
}

export interface SystemStats {
  cpu_percent: number;
  cores: CoreUsage[];
  memory: MemoryInfo;
  swap: SwapInfo;
  load_avg: LoadAvg;
  network: NetworkStats[];
  usb: UsbDeviceStats[];
  usb_buses: UsbBusStats[];
}
