/**
 * Quests. Each has a few steps; a step has one objective. Progress for the
 * active quest is synced on the player (activeQuest, questStep, questCount).
 */
import type { NodeKind } from "./world.ts";

export type QuestObjective =
  /** Pick up `count` quest nodes of a kind; each takes `seconds` of work (moving interrupts it). */
  | { type: "gather"; node: NodeKind; count: number; seconds?: number }
  /**
   * Kill `count` creatures of a kind (anyone nearby who shares the XP gets
   * credit). With `chance`, only that share of kills counts (a torn hide).
   */
  | { type: "kill"; enemy: string; count: number; chance?: number; failText?: string }
  /** Use a landmark; takes `seconds` of work. */
  | { type: "interact"; landmark: string; seconds?: number };

export interface QuestStepDef {
  title: string;
  /** Tracker text: what to do and where. */
  text: string;
  objective: QuestObjective;
  /** Experience for finishing the step. */
  xp: number;
  /** Said when the step is done. */
  doneText: string;
}

export interface QuestDef {
  id: string;
  name: string;
  /** Said when the quest starts. */
  intro: string;
  steps: QuestStepDef[];
}

export const CAMP_QUEST: QuestDef = {
  id: "make_camp",
  name: "Shelter",
  intro: "You're cold, soaked and alone. Night will come. You need a fire and a roof, and the sheltered clearing just west of the stream will do.",
  steps: [
    {
      title: "Firewood",
      text: "Gather dry branches from the deadfall in the woods around the clearing.",
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
      objective: { type: "kill", enemy: "boar", count: 4, chance: 0.7, failText: "The hide is torn to ribbons. Useless." },
      xp: 80,
      doneText: "Four rough hides. They stink, but they'll keep the rain off.",
    },
    {
      title: "Make camp",
      text: "Return to the clearing and build your camp.",
      objective: { type: "interact", landmark: "campsite", seconds: 4 },
      xp: 120,
      doneText: "The fire catches. For the first time since you woke, you're warm.",
    },
  ],
};

export const QUESTS: readonly QuestDef[] = [CAMP_QUEST];

/** The quest every new character starts with. */
export const FIRST_QUEST = CAMP_QUEST.id;

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
