/** Item database. Item instances in inventories just reference these by id. */

export type ItemKind = "weapon" | "armor" | "consumable" | "tool" | "material";

export type ItemUse =
  /** Restore a fraction of max HP. */
  | { type: "heal"; fraction: number }
  /** Restore a flat amount of class resource. Optionally turns into another item afterwards. */
  | { type: "restoreResource"; amount: number; becomes?: string };

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
}

const keepsake = (id: string, name: string, description: string, icon: string): ItemDef => ({
  id,
  name,
  kind: "material",
  description,
  stackable: false,
  icon,
});

const weapon = (id: string, name: string, description: string, icon: string, damageBonus = 1): ItemDef => ({
  id,
  name,
  kind: "weapon",
  description,
  stackable: false,
  damageBonus,
  icon,
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
  {
    id: "stale_bread",
    name: "Stale Bread",
    kind: "consumable",
    description: "Hard as a rock. Restores 25% health.",
    stackable: true,
    use: { type: "heal", fraction: 0.25 },
    icon: "🍞",
  },
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

  // --- Crude starter weapons, one per class ---
  weapon("rusty_shortsword", "Rusty Shortsword", "Pitted and dull, but it still has a point.", "🗡️"),
  weapon("dented_mace", "Dented Mace", "Someone used this on something very hard.", "🔨"),
  weapon("makeshift_bow", "Makeshift Bow", "Green wood and twisted gut. It'll do.", "🏹"),
  weapon("chipped_dagger", "Chipped Dagger", "Small, sharp enough, easy to hide.", "🔪"),
  weapon("cracked_wand", "Cracked Wand", "Still hums faintly when you hold it.", "🪄"),
  weapon("oak_cudgel", "Oak Cudgel", "A heavy stick with a carved prayer on it.", "🏏"),
  weapon("bone_fetish", "Bone Fetish", "Small bones bound with black thread.", "🦴"),
  weapon("gnarled_branch", "Gnarled Branch", "A branch that grew in a suspiciously useful shape.", "🌿"),
  weapon("hand_wraps", "Frayed Hand Wraps", "Linen wraps, stained from old fights.", "🥋"),
  weapon("battered_lute", "Battered Lute", "Three strings left. Two of them in tune.", "🪕"),
  weapon("tarnished_sigil", "Tarnished Sigil", "A coin-sized sigil that is always slightly warm.", "🔮"),
  weapon("splintered_spear", "Splintered Spear", "A fishing spear with ambitions.", "🔱"),
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
