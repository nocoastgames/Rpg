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

export type ResourceType = "mana" | "rage" | "energy" | "focus";

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

/** Experience required to go from `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
  return Math.round(60 * Math.pow(level, 1.6));
}
