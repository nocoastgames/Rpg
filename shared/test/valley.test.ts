import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWorld, isFree, isInWater, resolveCollisions, type World } from "../src/world.ts";
import { DUNGEON_CELL, dungeonSdf, inDungeon } from "../src/valley.ts";
import { PASS_END, fromUV, landmarks, terrainHeight, valleySdf } from "../src/valley.ts";

const world = generateWorld(1337);

/** Grid flood fill over walkable cells (0.5 m) from the spawn point. */
function reachable(w: World): (x: number, z: number) => boolean {
  const cell = 0.5;
  const key = (i: number, j: number) => `${i},${j}`;
  const seen = new Set<string>();
  const si = Math.round(w.spawn.x / cell);
  const sj = Math.round(w.spawn.z / cell);
  const queue: Array<[number, number]> = [[si, sj]];
  seen.add(key(si, sj));
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      if (!isFree(w, ni * cell, nj * cell, 0.45)) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  return (x, z) => {
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) if (seen.has(key(Math.round(x / cell) + di, Math.round(z / cell) + dj))) return true;
    return false;
  };
}

test("spawn is a dry free spot inside the valley, next to the stream", () => {
  assert.ok(valleySdf(world.spawn.x, world.spawn.z) > 5);
  assert.ok(!isInWater(world.spawn.x, world.spawn.z));
  assert.ok(isFree(world, world.spawn.x, world.spawn.z));
});

test("every landmark can be walked to from the spawn point", () => {
  const canReach = reachable(world);
  for (const l of landmarks()) if (!inDungeon(l.x, l.z)) assert.ok(canReach(l.x, l.z), `${l.id} is not reachable`);
});

test("the dungeon cell is far from the valley, walkable inside, and sealed", () => {
  const w = generateWorld(1337);
  const canReach = reachable(w);
  assert.ok(Math.hypot(DUNGEON_CELL.x, DUNGEON_CELL.z) > 400, "far away");
  assert.ok(isFree(w, DUNGEON_CELL.x, DUNGEON_CELL.z), "you can stand in the cell");
  assert.equal(canReach(DUNGEON_CELL.x, DUNGEON_CELL.z), false, "no walking there from the valley");
  // Walls hold: pushing out of the cell ends up back inside.
  const out = resolveCollisions(w, DUNGEON_CELL.x + DUNGEON_CELL.halfW + 1, DUNGEON_CELL.z);
  assert.ok(out.x < DUNGEON_CELL.x + DUNGEON_CELL.halfW, "cell wall");
  for (const l of w.landmarks.filter((m) => inDungeon(m.x, m.z) && m.interactRadius > 0)) assert.ok(dungeonSdf(l.x, l.z) > 0.4, `${l.id} inside the cell`);
});

test("the pass is sealed while the gate is closed and walkable once opened", () => {
  const end = fromUV(PASS_END.u - 3, PASS_END.v + 0.5);
  assert.equal(reachable(world)(end.x, end.z), false, "pass should be blocked");
  const opened = generateWorld(1337);
  opened.openGates.add("valley_exit");
  assert.equal(reachable(opened)(end.x, end.z), true, "pass should open");
});

test("mountains rise outside the valley and the valley floor stays low", () => {
  assert.ok(terrainHeight(world.spawn.x, world.spawn.z) < 2);
  const peak = fromUV(-80, -40);
  assert.ok(terrainHeight(peak.x, peak.z) > 12);
});

import { CAMP_QUEST, ENEMIES, FAITHS as ALL_FAITHS, SHRINES, ZONES, distanceToWater, enemyStats, getEnemy } from "../src/index.ts";

test("starting zone content: a shrine per god, campsite, quest nodes, hunting grounds", () => {
  const w = generateWorld(1337);
  const gods = ALL_FAITHS.filter((f) => f.blessing).map((f) => f.id).sort();
  assert.deepEqual(SHRINES.map((s) => s.faith).sort(), gods, "one shrine for every god");
  for (const l of w.landmarks.filter((m) => m.kind !== "inspect")) {
    assert.ok(valleySdf(l.x, l.z) > 4, `${l.id} inside the valley`);
    assert.ok(distanceToWater(l.x, l.z) > 2, `${l.id} not in the stream`);
  }
  const shrines = w.landmarks.filter((m) => m.kind === "shrine");
  for (const a of shrines) for (const b of shrines) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 12, `${a.id} apart from ${b.id}`);
  // Enough pick-ups for the camp quest, with room to spare.
  for (const step of CAMP_QUEST.steps) {
    const o = step.objective;
    if (o.type === "gather") assert.ok(w.nodes.filter((n) => n.kind === o.node).length >= o.count * 1.5, o.node);
    if (o.type === "kill") assert.ok(o.enemies.every((k) => ZONES.some((z) => z.enemies.some((e) => e.id === k))), o.enemies.join());
  }
  for (const n of w.nodes) assert.ok(isFree(w, n.x, n.z, 0.6) && !isInWater(n.x, n.z), n.id);
  // Zones cover levels 1-5 in order, with known enemies, and get tougher.
  assert.deepEqual([ZONES[0]!.levels[0], ZONES[ZONES.length - 1]!.levels[1]], [1, 5]);
  for (const z of ZONES) for (const e of z.enemies) assert.ok(getEnemy(e.id), e.id);
  for (const def of ENEMIES) assert.ok(enemyStats(def, 5).maxHp > enemyStats(def, 1).maxHp);
});
