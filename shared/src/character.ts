/**
 * Character creation: appearance, hidden backgrounds (revealed through
 * memories), faiths (flavour), and point-buy stats. Shared so the client can
 * preview exactly what the server will accept.
 */
import { BASE_CLASSES, classAlignment, isBaseClass, type BaseClassId, type ClassAlignment } from "./classes.ts";
import { NAME_MAX_LENGTH } from "./constants.ts";
import { STAT_IDS, addStats, type StatId, type Stats } from "./stats.ts";

// ---------------------------------------------------------------------------
// Appearance (ragged clothes for everyone; equipment shows later)
// ---------------------------------------------------------------------------

export interface Appearance {
  build: number;
  skin: number;
  hair: number;
  hairColor: number;
  beard: number;
  /** Colour of the ragged clothes. */
  dye: number;
}

export const APPEARANCE_OPTIONS = {
  build: [
    { id: "slight", label: "Slight", width: 0.88, height: 0.97 },
    { id: "average", label: "Average", width: 1, height: 1 },
    { id: "broad", label: "Broad", width: 1.14, height: 1.03 },
  ],
  skin: ["#f2d4b8", "#e8c0a0", "#d8a882", "#c08a64", "#a06c48", "#7e5236", "#5e3a24", "#42281a"],
  hair: [
    { id: "none", label: "Shaved" },
    { id: "short", label: "Short" },
    { id: "long", label: "Long" },
    { id: "ponytail", label: "Tied back" },
    { id: "braid", label: "Braid" },
    { id: "mohawk", label: "Crest" },
  ],
  hairColor: ["#16120e", "#3a2618", "#5e3e24", "#8a4a22", "#b0602e", "#d8b468", "#8c8a86", "#e8e4dc"],
  beard: [
    { id: "none", label: "None" },
    { id: "stubble", label: "Stubble" },
    { id: "short", label: "Short beard" },
    { id: "long", label: "Long beard" },
  ],
  dye: [
    { label: "Undyed", color: "#8a7a5e" },
    { label: "Earth", color: "#6a4a30" },
    { label: "Moss", color: "#4e5a34" },
    { label: "Faded blue", color: "#4a5a6e" },
    { label: "Ash", color: "#5c5a58" },
    { label: "Rust", color: "#7a3e2a" },
  ],
} as const;

export const DEFAULT_APPEARANCE: Appearance = { build: 1, skin: 2, hair: 1, hairColor: 2, beard: 0, dye: 0 };

function optionCount(key: keyof Appearance): number {
  return APPEARANCE_OPTIONS[key].length;
}

// ---------------------------------------------------------------------------
// Backgrounds: who you were. Chosen at creation only as a vague first memory;
// the name and story come back as you level.
// ---------------------------------------------------------------------------

/** Small always-on bonuses from a background or a faith blessing. */
export type Passive =
  | { type: "armor"; amount: number }
  | { type: "foodHealing"; amount: number }
  | { type: "beastDamage"; amount: number }
  | { type: "xp"; amount: number }
  | { type: "healingReceived"; amount: number }
  | { type: "moveSpeed"; amount: number }
  | { type: "weaponDamage"; amount: number }
  | { type: "waterSlow"; amount: number }
  | { type: "crit"; amount: number }
  | { type: "maxResource"; amount: number }
  | { type: "hpRegen"; amount: number }
  | { type: "respawnFaster"; amount: number }
  | { type: "lifesteal"; amount: number }
  | { type: "areaDamage"; amount: number };

/** @deprecated use Passive */
export type BackgroundPassive = Passive;

export interface BackgroundDef {
  id: string;
  /** Revealed with the last memory. */
  name: string;
  /** What the player picks at creation: a first-person flash of memory, no labels. */
  impression: string;
  statBonus: Partial<Stats>;
  /** Extra starting item (a clue). */
  item: string;
  passive: Passive;
  /** How the passive reads once remembered. */
  passiveText: string;
  /** Memory fragments, revealed at the given levels. The last one names the background. */
  memories: Array<{ level: number; text: string }>;
}

export const MEMORY_LEVELS = [3, 8, 15] as const;

const mem = (a: string, b: string, c: string) => [
  { level: MEMORY_LEVELS[0], text: a },
  { level: MEMORY_LEVELS[1], text: b },
  { level: MEMORY_LEVELS[2], text: c },
];

