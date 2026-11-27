import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWorld, isFree, isInWater, resolveCollisions, type World } from "../src/world.ts";
import { DUNGEON_CELL, dungeonSdf, inDungeon } from "../src/valley.ts";
import { GUARD_POST, PASS_BLOCK, fromUV, landmarks, terrainHeight, valleySdf } from "../src/valley.ts";
import { BASE_MOVE_SPEED } from "../src/constants.ts";

const world = generateWorld(1337);

/**
 * A* over 1 m cells with full collision (trees included): can a player walk
 * from `from` to `to`? `limit` bounds the search (nodes expanded, and an
 * optional radius around the start) so blocked routes fail fast.
 */
function pathExists(w: World, from: { x: number; z: number }, to: { x: number; z: number }, opts: { radius?: number; limit?: number } = {}): boolean {
  const cell = 1;
  const limit = opts.limit ?? 400_000;
  const si = Math.round(from.x / cell);
  const sj = Math.round(from.z / cell);
  const ti = Math.round(to.x / cell);
  const tj = Math.round(to.z / cell);
  const key = (i: number, j: number) => (i + 10000) * 20011 + (j + 10000);
  const g = new Map<number, number>([[key(si, sj), 0]]);
  const heap: Array<[number, number, number]> = [[1.6 * Math.hypot(ti - si, tj - sj), si, sj]];
  const push = (n: [number, number, number]) => {
    heap.push(n);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  let expanded = 0;
  while (heap.length && expanded++ < limit) {
    const [, i, j] = pop();
    if (Math.abs(i - ti) <= 2 && Math.abs(j - tj) <= 2) return true;
    const gi = g.get(key(i, j))!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      const cost = gi + (di && dj ? Math.SQRT2 : 1);
      if ((g.get(k) ?? Infinity) <= cost) continue;
      if (opts.radius && Math.hypot(ni - si, nj - sj) > opts.radius) continue;
      if (!isFree(w, ni * cell, nj * cell, 0.45)) continue;
      g.set(k, cost);
      push([cost + 1.6 * Math.hypot(ti - ni, tj - nj), ni, nj]);
    }
  }
  return false;
}

test("spawn is a dry free spot inside the valley, next to the stream", () => {
  assert.ok(valleySdf(world.spawn.x, world.spawn.z) > 5);
  assert.ok(!isInWater(world.spawn.x, world.spawn.z));
  assert.ok(isFree(world, world.spawn.x, world.spawn.z));
});

test("every landmark can be walked to from the spawn point", () => {
  for (const l of landmarks()) {
    if (inDungeon(l.x, l.z)) continue;
    // Gates (rockslide, thorns, sealed slab) are inspected from in front: aim for the landmark's own spot.
    assert.ok(pathExists(world, world.spawn, l), `${l.id} is not reachable`);
  }
});

test("the dungeon cell is far from the valley, walkable inside, and sealed", () => {
  const w = generateWorld(1337);
  assert.ok(Math.hypot(DUNGEON_CELL.x, DUNGEON_CELL.z) > 6000, "far away");
  assert.ok(isFree(w, DUNGEON_CELL.x, DUNGEON_CELL.z), "you can stand in the cell");
  assert.equal(pathExists(w, DUNGEON_CELL, { x: DUNGEON_CELL.x + 30, z: DUNGEON_CELL.z }, { radius: 40 }), false, "no walking out of the cell");
  // Walls hold: pushing out of the cell ends up back inside.
  const out = resolveCollisions(w, DUNGEON_CELL.x + DUNGEON_CELL.halfW + 1, DUNGEON_CELL.z);
  assert.ok(out.x < DUNGEON_CELL.x + DUNGEON_CELL.halfW, "cell wall");
  for (const l of w.landmarks.filter((m) => inDungeon(m.x, m.z) && m.interactRadius > 0)) assert.ok(dungeonSdf(l.x, l.z) > 0.4, `${l.id} inside the cell`);
});

test("the pass is sealed while the gate is closed and walkable once opened", () => {
  const before = fromUV(PASS_BLOCK.u - 25, PASS_BLOCK.v + 5);
  const beyond = fromUV(GUARD_POST.u + 20, GUARD_POST.v - 4);
  assert.equal(pathExists(world, before, beyond, { radius: 160 }), false, "pass should be blocked");
  const opened = generateWorld(1337);
  opened.openGates.add("valley_exit");
  assert.equal(pathExists(opened, before, beyond, { radius: 160 }), true, "pass should open");
});

