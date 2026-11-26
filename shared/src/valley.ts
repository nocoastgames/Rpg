/**
 * Layout of the starting zone: a small forested valley ringed by mountains.
 *
 * Coordinates: the game uses world X/Z (metres). The valley is authored in a
 * rotated "screen" frame (u, v) that lines up with the isometric camera:
 *   u = screen right, v = screen down (toward the camera).
 * So "north" on screen is -v. Use toUV / fromUV to convert.
 *
 *   north (top of screen): waterfall feeding a pool, the stream's source
 *   west:  cave mouth in the cliffs (sealed by thorns)   + unknown ruins (south-west)
 *   east:  the only pass out of the valley (blocked by a rockslide)
 *   south (near the camera): the stream leaves through a narrow gorge
 *
 * Everything here is pure math shared by client and server.
 */

const S = Math.SQRT1_2;

export function toUV(x: number, z: number): { u: number; v: number } {
  return { u: (x - z) * S, v: (x + z) * S };
}

export function fromUV(u: number, v: number): { x: number; z: number } {
  return { x: (u + v) * S, z: (v - u) * S };
}

// ---------------------------------------------------------------------------
// Value noise (deterministic)
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

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Fixed noise seed for terrain shape so the valley is a hand-tuned place, not a lottery. */
const SHAPE_SEED = 9001;

// ---------------------------------------------------------------------------
// Valley shape (signed distance: positive = walkable, metres to the cliffs)
// ---------------------------------------------------------------------------

export const VALLEY_HALF_U = 50;
export const VALLEY_HALF_V = 80;

/** The pass out of the valley (east). A corridor from the valley floor into the mountains. */
export const PASS_START = { u: 38, v: -18 };
export const PASS_END = { u: 82, v: -30 };
export const PASS_RADIUS = 4.5;

/** Alcove leading north into the north-west cliffs, so the cave mouth faces the camera. */
export const CAVE_ALCOVE_START = { u: -29, v: -42 };
export const CAVE_MOUTH = { u: -37, v: -63 };
export const CAVE_ALCOVE_RADIUS = 4.2;

export const RUINS_CENTER = { u: -24, v: 40 };
export const RUINS_ROTATION = 0.35;

function segDist(u: number, v: number, a: { u: number; v: number }, b: { u: number; v: number }): { d: number; t: number } {
  const du = b.u - a.u;
  const dv = b.v - a.v;
  const t = Math.max(0, Math.min(1, ((u - a.u) * du + (v - a.v) * dv) / (du * du + dv * dv)));
  return { d: Math.hypot(u - (a.u + du * t), v - (a.v + dv * t)), t };
}

function basinSdf(u: number, v: number): number {
  const a = VALLEY_HALF_U;
  const b = VALLEY_HALF_V;
  const r = Math.sqrt((u / a) ** 2 + (v / b) ** 2);
  const g = Math.sqrt((u * u) / a ** 4 + (v * v) / b ** 4) / Math.max(r, 1e-3);
  return (1 - r) / Math.max(g, 1 / Math.max(a, b));
}

/** Signed distance to the valley walls in metres (positive inside the walkable area). */
export function valleySdf(x: number, z: number): number {
  const { u, v } = toUV(x, z);
  // Irregular cliff line.
  const wobble = (valueNoise(SHAPE_SEED, x / 16, z / 16) - 0.5) * 12 + (valueNoise(SHAPE_SEED + 1, x / 6, z / 6) - 0.5) * 3;
  let d = basinSdf(u, v) + wobble;
  d = Math.max(d, PASS_RADIUS - segDist(u, v, PASS_START, PASS_END).d);
  d = Math.max(d, CAVE_ALCOVE_RADIUS - segDist(u, v, CAVE_ALCOVE_START, CAVE_MOUTH).d);
  return d;
}

// ---------------------------------------------------------------------------
// Stream: waterfall in the north, pool, meandering channel, gorge in the south
// ---------------------------------------------------------------------------

export const POOL_V = -74;
export const POOL_RADIUS = 7;
const WATERFALL_TOP_V = -84;
const WATERFALL_DROP = 9;

/** Stream centre line (u) as a function of v. */
export function streamU(v: number): number {
  return 6 + 9 * Math.sin(v * 0.045 + 0.6) + 4 * Math.sin(v * 0.12 + 1.7) + 1.5 * Math.sin(v * 0.29);
}

export function streamHalfWidth(v: number): number {
  return 2.1 + 0.7 * Math.sin(v * 0.07 + 2.1) + 0.35 * Math.sin(v * 0.23);
}

