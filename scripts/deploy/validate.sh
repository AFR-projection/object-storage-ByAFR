#!/usr/bin/env bash
# Pre-flight validation before build/deploy

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

load_env

VALIDATION_FAILED=0

check_mark() {
  if [[ $1 -eq 0 ]]; then ok "$2"; else fail "$2"; VALIDATION_FAILED=1; fi
}

validate_domain_format() {
  log "Checking domain..."
  local d="${DEPLOY_DOMAIN:-}"
  if [[ -z "$d" ]]; then
    d="$(grep -E '^DEPLOY_DOMAIN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)"
  fi
  if [[ -z "$d" ]]; then
    d="${NEXT_PUBLIC_APP_URL#https://}"
    d="${d#http://}"
    d="${d%%/*}"
  fi
  DEPLOY_DOMAIN="$d"
  if [[ "$d" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$ ]]; then
    check_mark 0 "Domain format: $d"
  else
    check_mark 1 "Domain format invalid: $d"
  fi
}

validate_database_url() {
  log "Checking DATABASE_URL..."
  if [[ -z "${DATABASE_URL:-}" ]]; then
    check_mark 1 "DATABASE_URL kosong"
    return
  fi
  if [[ "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
    check_mark 0 "DATABASE_URL format OK"
  else
    check_mark 1 "DATABASE_URL harus postgresql://..."
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    if docker run --rm --env-file "$ENV_FILE" postgres:16-alpine sh -c \
      "apk add --no-cache postgresql-client >/dev/null 2>&1 && psql \"\$DATABASE_URL\" -c 'SELECT 1' >/dev/null 2>&1"; then
      check_mark 0 "Database connection OK"
    else
      check_mark 1 "Database connection FAILED — periksa DATABASE_URL & Neon allowlist IP VPS"
    fi
  else
    warn "Docker belum ada — skip live DB test"
  fi
}

validate_r2() {
  log "Checking R2 credentials..."
  local missing=0
  for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET_NAME; do
    if [[ -z "${!v:-}" ]]; then missing=1; fail "$v kosong"; fi
  done
  [[ $missing -eq 1 ]] && return

  local endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  if command -v docker >/dev/null 2>&1; then
    if docker run --rm \
      -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
      -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      -e AWS_DEFAULT_REGION=auto \
      amazon/aws-cli:2.15.0 s3 ls "s3://${R2_BUCKET_NAME}" --endpoint-url "$endpoint" >/dev/null 2>&1; then
      check_mark 0 "R2 bucket accessible"
    else
      check_mark 1 "R2 access FAILED — periksa credential & bucket name"
    fi
  else
    check_mark 0 "R2 variables present (live test skipped)"
  fi
}

validate_app_url() {
  log "Checking NEXT_PUBLIC_APP_URL..."
  if [[ "${NEXT_PUBLIC_APP_URL:-}" == https://* ]]; then
    check_mark 0 "HTTPS URL: $NEXT_PUBLIC_APP_URL"
  else
    check_mark 1 "Production wajib HTTPS — NEXT_PUBLIC_APP_URL harus https://..."
  fi
}

validate_dns() {
  log "Checking DNS..."
  local ip server_ip
  server_ip="$(get_public_ip)"
  ip="$(getent ahostsv4 "$DEPLOY_DOMAIN" 2>/dev/null | awk '{print $1; exit}' || dig +short "$DEPLOY_DOMAIN" 2>/dev/null | head -n1 || true)"
  if [[ -z "$ip" ]]; then
    warn "DNS belum resolve — pastikan A record $DEPLOY_DOMAIN → $server_ip"
    return
  fi
  if [[ "$ip" == "$server_ip" ]]; then
    ok "DNS OK: $DEPLOY_DOMAIN → $ip"
  else
    warn "DNS $DEPLOY_DOMAIN → $ip (VPS IP: $server_ip) — SSL mungkin gagal jika tidak match"
  fi
}

validate_session_secret() {
  log "Checking SESSION_SECRET..."
  if [[ ${#SESSION_SECRET} -ge 32 ]]; then
    check_mark 0 "SESSION_SECRET length OK"
  else
    check_mark 1 "SESSION_SECRET terlalu pendek (min 32 char)"
  fi
}

validate_ports() {
  log "Checking ports 80 & 443..."
  local ok80=0 ok443=0
  port_free 80 && ok80=1
  port_free 443 && ok443=1
  if [[ $ok80 -eq 1 && $ok443 -eq 1 ]]; then
    check_mark 0 "Port 80 & 443 available"
  else
    warn "Port 80/443 in use — akan di-stop sementara untuk SSL setup"
  fi
}

run_validate() {
  echo
  log "Pre-flight validation"
  echo
  [[ -f "$ENV_FILE" ]] || die "File .env tidak ada. Jalankan wizard dulu."
  load_env
  validate_domain_format
  validate_app_url
  validate_session_secret
  validate_database_url
  validate_r2
  validate_dns
  validate_ports
  echo
  if [[ $VALIDATION_FAILED -ne 0 ]]; then
    die "Validasi gagal. Perbaiki .env atau jalankan ulang ./install.sh"
  fi
  ok "Semua validasi lulus"
  echo
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_validate
fi
