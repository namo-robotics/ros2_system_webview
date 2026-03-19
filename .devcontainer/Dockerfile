FROM osrf/ros:jazzy-desktop-full

SHELL ["/bin/bash", "-c"]

# Install build dependencies
RUN apt-get update && apt-get install -y \
    ros-dev-tools \
    python3-pip \
    python3-colcon-common-extensions \
    git \
    curl \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Install nvm and Node.js/npm
ENV NVM_DIR=/usr/local/nvm
RUN mkdir -p $NVM_DIR \
    && curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && source $NVM_DIR/nvm.sh \
    && nvm install --lts \
    && nvm use --lts \
    && nvm alias default node
RUN echo 'export NVM_DIR="/usr/local/nvm"' >> /etc/bash.bashrc \
    && echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> /etc/bash.bashrc

# Copy package.xml temporarily and install rosdeps
COPY package.xml /tmp/deps/package.xml
RUN apt-get update -y \
    && source /opt/ros/jazzy/setup.sh && \
    rosdep update && \
    rosdep install --from-paths /tmp/deps -ry || true && \
    rm -rf /tmp/deps

# Source ROS 2 environment in bashrc
RUN echo "source /opt/ros/\$ROS_DISTRO/setup.bash" >> /etc/bash.bashrc
