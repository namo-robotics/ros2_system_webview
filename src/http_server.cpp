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

#include <httplib.h>

#include <filesystem>
#include <fstream>
#include <mutex>
#include <numeric>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

#include "ament_index_cpp/get_package_share_directory.hpp"
#include "rclcpp/rclcpp.hpp"

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

// Build the JSON response
// prev_cpu is the *previous* sample so we can compute a delta-based percentage.
static std::string build_system_json(
  const std::vector<CpuTimes> & prev,
  const std::vector<CpuTimes> & cur,
  const MemInfo & mem,
  const LoadAvg & la)
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
     << ",\"fifteen\":" << la.fifteen << "}";

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

  // Shared CPU sample (protected by mutex) - background thread updates it once
  // per second so the API response contains a delta-based CPU percentage.
  std::mutex cpu_mtx;
  std::vector<CpuTimes> prev_cpu = read_cpu_times();

  std::thread sampler([&]() {
      while (rclcpp::ok()) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        auto snapshot = read_cpu_times();
        {
          std::lock_guard<std::mutex> lk(cpu_mtx);
          prev_cpu = snapshot;
        }
      }
    });

  // Create server outside thread so we can stop it on shutdown
  httplib::Server svr;

  // API: system stats
  svr.Get("/api/system", [&](const httplib::Request & /*req*/, httplib::Response & res) {
      std::vector<CpuTimes> prev_snapshot;
      {
        std::lock_guard<std::mutex> lk(cpu_mtx);
        prev_snapshot = prev_cpu;
      }
      auto cur = read_cpu_times();
      auto mem = read_meminfo();
      auto la = read_loadavg();

      res.set_header("Access-Control-Allow-Origin", "*");
      res.set_content(build_system_json(prev_snapshot, cur, mem, la), "application/json");
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

  server_thread.join();
  sampler.join();
  rclcpp::shutdown();
  return 0;
}
