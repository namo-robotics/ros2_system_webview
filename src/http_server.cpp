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

#include <dirent.h>

#include <httplib.h>

#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <numeric>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "ament_index_cpp/get_package_share_directory.hpp"
#include "rclcpp/rclcpp.hpp"
#include "usb_monitoring.hpp"

// CPU snapshot from /proc/stat
struct CpuTimes
{
  std::string name;        // "cpu", "cpu0", "cpu1", ...
  uint64_t user, nice, system, idle, iowait, irq, softirq, steal;

  uint64_t total() const
  {
    return user + nice + system + idle + iowait + irq + softirq + steal;
  }
  uint64_t active() const {return total() - idle - iowait;}
};

static std::vector<CpuTimes> read_cpu_times()
{
  std::vector<CpuTimes> result;
  std::ifstream f("/proc/stat");
  std::string line;
  while (std::getline(f, line)) {
    if (line.rfind("cpu", 0) != 0) {break;}        // lines stop starting with "cpu"
    std::istringstream ss(line);
    CpuTimes c{};
    ss >> c.name >> c.user >> c.nice >> c.system >> c.idle
       >> c.iowait >> c.irq >> c.softirq >> c.steal;
    result.push_back(c);
  }
  return result;
}

// Memory info from /proc/meminfo
struct MemInfo
{
  uint64_t total_kb = 0;
  uint64_t free_kb = 0;
  uint64_t avail_kb = 0;
  uint64_t buffers_kb = 0;
  uint64_t cached_kb = 0;
  uint64_t swap_total_kb = 0;
  uint64_t swap_free_kb = 0;
};

static MemInfo read_meminfo()
{
  MemInfo m;
  std::ifstream f("/proc/meminfo");
  std::string line;
  while (std::getline(f, line)) {
    std::istringstream ss(line);
    std::string key;
    uint64_t val;
    ss >> key >> val;                               // "MemTotal:", 1234
    if (key == "MemTotal:") {m.total_kb = val;} else if (key == "MemFree:") {
      m.free_kb = val;
    } else if (key == "MemAvailable:") {m.avail_kb = val;} else if (key == "Buffers:") {
      m.buffers_kb = val;
    } else if (key == "Cached:") {m.cached_kb = val;} else if (key == "SwapTotal:") {
      m.swap_total_kb = val;
    } else if (key == "SwapFree:") {m.swap_free_kb = val;}
  }
  return m;
}

// Load average from /proc/loadavg
struct LoadAvg
{
  double one = 0, five = 0, fifteen = 0;
};

static LoadAvg read_loadavg()
{
  LoadAvg la;
  std::ifstream f("/proc/loadavg");
  f >> la.one >> la.five >> la.fifteen;
  return la;
}

// Per-process stats for ROS nodes
struct ProcessStats
{
  pid_t pid = 0;
  std::string node_name;
  std::string cmdline;
  uint64_t utime = 0;       // User mode jiffies
  uint64_t stime = 0;       // Kernel mode jiffies
  uint64_t rss_kb = 0;      // Resident set size in KB
  uint64_t vsize_kb = 0;    // Virtual memory size in KB
  uint64_t read_bytes = 0;   // Total bytes read (from /proc/<pid>/io)
  uint64_t write_bytes = 0;  // Total bytes written
  double cpu_percent = 0.0;  // Calculated CPU percentage
  double mem_percent = 0.0;  // Calculated memory percentage
  double read_bps = 0.0;    // Read bandwidth
  double write_bps = 0.0;   // Write bandwidth
};

static std::string read_cmdline(pid_t pid)
{
  std::string path = "/proc/" + std::to_string(pid) + "/cmdline";
  std::ifstream f(path);
  if (!f.is_open()) {return "";}
  std::string cmdline;
  std::getline(f, cmdline, '\0');
  // cmdline has null-separated args, replace with spaces for display
  std::string result = cmdline;
  char c;
  while (f.get(c)) {
    if (c == '\0') {result += ' ';} else {result += c;}
  }
  return result;
}

