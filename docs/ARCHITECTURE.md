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

**The valley is a signed distance field.** `shared/src/valley.ts` describes
the zone in a camera-aligned (u, v) frame: an irregular basin plus capsules for
the pass and cave alcove. Positive distance = walkable; the same function
drives collision (players slide along cliffs), terrain height (mountains rise
with distance outside), the minimap, and spawn placement. Mountain height is
capped by the camera's sight line so cliffs never hide the player.

**Gates.** Sealed places (`valley_exit`, `ruins_seal`, `cave_thorns`) have
colliders tagged with a gate id. The server syncs `state.gates`; when a gate is
open, collision ignores its colliders and the client hides the blocker meshes.

**Input.** `client/src/controls/` holds the gamepad reader (Xbox/standard
mapping, radial dead zones, menu key-repeat), spatial menu navigation and the
touch controls. `GameClient.handleInput` merges all three each frame; analog
stick magnitude travels to the server so a half-pushed stick walks slower.

**Shared movement for prediction.** `stepMovement()` runs on the server for the
truth and on the client to move your own character instantly. The client then
eases toward the server's position, so corrections are rare and smooth. Other
players and enemies are smoothed toward their latest server position.

**Data-driven class tree.** All 60 classes (4 base → 8 → 16 → 32 end
classes) are plain data in `shared/src/classes.ts`. A player's `classId` is
their current node; `resolveKit()` walks the path to the base class to get
stats, the basic attack and one ability per tier, and `companionFor()` decides
the pet or familiar. Advancement (`advance` message) is validated on the
server: child of the current class, level 10/25/50, and the gate quest for 25
and 50. The server executes abilities through a few generic effect types
(`strike`, `nova`, `heal`, `dash`, `buff` in `server/src/sim/Game.ts`).

**Companions.** Pets and familiars are server entities in
`state.companions` (keyed `c:<owner>`). They follow their owner, attack the
owner's target or anything attacking the owner, can be targeted by enemies,
and return after being downed. Strength scales with the owner and with power:
familiar < pet (pet lines at 25) < empowered (pet classes at 50).

**Simulation separate from networking.** `Game` has no Colyseus dependency
beyond the schema objects it mutates. `ForestRoom` is a thin adapter. This
keeps rules testable and lets other room types (dungeon instances, towns) reuse
the same simulation.

**Cel-shaded rendering.** Every lit surface uses `MeshToonMaterial` with one
shared 4-step light ramp (`client/src/scene/toon.ts`); loaded glTF models are
converted to it automatically. `CelPost` renders the scene to an offscreen
target with a depth texture and draws ink outlines where the Laplacian of
linear depth spikes (silhouettes only, never flat or sloped surfaces), then
applies the time-of-day grade, vignette and tone mapping to the screen. The see-through cut-out is
hard-edged so the ink pass draws a clean rim around it.

**Time-of-day lighting.** Material colours are neutral; mood comes only from
light and grading. `Lighting.ts` defines night/dawn/day/dusk presets (sun
colour, direction and strength, sky/fog, hemisphere fill, exposure,
saturation, shadow tint, vignette, lantern, glows, fireflies, water
brightness) and `lightingAt(hour)` blends them. `GameClient.updateLighting()`
applies the result to the environment, the ink/grade pass and landmarks
whenever the hour changes, so a day/night cycle only needs to call
`setHour()` over time.

**Art is optional.** See [ASSETS.md](ASSETS.md). Procedural placeholders are
always available; glTF models are layered on through a manifest.

## Network messages

Defined in `shared/src/protocol.ts`.

| Direction | Message | Payload |
| --- | --- | --- |
| C→S | `moveDir` | `{x, z}` world direction, length 0..1 (analog; 0,0 = stop) |
| C→S | `moveTo` | `{x, z}` destination |
| C→S | `attack` | `{targetId}` enemy to chase and auto-attack |
| C→S | `ability` | `{slot: 0-3, x, z}` cast at point |
| C→S | `advance` | `{classId}` permanently advance to a child class |
| C→S | `useItem` | `{slot}` inventory index |
| C→S | `interact` | – (inspect a landmark, fill waterskin, drink) |
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
