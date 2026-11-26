# Architecture

```
            browser (client/)                                  node (server/)
 ┌──────────────────────────────────────┐          ┌───────────────────────────────────┐
 │ CharacterCreate ─► net.joinWorld()   │  HTTP    │ Colyseus Server                   │
 │                                      │ ───────► │  └─ ForestRoom (≤16 players)      │
 │ GameClient (per frame)               │  WS      │      ├─ validates messages        │
 │  ├─ Input ─► intents ────────────────┼────────► │      └─ Game (pure simulation)    │
 │  ├─ predict local player (shared     │          │          ├─ players / enemies     │
 │  │   stepMovement)                   │          │          ├─ combat, abilities, XP │
 │  ├─ mirror room.state ─► Avatars     │ ◄─────── │          └─ enemy AI + respawns   │
 │  ├─ Fx / Overlay / Hud               │  state   │  20 Hz tick, delta-encoded patches│
 │  └─ three.js render (iso camera)     │  patches │                                   │
 └──────────────────────────────────────┘ + events └───────────────────────────────────┘
                     ▲                                          ▲
                     └──────────── shared/ (@rpg/shared) ───────┘
         classes, items, enemies, stats, world generation, movement, protocol
```

## Packages

| Package | Purpose |
| --- | --- |
| `shared/` | Pure TypeScript game data and rules used by both sides. No dependencies. |
| `server/` | Authoritative Colyseus server. Serves the built client in production. |
| `client/` | Vite + three.js browser client. |

## Key decisions

**Server-authoritative.** Clients only send *intent* (move direction, move-to
point, attack target, ability + aim point, use item, interact, chat). The server
validates everything and owns HP, damage, XP, inventory and positions, so
cheating requires compromising the server.

**Deterministic world from a seed.** `generateWorld(seed)` in `shared/` builds
the forest (stream, trees, rocks, colliders) identically on both sides. Only
the seed is synced; the static world never crosses the network.

**Shared movement for prediction.** `stepMovement()` runs on the server for the
truth and on the client to move your own character instantly. The client then
eases toward the server's position, so corrections are rare and smooth. Other
players and enemies are smoothed toward their latest server position.

**Data-driven classes and abilities.** All 12 classes, 24 subclasses and 36
abilities are plain data in `shared/src/classes.ts`. The server executes a
small set of generic effect types (`strike`, `nova`, `heal`, `dash`, `buff` in
`server/src/sim/Game.ts`). New abilities are usually just data; a genuinely new
mechanic adds one effect type.

**Simulation separate from networking.** `Game` has no Colyseus dependency
beyond the schema objects it mutates. `ForestRoom` is a thin adapter. This
keeps rules testable and lets other room types (dungeon instances, towns) reuse
the same simulation.

**Art is optional.** See [ASSETS.md](ASSETS.md). Procedural placeholders are
always available; glTF models are layered on through a manifest.

## Network messages

Defined in `shared/src/protocol.ts`.

| Direction | Message | Payload |
| --- | --- | --- |
| C→S | `moveDir` | `{x, z}` normalised world direction (0,0 = stop) |
| C→S | `moveTo` | `{x, z}` destination |
| C→S | `attack` | `{targetId}` enemy to chase and auto-attack |
| C→S | `ability` | `{slot: 0 \| 1, x, z}` cast at point |
| C→S | `useItem` | `{slot}` inventory index |
| C→S | `interact` | – (stream: fill waterskin / drink) |
| C→S | `chat` | `{text}` |
| S→C | `hit` | damage / heal numbers |
| S→C | `fx` | visual effect cue (projectile, nova, dash…) |
| S→C | `chat` | chat + system lines |
| S→C | `notice` | private message to one player |

Synced state (`server/src/schema/WorldState.ts`): `players` and `enemies` maps
with position, facing, animation, HP/resource, level/XP, equipment, inventory,
buffs and cooldowns.

## Scaling notes (later)

- One `ForestRoom` = one world instance of up to 16 players; Colyseus creates
  more instances automatically when full.
- For multiple server processes, add `@colyseus/redis-presence` and
  `@colyseus/redis-driver`.
- Persistence (accounts, saved characters) is not implemented yet: characters
  live as long as the connection. See the roadmap in the README.
