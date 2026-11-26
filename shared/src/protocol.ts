/**
 * Network message contract between client and server.
 * Synced entity state (players, enemies) travels through Colyseus schema
 * patches; these messages carry player intent and one-off events.
 */

/** Options sent when joining a room. */
export interface JoinOptions {
  name: string;
  classId: string;
  subclassId: string;
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
  /** 0 = class ability, 1 = subclass ability. */
  slot: 0 | 1;
  x: number;
  z: number;
}

export interface UseItemMsg {
  slot: number;
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
  chat: "chat",
} as const;

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
