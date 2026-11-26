/**
 * Regenerates docs/CLASSES.md from the progression tree in shared/src/classes.ts.
 * Run: npm run docs:classes
 */
import { writeFileSync } from "node:fs";
import { BASE_CLASSES, BASE_CLASS_IDS, GATE_QUESTS, childrenOf, classTags, companionFor, getClassNode, type ClassNode } from "../shared/src/classes.ts";
import { RESOURCES, STAT_LABELS } from "../shared/src/stats.ts";
import type { AbilityDef } from "../shared/src/abilities.ts";

const effect = (a: AbilityDef): string => {
  const e = a.effect;
  switch (e.type) {
    case "strike":
      return `${e.multiplier}x damage${e.radius ? `, ${e.radius}m area` : ", single target"}${e.lifesteal ? `, ${Math.round(e.lifesteal * 100)}% lifesteal` : ""}`;
    case "nova":
      return `${e.multiplier}x damage around you, ${e.radius}m`;
    case "heal":
      return `heal ${Math.round(e.fraction * 100)}% max HP${e.radius ? `, allies within ${e.radius}m` : ""}`;
    case "dash":
      return `dash ${e.distance}m${e.multiplier ? `, ${e.multiplier}x damage on landing` : ""}`;
    case "buff":
      return `+${Math.round(e.amount * 100)}% ${e.stat} for ${e.duration}s${e.radius ? `, allies within ${e.radius}m` : ""}`;
  }
};

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const tags = (n: ClassNode) => classTags(n).join(", ");
const companion = (n: ClassNode) => {
  const c = companionFor(n.id);
  return c ? `${c.def.name} (${c.power === "familiar" ? "familiar" : c.power === "pet" ? "pet" : "empowered pet"})` : "";
};

function petTable(): string {
  return BASE_CLASS_IDS.map((b) => {
    const pets = childrenOf(b)
      .flatMap((t2) => childrenOf(t2.id))
      .flatMap((t3) => childrenOf(t3.id))
      .filter((n) => n.pet);
    const cell = (n?: ClassNode) => {
      if (!n) return "";
      const line = getClassNode(n.parent!)!;
      return `${line.name} → **${n.name}** (${line.companion?.name} → ${n.companion?.name})`;
    };
    return `| ${cap(b)} | ${cell(pets.find((p) => p.pet === "good"))} | ${cell(pets.find((p) => p.pet === "evil"))} |`;
  }).join("\n") + "\n";
}

let md = `# Classes

> Generated from \`shared/src/classes.ts\` by \`npm run docs:classes\`. Edit the data, not this file.

## How progression works

| Level | Choice | Requirement |
|---|---|---|
| 1 | One of 4 base classes | Character creation |
| 10 | 1 of 2 paths | Reach level 10 |
| 25 | 1 of 2 specialisations | Reach level 25 and complete the **${GATE_QUESTS[3]!.name}** |
| 50 | 1 of 2 end classes | Reach level 50 and complete the **${GATE_QUESTS[4]!.name}** |

- **4 → 8 → 16 → 32.** Every class branches in two. Choices are permanent (a lineage system will allow changes later).
- **Each class teaches one ability**, and you keep every ability on your path: 4 abilities plus a basic attack at level 50.
- **Each base has 5 pure and 3 hybrid end classes.** A hybrid blends in a second base (one hybrid with each other base). Every pair of bases has exactly two hybrids, one reached from each side.
- **Companions.** Each base has two *pet classes* on separate lines with different creatures: one traditionally good, one evil. Their level-25 specialisation (a *pet line*) brings a young companion at 25; at 50 the pet class grows it into something several times stronger (about 4x a familiar's health and damage), while the line's other end class takes a familiar instead. Every other end class gains a lesser *familiar* at 50.

## Pet classes

| Base | Good | Evil |
|---|---|---|
${petTable()}

## Hybrids

| Pair | From one side | From the other |
|---|---|---|
`;
const pairs = new Map<string, ClassNode[]>();
for (const b of BASE_CLASS_IDS) {
  for (const t2 of childrenOf(b)) for (const t3 of childrenOf(t2.id)) for (const t4 of childrenOf(t3.id)) {
    if (!t4.hybrid) continue;
    const key = [t4.base, t4.hybrid].sort().map(cap).join(" + ");
    pairs.set(key, [...(pairs.get(key) ?? []), t4]);
  }
}
for (const [key, list] of pairs) md += `| ${key} | ${list.map((n) => `**${n.name}** (${cap(n.base)})`).join(" | ")} |\n`;

for (const b of BASE_CLASS_IDS) {
  const root = getClassNode(b)!;
  const def = BASE_CLASSES[b];
  md += `\n## ${root.name}\n\n_${root.description}_\n\n`;
  md += `- **Resource:** ${RESOURCES[def.resource].label} · **Primary stat:** ${STAT_LABELS[def.primaryStat]} · **Basic attack:** ${def.basicAttack.kind}, ${def.basicAttack.range}m\n`;
  md += `- **Starting ability:** ${root.ability.name}: ${effect(root.ability)}\n\n`;
  md += `| Lv 10 | Lv 25 | Lv 50 | Tags | Ability (learned) | Companion at 50 |\n|---|---|---|---|---|---|\n`;
  for (const t2 of childrenOf(b)) {
    for (const t3 of childrenOf(t2.id)) {
      for (const t4 of childrenOf(t3.id)) {
        md += `| ${t2.name} | ${t3.name}${t3.petLine ? ` (pet line: ${companion(t3)} at 25)` : ""} | **${t4.name}** | ${tags(t4)} | ${t4.ability.name}: ${effect(t4.ability)} | ${companion(t4)} |\n`;
      }
    }
  }
  md += `\n**Abilities learned on the way:**\n\n`;
  for (const t2 of childrenOf(b)) {
    md += `- ${t2.name} (Lv 10): ${t2.ability.name}: ${effect(t2.ability)}\n`;
    for (const t3 of childrenOf(t2.id)) md += `  - ${t3.name} (Lv 25): ${t3.ability.name}: ${effect(t3.ability)}\n`;
  }
}
writeFileSync(new URL("../docs/CLASSES.md", import.meta.url), md);
console.log("wrote docs/CLASSES.md");
