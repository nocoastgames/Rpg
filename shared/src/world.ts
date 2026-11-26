/**
 * Deterministic forest generation + collision queries.
 *
 * Both the server (authoritative simulation) and the client (rendering and
 * movement prediction) call `generateWorld(seed)` and get identical results,
 * so the static world never has to be sent over the network.
 */
import { PLAYER_RADIUS, WATER_INTERACT_RANGE, WORLD_HALF } from "./constants.ts";
import { mulberry32, randRange } from "./rng.ts";

export type PropKind = "pine" | "oak" | "birch" | "rock" | "bush" | "log" | "mushroom";

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** Uniform scale multiplier. */
  scale: number;
  /** Y-axis rotation in radians. */
  rotation: number;
}

export interface Collider {
  x: number;
  z: number;
  r: number;
}

export interface World {
  seed: number;
  props: Prop[];
  colliders: Collider[];
  /** Where new and respawning players wake up: on the bank of the stream. */
  spawn: { x: number; z: number };
  /** Spatial hash of colliders for fast lookups. */
  grid: Map<number, Collider[]>;
}

const GRID_CELL = 4;
const SPAWN_CLEARING_RADIUS = 9;

// ---------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------

/** X coordinate of the stream's centre line at a given z. The stream runs the full north-south length of the map. */
export function streamCenterX(z: number): number {
  return 10 * Math.sin(z * 0.035) + 4 * Math.sin(z * 0.11 + 1.3) + 1.5 * Math.sin(z * 0.31 + 0.4);
}

/** Half-width of the water at a given z. */
export function streamHalfWidth(z: number): number {
  return 2.2 + 0.9 * Math.sin(z * 0.07 + 2.1) + 0.4 * Math.sin(z * 0.23);
}

/** Signed horizontal distance from the water's edge (negative = in the water). */
export function distanceToWater(x: number, z: number): number {
  return Math.abs(x - streamCenterX(z)) - streamHalfWidth(z);
}

export function isInWater(x: number, z: number): boolean {
  return distanceToWater(x, z) < 0;
}

export function isNearWater(x: number, z: number): boolean {
  return distanceToWater(x, z) < WATER_INTERACT_RANGE;
}

// ---------------------------------------------------------------------------
// Noise (cheap value noise, deterministic per seed)
// ---------------------------------------------------------------------------

