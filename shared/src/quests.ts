/**
 * Quests. Each has a few steps; a step has one objective. A character can
 * have several quests active at once (synced on the player as
 * `active: [{ id, step, count }]`).
 */
import type { BaseClassId } from "./classes.ts";
import type { GateId } from "./valley.ts";
import type { NodeKind } from "./world.ts";

/** Something a quest step's completion does to the world. */
export type QuestEffect = "build_camp" | "unseal_crypt" | "burn_thorns";

export type QuestObjective =
  /** Pick up `count` quest nodes of a kind; each takes `seconds` of work (moving interrupts it). */
  | { type: "gather"; node: NodeKind; count: number; seconds?: number }
  /**
   * Kill `count` creatures of these kinds (anyone nearby who shares the XP
   * gets credit). With `chance`, only that share of kills counts (a torn hide).
   */
  | { type: "kill"; enemies: readonly string[]; count: number; chance?: number; failText?: string }
  /** Use a landmark (talk to someone, work at a place); takes `seconds` of work. */
  | { type: "interact"; landmark: string; seconds?: number; verb?: string; effect?: QuestEffect }
  /** Go to a landmark. */
  | { type: "reach"; landmark: string; radius: number }
  /** Hand items to the quest giver. */
  | { type: "deliver"; item: string; count: number };

export interface QuestStepDef {
  title: string;
  /** Tracker text: what to do and where. */
  text: string;
  objective: QuestObjective;
  /** Experience for finishing the step. */
  xp: number;
  /** Said when the step is done. */
  doneText: string;
  /** Map hint: a landmark or hunting-ground id to mark. */
  marker?: string;
  /** What the tracker calls the place it points to (instead of the landmark's name, e.g. before you've met someone). */
  where?: string;
}

export interface QuestReward {
  coins?: number;
  xp?: number;
  /** One item for the character's base class. */
  classItem?: Record<BaseClassId, string>;
  /** A sealed way that opens for everyone when the quest is done. */
  opensGate?: GateId;
}

export interface QuestDef {
  id: string;
  name: string;
  /** Landmark id of whoever gives and takes the quest (missing: it starts on its own). */
  giver?: string;
  /** Said when the quest starts. */
  intro: string;
  steps: QuestStepDef[];
  reward?: QuestReward;
  /** Can be done again (fetch quests). */
  repeatable?: boolean;
  /** Starts by itself when this one is finished. */
  next?: string;
  /** Only offered once this quest is done. */
  requires?: string;
}

/** The first quest: you wake alone by the stream and hear people in the distance. */
export const VOICES_QUEST: QuestDef = {
  id: "voices",
  name: "Voices in the Distance",
  intro: "You wake on the bank of a cold stream, soaked and aching, with no memory of how you got here. Then, faint over the water, voices: people talking, a pot clanking. Somewhere to the west, someone has made camp.",
  next: "make_camp",
  steps: [
    {
      title: "Follow the voices",
      text: "Follow the voices west, away from the stream.",
      objective: { type: "reach", landmark: "vendor", radius: 18 },
      where: "The voices",
      xp: 30,
      doneText: "A covered cart, a smoky cookfire and a handful of travellers. A grey-bearded man raises a hand: \"Easy, friend. You look half-drowned.\"",
    },
    {
      title: "The peddler",
      text: "Talk to the grey-bearded man by the cart.",
      objective: { type: "interact", landmark: "vendor" },
      where: "The grey-bearded man",
      xp: 30,
      doneText: "\"Haskel. You're welcome to stay near the caravan, but we've no wood to spare. You'll have to build your own campfire. That clearing beside us is yours.\"",
    },
  ],
};

export const CAMP_QUEST: QuestDef = {
  id: "make_camp",
  name: "Shelter",
  giver: "vendor",
  intro: "Haskel will let you stay near the caravan, but you must build your own campfire in the clearing beside it. Night will come.",
  steps: [
    {
      title: "Firewood",
      text: "Gather dry branches from the deadfall in the woods around the caravan.",
      objective: { type: "gather", node: "deadfall", count: 8, seconds: 1.5 },
      xp: 40,
      doneText: "An armful of dry wood. Enough to keep a fire going through the night.",
    },
    {
      title: "A ring of stones",
      text: "Collect smooth stones from the stream banks to ring the fire.",
      objective: { type: "gather", node: "river_stone", count: 6, seconds: 1.5 },
      xp: 50,
      doneText: "Heavy, smooth and cold. They'll keep the fire where it belongs.",
    },
    {
      title: "Hides",
      text: "Hunt tusked boars in Tusk Meadow, across the ford, for hides to stretch over a lean-to.",
      objective: { type: "kill", enemies: ["boar"], count: 4, chance: 0.7, failText: "The hide is torn to ribbons. Useless." },
      xp: 80,
      doneText: "Four rough hides. They stink, but they'll keep the rain off.",
      marker: "tusk_meadow",
    },
    {
      title: "Make camp",
      text: "Return to the clearing beside the caravan and build your campfire.",
      objective: { type: "interact", landmark: "campsite", seconds: 4, verb: "Build your camp", effect: "build_camp" },
      xp: 120,
      doneText: "The fire catches. For the first time since you woke, you're warm. Haskel nods across at you from his cart: he has something to ask.",
    },
  ],
};

