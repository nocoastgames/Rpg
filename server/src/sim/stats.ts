import {
  addStats,
  BASE_MOVE_SPEED,
  deriveMaxHp,
  deriveMaxResource,
  getClass,
  getItem,
  getSubclass,
  type ClassDef,
  type Stats,
  type SubclassDef,
} from "@rpg/shared";
import type { Player } from "../schema/WorldState.ts";

export interface ResolvedCharacter {
  cls: ClassDef;
  sub: SubclassDef;
  stats: Stats;
}

export function resolveCharacter(p: Player): ResolvedCharacter {
  const cls = getClass(p.classId)!;
  const sub = getSubclass(p.classId, p.subclassId)!;
  const levelled = addStats(cls.baseStats, cls.growth, p.level - 1);
  return { cls, sub, stats: addStats(levelled, sub.statBonus) };
}

/** Recompute max HP/resource after level or gear changes. Keeps current values proportionally. */
export function applyDerived(p: Player, ch: ResolvedCharacter): void {
  const maxHp = deriveMaxHp(ch.stats, p.level);
  const maxRes = deriveMaxResource(ch.cls.resource, ch.stats, p.level);
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
  return (1 + ch.stats[ch.cls.primaryStat] * 0.04) * (1 + buffTotal(p, "damage", now));
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
