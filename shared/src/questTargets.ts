/**
 * Where a quest step sends you, for the map's quest arrow and the diary.
 * Deliberately general: a place, the middle of a hunting ground, or the
 * nearest pick-up you still need; never a creature's exact position.
 */
import { ENEMIES } from "./enemies.ts";
import { getQuest } from "./quests.ts";
import { ZONES, fromUV, type LandmarkDef, type ZoneDef } from "./valley.ts";
import type { GatherNode } from "./world.ts";

export interface QuestTarget {
  x: number;
  z: number;
  /** 0 for a spot; the hunting ground's radius for an area. */
  radius: number;
  /** What's there, for the map ("Tusk Meadow", "Haskel's camp"). */
  label: string;
}

export interface QuestTargetContext {
  landmarks: readonly LandmarkDef[];
  nodes: readonly GatherNode[];
  /** Where you are (picks the nearest pick-up or hunting ground). */
  x: number;
  z: number;
  /** How many of an item you carry (a delivery points at the giver once you have enough). */
  have(item: string): number;
  /** Pick-ups you still need for the active step. */
  wantsNode(n: GatherNode): boolean;
}

function zoneTarget(z: ZoneDef): QuestTarget {
  const p = fromUV(z.u, z.v);
  return { x: p.x, z: p.z, radius: z.radius, label: z.name };
}

function landmarkTarget(l: LandmarkDef): QuestTarget {
  return { x: l.x, z: l.z, radius: 0, label: l.name };
}

/** The nearest hunting ground (not the valley-wide hares) where any of these creatures live. */
function nearestZoneFor(enemies: readonly string[], x: number, z: number): ZoneDef | undefined {
  let best: ZoneDef | undefined;
  let bestD = Infinity;
  for (const zn of ZONES) {
    if (zn.ambient || !zn.enemies.some((e) => enemies.includes(e.id))) continue;
    const p = fromUV(zn.u, zn.v);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) {
      bestD = d;
      best = zn;
    }
  }
  return best;
}

/** Where step `stepIndex` of a quest sends you, or null if it points nowhere in particular. */
export function questTarget(questId: string, stepIndex: number, ctx: QuestTargetContext): QuestTarget | null {
  const t = rawTarget(questId, stepIndex, ctx);
  const where = getQuest(questId)?.steps[stepIndex]?.where;
  return t && where ? { ...t, label: where } : t;
}

function rawTarget(questId: string, stepIndex: number, ctx: QuestTargetContext): QuestTarget | null {
  const quest = getQuest(questId);
  const step = quest?.steps[stepIndex];
  if (!quest || !step) return null;
  const o = step.objective;
  const landmark = (id: string | undefined) => (id ? ctx.landmarks.find((l) => l.id === id) : undefined);
  const zone = (id: string | undefined) => (id ? ZONES.find((z) => z.id === id) : undefined);

  switch (o.type) {
    case "gather": {
      let best: GatherNode | undefined;
      let bestD = Infinity;
      for (const n of ctx.nodes) {
        if (n.kind !== o.node || !ctx.wantsNode(n)) continue;
        const d = Math.hypot(n.x - ctx.x, n.z - ctx.z);
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best) {
        const near = landmark(step.marker);
        return { x: best.x, z: best.z, radius: 0, label: near?.name ?? step.title };
      }
      break;
    }
    case "kill": {
      const z = zone(step.marker) ?? (landmark(step.marker) ? undefined : nearestZoneFor(o.enemies, ctx.x, ctx.z));
      if (z) return zoneTarget(z);
      break;
    }
    case "interact":
    case "reach": {
      const l = landmark(o.landmark);
      if (l) return landmarkTarget(l);
      break;
    }
    case "deliver": {
      if (ctx.have(o.item) < o.count) {
        // Not enough yet: where the creatures that drop it live.
        const droppers = ENEMIES.filter((e) => e.loot?.some((d) => d.item === o.item)).map((e) => e.id);
        const z = nearestZoneFor(droppers, ctx.x, ctx.z);
        if (z) return zoneTarget(z);
      }
      const giver = landmark(quest.giver);
      if (giver) return landmarkTarget(giver);
      break;
    }
  }
  // Fall back to the step's map hint.
  const z = zone(step.marker);
  if (z) return zoneTarget(z);
  const l = landmark(step.marker);
  return l ? landmarkTarget(l) : null;
}
