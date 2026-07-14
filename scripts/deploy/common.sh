#!/usr/bin/env bash
# Shared helpers for Storage ByAFR deployment scripts

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
COMPOSE=(docker compose -f "$COMPOSE_FILE")
ENV_FILE="$ROOT/.env"
DEPLOY_STATE="$ROOT/.deploy/state.env"
NGINX_GEN="$ROOT/docker/generated/nginx.conf"
NGINX_TEMPLATE="$ROOT/docker/nginx.conf.template"
DOMAIN_FILE="$ROOT/.deploy/domain"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${CYAN}==>${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  !${NC} $*"; }
fail() { echo -e "${RED}  ✗${NC} $*" >&2; }
die()  { fail "$*"; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Command '$1' not found. Install it first."
}

get_public_ip() {
  curl -sf --max-time 5 ifconfig.me 2>/dev/null \
    || curl -sf --max-time 5 icanhazip.com 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "unknown"
}

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then return 0; fi
  DEPLOY_DOMAIN="$(grep -E '^DEPLOY_DOMAIN=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  CERTBOT_EMAIL="$(grep -E '^CERTBOT_EMAIL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  R2_ACCOUNT_ID="$(grep -E '^R2_ACCOUNT_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  R2_ACCESS_KEY_ID="$(grep -E '^R2_ACCESS_KEY_ID=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  R2_SECRET_ACCESS_KEY="$(grep -E '^R2_SECRET_ACCESS_KEY=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  R2_BUCKET_NAME="$(grep -E '^R2_BUCKET_NAME=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  NEXT_PUBLIC_APP_URL="$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  SESSION_SECRET="$(grep -E '^SESSION_SECRET=' "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '"')"
  if [[ -f "$DEPLOY_STATE" ]]; then
    # shellcheck disable=SC1090
    source "$DEPLOY_STATE"
  fi
}

save_deploy_state() {
  mkdir -p "$(dirname "$DEPLOY_STATE")"
  cat > "$DEPLOY_STATE" <<EOF
DEPLOY_DOMAIN=${DEPLOY_DOMAIN:-}
CERTBOT_EMAIL=${CERTBOT_EMAIL:-}
EOF
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker & Compose ready"
    return 0
  fi
  log "Installing Docker..."
  if [[ $EUID -ne 0 ]]; then
    die "Docker not found. Run: sudo bash $ROOT/scripts/vps-install.sh"
  fi
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  ok "Docker installed"
}

port_free() {
  local port=$1
  ! ss -tln 2>/dev/null | grep -q ":${port} " && ! netstat -tln 2>/dev/null | grep -q ":${port} "
}

stop_nginx_container() {
  "${COMPOSE[@]}" stop nginx 2>/dev/null || true
}

start_nginx_container() {
  "${COMPOSE[@]}" up -d nginx
}

print_banner() {
  echo
  echo -e "${BOLD}==========================================${NC}"
  echo -e "${BOLD}  Storage ByAFR — Production Installer${NC}"
  echo -e "${BOLD}==========================================${NC}"
  echo
}

print_final_status() {
  local url="${1:-https://${DEPLOY_DOMAIN:-unknown}}"
  echo
  echo -e "${BOLD}==========================================${NC}"
  echo -e "${GREEN}${BOLD}  Deployment Complete${NC}"
  echo -e "${BOLD}==========================================${NC}"
  echo -e "  Application : ${GREEN}Running${NC}"
  echo -e "  URL         : ${BOLD}${url}${NC}"
  echo -e "  Admin login : MASTER_USERNAME / MASTER_PASSWORD (from setup)"
  echo
  echo "  Commands:"
  echo "    ./update.sh          Update safely"
  echo "    npm run deploy:logs  View logs"
  echo "    npm run deploy:health  Re-check services"
  echo -e "${BOLD}==========================================${NC}"
  echo
}
