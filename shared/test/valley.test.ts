import { test } from "node:test";
import assert from "node:assert/strict";
import { generateWorld, isFree, isInWater, type World } from "../src/world.ts";
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
  for (const l of landmarks()) assert.ok(canReach(l.x, l.z), `${l.id} is not reachable`);
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
