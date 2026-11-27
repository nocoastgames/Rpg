export type StatId = "might" | "agility" | "intellect" | "vitality" | "spirit";

export type Stats = Record<StatId, number>;

export const STAT_IDS: readonly StatId[] = ["might", "agility", "intellect", "vitality", "spirit"];

export const STAT_LABELS: Record<StatId, string> = {
  might: "Might",
  agility: "Agility",
  intellect: "Intellect",
  vitality: "Vitality",
  spirit: "Spirit",
};

export type ResourceType = "mana" | "rage" | "energy" | "focus" | "faith";

export interface ResourceRules {
  label: string;
  color: string;
  /** Amount regenerated per second (negative = decays, e.g. rage). */
  regenPerSecond: number;
  /** Amount gained when dealing a basic attack hit. */
  gainOnHit: number;
  /** Amount gained when taking damage. */
  gainOnHurt: number;
  /** Whether a freshly spawned character starts full or empty. */
  startsFull: boolean;
}

export const RESOURCES: Record<ResourceType, ResourceRules> = {
  mana: { label: "Mana", color: "#3a6fd8", regenPerSecond: 2, gainOnHit: 0, gainOnHurt: 0, startsFull: true },
  rage: { label: "Rage", color: "#c0392b", regenPerSecond: -1.5, gainOnHit: 8, gainOnHurt: 4, startsFull: false },
  energy: { label: "Energy", color: "#e1c340", regenPerSecond: 12, gainOnHit: 0, gainOnHurt: 0, startsFull: true },
  focus: { label: "Focus", color: "#3fa66b", regenPerSecond: 5, gainOnHit: 2, gainOnHurt: 0, startsFull: true },
  faith: { label: "Faith", color: "#e8c45a", regenPerSecond: 2.5, gainOnHit: 1, gainOnHurt: 1, startsFull: true },
};

export function addStats(a: Stats, b: Partial<Stats>, scale = 1): Stats {
  const out = { ...a };
  for (const id of STAT_IDS) out[id] += (b[id] ?? 0) * scale;
  return out;
}

/** Derived numbers from stats. Kept deliberately simple; tune later. */
export function deriveMaxHp(stats: Stats, level: number): number {
  return Math.round(40 + stats.vitality * 6 + stats.might * 1 + level * 8);
}

export function deriveMaxResource(resource: ResourceType, stats: Stats, level: number): number {
  if (resource === "rage" || resource === "energy") return 100;
  if (resource === "focus") return Math.round(80 + stats.agility * 1 + level * 2);
  return Math.round(40 + stats.intellect * 3 + stats.spirit * 3 + level * 5);
}

/** Damage multiplier from a class's primary stat. */
export function primaryDamageMultiplier(primaryValue: number): number {
  return 1 + primaryValue * 0.04;
}

/** Base critical-hit chance from agility (before bonuses), capped at 40%. */
export function critChanceFor(agility: number, bonus = 0): number {
  return Math.min(0.4, 0.05 + agility * 0.003 + bonus);
}

/**
 * Fighting above your level is punishing: each level of difference shifts
 * damage by LEVEL_GAP_STEP in the stronger side's favour, both ways.
 */
export const LEVEL_GAP_STEP = 0.38;

export function levelGapMultiplier(attackerLevel: number, defenderLevel: number): number {
  return Math.min(2.5, Math.max(0.25, 1 + LEVEL_GAP_STEP * (attackerLevel - defenderLevel)));
}

/**
 * Experience required to go from `level` to `level + 1`. Tuned with the
 * starting quests: level 2 as Shelter is finished, level 3 as Teeth in the
 * Pines is (see docs/VALLEY.md, "Pacing").
 */
export function xpForNextLevel(level: number): number {
  return Math.round(360 * Math.pow(level, 1.15));
}
