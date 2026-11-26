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
  classId: string;
  subclassId: string;
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
  cooldowns: ArrayLike<number>;
}

export interface EnemyView {
  kind: string;
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
}
