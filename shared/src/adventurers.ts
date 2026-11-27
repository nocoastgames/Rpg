/**
 * Adventurers stranded at Haskel's camp with him, one of each calling. When
 * you meet Haskel you can ask ONE of them to travel with you: they fight at
 * your side at your level, each with a role.
 */
import type { Appearance } from "./character.ts";
import type { BaseClassId } from "./classes.ts";

export type PartyRole = "tank" | "damage" | "healer";

export interface AdventurerDef {
  id: string;
  name: string;
  title: string;
  classId: BaseClassId;
  role: PartyRole;
  /** How they look: appearance indices, weapon and armour item ids, class colour. */
  appearance: Appearance;
  weapon: string;
  armor: string;
  color: string;
  /** Where they wait, as (u, v) offsets from Haskel. */
  du: number;
  dv: number;
  /** Strength relative to the player they travel with (health, damage per hit, seconds between hits). */
  power: { hp: number; damage: number; cooldown: number; ranged: boolean };
  /** Their signature move, used every `every` seconds when it's useful. */
  special: { name: string; every: number; description: string };
  /** What they say when you meet them, when they join, and when you part ways. */
  intro: string;
  join: string;
  leave: string;
}

export const ADVENTURERS: readonly AdventurerDef[] = [
  {
    id: "brannoc",
    name: "Brannoc",
    title: "Sellsword",
    classId: "fighter",
    role: "tank",
    appearance: { build: 2, skin: 3, hair: 0, hairColor: 1, beard: 2, dye: 4 },
    weapon: "rusted_longsword",
    armor: "militia_brigandine",
    color: "#c0392b",
    du: -7,
    dv: 3,
    power: { hp: 1.25, damage: 0.6, cooldown: 1.1, ranged: false },
    special: { name: "Taunt", every: 6, description: "Bellows a challenge: creatures attacking you turn on him instead." },
    intro: "\"Brannoc. Haskel paid me to guard his cart over the pass. Now there's no pass and nothing to guard. Point me at something.\"",
    join: "\"About time. Stay behind my shield.\"",
    leave: "\"Suit yourself. I'll be by the fire.\"",
  },
  {
    id: "ilse",
    name: "Ilse",
    title: "Hedge-Witch",
    classId: "mage",
    role: "damage",
    appearance: { build: 0, skin: 1, hair: 2, hairColor: 4, beard: 0, dye: 2 },
    weapon: "cracked_wand",
    armor: "hedge_robe",
    color: "#3a6fd8",
    du: -9,
    dv: -2,
    power: { hp: 0.7, damage: 0.95, cooldown: 1.2, ranged: true },
    special: { name: "Fire Burst", every: 8, description: "Sets the ground around her target alight, burning everything near it." },
    intro: "\"Ilse. I came over the pass to buy herbs, and the mountain fell on the road behind me. I can set things on fire, if that helps.\"",
    join: "\"Finally, something to do. Try not to stand in the fire.\"",
    leave: "\"Fine. Mind the spiders.\"",
  },
  {
    id: "maren",
    name: "Sister Maren",
    title: "Wandering Priest",
    classId: "priest",
    role: "healer",
    appearance: { build: 1, skin: 4, hair: 3, hairColor: 2, beard: 0, dye: 5 },
    weapon: "oak_cudgel",
    armor: "chapel_vestments",
    color: "#e8c45a",
    du: -5,
    dv: -5,
    power: { hp: 0.9, damage: 0.4, cooldown: 1.3, ranged: true },
    special: { name: "Mend", every: 3, description: "Closes your wounds when you're hurt, and draws out poison and blight." },
    intro: "\"Sister Maren. I walk from village to village tending the sick. Ashford was next on my road. I'd like to know what happened there.\"",
    join: "\"Go on, then. I'll keep you standing.\"",
    leave: "\"Walk carefully, child.\"",
  },
  {
    id: "wren",
    name: "Wren",
    title: "Pickpocket",
    classId: "thief",
    role: "damage",
    appearance: { build: 0, skin: 2, hair: 4, hairColor: 0, beard: 0, dye: 1 },
    weapon: "chipped_dagger",
    armor: "poacher_leathers",
    color: "#3fa66b",
    du: -11,
    dv: 2,
    power: { hp: 1.15, damage: 1.0, cooldown: 0.75, ranged: false },
    special: { name: "Backstab", every: 7, description: "Slips behind your target for a vicious strike." },
    intro: "\"Wren. I'm, uh, a trader. Haskel's assistant. Unofficially. Anyway: I'm bored, and you look like trouble.\"",
    join: "\"Ha! Right behind you. Literally.\"",
    leave: "\"Your loss. I'll be at the cart. Not near the cart. At it.\"",
  },
];

export function getAdventurer(id: string): AdventurerDef | undefined {
  return ADVENTURERS.find((a) => a.id === id);
}

/** Companion `kind` for a hired adventurer (shared with the client so it can draw them). */
export function adventurerKind(id: string): string {
  return `adv:${id}`;
}
