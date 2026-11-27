/**
 * Deterministic world generation + collision queries for the starting valley.
 *
 * The server (authoritative simulation) and every client (rendering and
 * movement prediction) call `generateWorld(seed)` and get identical results,
 * so the static world never has to be sent over the network. Only the gate
 * states (sealed/open) are synced.
 */
import { PLAYER_RADIUS, WATER_INTERACT_RANGE, WORLD_HALF } from "./constants.ts";
import { CRYPT_ORIGIN, cryptPoint, cryptSdf, inCrypt } from "./crypt.ts";
import { LORE_SITES, type LoreSiteKind } from "./lore.ts";
import { mulberry32, randRange } from "./rng.ts";
import {
  CAMP,
  CAMP_CLEARING_RADIUS,
  CARAVAN_CLEARING_RADIUS,
  WOLF_DEN,
  LORE_CLEARING,
  loreSitePosition,
  DUNGEON_CELL,
  dungeonSdf,
  inDungeon,
  VENDOR,
  VILLAGE,
  VILLAGE_CLEARING_RADIUS,
  VILLAGE_CLUES,
  VILLAGE_PIECES,
  villagePoint,
  type VillagePieceKind,
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
  zoneAt,
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
  | "signpost"
  /** A god's shrine (`faith` says whose). */
  | "shrine"
  /** The campsite: drawn as an empty clearing or a built camp, from synced state. */
  | "camp"
  /** Haskel's covered cart. */
  | "vendor_cart"
  /** The castle dungeon cell you're thrown into. */
  | "cell"
  /** The crypt under Ashford: rooms, walls, torches and the thorn heart, from the shared floor plan. */
  | "crypt_dungeon"
  /** Greyjaw's den in Greypine Wood. */
  | "wolf_den"
  /** The valley's lore sites (lore.ts). */
  | LoreSiteKind
  /** Ashford's buildings and yard (see VILLAGE_PIECES). */
  | VillagePieceKind;

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
  /** Shrines: the god it belongs to. */
  faith?: string;
}

/** Quest pick-ups: dry branches in the woods, smooth stones on the stream bank, clues in Ashford. */
export type NodeKind = "deadfall" | "river_stone" | "clue";

export interface GatherNode {
  id: string;
  kind: NodeKind;
  x: number;
  z: number;
  /** Clues: the prompt and what you find. */
  verb?: string;
  text?: string;
}

export const NODE_NAMES: Record<NodeKind, { name: string; verb: string }> = {
  deadfall: { name: "Dry branches", verb: "Gather branches" },
  river_stone: { name: "River stone", verb: "Pick up the stone" },
  clue: { name: "Something odd", verb: "Search" },
};

/** How close you must be to pick up a node. */
export const NODE_RADIUS = 1.9;

export interface Collider {
  x: number;
  z: number;
  r: number;
  /** Collider belongs to a gate and stops blocking when the gate is open. */
  gate?: GateId;
}

export interface World {
  seed: number;
  structures: Structure[];
  colliders: Collider[];
  landmarks: LandmarkDef[];
  /** Quest pick-ups. */
  nodes: GatherNode[];
  /** Where new and respawning players wake up: on the bank of the stream. */
  spawn: { x: number; z: number };
  /** Gates currently open. Mutated from synced state on the client, by the game on the server. */
  openGates: Set<GateId>;
  /** Spatial hash of colliders for fast lookups (prop colliders arrive as chunks are generated). */
  grid: Map<number, Collider[]>;
  /** Generated prop chunks (see chunkProps). */
  chunks: Map<number, Prop[]>;
  /** Hand-placed props (ford stones, the wake-up log), by chunk. */
  extraProps: Map<number, Prop[]>;
}

const GRID_CELL = 4;
const SPAWN_CLEARING_RADIUS = 9;

export function isInWater(x: number, z: number): boolean {
  return distanceToWater(x, z) < 0;
}

export function isNearWater(x: number, z: number): boolean {
  return distanceToWater(x, z) < WATER_INTERACT_RANGE;
}

