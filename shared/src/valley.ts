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

/** Sheltered clearing west of where you wake: the campsite you build in the first quest. */
export const CAMP = { u: -9, v: -10 };
export const CAMP_CLEARING_RADIUS = 8;

/** Haskel the peddler's cart, by the old signpost on the road to the pass. */
export const VENDOR = { u: 31, v: -10 };

/** Ashford: the farming village on the old west road, overrun by the dead. */
export const VILLAGE = { u: -29, v: 12 };
export const VILLAGE_CLEARING_RADIUS = 15;

export type VillagePieceKind = "cottage" | "headman_house" | "chapel" | "well" | "cart" | "fence" | "headstone" | "crypt" | "gate_posts";

/** Village layout, as offsets (u, v) from VILLAGE. `rot` is a yaw in radians. */
export const VILLAGE_PIECES: ReadonlyArray<{ kind: VillagePieceKind; du: number; dv: number; rot: number; size?: number }> = [
  { kind: "well", du: 0, dv: 0, rot: 0 },
  { kind: "cottage", du: 5, dv: -8, rot: 0.2 },
  { kind: "cottage", du: -2, dv: -9, rot: -0.15 },
  { kind: "cottage", du: 8, dv: 6, rot: 2.9 },
  { kind: "cottage", du: 1, dv: 9, rot: 3.3 },
  { kind: "headman_house", du: -8, dv: 4, rot: 1.6 },
  { kind: "chapel", du: -9, dv: -6, rot: 0.1 },
  { kind: "crypt", du: -6, dv: -1.5, rot: 1.2 },
  { kind: "cart", du: 7, dv: -1, rot: 0.9 },
  { kind: "gate_posts", du: 12, dv: 0.5, rot: 0.8 },
  { kind: "fence", du: 11, dv: -5, rot: 0.6, size: 5 },
  { kind: "fence", du: 11, dv: 6, rot: 1.0, size: 5 },
  // The graveyard, south of the chapel.
  { kind: "fence", du: -9, dv: 9, rot: 0, size: 7 },
  { kind: "fence", du: -9, dv: 16, rot: 0, size: 7 },
  { kind: "fence", du: -12.5, dv: 12.5, rot: Math.PI / 2, size: 7 },
  ...[0, 1, 2].flatMap((i) => [0, 1].map((j) => ({ kind: "headstone" as const, du: -11 + i * 2.2, dv: 11 + j * 2.4, rot: 0.1 * (i - j) }))),
];

/** The crypt beneath the chapel, the graveyard and the clues to what happened. */
export const VILLAGE_CRYPT = { du: -6, dv: -1.5 };
export const VILLAGE_GRAVEYARD = { du: -7.5, dv: 12.5 };

export interface ClueDef {
  id: string;
  du: number;
  dv: number;
  /** Prompt, e.g. "Search the cart". */
  verb: string;
  /** What you find. */
  text: string;
}

export const VILLAGE_CLUES: readonly ClueDef[] = [
  {
    id: "clue_cart",
    du: 6,
    dv: 1,
    verb: "Search the cart",
    text: "The headman's cart, half-packed: blankets, a cooking pot, a child's shoe. Someone meant to flee and never got the chance.",
  },
  {
    id: "clue_well",
    du: 1.6,
    dv: 1.2,
    verb: "Look down the well",
    text: "Black thorns choke the well shaft, and the water stinks of rot. The same thorns as the ones at the cave.",
  },
  {
    id: "clue_journal",
    du: -4.4,
    dv: 4,
    verb: "Read the open journal",
    text: "The headman's journal, last page: \"Corwin broke into the old crypt under the chapel. Says he heard singing down there. He won't speak now, only digs. Every night, more graves are open.\"",
  },
];

/** Where named creatures appear: Old Corwin in the graveyard, the Hollow Priest at the crypt. */
export function villagePoint(du: number, dv: number): { x: number; z: number } {
  return fromUV(VILLAGE.u + du, VILLAGE.v + dv);
}

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
    // Spawn clearing → the campsite clearing.
    [sp, { u: (sp.u + CAMP.u) / 2, v: (sp.v + CAMP.v) / 2 - 1 }, CAMP],
    // Spawn clearing → ford → east to the pass.
    [sp, { u: sp.u + 1, v: -11 }, { u: ford.u - 4, v: FORD_V }, ford, { u: ford.u + 5, v: FORD_V - 1 }, { u: 26, v: -16 }, PASS_START, { u: 52, v: -21 }],
    // Spawn → south-west to the ruins.
    [sp, { u: sp.u - 6, v: 6 }, { u: -16, v: 22 }, { u: RUINS_CENTER.u + 3, v: RUINS_CENTER.v - 10 }],
    // Off the ruins trail, west along the old road into Ashford.
    [{ u: sp.u - 6, v: 6 }, { u: -10, v: 10 }, { u: VILLAGE.u + 13, v: VILLAGE.v + 0.5 }, { u: VILLAGE.u + 3, v: VILLAGE.v }],
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
  if (inDungeon(x, z)) return 0;
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
// The castle dungeon: far from the valley. Only one cell is built.
// ---------------------------------------------------------------------------