export const BACKGROUNDS: readonly BackgroundDef[] = [
  {
    id: "soldier",
    name: "Soldier",
    impression: "The weight of a shield on your arm, and the ache of standing in line for hours.",
    statBonus: { vitality: 2, might: 1 },
    item: "whetstone",
    passive: { type: "armor", amount: 0.05 },
    passiveText: "Old drills keep you covered: +5% armour.",
    memories: mem(
      "Drums. A wall of shields locked edge to edge, and someone bellowing your name down the line.",
      "Mud to the knees and rain in your eyes. When the line broke, you were one of the few who held.",
      "You were a soldier. The banner you served is gone from your mind, but your body still remembers the drill.",
    ),
  },
  {
    id: "farmhand",
    name: "Farmhand",
    impression: "Warm bread, turned earth, and the slow patience of the seasons.",
    statBonus: { vitality: 2, spirit: 1 },
    item: "stale_bread",
    passive: { type: "foodHealing", amount: 0.5 },
    passiveText: "You know how to make a meal last: food heals 50% more.",
    memories: mem(
      "A field of barley bending in the wind, gold all the way to the hills.",
      "A plough horse with a white blaze, and calloused hands on the reins. Hers? Yours?",
      "You worked the land. Someone is still waiting for you to come home for the harvest.",
    ),
  },
  {
    id: "trapper",
    name: "Trapper",
    impression: "Cold mornings checking snares along a frozen creek.",
    statBonus: { agility: 2, might: 1 },
    item: "snare",
    passive: { type: "beastDamage", amount: 0.1 },
    passiveText: "You know where beasts are soft: +10% damage to beasts.",
    memories: mem(
      "Pelts drying on a line outside a cabin. Smoke curling from the chimney.",
      "A wolf in your snare, staring at you. You let it go. You never told anyone.",
      "You were a trapper, living alone in the high woods. These forests feel almost like home.",
    ),
  },
  {
    id: "scholar",
    name: "Scholar",
    impression: "Ink on your fingers, and a candle burning down to nothing.",
    statBonus: { intellect: 2, spirit: 1 },
    item: "torn_journal",
    passive: { type: "xp", amount: 0.1 },
    passiveText: "You learn quickly: +10% experience.",
    memories: mem(
      "Rows of books in a cold stone hall. A forbidden shelf, chained shut.",
      "A map of this very valley, drawn in your own hand. How could you have known it?",
      "You were a scholar, and you came here looking for something. The journal in your pack is yours.",
    ),
  },
  {
    id: "acolyte",
    name: "Acolyte",
    impression: "Incense, cold flagstones, and a prayer you can still recite word for word.",
    statBonus: { spirit: 2, intellect: 1 },
    item: "prayer_beads",
    passive: { type: "healingReceived", amount: 0.1 },
    passiveText: "The gods still hear you: +10% healing received.",
    memories: mem(
      "Bells at dawn. Rows of grey robes kneeling in silence.",
      "An elder pressing beads into your hand: 'Carry these where we cannot go.'",
      "You were an acolyte of a temple, sent on a pilgrimage you never finished.",
    ),
  },
  {
    id: "urchin",
    name: "Street Urchin",
    impression: "Rooftops, alleyways, and running before anyone could catch you.",
    statBonus: { agility: 2, intellect: 1 },
    item: "lockpick",
    passive: { type: "moveSpeed", amount: 0.05 },
    passiveText: "Always ready to run: +5% movement speed.",
    memories: mem(
      "A crowded market. A purse in your hand that wasn't yours a moment ago.",
      "Sleeping under a bridge with three other children, sharing one blanket.",
      "You grew up on the streets of a great city, living by quick hands and quicker feet.",
    ),
  },
  {
    id: "smith",
    name: "Smith",
    impression: "The ring of a hammer on hot iron, and sparks like falling stars.",
    statBonus: { might: 2, vitality: 1 },
    item: "hammer_charm",
    passive: { type: "weaponDamage", amount: 1 },
    passiveText: "You know a good edge: weapons deal +1 damage.",
    memories: mem(
      "A forge glowing in the dark, and an old master who never praised anything.",
      "A blade you made for someone important. You remember the weight of it exactly.",
      "You were a smith. Your hands still itch for a hammer.",
    ),
  },
  {
    id: "sailor",
    name: "Sailor",
    impression: "Salt spray, creaking timbers, and the deck rolling under your feet.",
    statBonus: { might: 1, agility: 1, vitality: 1 },
    item: "coil_of_rope",
    passive: { type: "waterSlow", amount: 0.5 },
    passiveText: "Water doesn't bother you: wading slows you half as much.",
    memories: mem(
      "A harbour full of masts. Gulls screaming over the fish market.",
      "A storm. The mast splitting. Cold water closing over your head.",
      "You were a sailor. How you came to be so far inland is still a mystery.",
    ),
  },
  {
    id: "outlaw",
    name: "Outlaw",
    impression: "A face on a wanted poster. It looked a lot like yours.",
    statBonus: { agility: 2, might: 1 },
    item: "wanted_poster",
    passive: { type: "crit", amount: 0.03 },
    passiveText: "You fight dirty: +3% critical hit chance.",
    memories: mem(
      "Riding hard through the dark with a sack of silver and hoofbeats behind you.",
      "A gallows in a town square. You were not the one who hanged.",
      "You were an outlaw, and someone, somewhere, is still hunting you.",
    ),
  },
  {
    id: "noble",
    name: "Noble",
    impression: "Silk sheets, a long table, and servants who never met your eyes.",
    statBonus: { intellect: 1, spirit: 1, vitality: 1 },
    item: "signet_ring",
    passive: { type: "maxResource", amount: 0.1 },
    passiveText: "A lifetime of training: +10% maximum resource.",
    memories: mem(
      "A hall of portraits. One of them has your eyes.",
      "An argument in a candlelit study. Someone wanted you gone. Badly.",
      "You were born noble. The ring is your house's seal, and your house believes you dead.",
    ),
  },
];

