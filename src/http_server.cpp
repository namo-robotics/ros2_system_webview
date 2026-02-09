#include <rclcpp/rclcpp.hpp>
#include <httplib.h>
#include <thread>
#include <filesystem>
#include <string>
#include <ament_index_cpp/get_package_share_directory.hpp>

int main(int argc, char **argv) {
  rclcpp::init(argc, argv);
  auto node = rclcpp::Node::make_shared("http_server");

  // Get the path to the installed web directory
  std::string web_dir = ament_index_cpp::get_package_share_directory("ros2_system_monitor") + "/web";

  // Check if directory exists
  if (!std::filesystem::exists(web_dir)) {
    RCLCPP_ERROR(node->get_logger(), "Web directory not found: %s", web_dir.c_str());
    return 1;
  }

  // Start HTTP server in a separate thread for non-blocking operation
  std::thread server_thread([&]() {
    httplib::Server svr;

    // Serve static files from the web directory at root "/"
    svr.set_mount_point("/", web_dir.c_str());

    // Handle errors gracefully
    svr.set_error_handler([](const httplib::Request & /*req*/, httplib::Response &res) {
      res.set_content("404 Not Found", "text/plain");
      res.status = 404;
    });

    // Listen on port 2525
    if (!svr.listen("0.0.0.0", 2525)) {
      RCLCPP_ERROR(node->get_logger(), "Failed to start HTTP server on port 2525");
    }
  });

  // Spin the ROS node (though not strictly needed here, allows integration if expanded)
  rclcpp::spin(node);

  // Cleanup
  server_thread.join();
  rclcpp::shutdown();
  return 0;
}