/** Centre of the cell (world x/z), well outside the valley's map. */
export const DUNGEON_CELL = { x: 640, z: 40, halfW: 3.2, halfD: 2.6 };

/** Anywhere in the dungeon's patch of the world. */
export function inDungeon(x: number, z: number): boolean {
  return Math.abs(x - DUNGEON_CELL.x) < 40 && Math.abs(z - DUNGEON_CELL.z) < 40;
}

/** Signed distance to the cell walls (positive inside). */
export function dungeonSdf(x: number, z: number): number {
  return Math.min(DUNGEON_CELL.halfW - Math.abs(x - DUNGEON_CELL.x), DUNGEON_CELL.halfD - Math.abs(z - DUNGEON_CELL.z));
}

/** Past this point on the road out (u, beyond the rockslide), the King's soldiers are waiting. */
export const GUARD_TRIGGER_U = 60;
/** Where the soldiers stand, in the pass beyond the rockslide (u, v offsets along it). */
export const GUARD_POST = { u: 68, v: -26.5 };

// ---------------------------------------------------------------------------
// Landmarks & sealed gates
// ---------------------------------------------------------------------------

export type GateId = "valley_exit" | "ruins_seal" | "cave_thorns";

export interface LandmarkDef {
  id: string;
  /** What interacting does: inspect (text only), pray at a shrine, use the campsite, or talk to someone. */
  kind: "inspect" | "shrine" | "camp" | "npc";
  /** Shrines: the god it belongs to. */
  faith?: string;
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
      kind: "inspect",
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
      kind: "inspect",
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
      kind: "inspect",
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
      kind: "inspect",
      name: "Old Signpost",
      ...at(PASS_START.u - 6, PASS_START.v + 2.2),
      interactRadius: 2.6,
      verb: "Read the signpost",
      lockedText: "The signpost is too weathered to read. One arm points toward the pass.",
      discoverRadius: 0,
    },
    {
      id: "campsite",
      kind: "camp",
      name: "The Clearing",
      ...at(CAMP.u, CAMP.v),
      interactRadius: 3.4,
      verb: "Make camp",
      lockedText: "A sheltered clearing, out of the wind. It would make a good camp.",
      discoverRadius: 12,
    },
    {
      id: "vendor",
      kind: "npc",
      name: "Haskel the Peddler",
      ...at(VENDOR.u, VENDOR.v),
      interactRadius: 3.4,
      verb: "Talk to Haskel",
      lockedText: "",
      discoverRadius: 14,
    },
    {
      id: "village",
      kind: "inspect",
      name: "Ashford",
      ...at(VILLAGE.u, VILLAGE.v),
      interactRadius: 0,
      verb: "",
      lockedText: "",
      discoverRadius: 17,
    },
    {
      id: "crypt",
      kind: "inspect",
      name: "The Chapel Crypt",
      ...villagePoint(VILLAGE_CRYPT.du + 1.6, VILLAGE_CRYPT.dv + 0.6),
      interactRadius: 2.8,
      verb: "Inspect the crypt",
      lockedText: "Stone steps lead down under the chapel to an iron door. Black thorns have pushed up between the flagstones.",
      discoverRadius: 0,
    },
    {
      id: "dungeon_cell",
      kind: "inspect",
      name: "The Castle Dungeon",
      x: DUNGEON_CELL.x,
      z: DUNGEON_CELL.z,
      interactRadius: 0,
      verb: "",
      lockedText: "",
      discoverRadius: 6,
    },
    {
      id: "cell_door",
      kind: "inspect",
      name: "Cell Door",
      x: DUNGEON_CELL.x,
      z: DUNGEON_CELL.z - DUNGEON_CELL.halfD + 0.7,
      interactRadius: 1.6,
      verb: "Try the door",
      lockedText: "Iron-banded oak, locked fast. Somewhere beyond it, keys jingle, and someone is weeping.",
      discoverRadius: 0,
    },
    {
      id: "cell_scratches",
      kind: "inspect",
      name: "Scratched Wall",
      x: DUNGEON_CELL.x - DUNGEON_CELL.halfW + 0.7,
      z: DUNGEON_CELL.z + 0.6,
      interactRadius: 1.5,
      verb: "Read the scratches",
      lockedText: "Hundreds of tally marks, and words gouged deep into the stone: \"THEY BROUGHT ME OUT OF THE VALLEY TOO.\"",
      discoverRadius: 0,
    },
    ...SHRINES.map((s): LandmarkDef => {
      const p = shrinePosition(s);
      return {
        id: `shrine_${s.faith}`,
        kind: "shrine",
        faith: s.faith,
        name: s.name,
        ...p,
        interactRadius: 2.8,
        verb: "Pray",
        lockedText: s.text,
        discoverRadius: 12,
      };
    }),
  ];
}