const BACKGROUND_MAP = new Map(BACKGROUNDS.map((b) => [b.id, b]));

export function getBackground(id: string): BackgroundDef | undefined {
  return BACKGROUND_MAP.get(id);
}

/** Memories recovered by a given level. */
export function memoriesAt(backgroundId: string, level: number): Array<{ level: number; text: string }> {
  return getBackground(backgroundId)?.memories.filter((m) => m.level <= level) ?? [];
}

/** True once the background's name is remembered (last memory). */
export function backgroundRevealed(backgroundId: string, level: number): boolean {
  const bg = getBackground(backgroundId);
  return !!bg && level >= bg.memories[bg.memories.length - 1]!.level;
}

/** A background's passive amount of a given type (0 if it has a different one). */
export function backgroundBonus(backgroundId: string, type: Passive["type"]): number {
  const p = getBackground(backgroundId)?.passive;
  return p && p.type === type ? p.amount : 0;
}

// ---------------------------------------------------------------------------
// Faiths. Mostly flavour; a minor blessing applies while your class's
// alignment matches your god's leaning (good with good, evil with evil,
// neutral with neutral). If the alignment is one step away (good/neutral or
// neutral/evil) you can still earn the blessing by completing that god's
// epic quest. Opposites (good and evil) are never blessed. Completing a god's
// epic quest makes that god your god; which quests you may take depends on
// your class's alignment (any god not opposed to it), never on your old god,
// and a god you have abandoned never takes you back.
// ---------------------------------------------------------------------------

export interface FaithDef {
  id: string;
  name: string;
  title: string;
  domain: string;
  leaning: "Good" | "Neutral" | "Evil" | "None";
  description: string;
  color: string;
  blessing?: Passive;
  blessingText?: string;
  /** Epic quest that wins this god's favour for a follower on an adjacent (not matching) path. */
  favorQuest?: { id: string; name: string };
}

