/**
 * Network message contract between client and server.
 * Synced entity state (players, enemies) travels through Colyseus schema
 * patches; these messages carry player intent and one-off events.
 */

import type { CreationChoices } from "./character.ts";

/** Options sent when joining a room: the full character-creation result (validated on the server). */
export type JoinOptions = CreationChoices;

// ---- Client -> Server -----------------------------------------------------

export interface MoveDirMsg {
  /** Keyboard direction in world space, already normalised (0,0 = stop). */
  x: number;
  z: number;
}

export interface MoveToMsg {
  x: number;
  z: number;
}

export interface AttackMsg {
  /** Enemy id to attack (click on an enemy). */
  targetId: string;
}

export interface AbilityMsg {
  /** Ability slot 0..3 (= tier of the class that taught it, minus one). */
  slot: number;
  x: number;
  z: number;
}

export interface UseItemMsg {
  slot: number;
}

export interface AdvanceMsg {
  /** Class to advance into; must be a child of the current class. */
  classId: string;
}

export interface ChatMsg {
  text: string;
}

/** Buy entry `index` of the merchant's shop. */
export interface BuyMsg {
  index: number;
}

/** Sell the stack in a bag slot (all of it, or just one). */
export interface SellMsg {
  slot: number;
  all?: boolean;
}

export interface QuestMsg {
  questId: string;
}

export interface UnequipMsg {
  slot: "weapon" | "armor";
}

/** Quick-use the best item of a kind: "heal" picks food out of combat, a potion in it. */
export interface QuickUseMsg {
  kind: "heal" | "drink";
}

export const C2S = {
  moveDir: "moveDir",
  moveTo: "moveTo",
  attack: "attack",
  ability: "ability",
  useItem: "useItem",
  interact: "interact",
  advance: "advance",
  chat: "chat",
  buy: "buy",
  sell: "sell",
  /** Sell every material (loot) in the bag. */
  sellJunk: "sellJunk",
  acceptQuest: "acceptQuest",
  /** Hand in a delivery quest to its giver. */
  turnIn: "turnIn",
  /** Ask the merchant for a weapon when you have none. */
  requestWeapon: "requestWeapon",
  unequip: "unequip",
  quickUse: "quickUse",
  hire: "hire",
  /** Part ways with your adventurer. */
  dismiss: "dismiss",
} as const;

/** Number of ability slots (one per tier). */
export const ABILITY_SLOTS = 4;

// ---- Server -> Client -----------------------------------------------------

export interface HitEvent {
  /** Entity that took the hit (player session id or enemy id). */
  targetId: string;
  sourceId: string;
  amount: number;
  /** Heals are sent as hits with heal=true. */
  heal?: boolean;
  crit?: boolean;
}

export interface FxEvent {
  kind: "projectile" | "nova" | "strike" | "heal" | "buff" | "dash" | "levelup" | "death" | "swing";
  sourceId: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  radius?: number;
  /** Projectile visual or ability id. */
  variant?: string;
  color?: string;
}

/** A recovered memory of your forgotten past. `revealed` names your background once it is fully remembered. */
export interface MemoryEvent {
  text: string;
  revealed?: string;
  passive?: string;
}

export interface ChatEvent {
  from: string;
  text: string;
  system?: boolean;
}

/** A book's text, shown to the reader. */
export interface ReadEvent {
  title: string;
  text: string[];
}

/** Open a conversation (and shop) with someone, optionally on a given tab ("party"). */
export interface DialogEvent {
  npc: string;
  tab?: string;
}

/** Ask an adventurer at Haskel's camp to travel with you. */
export interface HireMsg {
  adventurerId: string;
}

/** A short scripted scene: lines shown in turn over a darkening screen; controls are locked meanwhile. */
export interface CutsceneEvent {
  id: string;
  lines: string[];
  /** Total length (ms). */
  ms: number;
  /** When (ms from the start) the screen is fully black. */
  blackAt: number;
}

export const S2C = {
  hit: "hit",
  fx: "fx",
  chat: "chat",
  notice: "notice",
  memory: "memory",
  read: "read",
  dialog: "dialog",
  cutscene: "cutscene",
} as const;
