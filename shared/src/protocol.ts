/**
 * Network message contract between client and server.
 * Synced entity state (players, enemies) travels through Colyseus schema
 * patches; these messages carry player intent and one-off events.
 */

/** Options sent when joining a room. */
export interface JoinOptions {
  name: string;
  /** One of the four base classes: fighter, mage, priest, thief. */
  classId: string;
}

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

export const C2S = {
  moveDir: "moveDir",
  moveTo: "moveTo",
  attack: "attack",
  ability: "ability",
  useItem: "useItem",
  interact: "interact",
  advance: "advance",
  chat: "chat",
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

export interface ChatEvent {
  from: string;
  text: string;
  system?: boolean;
}

export const S2C = {
  hit: "hit",
  fx: "fx",
  chat: "chat",
  notice: "notice",
} as const;
