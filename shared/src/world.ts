/**
 * Deterministic world generation + collision queries for the starting valley.
 *
 * The server (authoritative simulation) and every client (rendering and
 * movement prediction) call `generateWorld(seed)` and get identical results,
 * so the static world never has to be sent over the network. Only the gate
 * states (sealed/open) are synced.
 */
import { PLAYER_RADIUS, WATER_INTERACT_RANGE, WORLD_HALF } from "./constants.ts";
import { mulberry32, randRange } from "./rng.ts";
import {
  CAVE_ALCOVE_START,
  CAVE_MOUTH,
  FORD_V,
  PASS_BLOCK,
  PASS_END,
  PASS_RADIUS,
  PASS_START,
  RUINS_CENTER,
  RUINS_ROTATION,
  VALLEY_HALF_U,
  VALLEY_HALF_V,
  distanceToTrail,
  distanceToWater,
  fromUV,
  landmarks,
  smoothstep,
  spawnPoint,
  streamHalfWidth,
  streamU,
  terrainHeight,
  toUV,
  valleyBase,
  valleySdf,
  valueNoise,
  type GateId,
  type LandmarkDef,
} from "./valley.ts";

export { distanceToWater, valueNoise } from "./valley.ts";

export type PropKind = "pine" | "oak" | "birch" | "rock" | "bush" | "log" | "mushroom" | "stone";

export interface Prop {
  kind: PropKind;
  x: number;
  z: number;
  /** Uniform scale multiplier. */
  scale: number;
  /** Y-axis rotation in radians. */
  rotation: number;
}

/** Hand-placed landmark pieces (ruins, cave, rockslide…). Rendered by kind on the client. */
export type StructureKind =
  | "column"
  | "column_broken"
  | "column_fallen"
  | "wall"
  | "arch"
  | "dais"
  | "seal"
  | "obelisk"
  | "rubble"
  | "boulder"
  | "cave_mouth"
  | "thorns"
  | "signpost";

export interface Structure {
  kind: StructureKind;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  /** Length (walls, fallen columns) or height (columns) depending on kind. */
  size?: number;
  /** Structure is part of a sealed gate; hidden/removed when the gate opens. */
  gate?: GateId;
}

export interface Collider {
  x: number;
  z: number;
  r: number;
  /** Collider belongs to a gate and stops blocking when the gate is open. */
  gate?: GateId;
}

export interface World {
  seed: number;
  props: Prop[];
  structures: Structure[];
  colliders: Collider[];
  landmarks: LandmarkDef[];
  /** Where new and respawning players wake up: on the bank of the stream. */
  spawn: { x: number; z: number };
  /** Gates currently open. Mutated from synced state on the client, by the game on the server. */
  openGates: Set<GateId>;
  /** Spatial hash of colliders for fast lookups. */
  grid: Map<number, Collider[]>;
}

const GRID_CELL = 4;
const SPAWN_CLEARING_RADIUS = 9;

export function isInWater(x: number, z: number): boolean {
  return distanceToWater(x, z) < 0;
}

export function isNearWater(x: number, z: number): boolean {
  return distanceToWater(x, z) < WATER_INTERACT_RANGE;
}

/** Forest density in [0,1]: 0 = open glade, 1 = thick woods. */
export function forestDensity(seed: number, x: number, z: number): number {
  return valueNoise(seed, x / 24, z / 24) * 0.65 + valueNoise(seed + 7, x / 8, z / 8) * 0.35;
}