// ---------------------------------------------------------------------------
// Shrines: one to each god, set where their domain shows
// ---------------------------------------------------------------------------

export interface ShrineDef {
  faith: string;
  name: string;
  /** Desired spot (u, v); nudged toward the valley centre if it lands too close to the cliffs or the water. */
  u: number;
  v: number;
  /** What a non-follower sees. */
  text: string;
}

export const SHRINES: readonly ShrineDef[] = [
  { faith: "solenne", name: "Shrine of the Dawn", u: 38, v: 6, text: "A white stone shrine facing the sunrise, warm to the touch even in shade." },
  { faith: "valdris", name: "Shrine of the Oathshield", u: 27, v: -28, text: "A shield-shaped stone stands watch over the road to the pass." },
  { faith: "green_mother", name: "Shrine of the Green Mother", u: 30, v: -52, text: "A mossy stone ringed with wildflowers that bloom out of season." },
  { faith: "orren", name: "Shrine of the Roads", u: -4, v: -24, text: "A waymarker carved with a hundred little arrows, worn smooth by passing hands." },
  { faith: "mirevel", name: "Shrine of the Hidden Ledger", u: -36, v: 54, text: "A slate carved with writing no one has ever finished reading." },
  { faith: "ferryman", name: "Shrine of the Far Shore", u: 0, v: 66, text: "A grey cairn by the water, where the stream leaves the valley." },
  { faith: "kaelthar", name: "Shrine of the Hunger", u: -42, v: -4, text: "A blackened altar. Old stains darken the stone." },
  { faith: "veiled_one", name: "Shrine of the Veil", u: -10, v: -66, text: "A shrouded figure in the mist of the waterfall. You can't see its face." },
  { faith: "rot_below", name: "Shrine of the Deep Rot", u: -20, v: -50, text: "A stump split open by black thorns. Something sweet and rotten breathes from it." },
];

/** Where a shrine actually stands: walked toward the valley centre until it has room. */
export function shrinePosition(s: { u: number; v: number }): { x: number; z: number } {
  let u = s.u;
  let v = s.v;
  for (let i = 0; i < 60; i++) {
    const p = fromUV(u, v);
    if (valleySdf(p.x, p.z) > 6 && distanceToWater(p.x, p.z) > 4) return p;
    u *= 0.96;
    v *= 0.97;
    if (distanceToWater(p.x, p.z) <= 4) u -= 1.5 * Math.sign(streamU(v) - u || 1);
  }
  return fromUV(u, v);
}

// ---------------------------------------------------------------------------
// Hunting grounds: the valley is a level 1-5 zone
// ---------------------------------------------------------------------------

export const VALLEY_LEVELS: [number, number] = [1, 5];

export interface ZoneDef {
  id: string;
  name: string;
  levels: [number, number];
  /** Centre and radius (u, v frame). */
  u: number;
  v: number;
  radius: number;
  /** Enemy kinds and spawn weights. */
  enemies: ReadonlyArray<{ id: string; weight: number }>;
  /** How many creatures live here at full strength. */
  population: number;
}

export const ZONES: readonly ZoneDef[] = [
  { id: "tusk_meadow", name: "Tusk Meadow", levels: [1, 2], u: 27, v: 14, radius: 17, enemies: [{ id: "boar", weight: 2 }, { id: "hare", weight: 1 }], population: 11 },
  { id: "greypine_wood", name: "Greypine Wood", levels: [2, 3], u: 14, v: -48, radius: 19, enemies: [{ id: "wolf", weight: 3 }, { id: "hare", weight: 1 }], population: 9 },
  { id: "ashford", name: "Ashford", levels: [2, 3], u: VILLAGE.u, v: VILLAGE.v, radius: 13, enemies: [{ id: "risen", weight: 11 }, { id: "skeleton", weight: 9 }], population: 10 },
  { id: "webbed_hollow", name: "Webbed Hollow", levels: [3, 4], u: 6, v: 50, radius: 16, enemies: [{ id: "spider", weight: 1 }], population: 7 },
  { id: "thornbrake", name: "The Thornbrake", levels: [4, 5], u: -35, v: -40, radius: 13, enemies: [{ id: "thornling", weight: 1 }], population: 7 },
];

export function zoneAt(x: number, z: number, margin = 0): ZoneDef | undefined {
  const { u, v } = toUV(x, z);
  return ZONES.find((zn) => Math.hypot(u - zn.u, v - zn.v) < zn.radius + margin);
}

export function spawnPoint(): { x: number; z: number } {
  const s = spawnUV();
  return fromUV(s.u, s.v);
}
