/**
 * Balance check: simulated 1-on-1 fights (auto-attacks plus the first
 * ability, no potions or food) for every calling against the valley's
 * creatures at a range of levels. Prints win rate / average health left.
 *
 *   npm run balance -w server
 *
 * Targets: same level is comfortable; one level higher is a hard fight;
 * two or more levels higher is a loss.
 */
import { ADVENTURERS, CAMP, DEFAULT_APPEARANCE, EMPTY_ALLOCATION, VENDOR, fromUV, getEnemy } from "@rpg/shared";
import { WorldState } from "../src/schema/WorldState.ts";
import { Game } from "../src/sim/Game.ts";

const quiet = { hit() {}, fx() {}, memory() {}, read() {}, dialog() {}, cutscene() {}, notice() {}, announce() {} };
const CLASSES = ["fighter", "mage", "priest", "thief"];
const TRIALS = Number(process.env.TRIALS ?? 2);

function duel(cls: string, playerLevel: number, kind: string, enemyLevel: number): { win: boolean; hp: number } {
  const state = new WorldState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = new Game(state, 1337, quiet);
  g.enemies.clear();
  state.enemies.clear();
  g.pendingSpawns = [];
  g.pendingSpecials = [];
  const p = g.addPlayer("a", { name: "T", classId: cls, faithId: "faithless", backgroundId: "farmhand", alloc: EMPTY_ALLOCATION, appearance: DEFAULT_APPEARANCE });
  g.setLevel("a", playerLevel);
  const at = fromUV(CAMP.u + 20, CAMP.v);
  p.x = at.x;
  p.z = at.z;
  const id = g.createEnemy(getEnemy(kind)!, enemyLevel, { x: at.x + 2.5, z: at.z });
  let now = 2_000_000;
  g.update(0.05, now);
  g.setAttackTarget("a", id);
  for (let t = 0; t < 180 * 20; t++) {
    now += 50;
    const e = state.enemies.get(id);
    if (!e || p.anim === "dead") break;
    const ability = g.players.get("a").ch.kit.abilities[0];
    if (ability && (p.cooldowns[0] ?? 0) <= now && p.resource >= ability.cost) {
      g.castAbility("a", 0, e.x, e.z);
      g.setAttackTarget("a", id);
    }
    g.update(0.05, now);
  }
  return { win: !state.enemies.has(id) && p.anim !== "dead", hp: p.hp / p.maxHp };
}

/** A party fight: you (and optionally an adventurer) against a pack of `count` creatures. */
function partyFight(cls: string, playerLevel: number, kind: string, enemyLevel: number, count: number, ally: string | null): { win: boolean; hp: number } {
  const state = new WorldState();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = new Game(state, 1337, quiet);
  g.enemies.clear();
  state.enemies.clear();
  g.pendingSpawns = [];
  g.pendingSpecials = [];
  const p = g.addPlayer("a", { name: "T", classId: cls, faithId: "faithless", backgroundId: "farmhand", alloc: EMPTY_ALLOCATION, appearance: DEFAULT_APPEARANCE });
  g.setLevel("a", playerLevel);
  let now = 2_000_000;
  g.update(0.05, now);
  if (ally) {
    const camp = g.world.landmarks.find((l: { id: string }) => l.id === `adv_${ally}`);
    p.x = camp.x;
    p.z = camp.z;
    g.hire("a", ally);
  }
  const at = fromUV(VENDOR.u - 25, VENDOR.v + 20);
  p.x = at.x;
  p.z = at.z;
  for (let i = 0; i < 10; i++) g.update(0.05, (now += 50));
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = g.createEnemy(getEnemy(kind)!, enemyLevel, { x: at.x + 6 + (i % 2), z: at.z + i * 1.2 });
    g.enemies.get(id).packId = 9999;
    ids.push(id);
  }
  g.setAttackTarget("a", ids[0]);
  for (let t = 0; t < 240 * 20; t++) {
    now += 50;
    const alive = ids.filter((id) => state.enemies.has(id));
    if (!alive.length || p.anim === "dead") break;
    if (!state.enemies.has(g.players.get("a").attackTargetId)) g.setAttackTarget("a", alive[0]);
    const e = state.enemies.get(alive[0]);
    const ability = g.players.get("a").ch.kit.abilities[0];
    if (ability && (p.cooldowns[0] ?? 0) <= now && p.resource >= ability.cost) {
      g.castAbility("a", 0, e.x, e.z);
      g.setAttackTarget("a", alive[0]);
    }
    g.update(0.05, now);
  }
  return { win: ids.every((id) => !state.enemies.has(id)) && p.anim !== "dead", hp: p.hp / p.maxHp };
}