export function poolCenter(): { u: number; v: number } {
  return { u: streamU(POOL_V), v: POOL_V };
}

/** Gentle north-to-south slope of the valley floor (the stream flows downhill toward the camera). */
export function valleyBase(v: number): number {
  return -v * 0.022;
}

/** Height of the water surface along the stream, including the waterfall step. */
export function waterSurface(v: number): number {
  const pool = valleyBase(POOL_V) - 0.15;
  if (v >= POOL_V) return valleyBase(v) - 0.15;
  const fall = WATERFALL_DROP * smoothstep(POOL_V - 3, WATERFALL_TOP_V, v);
  const above = Math.max(0, WATERFALL_TOP_V - v) * 0.45;
  return pool + fall + above;
}

/** Signed horizontal distance to open water (negative = standing in water). Valley floor only. */
export function distanceToWater(x: number, z: number): number {
  const { u, v } = toUV(x, z);
  const pc = poolCenter();
  const pool = Math.hypot(u - pc.u, v - pc.v) - POOL_RADIUS;
  if (v < POOL_V) return pool;
  return Math.min(pool, Math.abs(u - streamU(v)) - streamHalfWidth(v));
}

// ---------------------------------------------------------------------------
// Trails (worn dirt paths hinting at the landmarks)
// ---------------------------------------------------------------------------

export interface UV {
  u: number;
  v: number;
}

function spawnUV(): UV {
  const v = -6;
  return { u: streamU(v) - streamHalfWidth(v) - 3.2, v };
}

/** Ford where the trail crosses the stream (stepping stones). */
export const FORD_V = -14;

export function trails(): UV[][] {
  const sp = spawnUV();
  const ford = { u: streamU(FORD_V), v: FORD_V };
  return [
    // Spawn clearing → ford → east to the pass.
    [sp, { u: sp.u + 1, v: -11 }, { u: ford.u - 4, v: FORD_V }, ford, { u: ford.u + 5, v: FORD_V - 1 }, { u: 26, v: -16 }, PASS_START, { u: 52, v: -21 }],
    // Spawn → south-west to the ruins.
    [sp, { u: sp.u - 6, v: 6 }, { u: -16, v: 22 }, { u: RUINS_CENTER.u + 3, v: RUINS_CENTER.v - 10 }],
    // Ruins → north to the cave alcove (faint).
    [{ u: RUINS_CENTER.u - 4, v: RUINS_CENTER.v - 9 }, { u: -34, v: 14 }, { u: -34, v: -14 }, CAVE_ALCOVE_START, { u: -35, v: -56 }],
  ];
}

let trailCache: UV[][] | null = null;

