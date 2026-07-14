#!/usr/bin/env bash
# Legacy wrapper — use ./install.sh instead
exec bash "$(dirname "$0")/deploy/install.sh" "$@"
