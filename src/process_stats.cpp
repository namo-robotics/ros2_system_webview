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

#include "process_stats.hpp"

#include <dirent.h>

#include <cstring>
#include <fstream>
#include <regex>
#include <sstream>

std::string read_cmdline(pid_t pid)
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

std::string extract_node_name_from_cmdline(const std::string & cmdline)
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

ProcessStats read_process_stats(pid_t pid, uint64_t total_mem_kb)
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

std::vector<ProcessStats> find_ros_processes(uint64_t total_mem_kb)
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