export const FAITHS: readonly FaithDef[] = [
  { id: "solenne", name: "Solenne", title: "the Dawn Mother", domain: "Light, mercy and healing", leaning: "Good", color: "#f0d080", description: "She who rises each morning so that no night lasts forever." , blessing: { type: "healingReceived", amount: 0.08 }, blessingText: "+8% healing received" , favorQuest: { id: "favor_solenne", name: "The Long Dawn" } },
  { id: "valdris", name: "Valdris", title: "the Oathshield", domain: "Law, duty and protection", leaning: "Good", color: "#a8b8d0", description: "Guardian of sworn words. Oathbreakers find no shelter under his shield." , blessing: { type: "armor", amount: 0.04 }, blessingText: "+4% armour" , favorQuest: { id: "favor_valdris", name: "The Unbroken Oath" } },
  { id: "green_mother", name: "The Green Mother", title: "", domain: "Nature, growth and renewal", leaning: "Good", color: "#7aa85a", description: "Older than any temple. Her shrines are groves, springs and standing stones." , blessing: { type: "hpRegen", amount: 0.6 }, blessingText: "Natural health regeneration 60% faster" , favorQuest: { id: "favor_green_mother", name: "Roots of the World" } },
  { id: "orren", name: "Orren", title: "Keeper of Roads", domain: "Travel, luck and trade", leaning: "Neutral", color: "#c8a060", description: "Patron of wanderers and merchants. Every crossroads is his altar." , blessing: { type: "moveSpeed", amount: 0.04 }, blessingText: "+4% movement speed" , favorQuest: { id: "favor_orren", name: "The Endless Road" } },
  { id: "mirevel", name: "Mirevel", title: "of the Hidden Ledger", domain: "Knowledge and secrets", leaning: "Neutral", color: "#8a7ac8", description: "Keeps a ledger of every secret ever spoken. Scholars and spies alike pray to her." , blessing: { type: "maxResource", amount: 0.08 }, blessingText: "+8% maximum resource" , favorQuest: { id: "favor_mirevel", name: "The Unwritten Page" } },
  { id: "ferryman", name: "The Grey Ferryman", title: "", domain: "Death and balance", leaning: "Neutral", color: "#9aa4a8", description: "Neither cruel nor kind. Takes every soul across in its time, no sooner and no later." , blessing: { type: "respawnFaster", amount: 2 }, blessingText: "Return from death 2 seconds sooner" , favorQuest: { id: "favor_ferryman", name: "The Far Shore" } },
  { id: "kaelthar", name: "Kaelthar", title: "the Hunger", domain: "Blood, war and conquest", leaning: "Evil", color: "#b0302a", description: "The god of the strong. His priests teach that mercy is only weakness that hasn't been punished yet." , blessing: { type: "lifesteal", amount: 0.03 }, blessingText: "Heal for 3% of the damage you deal" , favorQuest: { id: "favor_kaelthar", name: "The Red Tithe" } },
  { id: "veiled_one", name: "The Veiled One", title: "", domain: "Shadow, deceit and poison", leaning: "Evil", color: "#5a4a7a", description: "No face, no name, no temple. Whispers in the dark that something will always listen." , blessing: { type: "crit", amount: 0.03 }, blessingText: "+3% critical hit chance" , favorQuest: { id: "favor_veiled_one", name: "Behind the Veil" } },
  { id: "rot_below", name: "The Rot Below", title: "", domain: "Decay, plague and thorns", leaning: "Evil", color: "#5a6a2a", description: "What grows in the dark beneath the roots. Some say its thorns have already reached this valley." , blessing: { type: "areaDamage", amount: 0.06 }, blessingText: "+6% damage with area abilities" , favorQuest: { id: "favor_rot_below", name: "The Deep Rot" } },
  { id: "faithless", name: "Faithless", title: "", domain: "No god", leaning: "None", color: "#8a8478", description: "You remember no prayers, and no god has come looking for you. Yet." },
];

const FAITH_MAP = new Map(FAITHS.map((f) => [f.id, f]));

export function getFaith(id: string): FaithDef | undefined {
  return FAITH_MAP.get(id);
}

const LEANING_STEP: Record<ClassAlignment, number> = { good: 1, neutral: 0, evil: -1 };

/** Anything with an `includes` check: a plain array, or a synced ArraySchema. */
export type QuestLog = { includes(id: string): boolean; readonly length?: number; readonly [i: number]: string };

export type BlessingStatus =
  /** Your god's blessing applies. */
  | "active"
  /** Your path is one step from your god's leaning: their epic quest wins their favour. */
  | "needsQuest"
  /** Your god opposes your path (good vs evil). Another god's epic quest can convert you. */
  | "opposed"
  /** Your god would bless you, but you have not yet prayed at their shrine. */
  | "awaitsPrayer"
  /** Faithless, or a god without a blessing. */
  | "none";


/**
 * Recorded when you learn of a god's epic quest from lore (books, inscriptions
 * and other world items). Until then the quest is never named to you.
 */
