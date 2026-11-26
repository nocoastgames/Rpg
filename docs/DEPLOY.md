# Deploying: Proxmox + Cloudflare Tunnel + Cloudflare Access

The game server runs in its own Proxmox container (an unprivileged Debian 12
LXC running Docker). A Cloudflare Tunnel publishes it at
`https://<name>.renegar.online` without opening any ports on your network, and
Cloudflare Access puts a login in front of it.

```
player's browser ──https/wss──▶ Cloudflare (Access login) ──tunnel──▶ cloudflared ──▶ game:2567
                                                                      (both in the LXC, Docker Compose)
```

Pick the subdomain first (examples below use `GAME_HOST=returned.renegar.online`).

## 1. Cloudflare Tunnel

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** →
   **Create a tunnel** → type **Cloudflared** → name it (e.g. `rpg`).
2. On the install step choose **Docker** and copy the token (the long value
   after `--token`). You don't need to run their command; Compose runs
   cloudflared for you.
3. **Public hostname**: subdomain = your game name, domain = `renegar.online`,
   service type **HTTP**, URL **`game:2567`**. Save.

WebSockets go through tunnels with no extra setting (the zone's
**Network → WebSockets** toggle should be on, which is the default).

## 2. Cloudflare Access (the login)

1. **Zero Trust** → **Access** → **Applications** → **Add an application** →
   **Self-hosted**.
2. Application domain: your game hostname (`returned.renegar.online`). Session
   duration: as long as you like (e.g. 1 month, so players aren't asked every day).
3. Policy: **Allow**, with a rule such as **Emails** (list yourself and the
   friends you invite) or **Emails ending in** your domain. With the built-in
   **One-time PIN** login method, players get a code by email; no accounts
   needed.

Access covers the page, the matchmaking calls and the WebSocket (all on the
same hostname, so the login cookie rides along). An invite link
(`https://returned.renegar.online/?world=K7Q-M2X`) survives the login: Access
sends the player back to the exact link after they sign in. **A friend has to
be allowed by the Access policy before their invite link will work.**

## 3. The Proxmox container

On the Proxmox host, as root, from a checkout of this repo (or copy
`deploy/` over):

```bash
cd Rpg/deploy/proxmox
CTID=120 NAME=rpg-game STORAGE=local-lvm BRIDGE=vmbr0 \
REPO_URL=https://github.com/nocoastgames/Rpg.git BRANCH=main \
TUNNEL_TOKEN='<token from step 1>' \
bash create-lxc.sh
```

`BRANCH` is the branch to run: `main` once this work is merged there; until
then use `claude/isometric-dungeon-crawler-b829g5`.

This creates an unprivileged Debian 12 LXC (2 cores, 2 GB RAM, 16 GB disk,
DHCP on `vmbr0`, nesting on so Docker works, starts on boot), installs Docker
and git inside it, clones the game to `/opt/rpg` and starts it with Compose.
Adjust `CORES`, `MEMORY`, `DISK_GB` and `TEMPLATE_STORAGE` if needed.

The repository is private, so the clone needs credentials. Either:

- use a **deploy key**: `pct enter 120`, `ssh-keygen -t ed25519`, add
  `~/.ssh/id_ed25519.pub` to the repo (GitHub → Settings → Deploy keys,
  read-only), and use `REPO_URL=git@github.com:nocoastgames/Rpg.git`; or
- use a **fine-grained token** with read access to this repo:
  `REPO_URL=https://<token>@github.com/nocoastgames/Rpg.git`.

If the clone fails during `create-lxc.sh`, set up the key, then rerun
`bash /root/setup.sh` inside the container with the same variables.

Prefer a full VM, or an existing Docker host? `deploy/setup.sh` works on any
Debian 12 / Ubuntu 22.04+ machine:
`REPO_URL=... BRANCH=main TUNNEL_TOKEN=... bash setup.sh`.

## 4. Check it

Inside the container (`pct enter 120`):

```bash
cd /opt/rpg/deploy
docker compose ps                      # game "healthy", tunnel "running"
curl -s http://127.0.0.1:2567/health   # {"ok":true}
docker compose logs -f tunnel          # "Registered tunnel connection"
```

Then open `https://returned.renegar.online`, sign in through Access, make a
character, choose **Start a new world**, and send a friend the code (or the
**Copy invite link** button in the Character panel).

## Updating

```bash
pct enter 120
/opt/rpg/deploy/update.sh   # git pull, rebuild, restart
```

Worlds live in memory: **restarting or updating the server closes every open
world** (and characters aren't saved yet). Update when nobody is playing.

## Settings

`deploy/.env` (created from `.env.example`, readable only by root):

| Variable | Meaning |
| --- | --- |
| `TUNNEL_TOKEN` | The Cloudflare Tunnel token |
| `DEV_COMMANDS` | `1` turns on the testing chat commands (`/tp`, `/level`, `/quest`…) for everyone; `0` for real play |

## How worlds and codes work

- **Start a new world** creates a world instance with a 6-character code
  (`K7Q-M2X`; no 0/O or 1/I/L, so it reads aloud cleanly).
- **Join a friend's world** takes a code; the server looks it up
  (`GET /api/worlds/<code>`) and joins that room. Up to 16 players per world.
- A world stays open for **30 minutes after its last player leaves**, so
  friends can drop out and come back with the same code.
- One server process hosts any number of worlds (each is light: the valley
  simulation at 20 ticks a second).
