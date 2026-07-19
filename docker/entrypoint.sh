#!/bin/sh
# Ensure WhatsApp session dir is writable by the app user (named volumes
# are often created as root on first mount).
set -eu
SESSION_DIR="${WA_SESSIONS_DIR:-/app/wa-sessions}"
mkdir -p "$SESSION_DIR"
chown -R nextjs:nodejs "$SESSION_DIR" 2>/dev/null || true
chmod -R u+rwX "$SESSION_DIR" 2>/dev/null || true

if command -v su-exec >/dev/null 2>&1; then
  exec su-exec nextjs "$@"
fi

# Fallback when su-exec is unavailable (should not happen in our image).
exec "$@"
