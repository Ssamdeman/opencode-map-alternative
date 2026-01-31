FROM ubuntu:24.04

# Avoid prompts
ENV DEBIAN_FRONTEND=noninteractive

# Update & Install Common Tools + PowerShell Dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    unzip \
    wget \
    nano \
    sudo \
    apt-transport-https \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install PowerShell (pwsh)
RUN wget -q "https://packages.microsoft.com/config/ubuntu/24.04/packages-microsoft-prod.deb" \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y powershell

# Install Bun
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash

# Ensure Bun is in path for all shells
ENV PATH=$BUN_INSTALL/bin:$PATH

# Set working directory
WORKDIR /workspace