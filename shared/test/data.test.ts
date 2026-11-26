import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_CLASS_IDS,
  CLASS_NODES,
  TIER_LEVELS,
  childrenOf,
  companionFor,
  endClassesOf,
  isPetClass,
  resolveKit,
  type ClassNode,
} from "../src/classes.ts";
import { ITEMS, STARTING_INVENTORY } from "../src/items.ts";
import { BASE_CLASSES } from "../src/classes.ts";

test("progression tree is 4 -> 8 -> 16 -> 32, every node branching in two", () => {
  const byTier = (t: number) => CLASS_NODES.filter((n) => n.tier === t);
  assert.equal(byTier(1).length, 4);
  assert.equal(byTier(2).length, 8);
  assert.equal(byTier(3).length, 16);
  assert.equal(byTier(4).length, 32);
  for (const n of CLASS_NODES) {
    if (n.tier < 4) assert.equal(childrenOf(n.id).length, 2, `${n.id} should have 2 children`);
    if (n.parent) {
      const parent = CLASS_NODES.find((p) => p.id === n.parent)!;
      assert.equal(parent.tier, n.tier - 1, n.id);
      assert.equal(parent.base, n.base, n.id);
    }
  }
  assert.deepEqual(TIER_LEVELS, { 1: 1, 2: 10, 3: 25, 4: 50 });
});

test("ids (classes and abilities) are unique", () => {
  const ids = new Set<string>();
  for (const n of CLASS_NODES) {
    for (const id of [n.id, n.ability.id]) {
      assert.ok(!ids.has(id), `duplicate id ${id}`);
      ids.add(id);
    }
  }
});

test("each base has 5 pure and 3 hybrid end classes; every pair of bases has exactly two hybrids, one from each side", () => {
  const pairs = new Map<string, ClassNode[]>();
  for (const b of BASE_CLASS_IDS) {
    const ends = endClassesOf(b);
    assert.equal(ends.length, 8);
    const hybrids = ends.filter((n) => n.hybrid);
    assert.equal(hybrids.length, 3, `${b} hybrids`);
    assert.equal(new Set(hybrids.map((h) => h.hybrid)).size, 3, `${b} hybrids should each pair with a different base`);
    for (const h of hybrids) {
      assert.notEqual(h.hybrid, b);
      const key = [h.base, h.hybrid].sort().join("+");
      pairs.set(key, [...(pairs.get(key) ?? []), h]);
    }
  }
  assert.equal(pairs.size, 6);
  for (const [key, list] of pairs) {
    assert.equal(list.length, 2, key);
    assert.notEqual(list[0]!.base, list[1]!.base, `${key} should have one hybrid from each side`);
  }
});

test("two pet classes per base, one good and one evil, on separate lines with different creatures", () => {
  for (const b of BASE_CLASS_IDS) {
    const pets = endClassesOf(b).filter((n) => n.pet);
    assert.equal(pets.length, 2, `${b} pet classes`);
    assert.deepEqual(pets.map((p) => p.pet).sort(), ["evil", "good"], `${b} alignments`);
    assert.notEqual(pets[0]!.parent, pets[1]!.parent, `${b} pet classes should come from different lines`);
    assert.notEqual(pets[0]!.companion!.kind, pets[1]!.companion!.kind, `${b} pet creatures should differ`);
    for (const p of pets) {
      const line = CLASS_NODES.find((n) => n.id === p.parent)!;
      assert.ok(line.petLine, `${p.id}'s parent should be a pet line`);
      assert.equal(companionFor(line.id)?.power, "pet");
      assert.equal(line.companion!.kind, p.companion!.kind, `${p.id} should grow the same creature it got at 25`);
      assert.equal(companionFor(p.id)?.power, "empowered");
    }
    const lines = CLASS_NODES.filter((n) => n.base === b && n.petLine);
    assert.equal(lines.length, 2, `${b} pet lines`);
  }
  const ends = CLASS_NODES.filter((n) => n.tier === 4);
  for (const n of ends) {
    const c = companionFor(n.id);
    assert.ok(c, `${n.id} should have a companion at 50`);
    assert.equal(c.power, isPetClass(n.id) ? "empowered" : "familiar", n.id);
  }
  assert.equal(ends.filter((n) => isPetClass(n.id)).length, 8);
  for (const n of CLASS_NODES.filter((n) => n.tier <= 3 && !n.petLine)) assert.equal(companionFor(n.id), null, n.id);
});

test("kits resolve: one ability per tier and a basic attack", () => {
  for (const n of CLASS_NODES) {
    const kit = resolveKit(n.id)!;
    assert.equal(kit.abilities.length, n.tier);
    assert.ok(kit.basicAttack.range > 0);
  }
});

test("every starter weapon and starting item exists", () => {
  const itemIds = new Set(ITEMS.map((i) => i.id));
  for (const b of BASE_CLASS_IDS) assert.ok(itemIds.has(BASE_CLASSES[b].starterWeapon), b);
  for (const s of STARTING_INVENTORY) assert.ok(itemIds.has(s.id), s.id);
});
