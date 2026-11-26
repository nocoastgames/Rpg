/**
 * Synchronised state. Colyseus delta-encodes changes to these schemas and
 * patches every connected client automatically. Keep only data that clients
 * need to *render* here; server-only bookkeeping lives in the Game sim.
 *
 * Uses the `schema()` + `t.*` builder API (no decorators, no special
 * compiler settings). Clients don't import this file: they rebuild the types
 * from the reflection data the server sends on join.
 */
import { schema, t, type SchemaType } from "@colyseus/schema";

export const InventorySlot = schema(
  {
    itemId: t.string().default(""),
    qty: t.uint16().default(0),
  },
  "InventorySlot",
);
export type InventorySlot = SchemaType<typeof InventorySlot>;

export const Buff = schema(
  {
    stat: t.string().default(""),
    amount: t.float32().default(0),
    /** Server time (ms) when the buff expires. */
    expiresAt: t.float64().default(0),
  },
  "Buff",
);
export type Buff = SchemaType<typeof Buff>;

export const Player = schema(
  {
    name: t.string().default(""),
    classId: t.string().default(""),
    subclassId: t.string().default(""),

    x: t.float32().default(0),
    z: t.float32().default(0),
    facing: t.float32().default(0),
    /** idle | walk | attack | cast | dead */
    anim: t.string().default("idle"),
    /** Increments every time an attack/cast starts so clients can retrigger animations. */
    actionSeq: t.uint16().default(0),

    level: t.uint16().default(1),
    xp: t.uint32().default(0),
    xpNext: t.uint32().default(0),

    hp: t.float32().default(0),
    maxHp: t.uint16().default(0),
    resource: t.float32().default(0),
    maxResource: t.uint16().default(0),

    weapon: t.string().default(""),
    armor: t.string().default(""),
    inventory: t.array(InventorySlot),
    buffs: t.array(Buff),
    /** Server time (ms) when each ability slot comes off cooldown. */
    cooldowns: t.array("float64"),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const Enemy = schema(
  {
    kind: t.string().default(""),
    x: t.float32().default(0),
    z: t.float32().default(0),
    facing: t.float32().default(0),
    anim: t.string().default("idle"),
    actionSeq: t.uint16().default(0),
    hp: t.float32().default(0),
    maxHp: t.uint16().default(0),
  },
  "Enemy",
);
export type Enemy = SchemaType<typeof Enemy>;

export const WorldState = schema(
  {
    seed: t.uint32().default(0),
    /** Server clock in ms, used by clients to show cooldowns/buffs. */
    serverTime: t.float64().default(0),
    players: t.map(Player),
    enemies: t.map(Enemy),
    /** Gate id -> open? (valley_exit, ruins_seal, cave_thorns). Sealed by default. */
    gates: t.map("boolean"),
  },
  "WorldState",
);
export type WorldState = SchemaType<typeof WorldState>;
