import {
  BASE_MOVE_SPEED,
  STAT_IDS,
  WATER_SPEED_MULTIPLIER,
  addStats,
  passiveBonus,
  critChanceFor,
  deriveMaxHp,
  deriveMaxResource,
  getBackground,
  getItem,
  getStatus,
  primaryDamageMultiplier,
  resolveKit,
  type Passive,
  type ResolvedKit,
  type Stats,
} from "@rpg/shared";
import type { Player } from "../schema/WorldState.ts";

/** Background passive + faith blessing (when the class's alignment matches the god). */
export function bonus(p: Player, type: Passive["type"]): number {
  return passiveBonus(p.background, p.faith, p.classId, type, p.quests);
}

export interface ResolvedCharacter {
  kit: ResolvedKit;
  stats: Stats;
}

/**
 * Stats = base class stats + background + creation point-buy + per-level
 * growth + every class bonus along the character's path.
 */
export function resolveCharacter(p: Player): ResolvedCharacter {
  const kit = resolveKit(p.classId)!;
  let stats = addStats(kit.base.baseStats, kit.base.growth, p.level - 1);
  stats = addStats(stats, getBackground(p.background)?.statBonus ?? {});
  STAT_IDS.forEach((id, i) => (stats[id] += p.alloc[i] ?? 0));
  for (const n of kit.path) stats = addStats(stats, n.statBonus);
  return { kit, stats };
}

/** Recompute max HP/resource after level or class changes. Keeps current values proportionally. */
export function applyDerived(p: Player, ch: ResolvedCharacter): void {
  const maxHp = deriveMaxHp(ch.stats, p.level);
  const maxRes = Math.round(deriveMaxResource(ch.kit.base.resource, ch.stats, p.level) * (1 + bonus(p, "maxResource")));
  const hpRatio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
  p.maxHp = maxHp;
  p.hp = Math.min(maxHp, Math.max(1, Math.round(maxHp * hpRatio)));
  p.maxResource = maxRes;
  p.resource = Math.min(p.resource, maxRes);
}

export function buffTotal(p: Player, stat: string, now: number): number {
  let total = 0;
  for (const b of p.buffs) if (b.stat === stat && b.expiresAt > now) total += b.amount;
  return total;
}

/** Multiplier from harmful statuses (Blight saps your strength). */
export function statusDamageMultiplier(p: Player, now: number): number {
  let m = 1;
  for (const s of p.statuses) if (s.expiresAt > now) m *= getStatus(s.id)?.damageDealt ?? 1;
  return m;
}

export function damageMultiplier(p: Player, ch: ResolvedCharacter, now: number): number {
  return primaryDamageMultiplier(ch.stats[ch.kit.base.primaryStat]) * (1 + buffTotal(p, "damage", now)) * statusDamageMultiplier(p, now);
}

export function critChance(p: Player, ch: ResolvedCharacter): number {
  return critChanceFor(ch.stats.agility, bonus(p, "crit"));
}

export function armorFraction(p: Player, now: number): number {
  const gear = getItem(p.armor)?.armor ?? 0;
  return Math.min(0.75, gear + bonus(p, "armor") + buffTotal(p, "armor", now));
}

export function moveSpeed(p: Player, now: number): number {
  return BASE_MOVE_SPEED * (1 + buffTotal(p, "speed", now) + bonus(p, "moveSpeed"));
}

export function weaponBonus(p: Player): number {
  return (getItem(p.weapon)?.damageBonus ?? 0) + bonus(p, "weaponDamage");
}

/** Average damage of one basic attack, before crits. Used for abilities and companions. */
export function averageHit(p: Player, ch: ResolvedCharacter, now: number): number {
  const atk = ch.kit.basicAttack;
  return ((atk.damage[0] + atk.damage[1]) / 2 + weaponBonus(p)) * damageMultiplier(p, ch, now);
}

/** Speed multiplier while wading; Sailors barely notice the water. */
export function waterMultiplier(p: Player): number {
  return WATER_SPEED_MULTIPLIER + (1 - WATER_SPEED_MULTIPLIER) * bonus(p, "waterSlow");
}
