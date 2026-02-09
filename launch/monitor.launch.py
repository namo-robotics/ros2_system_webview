from launch import LaunchDescription
from launch.actions import IncludeLaunchDescription
from launch_ros.actions import Node
from launch.substitutions import PathJoinSubstitution
from launch_ros.substitutions import FindPackageShare
from launch.launch_description_sources import AnyLaunchDescriptionSource 

def generate_launch_description():
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
        rosbridge_launch,
        Node(
            package='ros2_system_monitor',
            executable='http_server',
            name='static_http_server',
            output='screen',
        ),
    ])