export function loreFlag(faithId: string): string {
  return `lore_${faithId}`;
}

/** The god's epic quest, by name if you've learned of it, otherwise only as a rumour. */
export function epicQuestName(faithId: string, quests: QuestLog): string {
  const f = getFaith(faithId);
  return f?.favorQuest && quests.includes(loreFlag(faithId)) ? f.favorQuest.name : "some great deed in their name";
}

/** Recorded (in the quest log) the first time you pray at a god's shrine. */
export function prayedFlag(faithId: string): string {
  return `prayed_${faithId}`;
}

/** Steps between a god's leaning and a class's alignment: 0 same, 1 adjacent, 2 opposite. */
function leaningDistance(f: FaithDef, classId: string): number {
  return Math.abs(LEANING_STEP[f.leaning.toLowerCase() as ClassAlignment] - LEANING_STEP[classAlignment(classId)]);
}

export interface BlessingInfo {
  status: BlessingStatus;
  /** Set while the blessing applies. */
  blessedBy?: FaithDef;
}

/**
 * Your god's blessing:
 *   - same alignment as the god: automatic;
 *   - one step apart (good/neutral, neutral/evil): earned with the god's epic quest;
 *   - opposite (good vs evil): never (another god's epic quest can make them your god: availableFavorQuests);
 *   - Faithless: none.
 * Either way the blessing is only received by praying once at the god's shrine.
 */
export function blessingInfo(faithId: string, classId: string, quests: QuestLog = []): BlessingInfo {
  const f = getFaith(faithId);
  if (!f?.blessing || f.leaning === "None") return { status: "none" };
  const d = leaningDistance(f, classId);
  if (!favourWon(f, classId, quests)) return { status: d === 2 ? "opposed" : "needsQuest" };
  if (!quests.includes(prayedFlag(f.id))) return { status: "awaitsPrayer" };
  return { status: "active", blessedBy: f };
}

/** The god accepts your path: same alignment, or one step away with their epic quest done. */
function favourWon(f: FaithDef, classId: string, quests: QuestLog): boolean {
  const d = leaningDistance(f, classId);
  return d === 0 || (d === 1 && !!f.favorQuest && quests.includes(f.favorQuest.id));
}

export function blessingStatus(faithId: string, classId: string, quests: QuestLog = []): BlessingStatus {
  return blessingInfo(faithId, classId, quests).status;
}

export function blessingActive(faithId: string, classId: string, quests: QuestLog = []): boolean {
  return !!blessingInfo(faithId, classId, quests).blessedBy;
}

/** Total of a passive type from background + your god's blessing (when active). */
export function passiveBonus(backgroundId: string, faithId: string, classId: string, type: Passive["type"], quests: QuestLog = []): number {
  let total = backgroundBonus(backgroundId, type);
  const b = blessingInfo(faithId, classId, quests).blessedBy?.blessing;
  if (b?.type === type) total += b.amount;
  return total;
}

/**
 * Epic quests a character may undertake right now. Completing one makes that
 * god your god. Eligibility depends on your class's alignment, not on your
 * current god: any god within one step of your path (good/neutral or
 * neutral/evil), never one opposed to it, never a god you have abandoned, and
 * not your current god once they already bless you.
 */
export function availableFavorQuests(faithId: string, classId: string, quests: QuestLog = [], abandoned: QuestLog = []): FaithDef[] {
  return FAITHS.filter(
    (g) =>
      !!g.favorQuest &&
      !!g.blessing &&
      leaningDistance(g, classId) < 2 &&
      !abandoned.includes(g.id) &&
      !(g.id === faithId && favourWon(g, classId, quests)),
  );
}

/** Result of completing a god's epic quest: that god becomes your god and favours you. */
export function favorQuestOutcome(
  faithId: string,
  classId: string,
  questId: string,
  quests: QuestLog = [],
  abandoned: QuestLog = [],
): { ok: true; newFaith: FaithDef } | { ok: false; reason: string } {
  const god = FAITHS.find((g) => g.favorQuest?.id === questId);
  if (!god) return { ok: false, reason: "That is not an epic quest of the gods." };
  if (abandoned.includes(god.id)) return { ok: false, reason: `You turned your back on ${god.name}. They will not take you back.` };
  if (leaningDistance(god, classId) === 2) return { ok: false, reason: `${god.name} will never bless a ${classAlignment(classId)} path.` };
  if (god.id === faithId && favourWon(god, classId, quests)) return { ok: false, reason: `${god.name} already favours you.` };
  return { ok: true, newFaith: god };
}