export function getSpawnPoint(): { x: number; z: number } {
  return spawnPoint();
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

function segPointDist(px: number, pz: number, a: { u: number; v: number }, b: { u: number; v: number }): number {
  const p = toUV(px, pz);
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const t = Math.max(0, Math.min(1, ((p.u - a.u) * du + (p.v - a.v) * dv) / (du * du + dv * dv)));
  return Math.hypot(p.u - (a.u + du * t), p.v - (a.v + dv * t));
}

// ---------------------------------------------------------------------------
// Landmark structures
// ---------------------------------------------------------------------------

function buildStructures(): { structures: Structure[]; colliders: Collider[] } {
  const structures: Structure[] = [];
  const colliders: Collider[] = [];
  const add = (s: Structure, r?: number) => {
    structures.push(s);
    if (r) colliders.push({ x: s.x, z: s.z, r, gate: s.gate });
  };
  /** A line of collider circles (walls, fallen columns, thorn hedges). */
  const line = (x: number, z: number, rot: number, len: number, r: number, gate?: GateId) => {
    const n = Math.max(1, Math.ceil(len / (r * 1.4)));
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5;
      colliders.push({ x: x + Math.sin(rot) * len * t, z: z + Math.cos(rot) * len * t, r, gate });
    }
  };

  // --- Unknown ruins: a broken colonnade around a sealed stairway --------------
  const rc = fromUV(RUINS_CENTER.u, RUINS_CENTER.v);
  const cr = Math.cos(RUINS_ROTATION);
  const sr = Math.sin(RUINS_ROTATION);
  const R = (lx: number, lz: number) => ({ x: rc.x + lx * cr + lz * sr, z: rc.z - lx * sr + lz * cr });
  const rrot = (a: number) => a + RUINS_ROTATION;

  // Colonnade ring (radius 9). Pattern: intact / broken / missing / fallen.
  const pattern = ["column", "column_broken", "column", "none", "column_broken", "column", "fallen", "column_broken", "none", "column"] as const;
  pattern.forEach((kind, i) => {
    const a = (i / pattern.length) * Math.PI * 2 + 0.2;
    const p = R(Math.sin(a) * 9, Math.cos(a) * 9);
    if (kind === "none") {
      add({ kind: "rubble", ...p, rotation: a, scale: 0.9 });
    } else if (kind === "fallen") {
      const rot = rrot(a + 1.3);
      add({ kind: "column_fallen", ...p, rotation: rot, scale: 1, size: 4.2 });
      line(p.x, p.z, rot, 4.2, 0.45);
    } else {
      add({ kind, ...p, rotation: a, scale: 1, size: kind === "column" ? 4.2 : 1.4 + (i % 3) * 0.6 }, 0.55);
    }
  });

  // Broken walls on the north-west side.
  const walls: Array<[number, number, number, number]> = [
    [-3, -12.5, Math.PI / 2, 9],
    [-12.5, -4, 0, 7],
    [6, -12, Math.PI / 2 + 0.05, 3.5],
  ];
  for (const [lx, lz, a, len] of walls) {
    const p = R(lx, lz);
    const rot = rrot(a);
    add({ kind: "wall", ...p, rotation: rot, scale: 1, size: len });
    line(p.x, p.z, rot, len, 0.5);
  }

  // Archway at the south entrance (faces the trail).
  const arch = R(0, 12);
  add({ kind: "arch", ...arch, rotation: rrot(0), scale: 1 });
  for (const s of [-1, 1]) {
    const p = R(s * 2.1, 12);
    colliders.push({ x: p.x, z: p.z, r: 0.65 });
  }

  // Central dais with the sealed stairway, and a cracked obelisk.
  add({ kind: "dais", ...R(0, 0), rotation: rrot(0), scale: 1 });
  const seal = R(0, 0.6);
  add({ kind: "seal", ...seal, rotation: rrot(0), scale: 1, gate: "ruins_seal" }, 1.6);
  add({ kind: "obelisk", ...R(-5.5, 4.5), rotation: rrot(0.4), scale: 1 }, 0.6);
  for (const [lx, lz] of [
    [4, 6],
    [-7, -8],
    [11, 2],
    [-10, 9],
  ] as const) {
    add({ kind: "rubble", ...R(lx, lz), rotation: lx * 0.7, scale: 0.7 + Math.abs(lz) * 0.03 });
  }

  // --- Cave mouth in the western cliffs, choked with thorns ---------------------
  const mouth = fromUV(CAVE_MOUTH.u, CAVE_MOUTH.v);
  const inward = Math.atan2(
    fromUV(CAVE_ALCOVE_START.u, CAVE_ALCOVE_START.v).x - mouth.x,
    fromUV(CAVE_ALCOVE_START.u, CAVE_ALCOVE_START.v).z - mouth.z,
  );
  add({ kind: "cave_mouth", ...mouth, rotation: inward, scale: 1 });
  const thorns = { x: mouth.x + Math.sin(inward) * 1.6, z: mouth.z + Math.cos(inward) * 1.6 };
  add({ kind: "thorns", ...thorns, rotation: inward, scale: 1, gate: "cave_thorns" });
  line(thorns.x, thorns.z, inward + Math.PI / 2, 7, 0.7, "cave_thorns");

  // --- Rockslide blocking the pass ---------------------------------------------
  const pb = fromUV(PASS_BLOCK.u, PASS_BLOCK.v);
  const passDir = Math.atan2(fromUV(PASS_END.u, PASS_END.v).x - pb.x, fromUV(PASS_END.u, PASS_END.v).z - pb.z);
  const rng = mulberry32(4242);
  for (let i = 0; i < 14; i++) {
    const across = (i / 13 - 0.5) * (PASS_RADIUS * 2 + 3);
    const along = randRange(rng, -1.5, 2.5);
    const x = pb.x + Math.sin(passDir) * along + Math.sin(passDir + Math.PI / 2) * across;
    const z = pb.z + Math.cos(passDir) * along + Math.cos(passDir + Math.PI / 2) * across;
    const scale = randRange(rng, 1.1, 2.3) * (1 - Math.abs(across) / 12);
    add({ kind: "boulder", x, z, rotation: randRange(rng, 0, 6.28), scale: Math.max(0.8, scale), gate: "valley_exit" }, Math.max(0.8, scale) * 0.75);
  }
  line(pb.x, pb.z, passDir + Math.PI / 2, PASS_RADIUS * 2 + 2, 0.9, "valley_exit");

  // Old signpost where the trail turns toward the pass.
  const sign = landmarks().find((l) => l.id === "signpost")!;
  add({ kind: "signpost", x: sign.x + 0.9, z: sign.z - 0.9, rotation: passDir, scale: 1 }, 0.25);

  // A few big boulders strewn on the valley floor.
  const boulders: Array<[number, number, number]> = [
    [-20, -25, 1.8],
    [28, 20, 2.2],
    [-8, 58, 1.6],
    [33, -48, 2.0],
    [-30, -62, 1.7],
    [18, 55, 1.4],
  ];
  for (const [u, v, s] of boulders) {
    const p = fromUV(u, v);
    add({ kind: "boulder", ...p, rotation: u * 0.37, scale: s }, s * 0.75);
  }

  return { structures, colliders };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function generateWorld(seed: number): World {
  const rng = mulberry32(seed);
  const props: Prop[] = [];
  const { structures, colliders } = buildStructures();
  const spawn = getSpawnPoint();
  const marks = landmarks();
  const rc = fromUV(RUINS_CENTER.u, RUINS_CENTER.v);

  const step = 3.1;
  const half = WORLD_HALF + 20;
  for (let gx = -half; gx < half; gx += step) {
    for (let gz = -half; gz < half; gz += step) {
      const x = gx + randRange(rng, 0, step);
      const z = gz + randRange(rng, 0, step);
      const roll = rng();
      const rotation = randRange(rng, 0, Math.PI * 2);
      const scaleRoll = rng();
      const kindRoll = rng();

      const sdf = valleySdf(x, z);
      const { u, v } = toUV(x, z);

      // Mountain slopes: scattered pines (visual only), thinning with altitude.
      if (sdf < -1.5) {
        const alt = terrainHeight(x, z) - valleyBase(v);
        if (Math.abs(u - streamU(v)) < 5) continue;
        if (roll < 0.42 * (1 - smoothstep(6, 18, alt))) props.push({ kind: "pine", x, z, scale: 0.8 + scaleRoll * 0.7, rotation });
        else if (roll > 0.96) props.push({ kind: "rock", x, z, scale: 1 + scaleRoll * 1.5, rotation });
        continue;
      }
      if (sdf < 1.2) {
        if (roll < 0.25) props.push({ kind: "rock", x, z, scale: 0.8 + scaleRoll * 1.2, rotation });
        continue;
      }

      const water = distanceToWater(x, z);
      const trail = distanceToTrail(x, z);
      const spawnDist = Math.hypot(x - spawn.x, z - spawn.z);
      const ruinsDist = Math.hypot(x - rc.x, z - rc.z);
      const inPass = segPointDist(x, z, PASS_START, PASS_END) < PASS_RADIUS + 2;
      const inAlcove = segPointDist(x, z, CAVE_ALCOVE_START, CAVE_MOUTH) < 6;
      const nearMark = marks.some((m) => Math.hypot(x - m.x, z - m.z) < m.interactRadius + 2);
      const open = water < 1.3 || spawnDist < SPAWN_CLEARING_RADIUS || trail < 2 || ruinsDist < 14 || inPass || inAlcove || nearMark;

      // Rocks: everywhere, more along the banks.
      if (roll < (water < 1.5 ? 0.08 : 0.022) && spawnDist > 3 && trail > 1.2 && ruinsDist > 12) {
        const scale = 0.6 + scaleRoll * 1.0;
        props.push({ kind: "rock", x, z, scale, rotation });
        if (water > 0 && scale > 1.1) colliders.push({ x, z, r: 0.5 * scale });
        continue;
      }

      if (open) {
        // Glades keep a little ground cover; the ruins get overgrown with bushes.
        const cover = ruinsDist < 14 && ruinsDist > 10 ? 0.75 : 0.93;
        if (water > 0.4 && trail > 1.5 && spawnDist > 3 && roll > cover && !inPass) {
          props.push({ kind: kindRoll < 0.8 ? "bush" : "mushroom", x, z, scale: 0.5 + scaleRoll * 0.5, rotation });
        }
        continue;
      }

      const density = forestDensity(seed, x, z) * (0.55 + 0.45 * smoothstep(0, 14, sdf));
      if (roll < density * 0.72) {
        const kind: PropKind = kindRoll < 0.48 ? "pine" : kindRoll < 0.8 ? "oak" : "birch";
        const scale = 0.75 + scaleRoll * 0.6;
        props.push({ kind, x, z, scale, rotation });
        colliders.push({ x, z, r: (kind === "oak" ? 0.55 : 0.4) * scale });
      } else if (roll < density * 0.72 + 0.12) {
        props.push({ kind: "bush", x, z, scale: 0.6 + scaleRoll * 0.6, rotation });
      } else if (roll < density * 0.72 + 0.145) {
        props.push({ kind: "mushroom", x, z, scale: 0.6 + scaleRoll * 0.6, rotation });
      } else if (roll < density * 0.72 + 0.155) {
        props.push({ kind: "log", x, z, scale: 0.8 + scaleRoll * 0.4, rotation });
        colliders.push({ x, z, r: 0.6 });
      }
    }
  }

  // Stepping stones across the ford.
  const fu = streamU(FORD_V);
  const fhw = streamHalfWidth(FORD_V);
  for (let du = -fhw + 0.4; du <= fhw - 0.3; du += 0.95) {
    const p = fromUV(fu + du, FORD_V + Math.sin(du * 2) * 0.3);
    props.push({ kind: "stone", ...p, scale: 0.9 + ((du * 7) % 1) * 0.2, rotation: du });
  }

  // A fallen log to sit on in the wake-up clearing.
  const logPos = { x: spawn.x - 2.2, z: spawn.z + 2.8 };
  props.push({ kind: "log", ...logPos, scale: 1, rotation: 0.9 });
  colliders.push({ ...logPos, r: 0.6 });

  const grid = new Map<number, Collider[]>();
  for (const c of colliders) addToGrid(grid, c);

  return { seed, props, structures, colliders, landmarks: marks, spawn, openGates: new Set(), grid };
}

/** Random walkable point on the valley floor (for enemy spawns). */
export function randomValleyPoint(world: World, rng: () => number, minWallDist = 2.5): { x: number; z: number } {
  for (let i = 0; i < 200; i++) {
    const p = fromUV(randRange(rng, -VALLEY_HALF_U, VALLEY_HALF_U), randRange(rng, -VALLEY_HALF_V, VALLEY_HALF_V));
    if (valleySdf(p.x, p.z) > minWallDist && !isInWater(p.x, p.z) && isFree(world, p.x, p.z, 0.8)) return p;
  }
  return world.spawn;
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
        if (c.gate && world.openGates.has(c.gate)) continue;
        if (!seen.has(c)) {
          seen.add(c);
          out.push(c);
        }
      }
    }
  }
  return out;
}

