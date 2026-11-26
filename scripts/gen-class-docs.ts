/**
 * Regenerates docs/CLASSES.md from the class data in shared/src/classes.ts.
 * Run: npm run docs:classes
 */
import { writeFileSync } from "node:fs";
import { CLASSES } from "../shared/src/classes.ts";
import { RESOURCES, STAT_IDS, STAT_LABELS } from "../shared/src/stats.ts";
import { getItem } from "../shared/src/items.ts";
import type { AbilityDef } from "../shared/src/abilities.ts";

const effect = (a: AbilityDef): string => {
  const e = a.effect;
  switch (e.type) {
    case "strike":
      return `${e.multiplier}x damage${e.radius ? `, ${e.radius}m radius` : ", single target"}${e.lifesteal ? `, ${e.lifesteal * 100}% lifesteal` : ""}`;
    case "nova":
      return `${e.multiplier}x damage around you, ${e.radius}m`;
    case "heal":
      return `heal ${e.fraction * 100}% max HP${e.radius ? `, allies within ${e.radius}m` : ""}`;
    case "dash":
      return `dash ${e.distance}m${e.multiplier ? `, ${e.multiplier}x damage on landing` : ""}`;
    case "buff":
      return `+${e.amount * 100}% ${e.stat} for ${e.duration}s${e.radius ? `, allies within ${e.radius}m` : ""}`;
  }
};

const row = (a: AbilityDef, tag: string) => `| ${a.name} _(${tag})_ | ${a.cost} | ${a.cooldown}s | ${a.range || "self"} | ${effect(a)} |`;

let md = `# Classes\n\n> Generated from \`shared/src/classes.ts\` by \`npm run docs:classes\`. Edit the data, not this file.\n\n`;
md += `12 classes, each with 2 subclasses. Every character has a basic attack, one class ability and one subclass ability.\n\n`;
md += `| Class | Role | Resource | Attack | Subclasses |\n|---|---|---|---|---|\n`;
for (const c of CLASSES) {
  md += `| **${c.name}** | ${c.role} | ${RESOURCES[c.resource].label} | ${c.basicAttack.kind} (${c.basicAttack.range}m) | ${c.subclasses.map((s) => s.name).join(", ")} |\n`;
}
for (const c of CLASSES) {
  md += `\n## ${c.name}\n\n_${c.description}_\n\n`;
  md += `- **Role:** ${c.role} · **Resource:** ${RESOURCES[c.resource].label} · **Primary stat:** ${STAT_LABELS[c.primaryStat]}\n`;
  md += `- **Base stats:** ${STAT_IDS.map((s) => `${STAT_LABELS[s]} ${c.baseStats[s]}`).join(", ")}\n`;
  md += `- **Basic attack:** ${c.basicAttack.kind}, ${c.basicAttack.range}m, ${c.basicAttack.damage[0]}-${c.basicAttack.damage[1]} dmg every ${c.basicAttack.cooldown}s\n`;
  md += `- **Wakes up with:** ${getItem(c.starterWeapon)?.name}\n\n`;
  md += `| Ability | Cost | Cooldown | Range | Effect |\n|---|---|---|---|---|\n${row(c.ability, "class")}\n`;
  for (const s of c.subclasses) md += `${row(s.ability, s.name)}\n`;
  for (const s of c.subclasses) {
    const bonus = Object.entries(s.statBonus).map(([k, v]) => `+${v} ${STAT_LABELS[k as keyof typeof STAT_LABELS]}`).join(", ");
    md += `\n**${s.name}** — _${s.tagline}._ ${s.description} (${bonus})\n`;
  }
}
writeFileSync(new URL("../docs/CLASSES.md", import.meta.url), md);
console.log("wrote docs/CLASSES.md");