/** Distance (m) to the nearest trail. */
export function distanceToTrail(x: number, z: number): number {
  trailCache ??= trails();
  const { u, v } = toUV(x, z);
  let best = Infinity;
  for (const t of trailCache) {
    for (let i = 0; i < t.length - 1; i++) best = Math.min(best, segDist(u, v, t[i]!, t[i + 1]!).d);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Terrain height (visual; gameplay is 2D on the XZ plane)
// ---------------------------------------------------------------------------

/**
 * Isometric cut-away: a mountain may not rise above the camera's line of
 * sight to walkable ground behind it (the camera looks toward -v), so cliffs
 * on the near side of the valley, the cave alcove and the pass never hide
 * the player. Returns a height cap relative to the valley floor.
 */
function sightlineCap(u: number, v: number): number {
  for (let k = 1.5; k <= 36; k += 1.5) {
    const p = fromUV(u, v - k);
    if (valleySdf(p.x, p.z) > 0.5) return 1.0 + 0.6 * k;
  }
  return Infinity;
}

export function terrainHeight(x: number, z: number): number {
  const { u, v } = toUV(x, z);
  const sdf = valleySdf(x, z);
  const base = valleyBase(v);
  const wd = distanceToWater(x, z);

  // Valley floor: gentle rolls, flattened near water and walls.
  let h = base + (valueNoise(SHAPE_SEED + 2, x / 11, z / 11) - 0.5) * 1.4 * smoothstep(1, 9, wd) * smoothstep(-2, 6, sdf);
  // Ruins sit on a low rise.
  const rc = fromUV(RUINS_CENTER.u, RUINS_CENTER.v);
  h += 0.9 * (1 - smoothstep(10, 17, Math.hypot(x - rc.x, z - rc.z)));

  // Mountains outside the walkable area.
  if (sdf < 0) {
    const e = -sdf;
    const ridges = valueNoise(SHAPE_SEED + 3, x / 13, z / 13) * 0.6 + valueNoise(SHAPE_SEED + 4, x / 5, z / 5) * 0.25;
    let m = 2.6 * smoothstep(0, 2.5, e) + e * 0.85 + ridges * 14 * smoothstep(0, 12, e);
    m = Math.min(m, 30 + ridges * 10, sightlineCap(u, v));
    // Cut a channel where the stream runs through the mountains (waterfall above, gorge below).
    const su = streamU(v);
    const channel = smoothstep(2.5, 11, Math.abs(u - su));
    if (v < POOL_V || v > 60) {
      const target = waterSurface(v) - base - 0.3;
      m = target + (m - target) * channel;
    }
    h += m;
  }

  // Stream bed and banks.
  if (v >= POOL_V - POOL_RADIUS) {
    const surf = waterSurface(Math.max(v, POOL_V));
    if (wd < 0) h = Math.min(h, surf - 0.12 - Math.min(0.55, -wd * 0.35));
    else if (wd < 1.6) h = Math.min(h, surf + 0.05 + (h - surf) * (wd / 1.6));
  }
  return h;
}

// ---------------------------------------------------------------------------
// Landmarks & sealed gates
// ---------------------------------------------------------------------------

export type GateId = "valley_exit" | "ruins_seal" | "cave_thorns";

export interface LandmarkDef {
  id: string;
  name: string;
  /** Where the player stands to inspect it (world coords). */
  x: number;
  z: number;
  /** Radius (m) within which the interact prompt appears. */
  interactRadius: number;
  /** Prompt verb shown in the HUD, e.g. "Inspect". */
  verb: string;
  /** If set, this landmark is a gate that is sealed until the server opens it. */
  gate?: GateId;
  lockedText: string;
  openText?: string;
  /** Radius at which the zone-name banner appears the first time. */
  discoverRadius: number;
}

function at(u: number, v: number) {
  return fromUV(u, v);
}

/** Point `dist` metres in front of the cave mouth, along the alcove. */
function caveApproach(dist: number) {
  const du = CAVE_ALCOVE_START.u - CAVE_MOUTH.u;
  const dv = CAVE_ALCOVE_START.v - CAVE_MOUTH.v;
  const l = Math.hypot(du, dv);
  return fromUV(CAVE_MOUTH.u + (du / l) * dist, CAVE_MOUTH.v + (dv / l) * dist);
}

const passBlockU = 56;
const passBlockT = (passBlockU - PASS_START.u) / (PASS_END.u - PASS_START.u);
export const PASS_BLOCK = {
  u: passBlockU,
  v: PASS_START.v + (PASS_END.v - PASS_START.v) * passBlockT,
};

export function landmarks(): LandmarkDef[] {
  return [
    {
      id: "valley_exit",
      name: "The Narrow Pass",
      ...at(PASS_BLOCK.u - 3.5, PASS_BLOCK.v + 0.8),
      interactRadius: 4,
      verb: "Inspect the rockslide",
      gate: "valley_exit",
      lockedText: "A rockslide has buried the only way out of the valley. There is no getting past it. Not yet.",
      openText: "The rocks have been cleared. The path beyond is not written yet.",
      discoverRadius: 16,
    },
    {
      id: "ruins_seal",
      name: "Unknown Ruins",
      ...at(RUINS_CENTER.u, RUINS_CENTER.v + 3.6),
      interactRadius: 3.2,
      verb: "Inspect the sealed stairway",
      gate: "ruins_seal",
      lockedText: "Stairs lead down beneath the ruins, sealed by a slab of dark stone. Runes glow faintly across it. It doesn't budge.",
      openText: "The slab has slid aside. The stairs lead into darkness. Whatever lies below is not written yet.",
      discoverRadius: 18,
    },
    {
      id: "cave_thorns",
      name: "The Cave Mouth",
      ...caveApproach(3.8),
      interactRadius: 3.6,
      verb: "Inspect the thorns",
      gate: "cave_thorns",
      lockedText: "A wall of black thorns chokes the cave mouth. Cold air breathes from the darkness beyond.",
      openText: "The thorns have withered away. The cave waits. Its depths are not written yet.",
      discoverRadius: 16,
    },
    {
      id: "signpost",
      name: "Old Signpost",
      ...at(PASS_START.u - 6, PASS_START.v + 2.2),
      interactRadius: 2.6,
      verb: "Read the signpost",
      lockedText: "The signpost is too weathered to read. One arm points toward the pass.",
      discoverRadius: 0,
    },
  ];
}

export function spawnPoint(): { x: number; z: number } {
  const s = spawnUV();
  return fromUV(s.u, s.v);
}
