#!/usr/bin/env bash
# Full production install orchestrator

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

SKIP_WIZARD=0
SKIP_SSL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-wizard) SKIP_WIZARD=1; shift ;;
    --skip-ssl) SKIP_SSL=1; shift ;;
    --help|-h)
      echo "Usage: ./install.sh [--skip-wizard] [--skip-ssl]"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

main() {
  print_banner
  cd "$ROOT"

  ensure_docker

  if [[ $SKIP_WIZARD -eq 0 && ! -f "$ENV_FILE" ]]; then
    bash "$SCRIPT_DIR/wizard.sh"
  elif [[ ! -f "$ENV_FILE" ]]; then
    die "No .env file. Run ./install.sh without --skip-wizard"
  else
    ok "Using existing .env"
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
