#!/usr/bin/env bash
# Install Docker on a fresh Ubuntu/Debian VPS
# Usage: curl -fsSL ... | bash   OR   ./scripts/vps-install.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/vps-install.sh"
  exit 1
fi

echo "==> Installing Docker..."
curl -fsSL https://get.docker.com | sh

echo "==> Enabling Docker on boot..."
systemctl enable docker
systemctl start docker

if [[ -n "${SUDO_USER:-}" ]]; then
  usermod -aG docker "$SUDO_USER"
  echo "==> Added $SUDO_USER to docker group (re-login SSH agar aktif)"
fi

echo
echo "==> Docker ready"
docker --version
docker compose version