// ---------------------------------------------------------------------------
// Point-buy
// ---------------------------------------------------------------------------

export const POINT_BUY = {
  /** Points to spend at creation. */
  points: 10,
  /** Most a single stat can be raised. */
  maxRaise: 5,
  /** Most a single stat can be lowered (to gain points back). */
  maxLower: 2,
  /** Total that can be lowered across all stats. */
  totalLower: 2,
} as const;

export type StatAllocation = Record<StatId, number>;

export const EMPTY_ALLOCATION: StatAllocation = { might: 0, agility: 0, intellect: 0, vitality: 0, spirit: 0 };

/** Points still available for an allocation (negative = overspent). */
export function pointsRemaining(alloc: StatAllocation): number {
  let spent = 0;
  for (const id of STAT_IDS) spent += alloc[id];
  return POINT_BUY.points - spent;
}

export function allocationError(alloc: StatAllocation): string | null {
  let lowered = 0;
  for (const id of STAT_IDS) {
    const v = alloc[id];
    if (!Number.isInteger(v)) return "Stat points must be whole numbers.";
    if (v > POINT_BUY.maxRaise) return `No stat can be raised by more than ${POINT_BUY.maxRaise}.`;
    if (v < -POINT_BUY.maxLower) return `No stat can be lowered by more than ${POINT_BUY.maxLower}.`;
    if (v < 0) lowered -= v;
  }
  if (lowered > POINT_BUY.totalLower) return `You can lower stats by ${POINT_BUY.totalLower} in total.`;
  if (pointsRemaining(alloc) < 0) return "You've spent more points than you have.";
  return null;
}

/** Level-1 stats before class advancement: class base + background + allocation. */
export function creationStats(base: BaseClassId, backgroundId: string, alloc: StatAllocation): Stats {
  return addStats(addStats(BASE_CLASSES[base].baseStats, getBackground(backgroundId)?.statBonus ?? {}), alloc);
}

// ---------------------------------------------------------------------------
// Validation (server authoritative; client uses it to enable "Wake Up")
// ---------------------------------------------------------------------------

export interface CreationChoices {
  name: string;
  classId: BaseClassId;
  backgroundId: string;
  faithId: string;
  alloc: StatAllocation;
  appearance: Appearance;
}

export function sanitizeName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/[^\p{L}\p{N} _'-]/gu, "").trim().slice(0, NAME_MAX_LENGTH) : "";
  return name || "Wanderer";
}

/** Validate and normalise creation choices from an untrusted client. */
export function validateCreation(input: unknown): { ok: true; value: CreationChoices } | { ok: false; error: string } {
  const o = (input ?? {}) as Record<string, unknown>;
  if (!isBaseClass(o.classId)) return { ok: false, error: "Choose one of the four classes." };
  if (typeof o.backgroundId !== "string" || !getBackground(o.backgroundId)) return { ok: false, error: "Choose a first memory." };
  if (typeof o.faithId !== "string" || !getFaith(o.faithId)) return { ok: false, error: "Choose a faith." };

  const rawAlloc = (o.alloc ?? {}) as Record<string, unknown>;
  const alloc = { ...EMPTY_ALLOCATION };
  for (const id of STAT_IDS) {
    const v = rawAlloc[id] ?? 0;
    if (typeof v !== "number") return { ok: false, error: "Invalid stat points." };
    alloc[id] = v;
  }
  const allocErr = allocationError(alloc);
  if (allocErr) return { ok: false, error: allocErr };

  const rawApp = (o.appearance ?? {}) as Record<string, unknown>;
  const appearance = { ...DEFAULT_APPEARANCE };
  for (const key of Object.keys(DEFAULT_APPEARANCE) as Array<keyof Appearance>) {
    const v = rawApp[key] ?? DEFAULT_APPEARANCE[key];
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= optionCount(key)) return { ok: false, error: "Invalid appearance." };
    appearance[key] = v as number;
  }

  return {
    ok: true,
    value: { name: sanitizeName(o.name), classId: o.classId, backgroundId: o.backgroundId, faithId: o.faithId, alloc, appearance },
  };
}
