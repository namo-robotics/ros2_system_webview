from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch_ros.actions import Node
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.conditions import IfCondition


def generate_launch_description():
    # Use 'http_port' to avoid name collision with rosbridge's own 'port' arg,
    # since ROS 2 launch shares a single LaunchConfiguration namespace.
    http_port_arg = DeclareLaunchArgument(
        "http_port",
        default_value="2525",
        description="Port for the HTTP server (web UI & system stats API)",
    )

    launch_rosbridge_arg = DeclareLaunchArgument(
        "launch_rosbridge",
        default_value="true",
        description="Set to false if rosbridge is already running externally",
    )

    http_server = Node(
        package="system_webview",
        executable="http_server",
        name="http_server",
        output="screen",
        parameters=[{"http_port": LaunchConfiguration("http_port")}],
    )

    # rosbridge_port is hard-coded to 9090 because the webpage expects this port
    rosbridge_launch = IncludeLaunchDescription(
        AnyLaunchDescriptionSource(
            [
                PathJoinSubstitution(
                    [
                        FindPackageShare("rosbridge_server"),
                        "launch",
                        "rosbridge_websocket_launch.xml",
                    ]
                )
            ]
        ),
        launch_arguments={
            "port": "9090",
        }.items(),
        condition=IfCondition(LaunchConfiguration("launch_rosbridge")),
    )

    return LaunchDescription(
        [
            http_port_arg,
            launch_rosbridge_arg,
            http_server,
            rosbridge_launch,
        ]
    )
