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

#include "usb_monitoring.hpp"

#include <fcntl.h>
#include <poll.h>
#include <unistd.h>

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <utility>

// Global usbmon monitor instance
UsbmonMonitor g_usbmon_monitor;

// ── UsbmonMonitor implementation ─────────────────────────────────────────────

UsbmonMonitor::~UsbmonMonitor()
{
  stop();
}

void UsbmonMonitor::start()
{
  if (running_.exchange(true)) {return;}     // Already running

  // Check if debugfs/usbmon is available
  const std::string usbmon_path = "/sys/kernel/debug/usb/usbmon";
  if (!std::filesystem::exists(usbmon_path)) {
    running_ = false;
    return;
  }

  // Find available bus files (e.g., 0u, 1u, 2u, ...)
  // Bus 0 ('0u') captures all buses, individual files capture per-bus
  monitor_thread_ = std::thread([this, usbmon_path]() {
        monitor_loop(usbmon_path);
    });
}

void UsbmonMonitor::stop()
{
  if (!running_.exchange(false)) {return;}
  if (monitor_thread_.joinable()) {
    monitor_thread_.join();
  }
}

UsbmonMonitor::BusTraffic * UsbmonMonitor::get_bus_traffic(int bus_num)
{
  std::lock_guard<std::mutex> lock(traffic_mutex_);
  auto it = bus_traffic_.find(bus_num);
  return it != bus_traffic_.end() ? &it->second : nullptr;
}

bool UsbmonMonitor::is_available() const
{
  return running_.load();
}

void UsbmonMonitor::monitor_loop(const std::string & usbmon_path)
{
  // Try to open the "0u" file which captures all buses
  std::string all_buses_file = usbmon_path + "/0u";
  int fd = open(all_buses_file.c_str(), O_RDONLY | O_NONBLOCK);
  if (fd < 0) {
    // Fallback: debugfs might not be mounted or no permission
    running_ = false;
    return;
  }

  // Initialize all known buses (use operator[] which default-constructs)
  {
    std::lock_guard<std::mutex> lock(traffic_mutex_);
    for (int i = 1; i <= 16; ++i) {
      // Access to create default-constructed entry
      (void)bus_traffic_[i];
    }
  }

  char buffer[8192];
  auto last_update = std::chrono::steady_clock::now();

  while (running_.load()) {
    struct pollfd pfd;
    pfd.fd = fd;
    pfd.events = POLLIN;

    // Poll with 100ms timeout
    int ret = poll(&pfd, 1, 100);
    if (ret > 0 && (pfd.revents & POLLIN)) {
      ssize_t n = read(fd, buffer, sizeof(buffer) - 1);
      if (n > 0) {
        buffer[n] = '\0';
        parse_usbmon_data(buffer, n);
      }
    }

    // Update bytes_per_sec every second
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - last_update);
    if (elapsed.count() >= 1000) {
      std::lock_guard<std::mutex> lock(traffic_mutex_);
      double seconds = elapsed.count() / 1000.0;
      for (auto & [bus_num, traffic] : bus_traffic_) {
        uint64_t current = traffic.total_bytes.load();
        uint64_t prev = traffic.prev_bytes.load();
        if (current >= prev) {
          traffic.bytes_per_sec = static_cast<double>(current - prev) / seconds;
        }
        traffic.prev_bytes = current;
        if (current > 0) {
          traffic.available = true;
        }
      }
      last_update = now;
    }
  }

  close(fd);
}

// Parse usbmon text format to extract byte counts
// Format: "ffff... timestamp type Ci:bus:dev:ep ... length ..."
// We look for 'C' (complete) events and extract the data length
void UsbmonMonitor::parse_usbmon_data(const char * data, size_t len)
{
  std::istringstream stream(std::string(data, len));
  std::string line;

  while (std::getline(stream, line)) {
    // Skip empty lines
    if (line.empty()) {continue;}

    // Parse the line - look for completion events
    // Format: URB_TAG TIMESTAMP EVENT_TYPE TYPE:BUS:DEV:EP ...
    std::istringstream ls(line);
    std::string urb_tag, timestamp_str, event_type, address;
    ls >> urb_tag >> timestamp_str >> event_type >> address;

    // We only care about completion events ('C') as they indicate actual transfer
    if (event_type.empty() || event_type[0] != 'C') {continue;}

    // Parse address to get bus number (format: "Ci:1:001:0" or similar)
    // The second field after splitting by ':' is the bus number
    size_t first_colon = address.find(':');
    if (first_colon == std::string::npos) {continue;}
    size_t second_colon = address.find(':', first_colon + 1);
    if (second_colon == std::string::npos) {continue;}

    std::string bus_str = address.substr(first_colon + 1, second_colon - first_colon - 1);
    int bus_num = 0;
    try {
      bus_num = std::stoi(bus_str);
    } catch (...) {
      continue;
    }

    // Find the data length - it's typically after status field for completions
    // Scan for a number that looks like a byte count (skip status which is usually small)
    std::string token;
    int data_len = 0;
    while (ls >> token) {
      // Look for numeric tokens, the larger ones are typically byte counts
      try {
        int val = std::stoi(token);
        if (val >= 0 && val <= 1048576) {           // Reasonable packet size limit
          data_len = val;
        }
      } catch (...) {
        // Skip non-numeric tokens
      }
    }

    if (data_len > 0 && bus_num > 0) {
      std::lock_guard<std::mutex> lock(traffic_mutex_);
      bus_traffic_[bus_num].total_bytes += data_len;
    }
  }
}

