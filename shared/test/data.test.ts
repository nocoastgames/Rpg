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

import { BACKGROUNDS, FAITHS, POINT_BUY, EMPTY_ALLOCATION, validateCreation, memoriesAt, backgroundRevealed, pointsRemaining } from "../src/character.ts";

const valid = { name: "Ash", classId: "fighter", backgroundId: "soldier", faithId: "orren", alloc: { ...EMPTY_ALLOCATION, might: 5, vitality: 5 }, appearance: { build: 1, skin: 0, hair: 2, hairColor: 3, beard: 1, dye: 4 } };

test("creation validation accepts a legal character and rejects bad point-buy", () => {
  assert.equal(validateCreation(valid).ok, true);
  assert.equal(pointsRemaining(valid.alloc), 0);
  assert.equal(validateCreation({ ...valid, alloc: { ...EMPTY_ALLOCATION, might: 6 } }).ok, false, "raise cap");
  assert.equal(validateCreation({ ...valid, alloc: { ...EMPTY_ALLOCATION, might: 5, agility: 5, vitality: 1 } }).ok, false, "overspent");
  assert.equal(validateCreation({ ...valid, alloc: { ...EMPTY_ALLOCATION, spirit: -2, might: 5, vitality: 5, agility: 2 } }).ok, true, "lowering gives points back");
  assert.equal(validateCreation({ ...valid, alloc: { ...EMPTY_ALLOCATION, spirit: -2, intellect: -1 } }).ok, false, "total lower cap");
  assert.equal(validateCreation({ ...valid, classId: "paladin" }).ok, false, "must start as a base class");
  assert.equal(validateCreation({ ...valid, appearance: { ...valid.appearance, skin: 99 } }).ok, false, "appearance range");
  assert.equal(POINT_BUY.points, 10);
});

test("backgrounds: 3 memories each, name revealed only by the last; faiths exist", () => {
  assert.equal(BACKGROUNDS.length, 10);
  const items = new Set(ITEMS.map((i) => i.id));
  for (const b of BACKGROUNDS) {
    assert.equal(b.memories.length, 3, b.id);
    assert.ok(items.has(b.item), `${b.id} item`);
    const statTotal = Object.values(b.statBonus).reduce((a, v) => a + (v ?? 0), 0);
    assert.equal(statTotal, 3, `${b.id} stat bonus`);
    assert.equal(memoriesAt(b.id, 1).length, 0);
    assert.equal(backgroundRevealed(b.id, b.memories[1]!.level), false);
    assert.equal(backgroundRevealed(b.id, b.memories[2]!.level), true);
  }
  assert.ok(FAITHS.length >= 8);
});

import { blessingActive, passiveBonus } from "../src/character.ts";
import { classAlignment } from "../src/classes.ts";

test("faith blessings apply only when the class's alignment matches the god", () => {
  assert.equal(classAlignment("fighter"), "neutral");
  assert.equal(classAlignment("paladin"), "good");
  assert.equal(classAlignment("lich"), "evil");
  assert.equal(classAlignment("deathspeaker"), "neutral", "a deeper node can turn the path back");
  assert.equal(blessingActive("solenne", "paladin"), true);
  assert.equal(blessingActive("solenne", "lich"), false);
  assert.equal(blessingActive("kaelthar", "death_knight"), true);
  assert.equal(blessingActive("orren", "fighter"), true, "neutral gods bless neutral paths");
  assert.equal(blessingActive("faithless", "fighter"), false);
  assert.equal(passiveBonus("urchin", "orren", "fighter", "moveSpeed"), 0.05 + 0.04, "background + blessing stack");
  assert.equal(passiveBonus("urchin", "orren", "paladin", "moveSpeed"), 0.05, "blessing off on a good path");
  // Every pet class's alignment matches its good/evil tag.
  for (const n of CLASS_NODES.filter((n) => n.pet)) assert.equal(classAlignment(n.id), n.pet, n.id);
});

import { blessingStatus } from "../src/character.ts";

test("adjacent paths can earn a blessing by epic quest; opposites never can", () => {
  // good god
  assert.equal(blessingStatus("solenne", "paladin"), "active");
  assert.equal(blessingStatus("solenne", "fighter"), "needsQuest", "neutral path, good god");
  assert.equal(blessingStatus("solenne", "fighter", ["favor_solenne"]), "active");
  assert.equal(blessingStatus("solenne", "lich", ["favor_solenne"]), "opposed", "evil can never get good");
  // evil god
  assert.equal(blessingStatus("kaelthar", "lich"), "active");
  assert.equal(blessingStatus("kaelthar", "warlord", ["favor_kaelthar"]), "active", "neutral path, evil god, quest done");
  assert.equal(blessingStatus("kaelthar", "paladin", ["favor_kaelthar"]), "opposed", "good can never get evil");
  // neutral god accepts either side with the quest
  assert.equal(blessingStatus("orren", "paladin"), "needsQuest");
  assert.equal(blessingStatus("orren", "lich", ["favor_orren"]), "active");
  // faithless
  assert.equal(blessingStatus("faithless", "fighter", ["favor_solenne"]), "none");
  // another god's quest doesn't count
  assert.equal(blessingStatus("valdris", "fighter", ["favor_solenne"]), "needsQuest");
});

import { availableFavorQuests, blessingInfo, favorQuestOutcome } from "../src/character.ts";

test("completing a god's epic quest makes them your god; which quests are offered", () => {
  const ids = (l: { id: string }[]) => l.map((g) => g.id).sort();
  const good = ["green_mother", "solenne", "valdris"], neutral = ["ferryman", "mirevel", "orren"], evil = ["kaelthar", "rot_below", "veiled_one"];
  // Eligibility comes from the class, not the current god: a Paladin (good) can seek any good or neutral god, never an evil one.
  assert.deepEqual(ids(availableFavorQuests("kaelthar", "paladin")), [...good, ...neutral].sort());
  assert.deepEqual(ids(availableFavorQuests("solenne", "paladin")), ["ferryman", "green_mother", "mirevel", "orren", "valdris"], "not your own god once they bless you");
  assert.deepEqual(ids(availableFavorQuests("orren", "lich")), [...neutral, ...evil].sort(), "own god still offered until their favour is won");
  assert.ok(!availableFavorQuests("orren", "lich", ["favor_orren"]).some((g) => g.id === "orren"));
  // A neutral class can seek anyone, including its own god while unblessed.
  assert.deepEqual(ids(availableFavorQuests("solenne", "fighter")), [...good, ...neutral, ...evil].sort());
  assert.ok(availableFavorQuests("faithless", "fighter").length === 9);

  const conv = favorQuestOutcome("kaelthar", "paladin", "favor_solenne");
  assert.ok(conv.ok && conv.newFaith.id === "solenne");
  assert.equal(blessingInfo("orren", "paladin", ["favor_orren"]).status, "active", "the new god blesses you");
  // Too far apart, whatever your current god.
  assert.equal(favorQuestOutcome("orren", "paladin", "favor_kaelthar").ok, false);
  assert.equal(favorQuestOutcome("orren", "lich", "favor_solenne").ok, false);
  // Switching again is fine; going back to an abandoned god is not.
  assert.ok(favorQuestOutcome("orren", "paladin", "favor_mirevel", ["favor_orren"], ["solenne"]).ok);
  assert.equal(favorQuestOutcome("orren", "paladin", "favor_solenne", ["favor_orren"], ["solenne"]).ok, false);
  assert.ok(!availableFavorQuests("orren", "paladin", ["favor_orren"], ["solenne"]).some((g) => g.id === "solenne"));
});
