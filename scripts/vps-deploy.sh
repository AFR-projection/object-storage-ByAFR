#!/usr/bin/env bash
# Storage ByAFR — one-command VPS deploy
# Usage (from project root on the VPS):
#   chmod +x scripts/vps-deploy.sh
#   ./scripts/vps-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker/docker-compose.yml)

echo "==> Storage ByAFR VPS deploy"
echo "    Project: $ROOT"
echo

# ── 1. Docker ──────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker not found. Install first:"
  echo "  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin missing."
  exit 1
fi

# ── 2. .env ────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "==> Creating .env from .env.example"
  cp .env.example .env
  # Generate a session secret
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 32)"
    if grep -q '^SESSION_SECRET=' .env; then
      sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
    else
      echo "SESSION_SECRET=$SECRET" >> .env
    fi
  fi
  echo
  echo "IMPORTANT: Edit .env sekarang sebelum lanjut!"
  echo "  nano .env"
  echo
  echo "Minimal yang wajib diisi:"
  echo "  - DATABASE_URL          (Neon Postgres)"
  echo "  - R2_*                  (Cloudflare R2)"
  echo "  - MASTER_PASSWORD       (password admin)"
  echo "  - NEXT_PUBLIC_APP_URL   (http://IP-VPS atau https://domain.com)"
  echo
  echo "Lalu jalankan lagi: ./scripts/vps-deploy.sh"
  exit 0
fi

# Quick sanity checks
need_vars=(DATABASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME MASTER_PASSWORD NEXT_PUBLIC_APP_URL)
missing=0
for v in "${need_vars[@]}"; do
  val="$(grep -E "^${v}=" .env | head -n1 | cut -d= -f2- || true)"
  if [[ -z "$val" || "$val" == *"your_"* || "$val" == *"change-this"* || "$val" == *"ep-xxx"* ]]; then
    echo "WARN: $v masih kosong / placeholder di .env"
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  echo
  echo "Isi semua variabel di atas, lalu jalankan script ini lagi."
  exit 1
fi

# Ensure Redis is used inside Docker (override local REDIS_DISABLED=true)
# compose already sets REDIS_DISABLED=false for app/worker

# ── 3. Build & start ───────────────────────────────────────
echo "==> Building & starting containers..."
"${COMPOSE[@]}" up -d --build

# ── 4. Database schema + master account ────────────────────
echo "==> Running DB setup (db:push + bootstrap)..."
"${COMPOSE[@]}" --profile setup run --rm setup

echo
echo "==> DONE"
echo "    App  : ${NEXT_PUBLIC_APP_URL:-http://YOUR-VPS-IP}"
echo "    Logs : docker compose -f docker/docker-compose.yml logs -f"
echo "    Stop : docker compose -f docker/docker-compose.yml down"
echo
echo "Login dengan MASTER_USERNAME / MASTER_PASSWORD dari .env"
