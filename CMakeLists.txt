cmake_minimum_required(VERSION 3.8)
project(ros2_system_monitor)

if(NOT CMAKE_CXX_STANDARD)
  set(CMAKE_CXX_STANDARD 17)
endif()

if(CMAKE_COMPILER_IS_GNUCXX OR CMAKE_CXX_COMPILER_ID MATCHES "Clang")
  add_compile_options(-Wall -Wextra -Wpedantic)
endif()

find_package(ament_cmake REQUIRED)
find_package(rclcpp REQUIRED)
find_package(ament_index_cpp REQUIRED)
find_package(PkgConfig REQUIRED)

pkg_check_modules(HTTPLIB REQUIRED cpp-httplib)

add_executable(http_server
  src/http_server.cpp
)

target_include_directories(http_server PRIVATE
  ${HTTPLIB_INCLUDE_DIRS}
)

target_link_libraries(http_server
  ${HTTPLIB_LIBRARIES}
)

ament_target_dependencies(http_server
  rclcpp
  ament_index_cpp
)

install(TARGETS
  http_server
  DESTINATION lib/${PROJECT_NAME}
)

install(DIRECTORY
  web/
  DESTINATION share/${PROJECT_NAME}/web
)

install(DIRECTORY
  launch/
  DESTINATION share/${PROJECT_NAME}/launch
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()