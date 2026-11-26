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
}

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
  },
  {
    id: "wolf",
    name: "Grey Wolf",
    maxHp: 45,
    damage: [4, 7],
    attackRange: 1.6,
    attackCooldown: 1.2,
    moveSpeed: 5.5,
    aggroRange: 10,
    leashRange: 30,
    radius: 0.55,
    xp: 20,
    color: "#7d7d82",
    scale: 1,
    inflicts: { status: "bleed", chance: 0.2 },
    beast: true,
  },
  {
    id: "spider",
    name: "Hollow Spider",
    maxHp: 38,
    damage: [3, 6],
    attackRange: 1.6,
    attackCooldown: 1.1,
    moveSpeed: 4.8,
    aggroRange: 9,
    leashRange: 24,
    radius: 0.6,
    xp: 20,
    color: "#3a3046",
    scale: 1,
    inflicts: { status: "poison", chance: 0.35 },
    beast: true,
  },
  {
    id: "thornling",
    name: "Thornling",
    maxHp: 40,
    damage: [4, 7],
    attackRange: 1.5,
    attackCooldown: 1.0,
    moveSpeed: 3.6,
    aggroRange: 9,
    leashRange: 25,
    radius: 0.45,
    xp: 19,
    color: "#3f6b2a",
    scale: 0.85,
    inflicts: { status: "blight", chance: 0.25 },
  },
];

/** A creature's numbers at a given level. */
export function enemyStats(def: EnemyDef, level: number): { maxHp: number; damage: [number, number]; xp: number } {
  const l = Math.max(0, level - 1);
  const dmg = 1 + 0.15 * l;
  return {
    maxHp: Math.round(def.maxHp * (1 + 0.3 * l)),
    damage: [def.damage[0] * dmg, def.damage[1] * dmg],
    xp: Math.round(def.xp * (1 + 0.3 * l)),
  };
}

const ENEMY_MAP = new Map<string, EnemyDef>(ENEMIES.map((e) => [e.id, e]));

export function getEnemy(id: string): EnemyDef | undefined {
  return ENEMY_MAP.get(id);
}
