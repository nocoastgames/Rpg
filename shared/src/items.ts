/** Item database. Item instances in inventories just reference these by id. */

import type { BaseClassId } from "./classes.ts";
import type { Stats } from "./stats.ts";

export type ItemKind = "weapon" | "armor" | "consumable" | "tool" | "material" | "book" | "ammo";

export type ItemUse =
  /** Food: restores a fraction of max HP over `seconds`. Only out of combat; fighting interrupts it. */
  | { type: "food"; fraction: number; seconds: number }
  /** Potion: restores a fraction of max HP at once. Works in combat (shared cooldown). */
  | { type: "potion"; fraction: number }
  /** Restore a flat amount of class resource. Optionally turns into another item afterwards. */
  | { type: "restoreResource"; amount: number; becomes?: string }
  /** Throw at the nearest enemy in range. */
  | { type: "throw"; damage: [number, number]; range: number }
  /**
   * A book: shows its text; the first reading teaches you something
   * (experience), and may tell of gods' epic quests (`reveals`: faith ids).
   */
  | { type: "read"; title: string; text: string[]; xp: number; reveals?: string[] }
  /** A map: reveals a region on your map for good. */
  | { type: "map"; region: string };

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  description: string;
  stackable: boolean;
  /** Bonus added to basic attack damage when equipped (weapons only). */
  damageBonus?: number;
  /** Damage reduction fraction when equipped (armor only). */
  armor?: number;
  use?: ItemUse;
  /** Icon hint for the UI (emoji for now, swap for sprite atlas later). */
  icon: string;
  /** What a merchant pays for one (0 or missing: they won't buy it). */
  value?: number;
  /** Base classes that can equip it (weapons, class armour). Missing: anyone. */
  classes?: readonly BaseClassId[];
  /** Attribute bonuses while equipped. */
  stats?: Partial<Stats>;
  /** Raw food: cook it at a campfire to get this item. */
  cooksInto?: string;
}

const keepsake = (id: string, name: string, description: string, icon: string): ItemDef => ({
  id,
  name,
  kind: "material",
  description,
  stackable: false,
  icon,
});

const weapon = (id: string, name: string, description: string, icon: string, damageBonus = 1, classes?: readonly BaseClassId[], value = 1): ItemDef => ({
  id,
  name,
  kind: "weapon",
  description,
  stackable: false,
  damageBonus,
  icon,
  classes,
  value,
});

const material = (id: string, name: string, description: string, icon: string, value: number, extra: Partial<ItemDef> = {}): ItemDef => ({
  id,
  name,
  kind: "material",
  description,
  stackable: true,
  icon,
  value,
  ...extra,
});

const food = (id: string, name: string, description: string, icon: string, fraction: number, seconds: number, value: number): ItemDef => ({
  id,
  name,
  kind: "consumable",
  description,
  stackable: true,
  use: { type: "food", fraction, seconds },
  icon,
  value,
});

const bodyArmor = (id: string, name: string, description: string, icon: string, armor: number, value: number, classes?: readonly BaseClassId[], stats?: Partial<Stats>): ItemDef => ({
  id,
  name,
  kind: "armor",
  description,
  stackable: false,
  armor,
  icon,
  value,
  classes,
  stats,
});

