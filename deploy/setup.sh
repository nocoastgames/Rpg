#!/usr/bin/env bash
# Run inside the game's container/VM (Debian 12 or Ubuntu 22.04+), as root.
# Installs Docker and git, fetches the game and starts it with its Cloudflare Tunnel.
#
#   REPO_URL=git@github.com:nocoastgames/Rpg.git BRANCH=main TUNNEL_TOKEN=... bash setup.sh
set -euo pipefail
REPO_URL="${REPO_URL:-https://github.com/nocoastgames/Rpg.git}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/rpg}"

apt-get update
apt-get install -y ca-certificates curl git
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if [ ! -d "$DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$DIR"
else
  git -C "$DIR" fetch origin "$BRANCH" && git -C "$DIR" checkout "$BRANCH" && git -C "$DIR" pull --ff-only
fi

cd "$DIR/deploy"
if [ ! -f .env ]; then
  cp .env.example .env
  if [ -n "${TUNNEL_TOKEN:-}" ]; then sed -i "s|^TUNNEL_TOKEN=.*|TUNNEL_TOKEN=${TUNNEL_TOKEN}|" .env; fi
  chmod 600 .env
fi
if ! grep -q '^TUNNEL_TOKEN=.\+' .env; then
  echo "Put your Cloudflare Tunnel token in $DIR/deploy/.env (TUNNEL_TOKEN=...), then run: cd $DIR/deploy && docker compose up -d --build"
  exit 0
fi
docker compose up -d --build
docker compose ps
echo "Local check: curl -s http://127.0.0.1:2567/health"
