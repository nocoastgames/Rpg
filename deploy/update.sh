#!/usr/bin/env bash
# Pull the latest code and rebuild/restart the game. Open worlds close when the server restarts.
set -euo pipefail
cd "$(dirname "$0")"
git -C .. pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
