/** Enemy archetypes. Only forest creatures for now; dungeon monsters come later. */

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
}

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: "wolf",
    name: "Grey Wolf",
    maxHp: 40,
    damage: [4, 7],
    attackRange: 1.6,
    attackCooldown: 1.2,
    moveSpeed: 5.5,
    aggroRange: 11,
    leashRange: 30,
    radius: 0.55,
    xp: 18,
    color: "#7d7d82",
    scale: 1,
  },
  {
    id: "boar",
    name: "Tusked Boar",
    maxHp: 70,
    damage: [6, 10],
    attackRange: 1.7,
    attackCooldown: 1.6,
    moveSpeed: 4.2,
    aggroRange: 7,
    leashRange: 22,
    radius: 0.7,
    xp: 26,
    color: "#5a3d2b",
    scale: 1.15,
  },
  {
    id: "thornling",
    name: "Thornling",
    maxHp: 30,
    damage: [3, 6],
    attackRange: 1.5,
    attackCooldown: 1.0,
    moveSpeed: 3.6,
    aggroRange: 9,
    leashRange: 25,
    radius: 0.45,
    xp: 14,
    color: "#3f6b2a",
    scale: 0.85,
  },
];

const ENEMY_MAP = new Map<string, EnemyDef>(ENEMIES.map((e) => [e.id, e]));

export function getEnemy(id: string): EnemyDef | undefined {
  return ENEMY_MAP.get(id);
}
