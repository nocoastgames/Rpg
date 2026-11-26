/** Enemy archetypes for the valley. Stats are for level 1; `enemyStats` scales them to a level. */
import type { StatusId } from "./status.ts";

export interface EnemyDef {
  id: string;
  name: string;
  maxHp: number;
  damage: [min: number, max: number];
  attackRange: number;
  attackCooldown: number;
  moveSpeed: number;
  aggroRange: number;
  /** Distance from home before giving up the chase. */
  leashRange: number;
  radius: number;
  xp: number;
  /** Placeholder model colour + scale. */
  color: string;
  scale: number;
  /** Chance per hit to inflict a status effect. */
  inflicts?: { status: StatusId; chance: number };
  /** Counts as a beast (the Trapper background hunts these well). */
  beast?: boolean;
  /** Never attacks; runs from whatever hurts it. */
  passive?: boolean;
  /** What it may drop (straight into the killer's pack). */
  loot?: readonly LootDrop[];
  /** Chance of a few coins, and how many. */
  coins?: { chance: number; range: [number, number] };
  /** A named or boss creature: its name shows in gold. */
  elite?: boolean;
  /** Boss moves: a periodic blast around it, and calling minions once when wounded. */
  special?: {
    nova?: { every: number; radius: number; multiplier: number; status?: StatusId };
    summon?: { kind: string; count: number; atHpFraction: number };
  };
}

export interface LootDrop {
  item: string;
  chance: number;
  qty?: [number, number];
}