function partySummary(playerLevel: number, kind: string, enemyLevel: number, count: number): string {
  const allies: Array<string | null> = [null, ...ADVENTURERS.map((a) => a.id)];
  return allies
    .map((ally) => {
      const rs = CLASSES.flatMap((cls) => Array.from({ length: TRIALS }, () => partyFight(cls, playerLevel, kind, enemyLevel, count, ally)));
      const wins = rs.filter((r) => r.win);
      return `${ally ?? "solo"} ${Math.round((wins.length / rs.length) * 100)}%/${wins.length ? Math.round((wins.reduce((t, r) => t + r.hp, 0) / wins.length) * 100) : 0}`;
    })
    .join("  ");
}

function summary(playerLevel: number, kind: string, enemyLevel: number, perClass = false): string {
  const results = CLASSES.map((cls) => Array.from({ length: TRIALS }, () => duel(cls, playerLevel, kind, enemyLevel)));
  const fmt = (rs: Array<{ win: boolean; hp: number }>) => {
    const wins = rs.filter((r) => r.win);
    return `${Math.round((wins.length / rs.length) * 100)}%/${wins.length ? Math.round((wins.reduce((t, r) => t + r.hp, 0) / wins.length) * 100) : 0}`;
  };
  if (perClass) return CLASSES.map((c, i) => `${c} ${fmt(results[i]!)}`).join("  ");
  return fmt(results.flat());
}

const PARTY_ONLY = process.env.PARTY_ONLY === "1";
/** Only the named creatures (NAMED_ONLY=1). */
const NAMED_ONLY = process.env.NAMED_ONLY === "1";
const creatures: Array<[string, number[]]> = [["boar", [1, 2]], ["wolf", [2, 3]], ["skeleton", [2, 3]], ["spider", [3, 4]], ["thornling", [4, 5]]];
console.log("win rate / average health left (%)\n");
for (const pl of PARTY_ONLY || NAMED_ONLY ? [] : [1, 2, 3, 4, 5]) {
  const row = creatures.flatMap(([kind, levels]) => levels.map((el) => `${kind}${el} ${summary(pl, kind, el)}`));
  console.log(`player L${pl}:  ${row.join("  ")}`);
}
console.log("\nNamed creatures:");
for (const [kind, el] of PARTY_ONLY ? [] : ([["greyjaw", 3], ["gravedigger", 3], ["hollow_priest", 4]] as const)) {
  for (const pl of [2, 3, 4, 5]) console.log(`  L${pl} vs ${kind} (L${el}): ${summary(pl, kind, el, true)}`);
}

console.log("\nParty encounters (you alone, or with each adventurer):");
for (const [pl, kind, el, count] of NAMED_ONLY ? ([[2, "greyjaw", 3, 1], [2, "greyjaw", 2, 1], [3, "hollow_priest", 4, 1], [3, "skeleton", 3, 2]] as const) : (process.env.ONLY_THORN === "1" ? [[4, "thornling", 4, 3], [5, "thornling", 5, 3]] : [[4, "thornling", 4, 3], [5, "thornling", 5, 3], [4, "spider", 4, 3], [4, "hollow_priest", 4, 1]]) as ReadonlyArray<readonly [number, string, number, number]>) {
  console.log(`  L${pl} vs ${count} x ${kind} (L${el}): ${partySummary(pl, kind, el, count)}`);
}
