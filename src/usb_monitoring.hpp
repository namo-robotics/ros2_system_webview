// Copyright 2026 Namo Robotics
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

#ifndef USB_MONITORING_HPP_
#define USB_MONITORING_HPP_

#include <atomic>
#include <map>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

// USB bus/controller info from /sys/bus/usb/devices/usbN
struct UsbBusStats
{
  int bus_num = 0;              // Bus number (1, 2, 3, ...)
  uint64_t speed_mbps = 0;      // Max bus speed in Mbps
  std::string version;          // USB version ("1.1", "2.0", "3.0", etc.)
  std::string controller;       // Controller name/type
  uint64_t device_count = 0;    // Number of devices on this bus
  uint64_t claimed_bw_mbps = 0;  // Total claimed bandwidth by devices
  // Real-time traffic from usbmon (if available)
  uint64_t actual_bytes = 0;       // Total bytes transferred on this bus
  double actual_bytes_per_sec = 0;  // Real-time bandwidth usage
  bool usbmon_available = false;   // Whether usbmon data is available for this bus
};

// USB device info from /sys/bus/usb/devices
struct UsbDeviceStats
{
  std::string bus_port;     // e.g., "1-2"
  int bus_num = 0;          // Bus number this device is on
  std::string product;
  std::string manufacturer;
  uint64_t speed_mbps = 0;  // USB speed in Mbps
  std::string dev_class;    // Device class (e.g., "Video", "Mass Storage")
  // I/O stats (if it's a storage device)
  bool is_storage = false;
  std::string block_dev;    // e.g., "sda"
  uint64_t read_bytes = 0;
  uint64_t write_bytes = 0;
};

// ── usbmon real-time traffic monitoring ──────────────────────────────────────
// Reads from /sys/kernel/debug/usb/usbmon/<bus>u to track actual USB bandwidth
class UsbmonMonitor
{
public:
  struct BusTraffic
  {
    std::atomic<uint64_t> total_bytes{0};
    std::atomic<uint64_t> prev_bytes{0};
    std::atomic<double> bytes_per_sec{0.0};
    std::atomic<bool> available{false};
  };

  UsbmonMonitor() = default;
  ~UsbmonMonitor();

  // Start monitoring all available buses
  void start();

  // Stop monitoring
  void stop();

  // Get traffic stats for a specific bus
  BusTraffic * get_bus_traffic(int bus_num);

  // Check if usbmon is available and running
  bool is_available() const;

private:
  std::atomic<bool> running_{false};
  std::thread monitor_thread_;
  std::mutex traffic_mutex_;
  std::map<int, BusTraffic> bus_traffic_;

  void monitor_loop(const std::string & usbmon_path);
  void parse_usbmon_data(const char * data, size_t len);
};

// Global usbmon monitor instance
extern UsbmonMonitor g_usbmon_monitor;

// Read USB bus statistics
std::vector<UsbBusStats> read_usb_bus_stats();

// Read USB device statistics (also updates bus device_count and claimed_bw_mbps)
std::vector<UsbDeviceStats> read_usb_stats(std::vector<UsbBusStats> & buses);

#endif  // USB_MONITORING_HPP_
