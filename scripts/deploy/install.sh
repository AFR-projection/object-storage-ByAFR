#!/usr/bin/env bash
# Full production install orchestrator

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

USE_WIZARD=0
SKIP_SSL=0
FIX_ENV=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wizard) USE_WIZARD=1; shift ;;
    --skip-wizard) shift ;; # legacy, no-op
    --skip-ssl) SKIP_SSL=1; shift ;;
    --force-wizard) USE_WIZARD=1; shift ;; # legacy alias
    --fix-env) FIX_ENV=1; shift ;;
    --help|-h)
      echo "Usage: ./install.sh [--wizard] [--skip-ssl] [--fix-env]"
      echo ""
      echo "  Default: pakai .env manual (cp .env.example .env → nano .env)"
      echo "  --wizard   Wizard interaktif (opsional)"
      echo "  --fix-env    Perbaiki .env rusak (multiline/quote)"
      echo "  --skip-ssl   Skip SSL (testing saja)"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

main() {
  print_banner
  cd "$ROOT"

  ensure_docker

  if [[ $FIX_ENV -eq 1 ]]; then
    [[ -f "$ENV_FILE" ]] || die "No .env to fix"
    normalize_env_file
    load_env
    bash "$SCRIPT_DIR/validate.sh"
    exit $?
  fi

  if [[ $USE_WIZARD -eq 1 ]]; then
    bash "$SCRIPT_DIR/wizard.sh"
  else
    require_env_file
    ok "Using .env"
    normalize_env_file
  fi

  load_env
  bash "$SCRIPT_DIR/validate.sh"

  if [[ $SKIP_SSL -eq 0 ]]; then
    bash "$SCRIPT_DIR/ssl.sh"
    bash "$SCRIPT_DIR/nginx.sh"
  else
    warn "SSL skipped — only for development testing"
  fi

  bash "$SCRIPT_DIR/deploy-stack.sh"

  if [[ $SKIP_SSL -eq 0 ]]; then
    log "Starting nginx (HTTPS)..."
    "${COMPOSE[@]}" up -d nginx
  fi

  if bash "$SCRIPT_DIR/health.sh"; then
    print_final_status "https://${DEPLOY_DOMAIN}"
  else
    warn "Deploy finished with warnings — review health output above"
    print_final_status "https://${DEPLOY_DOMAIN}"
    exit 1
  fi
}

main "$@"
