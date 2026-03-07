cmake_minimum_required(VERSION 3.8)
project(system_webview)

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
  rclcpp::rclcpp
  ament_index_cpp::ament_index_cpp
)

install(TARGETS
  http_server
  DESTINATION lib/${PROJECT_NAME}
)

# ── Frontend ───────────────────────────────────────────────────────────────────
# By default the pre-built static export in web/out/ is installed directly.
# This is required for the ROS build farm which has no internet access.
# Set -DBUILD_FRONTEND=ON when building locally to rebuild via npm.
option(BUILD_FRONTEND "Rebuild the Next.js frontend during the build" OFF)

if(BUILD_FRONTEND)
  find_program(NPM_EXECUTABLE npm REQUIRED)
  add_custom_target(frontend_build ALL
    COMMAND ${NPM_EXECUTABLE} install
    COMMAND ${NPM_EXECUTABLE} run build
    WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/web
    COMMENT "Building Next.js frontend"
  )
endif()

install(DIRECTORY
  web/out/
  DESTINATION share/${PROJECT_NAME}/web
)

install(DIRECTORY
  launch/
  DESTINATION share/${PROJECT_NAME}/launch
)

if(BUILD_TESTING)
  find_package(ament_lint_auto REQUIRED)
  set(ament_cmake_copyright_FOUND TRUE)
  ament_lint_auto_find_test_dependencies()
endif()

ament_package()