/** Rusty gear the dead may carry: one entry per calling's weapon, plus padding anyone can wear. */
const RUSTY_GEAR: readonly LootDrop[] = [
  { item: "rusted_longsword", chance: 0.02 },
  { item: "rusted_flail", chance: 0.02 },
  { item: "rusted_dirk", chance: 0.02 },
  { item: "gravewood_wand", chance: 0.02 },
  { item: "moth_eaten_gambeson", chance: 0.03 },
];

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: "boar",
    name: "Tusked Boar",
    maxHp: 55,
    damage: [4, 8],
    attackRange: 1.7,
    attackCooldown: 1.6,
    moveSpeed: 4.2,
    aggroRange: 6,
    leashRange: 22,
    radius: 0.7,
    xp: 22,
    color: "#5a3d2b",
    scale: 1.15,
    beast: true,
    loot: [
      { item: "boar_hide", chance: 0.6 },
      { item: "boar_meat", chance: 0.5 },
    ],
  },
  {
    id: "hare",
    name: "Wild Hare",
    maxHp: 16,
    damage: [0, 0],
    attackRange: 0,
    attackCooldown: 99,
    moveSpeed: 6.5,
    aggroRange: 0,
    leashRange: 26,
    radius: 0.3,
    xp: 6,
    color: "#a08466",
    scale: 0.55,
    beast: true,
    passive: true,
    loot: [{ item: "hare_meat", chance: 0.9 }],
  },
  {
    id: "wolf",
    name: "Grey Wolf",
    maxHp: 45,
    damage: [4, 7],
    attackRange: 1.6,
    attackCooldown: 1.2,
    moveSpeed: 5.5,
    aggroRange: 8,
    leashRange: 30,
    radius: 0.55,
    xp: 20,
    color: "#7d7d82",
    scale: 1,
    inflicts: { status: "bleed", chance: 0.2 },
    beast: true,
    loot: [{ item: "wolf_pelt", chance: 0.55 }],
    coins: { chance: 0.15, range: [1, 2] },
  },
  {
    id: "spider",
    name: "Hollow Spider",
    maxHp: 38,
    damage: [3, 6],
    attackRange: 1.6,
    attackCooldown: 1.1,
    moveSpeed: 4.8,
    aggroRange: 7,
    leashRange: 24,
    radius: 0.6,
    xp: 20,
    color: "#3a3046",
    scale: 1,
    inflicts: { status: "poison", chance: 0.35 },
    beast: true,
    loot: [{ item: "spider_silk", chance: 0.6 }],
    coins: { chance: 0.15, range: [1, 3] },
  },
  {
    id: "thornling",
    name: "Thornling",
    maxHp: 40,
    damage: [4, 7],
    attackRange: 1.5,
    attackCooldown: 1.0,
    moveSpeed: 3.6,
    aggroRange: 8,
    leashRange: 25,
    radius: 0.45,
    xp: 19,
    color: "#3f6b2a",
    scale: 0.85,
    inflicts: { status: "blight", chance: 0.25 },
    loot: [{ item: "thorn_splinter", chance: 0.6 }],
    coins: { chance: 0.2, range: [1, 3] },
  },

  // --- The dead of Ashford ---
  {
    id: "risen",
    name: "Risen Villager",
    maxHp: 55,
    damage: [5, 8],
    attackRange: 1.6,
    attackCooldown: 1.7,
    moveSpeed: 2.7,
    aggroRange: 7,
    leashRange: 22,
    radius: 0.45,
    xp: 21,
    color: "#7d8a6a",
    scale: 1,
    loot: [{ item: "grave_shroud", chance: 0.45 }, { item: "tarnished_locket", chance: 0.06 }, ...RUSTY_GEAR],
    coins: { chance: 0.5, range: [1, 3] },
  },
  {
    id: "skeleton",
    name: "Skeleton",
    maxHp: 40,
    damage: [4, 7],
    attackRange: 1.7,
    attackCooldown: 1.2,
    moveSpeed: 4.0,
    aggroRange: 8,
    leashRange: 24,
    radius: 0.45,
    xp: 21,
    color: "#e2dccb",
    scale: 1,
    loot: [{ item: "old_bones", chance: 0.75, qty: [1, 2] }, ...RUSTY_GEAR],
    coins: { chance: 0.5, range: [1, 4] },
  },
  {
    id: "gravedigger",
    name: "Old Corwin, the Gravedigger",
    maxHp: 115,
    damage: [5, 6],
    attackRange: 1.9,
    attackCooldown: 1.5,
    moveSpeed: 3.2,
    aggroRange: 6,
    leashRange: 18,
    radius: 0.5,
    xp: 60,
    color: "#6a6f58",
    scale: 1.1,
    elite: true,
    loot: [{ item: "grave_shroud", chance: 1 }, { item: "old_bones", chance: 1, qty: [2, 3] }],
    coins: { chance: 1, range: [4, 8] },
  },
  {
    id: "hollow_priest",
    name: "The Hollow Priest",
    maxHp: 125,
    damage: [4, 5],
    attackRange: 2.0,
    attackCooldown: 1.6,
    moveSpeed: 3.4,
    aggroRange: 13,
    leashRange: 26,
    radius: 0.6,
    xp: 150,
    color: "#3e3448",
    scale: 1.25,
    elite: true,
    special: {
      nova: { every: 7, radius: 4.5, multiplier: 0.6, status: "blight" },
      summon: { kind: "skeleton", count: 2, atHpFraction: 0.5 },
    },
    loot: [{ item: "healing_draught", chance: 1 }, { item: "thorn_splinter", chance: 1, qty: [2, 3] }],
    coins: { chance: 1, range: [15, 25] },
  },
];

/** Overall creature toughness relative to the per-kind numbers above (tuned with simulated fights). */
const ENEMY_HP_SCALE = 1.3;
const ENEMY_DAMAGE_SCALE = 1.8;

/** A creature's numbers at a given level. */
export function enemyStats(def: EnemyDef, level: number): { maxHp: number; damage: [number, number]; xp: number } {
  const l = Math.max(0, level - 1);
  const dmg = (1 + 0.15 * l) * ENEMY_DAMAGE_SCALE;
  return {
    maxHp: Math.round(def.maxHp * (1 + 0.3 * l) * ENEMY_HP_SCALE),
    damage: [def.damage[0] * dmg, def.damage[1] * dmg],
    xp: Math.round(def.xp * (1 + 0.3 * l)),
  };
}

const ENEMY_MAP = new Map<string, EnemyDef>(ENEMIES.map((e) => [e.id, e]));

export function getEnemy(id: string): EnemyDef | undefined {
  return ENEMY_MAP.get(id);
}