test("the valley takes about 10 minutes to cross east to west and 15 north to south", () => {
  const span = (dir: (t: number) => { x: number; z: number }) => {
    let lo = 0;
    let hi = 0;
    for (let t = 0; t < 3500; t += 5) {
      const a = dir(t);
      const b = dir(-t);
      if (valleySdf(a.x, a.z) > 0) hi = t;
      if (valleySdf(b.x, b.z) > 0) lo = t;
    }
    return (lo + hi) / BASE_MOVE_SPEED / 60;
  };
  const ew = span((t) => fromUV(t, 0));
  const ns = span((t) => fromUV(0, t));
  assert.ok(ew >= 9.5 && ew <= 12, `east-west ${ew.toFixed(1)} min`);
  assert.ok(ns >= 15 && ns <= 18, `north-south ${ns.toFixed(1)} min`);
});

test("mountains rise outside the valley and the valley floor stays low", () => {
  assert.ok(terrainHeight(world.spawn.x, world.spawn.z) < 2);
  const peak = fromUV(-2300, -200);
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
  const grounds = ZONES.filter((z) => !z.ambient);
  assert.deepEqual([Math.min(...grounds.map((z) => z.levels[0])), Math.max(...grounds.map((z) => z.levels[1]))], [1, 5]);
  for (const z of ZONES) for (const e of z.enemies) assert.ok(getEnemy(e.id), e.id);
  for (const def of ENEMIES) assert.ok(enemyStats(def, 5).maxHp > enemyStats(def, 1).maxHp);
});

import { ADVENTURERS, BASE_CLASSES } from "../src/index.ts";

test("one adventurer of each class waits by the merchant, and level 4+ grounds hunt in packs", () => {
  const w = generateWorld(1337);
  assert.deepEqual(ADVENTURERS.map((a) => a.classId).sort(), Object.keys(BASE_CLASSES).sort(), "one per class");
  const vendor = w.landmarks.find((l) => l.id === "vendor")!;
  for (const a of ADVENTURERS) {
    const l = w.landmarks.find((m) => m.id === `adv_${a.id}`);
    assert.ok(l, `adv_${a.id} placed`);
    assert.ok(Math.hypot(l.x - vendor.x, l.z - vendor.z) < 14, `${a.id} near the merchant`);
    assert.ok(isFree(w, l.x, l.z, 0.5) && !isInWater(l.x, l.z), `${a.id} stands on open ground`);
  }
  for (const z of ZONES) if (z.levels[1] >= 4 && !z.ambient) assert.ok(z.pack && z.pack.minLevel <= 4, `${z.id} has packs`);
});

import { QUESTS, questTarget } from "../src/index.ts";

test("every quest step points the map arrow somewhere inside the valley", () => {
  const w = generateWorld(1337);
  for (const q of QUESTS) {
    q.steps.forEach((_, i) => {
      for (const have of [0, 99]) {
        const t = questTarget(q.id, i, { landmarks: w.landmarks, nodes: w.nodes, x: w.spawn.x, z: w.spawn.z, have: () => have, wantsNode: () => true });
        assert.ok(t, `${q.id} step ${i} has a target`);
        assert.ok(valleySdf(t.x, t.z) > -5, `${q.id} step ${i} points inside the valley`);
        assert.ok(t.label.length > 0);
      }
    });
  }
  // A delivery points at the creatures that drop the item until you have enough, then at the giver.
  const pelts = QUESTS.find((q) => q.id === "fetch_pelts")!;
  const vendor = w.landmarks.find((l) => l.id === "vendor")!;
  const hunt = questTarget(pelts.id, 0, { landmarks: w.landmarks, nodes: w.nodes, x: 0, z: 0, have: () => 0, wantsNode: () => true })!;
  const home = questTarget(pelts.id, 0, { landmarks: w.landmarks, nodes: w.nodes, x: 0, z: 0, have: () => 3, wantsNode: () => true })!;
  assert.equal(hunt.label, "Greypine Wood");
  assert.deepEqual([home.x, home.z], [vendor.x, vendor.z]);
});

import { FIRST_QUEST, VOICES_QUEST, VILLAGE_QUEST as SILENT_VILLAGE, CAMP_QUEST as SHELTER } from "../src/index.ts";

test("you wake within earshot of the caravan, and build your own fire beside it", () => {
  const w = generateWorld(1337);
  const vendor = w.landmarks.find((l) => l.id === "vendor")!;
  const camp = w.landmarks.find((l) => l.id === "campsite")!;
  const far = Math.hypot(vendor.x - w.spawn.x, vendor.z - w.spawn.z);
  assert.ok(far > 120 && far < 260, `the voices are in the distance (${far.toFixed(0)} m)`);
  assert.ok(Math.hypot(camp.x - vendor.x, camp.z - vendor.z) < 25, "the campsite is beside the caravan");
  assert.equal(FIRST_QUEST, VOICES_QUEST.id);
  assert.equal(VOICES_QUEST.next, SHELTER.id);
  assert.equal(SILENT_VILLAGE.requires, SHELTER.id);
});