// Extract ROS node name from command line arguments
static std::string extract_node_name_from_cmdline(const std::string & cmdline)
{
  // Look for __node:= or --ros-args ... -r __node:=name patterns
  std::regex node_pattern("__node:=([^\\s]+)");
  std::smatch match;
  if (std::regex_search(cmdline, match, node_pattern)) {
    std::string name = match[1].str();
    // Add leading slash if not present
    if (!name.empty() && name[0] != '/') {
      name = "/" + name;
    }
    return name;
  }

  // Fallback: extract node name from executable path
  // Parse the first argument (executable path) from cmdline
  std::istringstream ss(cmdline);
  std::string exe_path;
  if (ss >> exe_path) {
    // Extract basename from the executable path
    auto last_slash = exe_path.rfind('/');
    std::string basename = (last_slash != std::string::npos) ?
      exe_path.substr(last_slash + 1) : exe_path;

    // Skip common non-node executables
    if (basename == "python3" || basename == "python" ||
      basename == "ros2" || basename == "node" ||
      basename == "bash" || basename == "sh")
    {
      return "";
    }

    // Return the basename as node name with leading slash
    if (!basename.empty()) {
      return "/" + basename;
    }
  }

  return "";
}

static ProcessStats read_process_stats(pid_t pid, uint64_t total_mem_kb)
{
  ProcessStats ps;
  ps.pid = pid;

  // Read cmdline
  ps.cmdline = read_cmdline(pid);

  // Extract node name
  ps.node_name = extract_node_name_from_cmdline(ps.cmdline);

  // Read /proc/<pid>/stat for CPU times
  std::string stat_path = "/proc/" + std::to_string(pid) + "/stat";
  std::ifstream stat_file(stat_path);
  if (stat_file.is_open()) {
    std::string line;
    std::getline(stat_file, line);
    // Format: pid (comm) state ppid ... utime stime ...
    // utime is field 14, stime is field 15 (1-indexed)
    // Find the closing paren to skip the comm field which may contain spaces
    auto paren_pos = line.rfind(')');
    if (paren_pos != std::string::npos) {
      std::istringstream ss(line.substr(paren_pos + 2));       // Skip ") "
      std::string field;
      std::vector<std::string> fields;
      while (ss >> field) {
        fields.push_back(field);
      }
      // After (comm), fields are: state(0), ppid(1), ... utime(11), stime(12), ...
      if (fields.size() > 12) {
        ps.utime = std::stoull(fields[11]);
        ps.stime = std::stoull(fields[12]);
      }
      // vsize is field 20 (index 18 after comm), rss is field 21 (index 19)
      if (fields.size() > 21) {
        ps.vsize_kb = std::stoull(fields[20]) / 1024;         // vsize is in bytes
        uint64_t rss_pages = std::stoull(fields[21]);
        ps.rss_kb = rss_pages * 4;         // Assume 4KB pages
      }
    }
  }

  // Read memory info from /proc/<pid>/status as backup/confirmation
  std::string status_path = "/proc/" + std::to_string(pid) + "/status";
  std::ifstream status_file(status_path);
  if (status_file.is_open()) {
    std::string line;
    while (std::getline(status_file, line)) {
      if (line.rfind("VmRSS:", 0) == 0) {
        std::istringstream ss(line.substr(6));
        uint64_t val;
        if (ss >> val) {
          ps.rss_kb = val;
        }
      }
    }
  }

  // Read I/O stats from /proc/<pid>/io (may not be accessible without permissions)
  std::string io_path = "/proc/" + std::to_string(pid) + "/io";
  std::ifstream io_file(io_path);
  if (io_file.is_open()) {
    std::string line;
    while (std::getline(io_file, line)) {
      if (line.rfind("read_bytes:", 0) == 0) {
        std::istringstream ss(line.substr(11));
        ss >> ps.read_bytes;
      } else if (line.rfind("write_bytes:", 0) == 0) {
        std::istringstream ss(line.substr(12));
        ss >> ps.write_bytes;
      }
    }
  }

  // Calculate memory percentage
  if (total_mem_kb > 0) {
    ps.mem_percent = 100.0 * static_cast<double>(ps.rss_kb) / static_cast<double>(total_mem_kb);
  }

  return ps;
}

