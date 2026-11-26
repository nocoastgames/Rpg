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
import { CAMP, DEFAULT_APPEARANCE, EMPTY_ALLOCATION, fromUV, getEnemy } from "@rpg/shared";
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

function summary(playerLevel: number, kind: string, enemyLevel: number, perClass = false): string {
  const results = CLASSES.map((cls) => Array.from({ length: TRIALS }, () => duel(cls, playerLevel, kind, enemyLevel)));
  const fmt = (rs: Array<{ win: boolean; hp: number }>) => {
    const wins = rs.filter((r) => r.win);
    return `${Math.round((wins.length / rs.length) * 100)}%/${wins.length ? Math.round((wins.reduce((t, r) => t + r.hp, 0) / wins.length) * 100) : 0}`;
  };
  if (perClass) return CLASSES.map((c, i) => `${c} ${fmt(results[i]!)}`).join("  ");
  return fmt(results.flat());
}

const creatures: Array<[string, number[]]> = [["boar", [1, 2]], ["wolf", [2, 3]], ["skeleton", [2, 3]], ["spider", [3, 4]], ["thornling", [4, 5]]];
console.log("win rate / average health left (%)\n");
for (const pl of [1, 2, 3, 4, 5]) {
  const row = creatures.flatMap(([kind, levels]) => levels.map((el) => `${kind}${el} ${summary(pl, kind, el)}`));
  console.log(`player L${pl}:  ${row.join("  ")}`);
}
console.log("\nNamed creatures:");
for (const [kind, el] of [["gravedigger", 3], ["hollow_priest", 4]] as const) {
  for (const pl of [3, 4, 5]) console.log(`  L${pl} vs ${kind} (L${el}): ${summary(pl, kind, el, true)}`);
}
