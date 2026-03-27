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

#ifndef PROCESS_STATS_HPP_
#define PROCESS_STATS_HPP_

#include <sys/types.h>

#include <cstdint>
#include <string>
#include <vector>

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

// Read /proc/<pid>/cmdline
std::string read_cmdline(pid_t pid);

// Extract ROS node name from command line arguments
std::string extract_node_name_from_cmdline(const std::string & cmdline);

// Read process stats from /proc/<pid>/*
ProcessStats read_process_stats(pid_t pid, uint64_t total_mem_kb);

// Find all ROS 2 node processes by scanning /proc
std::vector<ProcessStats> find_ros_processes(uint64_t total_mem_kb);

#endif  // PROCESS_STATS_HPP_
