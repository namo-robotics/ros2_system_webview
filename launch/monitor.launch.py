from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch_ros.actions import Node
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.conditions import IfCondition


def generate_launch_description():
    port_arg = DeclareLaunchArgument(
        'port',
        default_value='2525',
        description='Port for the HTTP server (web UI & system stats API)',
    )

    rosbridge_port_arg = DeclareLaunchArgument(
        'rosbridge_port',
        default_value='9090',
        description='Port for the rosbridge WebSocket server',
    )

    launch_rosbridge_arg = DeclareLaunchArgument(
        'launch_rosbridge',
        default_value='true',
        description='Set to false if rosbridge is already running externally',
    )

    rosbridge_launch = IncludeLaunchDescription(
        AnyLaunchDescriptionSource([
            PathJoinSubstitution([
                FindPackageShare('rosbridge_server'),
                'launch',
                'rosbridge_websocket_launch.xml'
            ])
        ]),
        launch_arguments={
            'port': '9090',
        }.items(),
        condition=IfCondition(LaunchConfiguration('launch_rosbridge')),
    )

    return LaunchDescription([
        port_arg,
        rosbridge_port_arg,
        launch_rosbridge_arg,
        rosbridge_launch,
        Node(
            package='ros2_system_webview',
            executable='http_server',
            name='static_http_server',
            output='screen',
            parameters=[{'port': 2525}],
        ),
    ])