/** Push a circle out of static colliders and the valley walls. */
export function resolveCollisions(world: World, x: number, z: number, radius = PLAYER_RADIUS): { x: number; z: number } {
  for (let iter = 0; iter < 4; iter++) {
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
    // Valley walls (signed distance field): slide along the cliffs.
    const sdf = valleySdf(x, z);
    if (sdf < radius) {
      const e = 0.2;
      let gx = valleySdf(x + e, z) - valleySdf(x - e, z);
      let gz = valleySdf(x, z + e) - valleySdf(x, z - e);
      const gl = Math.hypot(gx, gz) || 1;
      gx /= gl;
      gz /= gl;
      const push = radius - sdf;
      x += gx * push;
      z += gz * push;
      moved = true;
    }
    if (!moved) break;
  }
  const lim = WORLD_HALF - 1;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}

/** True if a circle at (x,z) overlaps no collider and is inside the valley. */
export function isFree(world: World, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  if (valleySdf(x, z) < radius) return false;
  for (const c of collidersNear(world, x, z, radius + 1)) {
    if (Math.hypot(x - c.x, z - c.z) < radius + c.r) return false;
  }
  return true;
}

export type Interactable = { kind: "landmark"; landmark: LandmarkDef } | { kind: "water" };

/** What the player at (x,z) would interact with by pressing the interact button. */
export function findInteractable(world: World, x: number, z: number): Interactable | null {
  let best: LandmarkDef | null = null;
  let bestD = Infinity;
  for (const l of world.landmarks) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < l.interactRadius && d < bestD) {
      best = l;
      bestD = d;
    }
  }
  if (best) return { kind: "landmark", landmark: best };
  if (isNearWater(x, z)) return { kind: "water" };
  return null;
}
