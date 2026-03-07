# Copyright 2026 Namo Robotics
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument, IncludeLaunchDescription
from launch.conditions import IfCondition
from launch.launch_description_sources import AnyLaunchDescriptionSource
from launch.substitutions import LaunchConfiguration, PathJoinSubstitution
from launch_ros.actions import Node
from launch_ros.substitutions import FindPackageShare


def generate_launch_description():
    # Use 'http_port' to avoid name collision with rosbridge's own 'port' arg,
    # since ROS 2 launch shares a single LaunchConfiguration namespace.
    http_port_arg = DeclareLaunchArgument(
        'http_port',
        default_value='2525',
        description='Port for the HTTP server (web UI & system stats API)',
    )

    launch_rosbridge_arg = DeclareLaunchArgument(
        'launch_rosbridge',
        default_value='true',
        description='Set to false if rosbridge is already running externally',
    )

    http_server = Node(
        package='system_webview',
        executable='http_server',
        name='http_server',
        output='screen',
        parameters=[{'http_port': LaunchConfiguration('http_port')}],
    )

    # rosbridge_port is hard-coded to 9090 because the webpage expects this port
    rosbridge_launch = IncludeLaunchDescription(
        AnyLaunchDescriptionSource(
            [
                PathJoinSubstitution(
                    [
                        FindPackageShare('rosbridge_server'),
                        'launch',
                        'rosbridge_websocket_launch.xml',
                    ]
                )
            ]
        ),
        launch_arguments={
            'port': '9090',
        }.items(),
        condition=IfCondition(LaunchConfiguration('launch_rosbridge')),
    )

    return LaunchDescription(
        [
            http_port_arg,
            launch_rosbridge_arg,
            http_server,
            rosbridge_launch,
        ]
    )
