#!/usr/bin/env bash
# Run on the Proxmox host as root. Creates an unprivileged Debian 12 LXC with
# nesting (so Docker runs inside it), then runs deploy/setup.sh in it.
#
#   CTID=120 NAME=rpg-game STORAGE=local-lvm BRIDGE=vmbr0 \
#   REPO_URL=https://github.com/nocoastgames/Rpg.git BRANCH=main TUNNEL_TOKEN=... \
#   bash create-lxc.sh
set -euo pipefail
CTID="${CTID:?Pick a free container id, e.g. CTID=120}"
NAME="${NAME:-rpg-game}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
CORES="${CORES:-2}"
MEMORY="${MEMORY:-2048}"
DISK_GB="${DISK_GB:-16}"
SETUP_URL="${SETUP_URL:-}"

pveam update >/dev/null
TEMPLATE="$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -n1)"
[ -n "$TEMPLATE" ] || { echo "No Debian 12 template found (pveam available --section system)"; exit 1; }
pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE" || pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"

pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$NAME" \
  --unprivileged 1 \
  --features nesting=1,keyctl=1 \
  --cores "$CORES" --memory "$MEMORY" --swap 512 \
  --rootfs "$STORAGE:$DISK_GB" \
  --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp" \
  --onboot 1
pct start "$CTID"
# Wait for the network.
for _ in $(seq 1 30); do pct exec "$CTID" -- ping -c1 -W1 deb.debian.org >/dev/null 2>&1 && break; sleep 2; done

# Copy setup.sh in (from this checkout, or SETUP_URL) and run it.
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$HERE/../setup.sh" ]; then
  pct push "$CTID" "$HERE/../setup.sh" /root/setup.sh
else
  pct exec "$CTID" -- bash -c "apt-get update && apt-get install -y curl && curl -fsSL '$SETUP_URL' -o /root/setup.sh"
fi
pct exec "$CTID" -- env REPO_URL="${REPO_URL:-https://github.com/nocoastgames/Rpg.git}" BRANCH="${BRANCH:-main}" TUNNEL_TOKEN="${TUNNEL_TOKEN:-}" bash /root/setup.sh
echo "Container $CTID ($NAME) is up. Shell: pct enter $CTID"
