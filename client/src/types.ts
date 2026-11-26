/**
 * Read-only views of the synced room state. These mirror
 * server/src/schema/WorldState.ts — the client decodes the state via
 * Colyseus reflection, so these interfaces are just for type safety.
 * Keep them in sync when adding fields on the server.
 */

export interface InventorySlotView {
  itemId: string;
  qty: number;
}

export interface BuffView {
  stat: string;
  amount: number;
  expiresAt: number;
}

export interface PlayerView {
  name: string;
  /** Current class in the progression tree. */
  classId: string;
  /** Completed gate quests. */
  quests: ArrayLike<string> & { includes(id: string): boolean };
  /** Hidden background id (the UI only shows it once remembered). */
  background: string;
  faith: string;
  /** Gods abandoned by converting; they never take you back. */
  abandoned: ArrayLike<string> & { includes(id: string): boolean };
  /** Number of memory fragments recovered. */
  memories: number;
  /** Creation point-buy, in STAT_IDS order. */
  alloc: ArrayLike<number>;
  appearance: { build: number; skin: number; hair: number; hairColor: number; beard: number; dye: number };
  x: number;
  z: number;
  facing: number;
  anim: string;
  actionSeq: number;
  level: number;
  xp: number;
  xpNext: number;
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  weapon: string;
  armor: string;
  inventory: ArrayLike<InventorySlotView> & { forEach(cb: (s: InventorySlotView, i: number) => void): void };
  buffs: ArrayLike<BuffView> & { forEach(cb: (b: BuffView, i: number) => void): void };
  /** Harmful status effects (bleed, poison, blight). */
  statuses: ArrayLike<{ id: string; expiresAt: number }> & { forEach(cb: (s: { id: string; expiresAt: number }, i: number) => void): void };
  /** Quests in progress: current step and progress toward it. */
  active: ArrayLike<QuestStateView> & { forEach(cb: (q: QuestStateView, i: number) => void): void; find(cb: (q: QuestStateView) => boolean): QuestStateView | undefined; some(cb: (q: QuestStateView) => boolean): boolean };
  /** The odd job the merchant is offering right now. */
  fetchOffer: string;
  coins: number;
  /** Timed action in progress (gathering, building). */
  channelLabel: string;
  channelStart: number;
  channelEnd: number;
  /** Quest pick-ups (world node ids) already taken during the active quest. */
  gathered: ArrayLike<string> & { includes(id: string): boolean };
  cooldowns: ArrayLike<number>;
}

export interface QuestStateView {
  id: string;
  step: number;
  count: number;
}

export interface EnemyView {
  kind: string;
  level: number;
  x: number;
  z: number;
  facing: number;
  anim: string;
  actionSeq: number;
  hp: number;
  maxHp: number;
}

export interface CompanionView {
  owner: string;
  kind: string;
  name: string;
  color: string;
  scale: number;
  power: string;
  x: number;
  z: number;
  facing: number;
  anim: string;
  actionSeq: number;
  hp: number;
  maxHp: number;
}

export interface MapView<T> {
  readonly size: number;
  get(key: string): T | undefined;
  has(key: string): boolean;
  forEach(cb: (value: T, key: string) => void): void;
}

export interface WorldStateView {
  seed: number;
  serverTime: number;
  players: MapView<PlayerView>;
  enemies: MapView<EnemyView>;
  companions: MapView<CompanionView>;
  /** Gate id -> open. Sealed gates block movement. */
  gates: MapView<boolean>;
  /** The campsite has been built. */
  campBuilt: boolean;
  /** Ashford's crypt: unlocked, and its thorns burned. */
  cryptOpen: boolean;
  cryptBurned: boolean;
}
