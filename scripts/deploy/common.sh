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
  DEPLOY_DOMAIN="$(env_get DEPLOY_DOMAIN)"
  CERTBOT_EMAIL="$(env_get CERTBOT_EMAIL)"
  DATABASE_URL="$(env_get DATABASE_URL)"
  R2_ACCOUNT_ID="$(env_get R2_ACCOUNT_ID)"
  R2_ACCESS_KEY_ID="$(env_get R2_ACCESS_KEY_ID)"
  R2_SECRET_ACCESS_KEY="$(env_get R2_SECRET_ACCESS_KEY)"
  R2_BUCKET_NAME="$(env_get R2_BUCKET_NAME)"
  R2_PUBLIC_URL="$(env_get R2_PUBLIC_URL)"
  NEXT_PUBLIC_APP_URL="$(env_get NEXT_PUBLIC_APP_URL)"
  SESSION_SECRET="$(env_get SESSION_SECRET)"
  MASTER_USERNAME="$(env_get MASTER_USERNAME)"
  MASTER_PASSWORD="$(env_get MASTER_PASSWORD)"
  if [[ -f "$DEPLOY_STATE" ]]; then
    # shellcheck disable=SC1090
    source "$DEPLOY_STATE"
  fi
}

# Strip quotes, whitespace, and accidental line breaks from .env values
sanitize_env_value() {
  local v=$1
  v="${v//$'\r'/}"
  v="${v//$'\n'/}"
  v="${v#"${v%%[![:space:]]*}"}"
  v="${v%"${v##*[![:space:]]}"}"
  if [[ "$v" == \"*\" && "$v" == *\" ]]; then
    v="${v:1:${#v}-2}"
  fi
  printf '%s' "$v"
}

env_get() {
  local key=$1
  [[ -f "$ENV_FILE" ]] || return 0
  local line val
  line="$(grep -m1 "^${key}=" "$ENV_FILE" 2>/dev/null || true)"
  [[ -z "$line" ]] && return 0
  val="${line#*=}"
  sanitize_env_value "$val"
}

env_set_line() {
  local key=$1
  local val=$2
  val="$(sanitize_env_value "$val")"
  printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
}

# Fix broken wizard output (multiline quoted values) → KEY=value per line
normalize_env_file() {
  [[ -f "$ENV_FILE" ]] || return 0
  local tmp current_key="" val="" line=""
  tmp="$(mktemp)"
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" =~ ^[[:space:]]*# || -z "${line//[[:space:]]/}" ]]; then
      printf '%s\n' "$line" >> "$tmp"
      continue
    fi
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      if [[ -n "$current_key" ]]; then
        val="$(sanitize_env_value "$val")"
        printf '%s=%s\n' "$current_key" "$val" >> "$tmp"
      fi
      current_key="${line%%=*}"
      val="${line#*=}"
    elif [[ -n "$current_key" ]]; then
      val+="${line}"
    else
      printf '%s\n' "$line" >> "$tmp"
    fi
  done < "$ENV_FILE"
  if [[ -n "$current_key" ]]; then
    val="$(sanitize_env_value "$val")"
    printf '%s=%s\n' "$current_key" "$val" >> "$tmp"
  fi
  if cmp -s "$ENV_FILE" "$tmp" 2>/dev/null; then
    rm -f "$tmp"
    return 0
  fi
  mv "$tmp" "$ENV_FILE"
  ok "File .env dinormalisasi (format KEY=value)"
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