/** Forest density in [0,1]: 0 = open glade, 1 = thick woods. Meadows are open; Greypine Wood is dense. */
export function forestDensity(seed: number, x: number, z: number): number {
  let d = valueNoise(seed, x / 24, z / 24) * 0.5 + valueNoise(seed + 7, x / 8, z / 8) * 0.25 + valueNoise(seed + 11, x / 260, z / 260) * 0.35;
  const zone = zoneAt(x, z);
  if (zone?.id === "tusk_meadow") d *= 0.3;
  else if (zone?.id === "greypine_wood") d = Math.min(1, d * 1.3 + 0.1);
  return Math.min(1, d);
}

export function getSpawnPoint(): { x: number; z: number } {
  return spawnPoint();
}

function cellKey(cx: number, cz: number): number {
  return (cx + 4000) * 8009 + (cz + 4000);
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

  // Shrines, one to each god.
  for (const l of landmarks()) {
    if (l.kind !== "shrine") continue;
    const toCentre = Math.atan2(-l.x, -l.z);
    add({ kind: "shrine", x: l.x, z: l.z, rotation: toCentre, scale: 1, faith: l.faith }, 0.7);
  }
  // The campsite (rendered from synced state; no colliders so you can stand at the fire).
  const camp = fromUV(CAMP.u, CAMP.v);
  add({ kind: "camp", ...camp, rotation: 0.6, scale: 1 });

  // Haskel's covered cart, just behind him.
  const vend = fromUV(VENDOR.u + 2.6, VENDOR.v - 1.4);
  add({ kind: "vendor_cart", ...vend, rotation: 0.4, scale: 1 }, 1.3);

  // Ashford: cottages, the headman's house, the chapel and its crypt, the graveyard.
  for (const piece of VILLAGE_PIECES) {
    const p = villagePoint(piece.du, piece.dv);
    const rot = piece.rot;
    switch (piece.kind) {
      case "cottage":
        add({ kind: "cottage", ...p, rotation: rot, scale: 1 });
        line(p.x, p.z, rot + Math.PI / 2, 3.4, 1.2);
        break;
      case "headman_house":
        add({ kind: "headman_house", ...p, rotation: rot, scale: 1 });
        line(p.x, p.z, rot + Math.PI / 2, 4.6, 1.5);
        break;
      case "chapel":
        add({ kind: "chapel", ...p, rotation: rot, scale: 1 });
        line(p.x, p.z, rot, 6.5, 1.7);
        break;
      case "well":
        add({ kind: "well", ...p, rotation: rot, scale: 1 }, 0.8);
        break;
      case "cart":
        add({ kind: "cart", ...p, rotation: rot, scale: 1 }, 0.9);
        break;
      case "fence":
        add({ kind: "fence", ...p, rotation: rot, scale: 1, size: piece.size ?? 4 });
        line(p.x, p.z, rot + Math.PI / 2, piece.size ?? 4, 0.2);
        break;
      default:
        add({ kind: piece.kind, ...p, rotation: rot, scale: 1 }, piece.kind === "headstone" ? 0.3 : piece.kind === "crypt" ? 0.9 : undefined);
    }
  }

  // The lore sites. Most are solid in the middle; the stone ring and the giant's ribs are solid at their stones.
  for (const site of LORE_SITES) {
    const p = loreSitePosition(site);
    add({ kind: site.kind, ...p, rotation: site.rotation, scale: 1 }, site.radius || undefined);
    const local = (lx: number, lz: number) => ({ x: p.x + lx * Math.cos(site.rotation) + lz * Math.sin(site.rotation), z: p.z - lx * Math.sin(site.rotation) + lz * Math.cos(site.rotation) });
    if (site.kind === "standing_stones") {
      for (let i = 0; i < 8; i++) colliders.push({ ...local(Math.cos((i / 8) * Math.PI * 2) * 4.5, Math.sin((i / 8) * Math.PI * 2) * 4.5), r: 0.55 });
    }
    if (site.kind === "giant_ribs") {
      for (let i = 0; i < 5; i++) for (const side of [-1, 1]) colliders.push({ ...local(side * 3.2, -5 + i * 2.5), r: 0.45 });
    }
  }

  // The wolves' den in Greypine Wood: a root hollow and rocks.
  const den = fromUV(WOLF_DEN.u, WOLF_DEN.v);
  add({ kind: "wolf_den", ...den, rotation: 0.3, scale: 1 }, 1.4);

  // The crypt under Ashford, far away: drawn as one piece from its floor plan (walls come from cryptSdf).
  add({ kind: "crypt_dungeon", x: CRYPT_ORIGIN.x, z: CRYPT_ORIGIN.z, rotation: 0, scale: 1 });
  // Pillars and sarcophagi to fight around.
  for (const [lx, lz, r] of [[18, -3.5, 0.5], [24, -3.5, 0.5], [18, 3.5, 0.5], [24, 3.5, 0.5], [17, 22, 0.9], [25, 18, 0.9], [41, 14.5, 0.6], [41, 25.5, 0.6], [50, 14.5, 0.6], [50, 25.5, 0.6]] as const) {
    const c = cryptPoint(lx, lz);
    colliders.push({ x: c.x, z: c.z, r });
  }

  // The dungeon cell, far away: a cot and a bucket to bump into.
  add({ kind: "cell", x: DUNGEON_CELL.x, z: DUNGEON_CELL.z, rotation: 0, scale: 1 });
  colliders.push({ x: DUNGEON_CELL.x + 2.2, z: DUNGEON_CELL.z + 1.2, r: 0.7 });
  colliders.push({ x: DUNGEON_CELL.x + 2.6, z: DUNGEON_CELL.z - 1.9, r: 0.3 });

  // A few big boulders strewn on the valley floor.
  const boulders: Array<[number, number, number]> = [
    [-600, -700, 1.8],
    [840, 560, 2.2],
    [-240, 1620, 1.6],
    [990, -1340, 2.0],
    [-900, -1740, 1.7],
    [540, 1540, 1.4],
    [60, 300, 1.9],
    [-420, 600, 2.1],
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

/** Procedural props and their colliders are made per chunk, on demand (the valley is kilometres across). */
export const CHUNK_SIZE = 32;
const PROP_STEP = 3.1;

function chunkKey(cx: number, cz: number): number {
  return (cx + 5000) * 10007 + (cz + 5000);
}

/** Deterministic random numbers for one prop-grid cell. */
function cellRng(seed: number, gx: number, gz: number): () => number {
  let h = (seed ^ Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
  return mulberry32(h);
}

export function generateWorld(seed: number): World {
  const { structures, colliders } = buildStructures();
  const spawn = getSpawnPoint();
  const marks = landmarks();
  const extraProps = new Map<number, Prop[]>();
  const addExtra = (p: Prop) => {
    const k = chunkKey(Math.floor(p.x / CHUNK_SIZE), Math.floor(p.z / CHUNK_SIZE));
    const list = extraProps.get(k) ?? [];
    list.push(p);
    extraProps.set(k, list);
  };

  // Stepping stones across the ford.
  const fu = streamU(FORD_V);
  const fhw = streamHalfWidth(FORD_V);
  for (let du = -fhw + 0.4; du <= fhw - 0.3; du += 0.95) {
    const p = fromUV(fu + du, FORD_V + Math.sin(du * 2) * 0.3);
    addExtra({ kind: "stone", ...p, scale: 0.9 + ((du * 7) % 1) * 0.2, rotation: du });
  }
  // A fallen log to sit on in the wake-up clearing.
  const logPos = { x: spawn.x - 2.2, z: spawn.z + 2.8 };
  addExtra({ kind: "log", ...logPos, scale: 1, rotation: 0.9 });
  colliders.push({ ...logPos, r: 0.6 });

  const grid = new Map<number, Collider[]>();
  for (const c of colliders) addToGrid(grid, c);

  const world: World = { seed, structures, colliders, landmarks: marks, nodes: [], spawn, openGates: new Set(), grid, chunks: new Map(), extraProps };
  world.nodes = placeNodes(world);
  return world;
}

/** The props in one chunk (generated the first time it's asked for; their colliders join the grid). */
export function chunkProps(world: World, cx: number, cz: number): Prop[] {
  const key = chunkKey(cx, cz);
  const cached = world.chunks.get(key);
  if (cached) return cached;
  const props = generateChunk(world, cx, cz);
  props.push(...(world.extraProps.get(key) ?? []));
  world.chunks.set(key, props);
  return props;
}

/** Lore sites and the open ground each needs. */
const LORE_POSITIONS = LORE_SITES.map((s) => ({ ...loreSitePosition(s), r: LORE_CLEARING[s.kind] }));

function generateChunk(world: World, cx: number, cz: number): Prop[] {
  const seed = world.seed;
  const props: Prop[] = [];
  const colliders: Collider[] = [];
  const spawn = world.spawn;
  const rc = fromUV(RUINS_CENTER.u, RUINS_CENTER.v);
  const campPos = fromUV(CAMP.u, CAMP.v);
  const villagePos = fromUV(VILLAGE.u, VILLAGE.v);
  const vendorPos = fromUV(VENDOR.u, VENDOR.v);
  const x0 = cx * CHUNK_SIZE;
  const z0 = cz * CHUNK_SIZE;
  // Grid cells whose origin lies in this chunk (each cell belongs to exactly one chunk).
  const gx0 = Math.ceil(x0 / PROP_STEP);
  const gx1 = Math.ceil((x0 + CHUNK_SIZE) / PROP_STEP);
  const gz0 = Math.ceil(z0 / PROP_STEP);
  const gz1 = Math.ceil((z0 + CHUNK_SIZE) / PROP_STEP);
  for (let gx = gx0; gx < gx1; gx++) {
    for (let gz = gz0; gz < gz1; gz++) {
      const rng = cellRng(seed, gx, gz);
      const x = gx * PROP_STEP + randRange(rng, 0, PROP_STEP);
      const z = gz * PROP_STEP + randRange(rng, 0, PROP_STEP);
      const roll = rng();
      const rotation = randRange(rng, 0, Math.PI * 2);
      const scaleRoll = rng();
      const kindRoll = rng();
      if (inDungeon(x, z)) continue;

      const sdf = valleySdf(x, z);
      const { u, v } = toUV(x, z);

      // Mountain slopes: scattered pines (visual only), thinning with altitude. Far out: nothing.
      if (sdf < -1.5) {
        if (sdf < -140) continue;
        const alt = terrainHeight(x, z) - valleyBase(v);
        if (Math.abs(u - streamU(v)) < 8) continue;
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
      const nearMark = world.landmarks.some((m) => Math.abs(x - m.x) < 40 && Math.abs(z - m.z) < 40 && Math.hypot(x - m.x, z - m.z) < m.interactRadius + 2);
      const campDist = Math.hypot(x - campPos.x, z - campPos.z);
      const villageDist = Math.hypot(x - villagePos.x, z - villagePos.z);
      const vendorDist = Math.hypot(x - vendorPos.x, z - vendorPos.z);
      const nearLore = LORE_POSITIONS.some((l) => Math.abs(x - l.x) < l.r && Math.abs(z - l.z) < l.r && Math.hypot(x - l.x, z - l.z) < l.r);
      const open = water < 1.3 || spawnDist < SPAWN_CLEARING_RADIUS || campDist < CAMP_CLEARING_RADIUS || villageDist < VILLAGE_CLEARING_RADIUS || vendorDist < CARAVAN_CLEARING_RADIUS || nearLore || trail < 2 || ruinsDist < 14 || inPass || inAlcove || nearMark;

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
  for (const c of colliders) addToGrid(world.grid, c);
  return props;
}

/**
 * Quest pick-ups near the camp: deadfall in the woods around the clearing,
 * stones along the stream banks. Fixed seed, so every client agrees.
 */
function placeNodes(world: World): GatherNode[] {
  const rng = mulberry32(5151);
  const camp = fromUV(CAMP.u, CAMP.v);
  const nodes: GatherNode[] = [];
  const farFromOthers = (x: number, z: number, min: number) => nodes.every((n) => Math.hypot(n.x - x, n.z - z) > min);
  const tryPlace = (kind: NodeKind, want: number, spacing: number, pick: () => { x: number; z: number } | null) => {
    let placed = 0;
    for (let i = 0; i < 4000 && placed < want; i++) {
      const p = pick();
      if (!p || isInWater(p.x, p.z) || !isFree(world, p.x, p.z, 0.7) || !farFromOthers(p.x, p.z, spacing)) continue;
      if (Math.hypot(p.x - world.spawn.x, p.z - world.spawn.z) < 5) continue;
      // Keep out of the tougher hunting grounds (Tusk Meadow's boars are fair game).
      const zone = zoneAt(p.x, p.z, 6);
      if (zone && zone.levels[0] > 1) continue;
      nodes.push({ id: `${kind === "deadfall" ? "d" : "s"}${placed}`, kind, ...p });
      placed++;
    }
  };
  // Dry branches: scattered through the woods 14-60 m from the camp, away from the water.
  tryPlace("deadfall", 16, 8, () => {
    const a = randRange(rng, 0, Math.PI * 2);
    const r = randRange(rng, 14, 60);
    const p = { x: camp.x + Math.cos(a) * r, z: camp.z + Math.sin(a) * r };
    return distanceToWater(p.x, p.z) > 4 && valleySdf(p.x, p.z) > 3 && forestDensity(world.seed, p.x, p.z) > 0.35 ? p : null;
  });
  // River stones: on the banks from the waterfall woods down past the meadow.
  tryPlace("river_stone", 12, 5, () => {
    const v = world.spawn ? toUV(world.spawn.x, world.spawn.z).v + randRange(rng, -180, 180) : 0;
    const side = rng() < 0.5 ? -1 : 1;
    const u = streamU(v) + side * (streamHalfWidth(v) + randRange(rng, 0.5, 1.3));
    return fromUV(u, v);
  });
  // Clues in Ashford: fixed spots.
  for (const c of VILLAGE_CLUES) nodes.push({ id: c.id, kind: "clue", ...villagePoint(c.du, c.dv), verb: c.verb, text: c.text });
  return nodes;
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
  // Make sure every chunk whose props could reach this area exists.
  const cx0 = Math.floor((x - radius - 2) / CHUNK_SIZE);
  const cx1 = Math.floor((x + radius + 2) / CHUNK_SIZE);
  const cz0 = Math.floor((z - radius - 2) / CHUNK_SIZE);
  const cz1 = Math.floor((z + radius + 2) / CHUNK_SIZE);
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) if (!world.chunks.has(chunkKey(cx, cz))) chunkProps(world, cx, cz);
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
    const sdf = walkableSdf(x, z);
    if (sdf < radius) {
      const e = 0.2;
      let gx = walkableSdf(x + e, z) - walkableSdf(x - e, z);
      let gz = walkableSdf(x, z + e) - walkableSdf(x, z - e);
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
  if (inDungeon(x, z)) return { x, z };
  const lim = WORLD_HALF - 1;
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) };
}

/** Where you can walk: the valley, or (far away) the dungeon cell or the crypt under Ashford. */
export function walkableSdf(x: number, z: number): number {
  if (inCrypt(x, z)) return cryptSdf(x, z);
  return inDungeon(x, z) ? dungeonSdf(x, z) : valleySdf(x, z);
}

/** True if a circle at (x,z) overlaps no collider and is inside the valley. */
export function isFree(world: World, x: number, z: number, radius = PLAYER_RADIUS): boolean {
  if (walkableSdf(x, z) < radius) return false;
  for (const c of collidersNear(world, x, z, radius + 1)) {
    if (Math.hypot(x - c.x, z - c.z) < radius + c.r) return false;
  }
  return true;
}

export type Interactable = { kind: "landmark"; landmark: LandmarkDef } | { kind: "node"; node: GatherNode } | { kind: "water" };

/**
 * What the player at (x,z) would interact with by pressing the interact button.
 * `wantsNode` says which quest pick-ups this player can take right now.
 */
export function findInteractable(world: World, x: number, z: number, wantsNode?: (n: GatherNode) => boolean): Interactable | null {
  if (wantsNode) {
    let node: GatherNode | null = null;
    let nodeD = NODE_RADIUS;
    for (const n of world.nodes) {
      const d = Math.hypot(x - n.x, z - n.z);
      if (d < nodeD && wantsNode(n)) {
        node = n;
        nodeD = d;
      }
    }
    if (node) return { kind: "node", node };
  }
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