function hash2(seed: number, x: number, z: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(seed: number, x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = hash2(seed, x0, z0);
  const b = hash2(seed, x0 + 1, z0);
  const c = hash2(seed, x0, z0 + 1);
  const d = hash2(seed, x0 + 1, z0 + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/** Forest density in [0,1] at a point: 0 = open glade, 1 = thick woods. */
export function forestDensity(seed: number, x: number, z: number): number {
  const n = valueNoise(seed, x / 28, z / 28) * 0.65 + valueNoise(seed + 7, x / 9, z / 9) * 0.35;
  // Thicken toward the map edge so the border reads as impassable woods.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
  return Math.min(1, n + Math.max(0, edge - 0.85) * 4);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function getSpawnPoint(): { x: number; z: number } {
  const z = 0;
  return { x: streamCenterX(z) + streamHalfWidth(z) + 2.5, z };
}

function cellKey(cx: number, cz: number): number {
  return (cx + 1000) * 2003 + (cz + 1000);
}

function addToGrid(grid: Map<number, Collider[]>, c: Collider): void {
  const minX = Math.floor((c.x - c.r) / GRID_CELL);
  const maxX = Math.floor((c.x + c.r) / GRID_CELL);
  const minZ = Math.floor((c.z - c.r) / GRID_CELL);
  const maxZ = Math.floor((c.z + c.r) / GRID_CELL);
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      const k = cellKey(cx, cz);
      let bucket = grid.get(k);
      if (!bucket) grid.set(k, (bucket = []));
      bucket.push(c);
    }
  }
}

export function generateWorld(seed: number): World {
  const rng = mulberry32(seed);
  const props: Prop[] = [];
  const colliders: Collider[] = [];
  const spawn = getSpawnPoint();

  const step = 3.2;
  for (let gx = -WORLD_HALF; gx < WORLD_HALF; gx += step) {
    for (let gz = -WORLD_HALF; gz < WORLD_HALF; gz += step) {
      const x = gx + randRange(rng, 0, step);
      const z = gz + randRange(rng, 0, step);
      const roll = rng();
      const rotation = randRange(rng, 0, Math.PI * 2);
      const scaleRoll = rng();

      const water = distanceToWater(x, z);
      const spawnDist = Math.hypot(x - spawn.x, z - spawn.z);
      const density = forestDensity(seed, x, z);

      // Rocks: scattered everywhere, a little more common along the banks and in the water.
      if (roll < (water < 1.5 ? 0.09 : 0.025) && spawnDist > 3) {
        const scale = 0.6 + scaleRoll * 1.1;
        props.push({ kind: "rock", x, z, scale, rotation });
        // Small rocks in the stream are stepping stones (no collision).
        if (water > 0 || scale > 1.2) colliders.push({ x, z, r: 0.55 * scale });
        continue;
      }

      if (water < 1.2 || spawnDist < SPAWN_CLEARING_RADIUS) {
        // Keep the banks and the wake-up clearing open, but allow a little ground cover.
        if (water > 0.4 && roll > 0.93) props.push({ kind: "bush", x, z, scale: 0.5 + scaleRoll * 0.5, rotation });
        continue;
      }

      if (roll < density * 0.75) {
        const kindRoll = rng();
        const kind: PropKind = kindRoll < 0.5 ? "pine" : kindRoll < 0.82 ? "oak" : "birch";
        const scale = 0.75 + scaleRoll * 0.6;
        props.push({ kind, x, z, scale, rotation });
        colliders.push({ x, z, r: (kind === "oak" ? 0.55 : 0.4) * scale });
      } else if (roll < density * 0.75 + 0.12) {
        props.push({ kind: "bush", x, z, scale: 0.6 + scaleRoll * 0.6, rotation });
      } else if (roll < density * 0.75 + 0.14) {
        props.push({ kind: "mushroom", x, z, scale: 0.6 + scaleRoll * 0.6, rotation });
      } else if (roll < density * 0.75 + 0.15) {
        props.push({ kind: "log", x, z, scale: 0.8 + scaleRoll * 0.4, rotation });
        colliders.push({ x, z, r: 0.6 });
      }
    }
  }

  // Leave a couple of personal touches in the wake-up clearing: a fallen log to sit on.
  const logPos = { x: spawn.x + 3, z: spawn.z - 2.5 };
  props.push({ kind: "log", ...logPos, scale: 1, rotation: 0.6 });
  colliders.push({ ...logPos, r: 0.6 });

  const grid = new Map<number, Collider[]>();
  for (const c of colliders) addToGrid(grid, c);

  return { seed, props, colliders, spawn, grid };
}

// ---------------------------------------------------------------------------
// Collision queries
// ---------------------------------------------------------------------------

export function collidersNear(world: World, x: number, z: number, radius: number): Collider[] {
  const out: Collider[] = [];
  const seen = new Set<Collider>();
  const minX = Math.floor((x - radius) / GRID_CELL);
  const maxX = Math.floor((x + radius) / GRID_CELL);
  const minZ = Math.floor((z - radius) / GRID_CELL);
  const maxZ = Math.floor((z + radius) / GRID_CELL);
  for (let cx = minX; cx <= maxX; cx++) {
    for (let cz = minZ; cz <= maxZ; cz++) {
      const bucket = world.grid.get(cellKey(cx, cz));
      if (!bucket) continue;
      for (const c of bucket) {
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
  }
  return out;
}

/** Push a circle out of any static colliders and keep it inside the world. */
export function resolveCollisions(world: World, x: number, z: number, radius = PLAYER_RADIUS): { x: number; z: number } {
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of collidersNear(world, x, z, radius + 1)) {
      const dx = x - c.x;
      const dz = z - c.z;
      const min = radius + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        const push = min - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const lim = WORLD_HALF - 1;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}

/** True if a circle at (x,z) overlaps no static collider. */
export function isFree(world: World, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  for (const c of collidersNear(world, x, z, radius + 1)) {
    if (Math.hypot(x - c.x, z - c.z) < radius + c.r) return false;
  }
  return Math.abs(x) < WORLD_HALF - 1 && Math.abs(z) < WORLD_HALF - 1;
}