// ── Helper functions ─────────────────────────────────────────────────────────

// Helper to read a sysfs attribute file
static std::string read_sysfs_attr(const std::string & path)
{
  std::ifstream f(path);
  if (!f.is_open()) {return "";}
  std::string val;
  std::getline(f, val);
  // Trim trailing whitespace/newlines
  while (!val.empty() && (val.back() == '\n' || val.back() == '\r' || val.back() == ' ')) {
    val.pop_back();
  }
  return val;
}

// Read block device I/O stats from /sys/block/<dev>/stat
// Format: reads_completed reads_merged sectors_read ms_reading writes_completed ...
static std::pair<uint64_t, uint64_t> read_block_io(const std::string & block_dev)
{
  std::string path = "/sys/block/" + block_dev + "/stat";
  std::ifstream f(path);
  if (!f.is_open()) {return {0, 0};}

  uint64_t reads_completed, reads_merged, sectors_read, ms_reading;
  uint64_t writes_completed, writes_merged, sectors_written;
  f >> reads_completed >> reads_merged >> sectors_read >> ms_reading;
  f >> writes_completed >> writes_merged >> sectors_written;

  // Sectors are typically 512 bytes
  return {sectors_read * 512, sectors_written * 512};
}

// Check if a block device is USB-attached by checking its device symlink
static std::string find_usb_block_device(const std::string & usb_path)
{
  // Look for block devices under this USB device
  namespace fs = std::filesystem;
  try {
    for (const auto & entry : fs::recursive_directory_iterator(usb_path)) {
      if (entry.is_directory() && entry.path().filename().string().rfind("block", 0) == 0) {
        // Found a block directory, check for actual device
        for (const auto & block_entry : fs::directory_iterator(entry.path())) {
          if (block_entry.is_directory()) {
            return block_entry.path().filename().string();
          }
        }
      }
    }
  } catch (...) {
    // Ignore errors from permission issues
  }
  return "";
}

// Map USB class codes to human-readable names
static std::string get_usb_class_name(const std::string & class_code)
{
  if (class_code.empty() || class_code.length() < 2) {return "";}
  // Class code is in format "xx/yy/zz" or just "xx"
  std::string base_class = class_code.substr(0, 2);
  if (base_class == "01") {return "Audio";}
  if (base_class == "02") {return "Network";}
  if (base_class == "03") {return "HID";}
  if (base_class == "06") {return "Imaging";}
  if (base_class == "07") {return "Printer";}
  if (base_class == "08") {return "Storage";}
  if (base_class == "09") {return "Hub";}
  if (base_class == "0e") {return "Video";}
  if (base_class == "10") {return "Audio/Video";}
  if (base_class == "e0") {return "Wireless";}
  if (base_class == "ef") {return "Misc";}
  if (base_class == "ff") {return "Vendor";}
  return "";
}

// Get USB version string from speed
static std::string get_usb_version(uint64_t speed_mbps)
{
  if (speed_mbps >= 20000) {return "3.2";}
  if (speed_mbps >= 10000) {return "3.1";}
  if (speed_mbps >= 5000) {return "3.0";}
  if (speed_mbps >= 480) {return "2.0";}
  if (speed_mbps >= 12) {return "1.1";}
  return "1.0";
}

// ── Public API ───────────────────────────────────────────────────────────────