// Find all ROS 2 node processes by scanning /proc
static std::vector<ProcessStats> find_ros_processes(uint64_t total_mem_kb)
{
  std::vector<ProcessStats> result;
  DIR * proc_dir = opendir("/proc");
  if (!proc_dir) {return result;}

  struct dirent * entry;
  while ((entry = readdir(proc_dir)) != nullptr) {
    // Check if directory name is a number (PID)
    char * endptr;
    pid_t pid = strtol(entry->d_name, &endptr, 10);
    if (*endptr != '\0' || pid <= 0) {continue;}

    std::string cmdline = read_cmdline(pid);
    if (cmdline.empty()) {continue;}

    // Check if this is a ROS 2 process - look for various indicators
    bool is_ros_process =
      cmdline.find("__node:=") != std::string::npos ||    // Explicit node name
      cmdline.find("--ros-args") != std::string::npos ||  // ROS 2 args
      cmdline.find("/opt/ros/") != std::string::npos ||   // ROS install path (includes lib/)
      cmdline.find("/install/") != std::string::npos;     // Workspace install path

    if (is_ros_process) {
      ProcessStats ps = read_process_stats(pid, total_mem_kb);
      if (!ps.node_name.empty()) {
        result.push_back(ps);
      }
    }
  }
  closedir(proc_dir);
  return result;
}

// Count number of CPU cores
static int get_num_cores()
{
  static int num_cores = 0;
  if (num_cores == 0) {
    auto cpu_times = read_cpu_times();
    num_cores = static_cast<int>(cpu_times.size()) - 1;  // Subtract 1 for aggregate "cpu" line
    if (num_cores < 1) {num_cores = 1;}
  }
  return num_cores;
}

// Build JSON for node stats
static std::string build_nodes_json(
  const std::vector<ProcessStats> & cur,
  const std::unordered_map<pid_t, ProcessStats> & prev,
  double total_cpu_delta,
  double sample_interval_sec)
{
  std::ostringstream js;
  js << std::fixed;
  js.precision(2);

  int num_cores = get_num_cores();

  js << "{\"nodes\":[";
  bool first = true;
  for (const auto & ps : cur) {
    if (!first) {js << ",";}
    first = false;

    double cpu_pct = 0.0;
    double read_bps = 0.0;
    double write_bps = 0.0;

    auto it = prev.find(ps.pid);
    if (it != prev.end() && total_cpu_delta > 0) {
      uint64_t proc_delta = (ps.utime + ps.stime) - (it->second.utime + it->second.stime);
      // Multiply by num_cores to show percentage of a single core (like htop)
      // 100% means using one full core
      cpu_pct = 100.0 * static_cast<double>(proc_delta) * num_cores / total_cpu_delta;

      // I/O bandwidth
      if (ps.read_bytes >= it->second.read_bytes) {
        read_bps = static_cast<double>(ps.read_bytes - it->second.read_bytes) / sample_interval_sec;
      }
      if (ps.write_bytes >= it->second.write_bytes) {
        write_bps =
          static_cast<double>(ps.write_bytes - it->second.write_bytes) / sample_interval_sec;
      }
    }

    // Escape JSON strings
    auto escape_json = [](const std::string & s) {
        std::string result;
        for (char c : s) {
          if (c == '"') {result += "\\\"";} else if (c == '\\') {
            result += "\\\\";
          } else if (c < 32) {result += ' ';} else {result += c;}
        }
        return result;
      };

    js << "{\"name\":\"" << escape_json(ps.node_name) << "\","
       << "\"pid\":" << ps.pid << ","
       << "\"cpu_percent\":" << cpu_pct << ","
       << "\"mem_percent\":" << ps.mem_percent << ","
       << "\"mem_mb\":" << (static_cast<double>(ps.rss_kb) / 1024.0) << ","
       << "\"read_bytes_per_sec\":" << read_bps << ","
       << "\"write_bytes_per_sec\":" << write_bps << "}";
  }
  js << "]}";
  return js.str();
}

// Network interface stats from /proc/net/dev
struct NetIfaceStats
{
  std::string name;
  uint64_t rx_bytes = 0;
  uint64_t tx_bytes = 0;
  int64_t speed_mbps = -1;  // Link speed in Mbps, -1 if unknown
};

