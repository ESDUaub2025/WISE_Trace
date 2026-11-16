#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if [[ $(id -u) -ne 0 ]]; then echo 'Run with sudo.' >&2; exit 1; fi
root_source=$(findmnt -n -o SOURCE /)
if [[ "$root_source" == /dev/root || "$root_source" == /dev/nvme0n1p1 ]] && [[ -b /dev/nvme0n1p1 ]]; then
  growpart /dev/nvme0n1 1 || [[ $? -eq 1 ]]
  resize2fs /dev/nvme0n1p1
fi
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
apt-get update -qq
apt-get install -y -qq ca-certificates curl unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
systemctl enable --now docker
install -d -m 0700 /opt/wise /var/backups/wise
printf 'Server ready. No AWS resources were created or resized.\n'
