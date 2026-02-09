from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch_ros.actions import Node
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import AnyLaunchDescriptionSource


def generate_launch_description():
    port_arg = DeclareLaunchArgument(
        'port',
        default_value='2525',
        description='Port for the HTTP server (web UI & system stats API)',
    )

    rosbridge_launch = IncludeLaunchDescription(
        AnyLaunchDescriptionSource([
            PathJoinSubstitution([
                FindPackageShare('rosbridge_server'),
                'launch',
                'rosbridge_websocket_launch.xml'
            ])
        ])
    )

    return LaunchDescription([
        port_arg,
        rosbridge_launch,
        Node(
            package='ros2_system_monitor',
            executable='http_server',
            name='static_http_server',
            output='screen',
            parameters=[{'port': LaunchConfiguration('port')}],
        ),
    ])