static std::vector<NetIfaceStats> read_net_stats()
{
  std::vector<NetIfaceStats> result;
  std::ifstream f("/proc/net/dev");
  std::string line;
  // Skip header lines
  std::getline(f, line);
  std::getline(f, line);

  while (std::getline(f, line)) {
    // Format: "  iface: rx_bytes rx_packets ... tx_bytes tx_packets ..."
    auto colon = line.find(':');
    if (colon == std::string::npos) {continue;}

    NetIfaceStats ns;
    ns.name = line.substr(0, colon);
    // Trim whitespace from name
    ns.name.erase(0, ns.name.find_first_not_of(" \t"));
    ns.name.erase(ns.name.find_last_not_of(" \t") + 1);

    std::istringstream ss(line.substr(colon + 1));
    uint64_t rx_packets, rx_errs, rx_drop, rx_fifo, rx_frame, rx_compressed, rx_multicast;
    uint64_t tx_packets, tx_errs, tx_drop, tx_fifo, tx_colls, tx_carrier, tx_compressed;
    ss >> ns.rx_bytes >> rx_packets >> rx_errs >> rx_drop >> rx_fifo >> rx_frame >>
    rx_compressed >> rx_multicast;
    ss >> ns.tx_bytes >> tx_packets >> tx_errs >> tx_drop >> tx_fifo >> tx_colls >>
    tx_carrier >> tx_compressed;

    // Skip loopback
    if (ns.name != "lo") {
      // Read link speed from sysfs (returns Mbps, or -1 if not available)
      std::string speed_path = "/sys/class/net/" + ns.name + "/speed";
      std::ifstream speed_file(speed_path);
      if (speed_file.is_open()) {
        int64_t speed;
        if (speed_file >> speed && speed > 0) {
          ns.speed_mbps = speed;
        }
      }
      result.push_back(ns);
    }
  }
  return result;
}

