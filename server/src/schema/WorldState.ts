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

/** A harmful status effect (bleed, poison, blight). Cured at shrines and by resting. */
export const StatusEffect = schema(
  {
    id: t.string().default(""),
    /** Server time (ms) when it wears off. */
    expiresAt: t.float64().default(0),
  },
  "StatusEffect",
);
export type StatusEffect = SchemaType<typeof StatusEffect>;

/** Indices into APPEARANCE_OPTIONS (shared/src/character.ts). */
export const AppearanceState = schema(
  {
    build: t.uint8().default(1),
    skin: t.uint8().default(0),
    hair: t.uint8().default(0),
    hairColor: t.uint8().default(0),
    beard: t.uint8().default(0),
    dye: t.uint8().default(0),
  },
  "Appearance",
);
export type AppearanceState = SchemaType<typeof AppearanceState>;

export const Player = schema(
  {
    name: t.string().default(""),
    /** Current class in the progression tree (starts as a base class). */
    classId: t.string().default(""),
    /** Completed quests and milestones (trial_of_paths, make_camp, favor_<god>, prayed_<god>). */
    quests: t.array("string"),
    /** Quest in progress (shared/src/quests.ts), its current step and progress toward that step's count. */
    activeQuest: t.string().default(""),
    questStep: t.uint8().default(0),
    questCount: t.uint8().default(0),
    /** Quest pick-ups (world node ids) this player has already taken during the active quest. */
    gathered: t.array("string"),
    /** Hidden background (revealed through memories), faith (flavour), and creation point-buy in STAT_IDS order. */
    background: t.string().default(""),
    faith: t.string().default(""),
    /** Gods this character turned away from by completing another god's epic quest. They never take you back. */
    abandoned: t.array("string"),
    memories: t.uint8().default(0),
    alloc: t.array("int8"),
    appearance: AppearanceState,

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
    statuses: t.array(StatusEffect),
    /** A timed action in progress (gathering, building): label and server times, for the progress bar. */
    channelLabel: t.string().default(""),
    channelStart: t.float64().default(0),
    channelEnd: t.float64().default(0),
    /** Server time (ms) when each ability slot comes off cooldown. */
    cooldowns: t.array("float64"),
  },
  "Player",
);
export type Player = SchemaType<typeof Player>;

export const Enemy = schema(
  {
    kind: t.string().default(""),
    level: t.uint8().default(1),
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

/** A pet or familiar fighting for a player. Keyed by "c:<ownerSessionId>". */
export const Companion = schema(
  {
    owner: t.string().default(""),
    kind: t.string().default(""),
    name: t.string().default(""),
    color: t.string().default("#ffffff"),
    scale: t.float32().default(1),
    /** familiar | pet | empowered */
    power: t.string().default("familiar"),
    x: t.float32().default(0),
    z: t.float32().default(0),
    facing: t.float32().default(0),
    anim: t.string().default("idle"),
    actionSeq: t.uint16().default(0),
    hp: t.float32().default(0),
    maxHp: t.uint16().default(0),
  },
  "Companion",
);
export type Companion = SchemaType<typeof Companion>;

export const WorldState = schema(
  {
    seed: t.uint32().default(0),
    /** Server clock in ms, used by clients to show cooldowns/buffs. */
    serverTime: t.float64().default(0),
    players: t.map(Player),
    enemies: t.map(Enemy),
    companions: t.map(Companion),
    /** Gate id -> open? (valley_exit, ruins_seal, cave_thorns). Sealed by default. */
    gates: t.map("boolean"),
    /** The campsite has been built (by anyone in this world). */
    campBuilt: t.boolean().default(false),
  },
  "WorldState",
);
export type WorldState = SchemaType<typeof WorldState>;