/** Haskel's quest: find out what happened to Ashford. About twenty minutes. */
export const VILLAGE_QUEST: QuestDef = {
  id: "silent_village",
  name: "The Silent Village",
  giver: "vendor",
  requires: "make_camp",
  intro: "Haskel wants to know what happened to Ashford, the farming village on the old road east of the ford.",
  steps: [
    {
      title: "The old west road",
      text: "Cross the stream at the ford and follow the old road east to Ashford.",
      objective: { type: "reach", landmark: "village", radius: 13 },
      xp: 40,
      doneText: "Doors hang open. Nothing moves in Ashford but the dead.",
      marker: "village",
    },
    {
      title: "Put them to rest",
      text: "Destroy the risen dead and skeletons that walk Ashford's lanes.",
      objective: { type: "kill", enemies: ["risen", "skeleton"], count: 8 },
      xp: 90,
      doneText: "The lanes are quieter. For now.",
      marker: "ashford",
    },
    {
      title: "What happened here",
      text: "Search Ashford for signs of what happened: the cart by the gate, the well, the headman's house.",
      objective: { type: "gather", node: "clue", count: 3, seconds: 2 },
      xp: 70,
      doneText: "Corwin the gravedigger opened the old crypt. Everything went wrong after that.",
      marker: "village",
    },
    {
      title: "The gravedigger",
      text: "Find Old Corwin in the graveyard south of the chapel. He still carries the crypt key.",
      objective: { type: "kill", enemies: ["gravedigger"], count: 1 },
      xp: 70,
      doneText: "A heavy iron key hangs from what's left of Corwin's belt.",
      marker: "village",
    },
    {
      title: "Under the chapel",
      text: "Unlock the crypt beneath the chapel.",
      objective: { type: "interact", landmark: "crypt", seconds: 3, verb: "Unlock the crypt", effect: "unseal_crypt" },
      xp: 30,
      doneText: "The door grinds open. Something below stops singing, and starts to climb.",
    },
    {
      title: "The Hollow Priest",
      text: "Destroy the thing that rose from the crypt.",
      objective: { type: "kill", enemies: ["hollow_priest"], count: 1 },
      xp: 150,
      doneText: "The Hollow Priest falls apart into black dust, and the dust crawls toward the thorns.",
      marker: "crypt",
    },
    {
      title: "Root and ash",
      text: "Burn the black thorns choking the crypt so nothing else rises.",
      objective: { type: "interact", landmark: "crypt", seconds: 4, verb: "Burn the black thorns", effect: "burn_thorns" },
      xp: 60,
      doneText: "The thorns curl, hiss and burn. Something deep under the valley stirs, and goes still.",
    },
    {
      title: "Report to Haskel",
      text: "Tell Haskel what you found in Ashford.",
      objective: { type: "interact", landmark: "vendor" },
      xp: 150,
      doneText: "Haskel listens without a word, then lights a signal fire on the rockslide for the kingdom's men beyond.",
    },
  ],
  reward: {
    coins: 25,
    classItem: { fighter: "militia_brigandine", mage: "hedge_robe", priest: "chapel_vestments", thief: "poacher_leathers" },
    opensGate: "valley_exit",
  },
};

const fetch = (id: string, name: string, item: string, count: number, coins: number, xp: number, ask: string): QuestDef => ({
  id: `fetch_${id}`,
  name,
  giver: "vendor",
  intro: ask,
  repeatable: true,
  steps: [
    {
      title: name,
      text: ask,
      objective: { type: "deliver", item, count },
      xp,
      doneText: "Haskel counts them twice and pays.",
    },
  ],
  reward: { coins },
});

/** Haskel's odd jobs: one is on offer at a time, picked at random. */
export const FETCH_QUESTS: readonly QuestDef[] = [
  fetch("pelts", "Warm Hands", "wolf_pelt", 3, 12, 40, "Bring Haskel 3 wolf pelts. Nights by the rockslide are cold."),
  fetch("hare", "Hare Stew", "hare_meat", 4, 8, 25, "Bring Haskel 4 raw hares for the pot."),
  fetch("hides", "Patching the Cover", "boar_hide", 3, 10, 30, "Bring Haskel 3 boar hides to patch his cart's cover."),
  fetch("silk", "Strong Thread", "spider_silk", 3, 14, 50, "Bring Haskel 3 skeins of spider silk from Webbed Hollow."),
  fetch("bones", "Bonemeal", "old_bones", 5, 12, 50, "Bring Haskel 5 old bones. A farmer downriver grinds them for his fields."),
  fetch("thorns", "Curious Thorns", "thorn_splinter", 4, 16, 60, "Bring Haskel 4 black thorns. He knows a scholar who'd pay for them."),
];

export const QUESTS: readonly QuestDef[] = [VOICES_QUEST, CAMP_QUEST, VILLAGE_QUEST, ...FETCH_QUESTS];

/** The quest every new character starts with. */
export const FIRST_QUEST = VOICES_QUEST.id;

export function getQuest(id: string): QuestDef | undefined {
  return QUESTS.find((q) => q.id === id);
}

/** Resting at camp. */
export const REST = {
  /** "Well Rested": bonus experience and faster natural healing for a while. */
  buffStat: "rested",
  xpBonus: 0.15,
  regenMultiplier: 2,
  durationSec: 15 * 60,
} as const;