// Build the JSON response
// prev_cpu is the *previous* sample so we can compute a delta-based percentage.
static std::string build_system_json(
  const std::vector<CpuTimes> & prev,
  const std::vector<CpuTimes> & cur,
  const MemInfo & mem,
  const LoadAvg & la,
  const std::vector<NetIfaceStats> & prev_net,
  const std::vector<NetIfaceStats> & cur_net,
  const std::vector<UsbBusStats> & usb_buses,
  const std::vector<UsbDeviceStats> & prev_usb,
  const std::vector<UsbDeviceStats> & cur_usb,
  double sample_interval_sec)
{
  auto pct = [](const CpuTimes & a, const CpuTimes & b) -> double {
      auto dt = b.total() - a.total();
      auto da = b.active() - a.active();
      return dt == 0 ? 0.0 : 100.0 * static_cast<double>(da) / static_cast<double>(dt);
    };

  std::ostringstream js;
  js << std::fixed;
  js.precision(1);

  js << "{";
  // overall CPU
  if (!prev.empty() && !cur.empty()) {
    js << "\"cpu_percent\":" << pct(prev[0], cur[0]) << ",";
  } else {
    js << "\"cpu_percent\":0,";
  }

  // per-core
  js << "\"cores\":[";
  for (size_t i = 1; i < cur.size() && i < prev.size(); ++i) {
    if (i > 1) {js << ",";}
    js << "{\"name\":\"" << cur[i].name << "\",\"percent\":" << pct(prev[i], cur[i]) << "}";
  }
  js << "],";

  // memory (in MB)
  auto to_mb = [](uint64_t kb) {return static_cast<double>(kb) / 1024.0;};
  uint64_t used_kb = mem.total_kb - mem.avail_kb;
  js << "\"memory\":{";
  js << "\"total_mb\":" << to_mb(mem.total_kb) << ",";
  js << "\"used_mb\":" << to_mb(used_kb) << ",";
  js << "\"free_mb\":" << to_mb(mem.avail_kb) << ",";
  js << "\"buffers_mb\":" << to_mb(mem.buffers_kb) << ",";
  js << "\"cached_mb\":" << to_mb(mem.cached_kb) << ",";
  js << "\"percent\":"
     << (mem.total_kb == 0 ? 0.0 : 100.0 * static_cast<double>(used_kb) /
  static_cast<double>(mem.total_kb));
  js << "},";

  // swap
  uint64_t swap_used = mem.swap_total_kb - mem.swap_free_kb;
  js << "\"swap\":{";
  js << "\"total_mb\":" << to_mb(mem.swap_total_kb) << ",";
  js << "\"used_mb\":" << to_mb(swap_used) << ",";
  js << "\"percent\":"
     << (mem.swap_total_kb == 0 ? 0.0 : 100.0 * static_cast<double>(swap_used) /
  static_cast<double>(mem.swap_total_kb));
  js << "},";

  // load average
  js << "\"load_avg\":{\"one\":" << la.one
     << ",\"five\":" << la.five
     << ",\"fifteen\":" << la.fifteen << "},";

  // Network interfaces with bandwidth
  js << "\"network\":[";
  for (size_t i = 0; i < cur_net.size(); ++i) {
    if (i > 0) {js << ",";}
    const auto & cur_if = cur_net[i];
    // Find matching previous stats
    double rx_bps = 0.0, tx_bps = 0.0;
    for (const auto & prev_if : prev_net) {
      if (prev_if.name == cur_if.name) {
        // Calculate bytes per second
        uint64_t rx_delta = (cur_if.rx_bytes >= prev_if.rx_bytes) ?
          (cur_if.rx_bytes - prev_if.rx_bytes) : 0;
        uint64_t tx_delta = (cur_if.tx_bytes >= prev_if.tx_bytes) ?
          (cur_if.tx_bytes - prev_if.tx_bytes) : 0;
        rx_bps = static_cast<double>(rx_delta) / sample_interval_sec;
        tx_bps = static_cast<double>(tx_delta) / sample_interval_sec;
        break;
      }
    }
    js << "{\"name\":\"" << cur_if.name << "\","
       << "\"rx_bytes\":" << cur_if.rx_bytes << ","
       << "\"tx_bytes\":" << cur_if.tx_bytes << ","
       << "\"rx_bytes_per_sec\":" << rx_bps << ","
       << "\"tx_bytes_per_sec\":" << tx_bps << ","
       << "\"speed_mbps\":" << cur_if.speed_mbps << "}";
  }
  js << "],";

  // USB devices with I/O stats
  js << "\"usb\":[";
  for (size_t i = 0; i < cur_usb.size(); ++i) {
    if (i > 0) {js << ",";}
    const auto & cur_dev = cur_usb[i];
    double read_bps = 0.0, write_bps = 0.0;
    // Calculate bandwidth for storage devices
    if (cur_dev.is_storage) {
      for (const auto & prev_dev : prev_usb) {
        if (prev_dev.bus_port == cur_dev.bus_port && prev_dev.is_storage) {
          uint64_t rd = (cur_dev.read_bytes >= prev_dev.read_bytes) ?
            (cur_dev.read_bytes - prev_dev.read_bytes) : 0;
          uint64_t wd = (cur_dev.write_bytes >= prev_dev.write_bytes) ?
            (cur_dev.write_bytes - prev_dev.write_bytes) : 0;
          read_bps = static_cast<double>(rd) / sample_interval_sec;
          write_bps = static_cast<double>(wd) / sample_interval_sec;
          break;
        }
      }
    }
    // Escape JSON strings
    auto escape_json = [](const std::string & s) {
        std::string result;
        for (char c : s) {
          if (c == '"') {result += "\\\"";} else if (c == '\\') {
            result += "\\\\";
          } else if (c < 32) {result += ' ';} else {result += c;}
        }
        return result;
      };
    js << "{\"bus_port\":\"" << cur_dev.bus_port << "\","
       << "\"bus_num\":" << cur_dev.bus_num << ","
       << "\"product\":\"" << escape_json(cur_dev.product) << "\","
       << "\"manufacturer\":\"" << escape_json(cur_dev.manufacturer) << "\","
       << "\"speed_mbps\":" << cur_dev.speed_mbps << ","
       << "\"dev_class\":\"" << escape_json(cur_dev.dev_class) << "\","
       << "\"is_storage\":" << (cur_dev.is_storage ? "true" : "false") << ","
       << "\"block_dev\":\"" << cur_dev.block_dev << "\","
       << "\"read_bytes\":" << cur_dev.read_bytes << ","
       << "\"write_bytes\":" << cur_dev.write_bytes << ","
       << "\"read_bytes_per_sec\":" << read_bps << ","
       << "\"write_bytes_per_sec\":" << write_bps << "}";
  }
  js << "],";

  // USB bus/controller stats
  js << "\"usb_buses\":[";
  for (size_t i = 0; i < usb_buses.size(); ++i) {
    if (i > 0) {js << ",";}
    const auto & bus = usb_buses[i];
    // Escape JSON strings
    auto escape_json = [](const std::string & s) {
        std::string result;
        for (char c : s) {
          if (c == '"') {result += "\\\"";} else if (c == '\\') {
            result += "\\\\";
          } else if (c < 32) {result += ' ';} else {result += c;}
        }
        return result;
      };
    js << "{\"bus_num\":" << bus.bus_num << ","
       << "\"speed_mbps\":" << bus.speed_mbps << ","
       << "\"version\":\"" << bus.version << "\","
       << "\"controller\":\"" << escape_json(bus.controller) << "\","
       << "\"device_count\":" << bus.device_count << ","
       << "\"claimed_bw_mbps\":" << bus.claimed_bw_mbps << ","
       << "\"usbmon_available\":" << (bus.usbmon_available ? "true" : "false") << ","
       << "\"actual_bytes\":" << bus.actual_bytes << ","
       << "\"actual_bytes_per_sec\":" << bus.actual_bytes_per_sec << "}";
  }
  js << "]";

  js << "}";
  return js.str();
}