export const ITEMS: readonly ItemDef[] = [
  // --- Survival kit every character wakes up with ---
  {
    id: "tattered_clothes",
    name: "Tattered Clothes",
    kind: "armor",
    description: "Damp, torn and smelling of river mud. Better than nothing. Barely.",
    stackable: false,
    armor: 0.02,
    icon: "👕",
  },
  food("stale_bread", "Stale Bread", "Hard as a rock. Restores 25% health over 10 seconds. Not while fighting.", "🍞", 0.25, 10, 1),
  {
    id: "waterskin_empty",
    name: "Empty Waterskin",
    kind: "tool",
    description: "A leather waterskin. Fill it at the stream (F).",
    stackable: false,
    icon: "🫗",
  },
  {
    id: "waterskin_full",
    name: "Waterskin (Full)",
    kind: "consumable",
    description: "Cold stream water. Restores 30 of your class resource.",
    stackable: false,
    use: { type: "restoreResource", amount: 30, becomes: "waterskin_empty" },
    icon: "💧",
  },

  // --- Keepsakes: one per background. Clues to a past you don't remember. ---
  keepsake("whetstone", "Worn Whetstone", "Smooth from years of use. Your thumb knows exactly how to hold it.", "🪨"),
  keepsake("snare", "Wire Snare", "A loop of wire, expertly knotted. You don't remember learning the knot.", "🪢"),
  keepsake("torn_journal", "Torn Journal", "Most pages are water-stained. The handwriting looks oddly familiar.", "📓"),
  keepsake("prayer_beads", "Prayer Beads", "Worn smooth. Your fingers count them without being asked.", "📿"),
  keepsake("lockpick", "Bent Lockpick", "Hidden in your boot. Why would you need one of these?", "🗝️"),
  keepsake("hammer_charm", "Hammer Charm", "A tiny iron hammer on a cord, warm from your skin.", "🔨"),
  keepsake("coil_of_rope", "Coil of Rope", "Tarred and salt-stiff. Tied off with a knot you can't name.", "🪢"),
  keepsake("wanted_poster", "Wanted Poster", "Folded small and tucked away. The face is smudged, but it could be yours.", "📜"),
  keepsake("signet_ring", "Signet Ring", "Heavy gold with a crest you don't recognise. It fits perfectly.", "💍"),

  // --- Crude starter weapons, one per class (and the tools later paths carry) ---
  weapon("rusty_shortsword", "Rusty Shortsword", "Pitted and dull, but it still has a point.", "🗡️", 1, ["fighter"]),
  weapon("dented_mace", "Dented Mace", "Someone used this on something very hard.", "🔨"),
  weapon("makeshift_bow", "Makeshift Bow", "Green wood and twisted gut. It'll do.", "🏹"),
  weapon("chipped_dagger", "Chipped Dagger", "Small, sharp enough, easy to hide.", "🔪", 1, ["thief"]),
  weapon("cracked_wand", "Cracked Wand", "Still hums faintly when you hold it.", "🪄", 1, ["mage"]),
  weapon("oak_cudgel", "Oak Cudgel", "A heavy stick with a carved prayer on it.", "🏏", 1, ["priest"]),
  weapon("bone_fetish", "Bone Fetish", "Small bones bound with black thread.", "🦴"),
  weapon("gnarled_branch", "Gnarled Branch", "A branch that grew in a suspiciously useful shape.", "🌿"),
  weapon("hand_wraps", "Frayed Hand Wraps", "Linen wraps, stained from old fights.", "🥋"),
  weapon("battered_lute", "Battered Lute", "Three strings left. Two of them in tune.", "🪕"),
  weapon("tarnished_sigil", "Tarnished Sigil", "A coin-sized sigil that is always slightly warm.", "🔮"),
  weapon("splintered_spear", "Splintered Spear", "A fishing spear with ambitions.", "🔱"),

  // --- Rusty gear the dead of Ashford carried ---
  weapon("rusted_longsword", "Rusted Longsword", "A militia blade, red with rust. Heavier than it looks.", "🗡️", 2, ["fighter"], 6),
  weapon("rusted_flail", "Rusted Flail", "The chain still swings, if you don't mind the squeal.", "⛓️", 2, ["priest"], 6),
  weapon("rusted_dirk", "Rusted Dirk", "Long, thin and stained. Somebody's last resort.", "🔪", 2, ["thief"], 6),
  weapon("gravewood_wand", "Gravewood Wand", "Cut from the yew in Ashford's graveyard. It's cold.", "🪄", 2, ["mage"], 6),
  bodyArmor("moth_eaten_gambeson", "Moth-Eaten Gambeson", "Quilted padding, holed and musty. Turns a blade, mostly.", "🧥", 0.04, 5),

  // --- Upper-body armour: Haskel's reward, one for each calling ---
  bodyArmor("militia_brigandine", "Ashford Militia Brigandine", "Riveted plates sewn into leather. The village militia never got to wear it.", "🦺", 0.1, 20, ["fighter"], { vitality: 2 }),
  bodyArmor("hedge_robe", "Hedge-Wizard's Robe", "Deep blue wool stitched with faded stars. The pockets are full of chalk.", "🥻", 0.05, 20, ["mage"], { intellect: 2 }),
  bodyArmor("chapel_vestments", "Chapel Vestments", "White linen and a gold-thread stole, saved from Ashford's chapel.", "🥼", 0.07, 20, ["priest"], { spirit: 2 }),
  bodyArmor("poacher_leathers", "Poacher's Leathers", "Supple, dark and quiet. Every pocket is somewhere a knife fits.", "🧥", 0.07, 20, ["thief"], { agility: 2 }),

  // --- Haskel's wares ---
  food("trail_ration", "Trail Ration", "Hard tack, dried meat and a wrinkled apple. Restores 40% health over 12 seconds. Not while fighting.", "🥪", 0.4, 12, 1),
  {
    id: "healing_draught",
    name: "Healing Draught",
    kind: "consumable",
    description: "Bitter, red and expensive. Restores 40% health at once, even mid-fight.",
    stackable: true,
    use: { type: "potion", fraction: 0.4 },
    icon: "🧪",
    value: 8,
  },
  {
    id: "throwing_knife",
    name: "Throwing Knife",
    kind: "consumable",
    description: "Balanced for throwing. Hurls at the nearest enemy within 12 m.",
    stackable: true,
    use: { type: "throw", damage: [9, 14], range: 12 },
    icon: "🔪",
    value: 0,
  },
  {
    id: "arrows",
    name: "Arrows",
    kind: "ammo",
    description: "Fletched arrows. A bow shoots one per attack for +2 damage; without them you loose crude sticks.",
    stackable: true,
    icon: "➶",
    value: 0,
  },
  {
    id: "valley_map",
    name: "Map of the Valley",
    kind: "tool",
    description: "Haskel's own map, inked over twenty years of visits. Shows the whole valley.",
    stackable: false,
    use: { type: "map", region: "valley" },
    icon: "🗺️",
    value: 3,
  },
  {
    id: "book_bestiary",
    name: "A Peddler's Bestiary",
    kind: "book",
    description: "Haskel's notes on what lives in the valley. Read it (use).",
    stackable: false,
    icon: "📕",
    value: 2,
    use: {
      type: "read",
      title: "A Peddler's Bestiary",
      xp: 60,
      text: [
        "Boars: Mind the tusks. They will leave you be if you leave them be. Good hides, better bacon.",
        "Wolves: Never one alone. A bite bleeds long after the wolf is gone; bind it or pray it closed.",
        "Spiders of the Hollow: as big as a dog and twice as patient. Their bite sickens. The silk fetches a fair price downriver.",
        "Thornlings: I never saw these before last year. Little men of bark and briar near the cave. A scratch leaves you weak and slow-handed. Stay away.",
        "Hares: harmless, quick, and the best stew in the valley.",
      ],
    },
  },
  {
    id: "book_hymns",
    name: "Hymns of the Ten",
    kind: "book",
    description: "A cheap printed hymnal, one hymn for each god (and a blank page for the Faithless). Read it (use).",
    stackable: false,
    icon: "📘",
    value: 2,
    use: {
      type: "read",
      title: "Hymns of the Ten",
      xp: 60,
      text: [
        "Solenne mends, Valdris guards, the Green Mother grows. Orren knows the way, Mirevel keeps the count, the Ferryman keeps the dead.",
        "Kaelthar hungers, the Veiled One watches, and the Rot Below waits.",
        "\"Speak, and the Ten will answer, each in their hour. Kneel at the stone and be known.\"",
        "A margin note in pencil: why do all the shrines have eight sides?",
      ],
    },
  },

  // --- What the valley's creatures leave behind ---
  material("boar_hide", "Boar Hide", "Thick and bristly. Tanners pay for these.", "🟫", 3),
  material("boar_meat", "Raw Boar Meat", "Cook it at a campfire (use near the fire).", "🥩", 1, { cooksInto: "roast_boar" }),
  food("roast_boar", "Roast Boar", "Crackling and juicy. Restores 50% health over 10 seconds. Not while fighting.", "🍖", 0.5, 10, 2),
  material("wolf_pelt", "Wolf Pelt", "Grey fur, warm and only a little bloody.", "🐺", 3),
  material("hare_meat", "Raw Hare", "Cook it at a campfire (use near the fire).", "🍗", 1, { cooksInto: "roast_hare" }),
  food("roast_hare", "Roast Hare", "Lean and smoky. Restores 35% health over 10 seconds. Not while fighting.", "🍗", 0.35, 10, 2),
  material("spider_silk", "Spider Silk", "A sticky skein, strong as wire.", "🕸️", 2),
  material("wasp_stinger", "Wasp Stinger", "As long as your finger, still beaded with venom.", "🐝", 2),
  material("rat_tail", "Rat Tail", "Bald and horrible. Someone pays a bounty on these, surely.", "🐀", 1),
  material("snake_skin", "Adder Skin", "A shed black skin with a zigzag down the back.", "🐍", 3),
  material("toad_slime", "Toad Slime", "Bottled, it's a salve. Unbottled, it's on your hands.", "🐸", 2),
  material("deer_hide", "Deer Hide", "Soft and supple. A good hide for gloves.", "🦌", 4),
  material("antler", "Stag Antler", "Heavy and many-pointed. Carvers love these.", "🦌", 7),
  material("venison", "Raw Venison", "Cook it at a campfire (use near the fire).", "🥩", 2, { cooksInto: "roast_venison" }),
  food("roast_venison", "Roast Venison", "Rich and dark. Restores 60% health over 10 seconds. Not while fighting.", "🍖", 0.6, 10, 3),
  material("thorn_splinter", "Black Thorn", "A splinter of the black thorns. It's warm, and it twitches.", "🥀", 2),
  material("old_bones", "Old Bones", "Yellowed bones. A bonemeal-maker might want them.", "🦴", 1),
  material("grave_shroud", "Grave Shroud", "Strips of burial linen, mud-stained.", "🧻", 1),
  material("tarnished_locket", "Tarnished Locket", "A cheap locket. Inside, a tiny painted face.", "📿", 8),
];

const ITEM_MAP = new Map<string, ItemDef>(ITEMS.map((i) => [i.id, i]));

export function getItem(id: string): ItemDef | undefined {
  return ITEM_MAP.get(id);
}

/** Inventory every new character wakes up with (in addition to their equipped starter weapon + clothes). */
export const STARTING_INVENTORY: ReadonlyArray<{ id: string; qty: number }> = [
  { id: "stale_bread", qty: 1 },
  { id: "waterskin_empty", qty: 1 },
];

export const STARTING_ARMOR = "tattered_clothes";

/** Can a character of this base class equip the item? */
export function canEquip(item: ItemDef, baseClass: string): boolean {
  return (item.kind === "weapon" || item.kind === "armor") && (!item.classes || item.classes.includes(baseClass as BaseClassId));
}