std::vector<UsbBusStats> read_usb_bus_stats()
{
  std::vector<UsbBusStats> result;
  namespace fs = std::filesystem;
  const std::string usb_path = "/sys/bus/usb/devices";

  if (!fs::exists(usb_path)) {return result;}

  try {
    for (const auto & entry : fs::directory_iterator(usb_path)) {
      std::string name = entry.path().filename().string();
      // Only look at root hubs (names like "usb1", "usb2", etc.)
      if (name.rfind("usb", 0) != 0) {continue;}

      UsbBusStats bus;
      try {
        bus.bus_num = std::stoi(name.substr(3));
      } catch (...) {
        continue;
      }

      // Read bus speed
      std::string speed_str = read_sysfs_attr(entry.path().string() + "/speed");
      if (!speed_str.empty()) {
        try {
          bus.speed_mbps = std::stoull(speed_str);
        } catch (...) {
        }
      }

      bus.version = get_usb_version(bus.speed_mbps);

      // Try to get controller info from product name
      bus.controller = read_sysfs_attr(entry.path().string() + "/product");
      if (bus.controller.empty()) {
        bus.controller = "USB " + bus.version + " Controller";
      }

      // Get real-time traffic from usbmon if available
      if (g_usbmon_monitor.is_available()) {
        auto * traffic = g_usbmon_monitor.get_bus_traffic(bus.bus_num);
        if (traffic && traffic->available.load()) {
          bus.usbmon_available = true;
          bus.actual_bytes = traffic->total_bytes.load();
          bus.actual_bytes_per_sec = traffic->bytes_per_sec.load();
        }
      }

      result.push_back(bus);
    }
  } catch (...) {
    // Ignore filesystem errors
  }

  // Sort by bus number
  std::sort(result.begin(), result.end(),
    [](const UsbBusStats & a, const UsbBusStats & b) {return a.bus_num < b.bus_num;});

  return result;
}

std::vector<UsbDeviceStats> read_usb_stats(std::vector<UsbBusStats> & buses)
{
  std::vector<UsbDeviceStats> result;
  namespace fs = std::filesystem;
  const std::string usb_path = "/sys/bus/usb/devices";

  // Reset device counts and claimed bandwidth
  for (auto & bus : buses) {
    bus.device_count = 0;
    bus.claimed_bw_mbps = 0;
  }

  if (!fs::exists(usb_path)) {return result;}

  try {
    for (const auto & entry : fs::directory_iterator(usb_path)) {
      std::string name = entry.path().filename().string();
      // Skip USB hubs (names like "usb1") and interfaces (names containing ":")
      if (name.rfind("usb", 0) == 0 || name.find(':') != std::string::npos) {
        continue;
      }

      UsbDeviceStats dev;
      dev.bus_port = name;

      // Extract bus number from device name (e.g., "1-2" -> bus 1)
      auto dash_pos = name.find('-');
      if (dash_pos != std::string::npos) {
        try {
          dev.bus_num = std::stoi(name.substr(0, dash_pos));
        } catch (...) {
        }
      }

      dev.product = read_sysfs_attr(entry.path().string() + "/product");
      dev.manufacturer = read_sysfs_attr(entry.path().string() + "/manufacturer");
      std::string speed_str = read_sysfs_attr(entry.path().string() + "/speed");
      if (!speed_str.empty()) {
        try {
          dev.speed_mbps = std::stoull(speed_str);
        } catch (...) {
        }
      }

      // Read device class
      std::string class_str = read_sysfs_attr(entry.path().string() + "/bDeviceClass");
      if (class_str == "00") {
        // Class defined at interface level, check first interface
        std::string iface_class = read_sysfs_attr(entry.path().string() + "/" + name +
          ":1.0/bInterfaceClass");
        dev.dev_class = get_usb_class_name(iface_class);
      } else {
        dev.dev_class = get_usb_class_name(class_str);
      }

      // Skip devices without product name (usually internal hubs)
      if (dev.product.empty()) {continue;}

      // Check if this USB device has a block device (storage)
      std::string block_dev = find_usb_block_device(entry.path().string());
      if (!block_dev.empty()) {
        dev.is_storage = true;
        dev.block_dev = block_dev;
        if (dev.dev_class.empty()) {dev.dev_class = "Storage";}
        auto [rb, wb] = read_block_io(block_dev);
        dev.read_bytes = rb;
        dev.write_bytes = wb;
      }

      // Update bus statistics
      for (auto & bus : buses) {
        if (bus.bus_num == dev.bus_num) {
          bus.device_count++;
          bus.claimed_bw_mbps += dev.speed_mbps;
          break;
        }
      }

      result.push_back(dev);
    }
  } catch (...) {
    // Ignore filesystem errors
  }

  return result;
}
