#!/usr/bin/env bash
# Storage ByAFR — one-command VPS deploy
# Usage (from project root on the VPS):
#   chmod +x scripts/vps-deploy.sh
#   ./scripts/vps-deploy.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker/docker-compose.yml)

echo "=========================================="
echo "  Storage ByAFR — VPS Deploy"
echo "=========================================="
echo "  Project: $ROOT"
echo

# ── 1. Docker ──────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker belum terinstall."
  echo "  sudo ./scripts/vps-install.sh"
  echo "  atau: curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "ERROR: Docker Compose plugin tidak ditemukan."
  exit 1
fi

mkdir -p docker/certs

# ── 2. .env ────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "==> Membuat .env dari .env.example"
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 32)"
    sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env && rm -f .env.bak
  fi
  echo
  echo "PENTING: Edit .env dulu, lalu jalankan script ini lagi."
  echo "  nano .env"
  echo
  echo "Wajib diisi:"
  echo "  DATABASE_URL          → Neon PostgreSQL"
  echo "  R2_*                  → Cloudflare R2"
  echo "  MASTER_PASSWORD       → password admin"
  echo "  NEXT_PUBLIC_APP_URL   → http://IP-VPS atau https://domain.com"
  echo
  exit 0
fi

# Load APP URL for messages (avoid sourcing .env — passwords may break shell)
APP_URL="$(grep -E '^NEXT_PUBLIC_APP_URL=' .env | head -n1 | cut -d= -f2- || true)"

need_vars=(DATABASE_URL R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME R2_PUBLIC_URL MASTER_PASSWORD NEXT_PUBLIC_APP_URL SESSION_SECRET)
missing=0
for v in "${need_vars[@]}"; do
  val="$(grep -E "^${v}=" .env | head -n1 | cut -d= -f2- || true)"
  if [[ -z "$val" || "$val" == *"your_"* || "$val" == *"change-this"* || "$val" == *"ep-xxx"* ]]; then
    echo "WARN: $v masih kosong / placeholder"
    missing=1
  fi
done
if [[ "$missing" -eq 1 ]]; then
  echo
  echo "Lengkapi .env dulu, lalu jalankan lagi: ./scripts/vps-deploy.sh"
  exit 1
fi

# ── 3. Build & start ───────────────────────────────────────
echo "==> Build & start containers (app, worker, redis, nginx)..."
"${COMPOSE[@]}" up -d --build

echo "==> Menunggu app siap..."
ready=0
for _ in $(seq 1 45); do
  if curl -sf http://127.0.0.1:3000/api/auth/csrf >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "WARN: App belum merespons. Cek log: npm run deploy:logs"
else
  echo "==> App online"
fi

# ── 4. Database schema + master account ────────────────────
echo "==> Setup database (schema + master admin)..."
"${COMPOSE[@]}" --profile setup run --rm setup

APP_URL="${APP_URL:-http://YOUR-VPS-IP}"

echo
echo "=========================================="
echo "  DEPLOY SELESAI"
echo "=========================================="
echo "  Web (nginx) : http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR-VPS-IP')"
echo "  App direct  : http://127.0.0.1:3000"
echo "  Config URL  : $APP_URL"
echo
echo "  Login: MASTER_USERNAME / MASTER_PASSWORD (dari .env)"
echo
echo "  Perintah berguna:"
echo "    npm run deploy:logs   → lihat log live"
echo "    npm run deploy:down   → stop semua"
echo "    ./scripts/vps-update.sh → update dari git"
echo
echo "  Jangan lupa:"
echo "    1. Set CORS R2 → docker/r2-cors.json (+ domain VPS)"
echo "    2. HTTPS → certbot (lihat README bagian SSL)"
echo "=========================================="