int main(int argc, char ** argv)
{
  rclcpp::init(argc, argv);
  auto node = rclcpp::Node::make_shared("http_server");

  // Declare configurable port parameter (default 2525)
  node->declare_parameter("http_port", 2525);
  int port = static_cast<int>(node->get_parameter("http_port").as_int());

  // Get the path to the installed web directory
  std::string web_dir =
    ament_index_cpp::get_package_share_directory("system_webview") + "/web";

  if (!std::filesystem::exists(web_dir)) {
    RCLCPP_ERROR(node->get_logger(), "Web directory not found: %s", web_dir.c_str());
    return 1;
  }

  // Start usbmon monitoring (requires debugfs mounted and appropriate permissions)
  // Falls back gracefully if not available
  g_usbmon_monitor.start();
  if (g_usbmon_monitor.is_available()) {
    RCLCPP_INFO(node->get_logger(), "usbmon monitoring enabled for real-time USB bandwidth");
  } else {
    RCLCPP_INFO(
      node->get_logger(),
      "usbmon not available - showing claimed bandwidth only. "
      "For real-time USB traffic: mount -t debugfs none /sys/kernel/debug");
  }

  // Shared CPU sample (protected by mutex) - background thread updates it once
  // per second so the API response contains a delta-based CPU percentage.
  std::mutex stats_mtx;
  std::vector<CpuTimes> prev_cpu = read_cpu_times();
  std::vector<NetIfaceStats> prev_net = read_net_stats();
  std::vector<UsbBusStats> init_buses = read_usb_bus_stats();
  std::vector<UsbDeviceStats> prev_usb = read_usb_stats(init_buses);

  // Per-node process stats tracking
  MemInfo init_mem = read_meminfo();
  std::unordered_map<pid_t, ProcessStats> prev_node_stats;
  uint64_t prev_total_cpu = 0;
  if (!prev_cpu.empty()) {
    prev_total_cpu = prev_cpu[0].total();
  }
  // Initialize node stats
  auto init_nodes = find_ros_processes(init_mem.total_kb);
  for (const auto & ps : init_nodes) {
    prev_node_stats[ps.pid] = ps;
  }

  std::thread sampler([&]() {
      while (rclcpp::ok()) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        auto cpu_snapshot = read_cpu_times();
        auto net_snapshot = read_net_stats();
        auto bus_snapshot = read_usb_bus_stats();
        auto usb_snapshot = read_usb_stats(bus_snapshot);
        auto mem_snapshot = read_meminfo();
        auto node_snapshot = find_ros_processes(mem_snapshot.total_kb);
        {
          std::lock_guard<std::mutex> lk(stats_mtx);
          prev_cpu = cpu_snapshot;
          prev_net = net_snapshot;
          prev_usb = usb_snapshot;
          // Update node stats
          if (!cpu_snapshot.empty()) {
            prev_total_cpu = cpu_snapshot[0].total();
          }
          prev_node_stats.clear();
          for (const auto & ps : node_snapshot) {
            prev_node_stats[ps.pid] = ps;
          }
        }
      }
    });

  // Create server outside thread so we can stop it on shutdown
  httplib::Server svr;

  // API: system stats
  svr.Get("/api/system", [&](const httplib::Request & /*req*/, httplib::Response & res) {
      std::vector<CpuTimes> prev_cpu_snapshot;
      std::vector<NetIfaceStats> prev_net_snapshot;
      std::vector<UsbDeviceStats> prev_usb_snapshot;
      {
        std::lock_guard<std::mutex> lk(stats_mtx);
        prev_cpu_snapshot = prev_cpu;
        prev_net_snapshot = prev_net;
        prev_usb_snapshot = prev_usb;
      }
      auto cur_cpu = read_cpu_times();
      auto cur_net = read_net_stats();
      auto usb_buses = read_usb_bus_stats();
      auto cur_usb = read_usb_stats(usb_buses);
      auto mem = read_meminfo();
      auto la = read_loadavg();

      res.set_header("Access-Control-Allow-Origin", "*");
      res.set_content(
        build_system_json(
          prev_cpu_snapshot, cur_cpu, mem, la,
          prev_net_snapshot, cur_net,
          usb_buses,
          prev_usb_snapshot, cur_usb,
          1.0),   // sample interval in seconds
        "application/json");
    });

  // API: per-node resource stats
  svr.Get("/api/nodes", [&](const httplib::Request & /*req*/, httplib::Response & res) {
      std::unordered_map<pid_t, ProcessStats> prev_nodes_snapshot;
      uint64_t prev_cpu_total_snapshot = 0;
      {
        std::lock_guard<std::mutex> lk(stats_mtx);
        prev_nodes_snapshot = prev_node_stats;
        prev_cpu_total_snapshot = prev_total_cpu;
      }

      auto mem = read_meminfo();
      auto cur_nodes = find_ros_processes(mem.total_kb);
      auto cur_cpu = read_cpu_times();

      // Calculate total CPU delta for percentage calculation
      double total_cpu_delta = 0.0;
      if (!cur_cpu.empty()) {
        total_cpu_delta = static_cast<double>(cur_cpu[0].total() - prev_cpu_total_snapshot);
      }

      res.set_header("Access-Control-Allow-Origin", "*");
      res.set_content(
        build_nodes_json(cur_nodes, prev_nodes_snapshot, total_cpu_delta, 1.0),
        "application/json");
    });

  // Static file serving
  svr.set_mount_point("/", web_dir.c_str());

  svr.set_error_handler([](const httplib::Request & /*req*/, httplib::Response & res) {
      res.set_content("404 Not Found", "text/plain");
      res.status = 404;
    });

  // Start HTTP server in a separate thread
  std::thread server_thread([&]() {
      if (svr.bind_to_port("0.0.0.0", port)) {
        RCLCPP_INFO(node->get_logger(), "HTTP server listening on port %d", port);
        svr.listen_after_bind();
      } else {
        RCLCPP_ERROR(
          node->get_logger(),
          "Failed to bind HTTP server to port %d (address already in use?)", port);
        rclcpp::shutdown();
      }
    });

  rclcpp::spin(node);

  // Gracefully stop the HTTP server so it releases the port immediately
  RCLCPP_INFO(node->get_logger(), "Shutting down HTTP server...");
  svr.stop();

  // Stop usbmon monitoring
  g_usbmon_monitor.stop();

  server_thread.join();
  sampler.join();
  rclcpp::shutdown();
  return 0;
}
