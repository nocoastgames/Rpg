import { BASE_MOVE_SPEED, addStats, deriveMaxHp, deriveMaxResource, getItem, resolveKit, type ResolvedKit, type Stats } from "@rpg/shared";
import type { Player } from "../schema/WorldState.ts";

export interface ResolvedCharacter {
  kit: ResolvedKit;
  stats: Stats;
}

/** Stats = base class stats + per-level growth + every class bonus along the character's path. */
export function resolveCharacter(p: Player): ResolvedCharacter {
  const kit = resolveKit(p.classId)!;
  let stats = addStats(kit.base.baseStats, kit.base.growth, p.level - 1);
  for (const n of kit.path) stats = addStats(stats, n.statBonus);
  return { kit, stats };
}

/** Recompute max HP/resource after level or class changes. Keeps current values proportionally. */
export function applyDerived(p: Player, ch: ResolvedCharacter): void {
  const maxHp = deriveMaxHp(ch.stats, p.level);
  const maxRes = deriveMaxResource(ch.kit.base.resource, ch.stats, p.level);
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

export function damageMultiplier(p: Player, ch: ResolvedCharacter, now: number): number {
  return (1 + ch.stats[ch.kit.base.primaryStat] * 0.04) * (1 + buffTotal(p, "damage", now));
}

export function critChance(ch: ResolvedCharacter): number {
  return Math.min(0.4, 0.05 + ch.stats.agility * 0.003);
}

export function armorFraction(p: Player, now: number): number {
  const gear = getItem(p.armor)?.armor ?? 0;
  return Math.min(0.75, gear + buffTotal(p, "armor", now));
}

export function moveSpeed(p: Player, now: number): number {
  return BASE_MOVE_SPEED * (1 + buffTotal(p, "speed", now));
}

export function weaponBonus(p: Player): number {
  return getItem(p.weapon)?.damageBonus ?? 0;
}

/** Average damage of one basic attack, before crits. Used for abilities and companions. */
export function averageHit(p: Player, ch: ResolvedCharacter, now: number): number {
  const atk = ch.kit.basicAttack;
  return ((atk.damage[0] + atk.damage[1]) / 2 + weaponBonus(p)) * damageMultiplier(p, ch, now);
}
