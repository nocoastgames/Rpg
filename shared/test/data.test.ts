import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSES, getSubclass } from "../src/classes.ts";
import { ITEMS, STARTING_INVENTORY } from "../src/items.ts";
import { generateWorld, isFree, isInWater } from "../src/world.ts";
import { stepMovement } from "../src/movement.ts";


test("there are 12 classes with exactly 2 subclasses each", () => {
  assert.equal(CLASSES.length, 12);
  for (const c of CLASSES) assert.equal(c.subclasses.length, 2, c.id);
});

test("class, subclass and ability ids are unique", () => {
  const ids = new Set<string>();
  for (const c of CLASSES) {
    for (const id of [c.id, c.ability.id, ...c.subclasses.flatMap((s) => [s.id, s.ability.id])]) {
      assert.ok(!ids.has(id), `duplicate id ${id}`);
      ids.add(id);
    }
  }
  assert.ok(getSubclass("warrior", "berserker"));
  assert.equal(getSubclass("warrior", "pyromancer"), undefined);
});

test("every starter weapon and starting item exists", () => {
  const itemIds = new Set(ITEMS.map((i) => i.id));
  for (const c of CLASSES) assert.ok(itemIds.has(c.starterWeapon), c.starterWeapon);
  for (const s of STARTING_INVENTORY) assert.ok(itemIds.has(s.id), s.id);
});

test("world generation is deterministic and spawn is a dry, free spot", () => {
  const a = generateWorld(42);
  const b = generateWorld(42);
  assert.equal(a.props.length, b.props.length);
  assert.deepEqual(a.props.slice(0, 50), b.props.slice(0, 50));
  assert.ok(a.props.length > 500, "forest should have plenty of props");
  assert.ok(!isInWater(a.spawn.x, a.spawn.z));
  assert.ok(isFree(a, a.spawn.x, a.spawn.z));
});

test("movement never ends inside a collider", () => {
  const w = generateWorld(7);
  let x = w.spawn.x;
  let z = w.spawn.z;
  for (let i = 0; i < 400; i++) {
    const r = stepMovement(w, x, z, { dirX: Math.cos(i / 40), dirZ: Math.sin(i / 25), target: null }, 5, 0.05);
    x = r.x;
    z = r.z;
    for (const c of w.colliders) assert.ok(Math.hypot(x - c.x, z - c.z) > c.r + 0.4, `inside collider at step ${i}`);
  }
});
