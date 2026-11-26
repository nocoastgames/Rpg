/**
 * Class progression tree.
 *
 *   Level 1   pick one of 4 base classes       Fighter · Mage · Priest · Thief
 *   Level 10  choose 1 of 2 paths              (8 in total)
 *   Level 25  choose 1 of 2 specialisations    (16)  - needs the Trial of Paths
 *   Level 50  choose 1 of 2 end classes        (32)  - needs the Trial of Mastery
 *
 * Each base has 8 end classes: 5 pure and 3 hybrids (one with each other
 * base). Every pair of bases has exactly two hybrids, one reached from each
 * side.
 *
 * Pets: each base has two pet classes on separate lines with different
 * creatures - one traditionally good, one evil (e.g. the Falconer and her
 * war falcon vs the Plaguebringer and his rats). Their level-25 specialisation
 * is a pet line that brings a young companion at 25; at 50 the pet class turns
 * it into something far stronger, while the line's other end class takes a
 * familiar instead. Every other end class also gains a familiar at 50.
 *
 * Choices are permanent (a lineage system will allow changes later).
 * Each node grants one ability; a character keeps every ability on its path,
 * so a level-50 character has 4 abilities plus a basic attack.
 */
import type { AbilityDef, AbilityEffect, BasicAttackDef } from "./abilities.ts";
import type { ResourceType, StatId, Stats } from "./stats.ts";

export type BaseClassId = "fighter" | "mage" | "priest" | "thief";
export type Tier = 1 | 2 | 3 | 4;
export type Role = "Tank" | "Melee DPS" | "Ranged DPS" | "Caster" | "Healer" | "Support" | "Summoner" | "Hybrid";

export const TIER_LEVELS: Record<Tier, number> = { 1: 1, 2: 10, 3: 25, 4: 50 };

/** Gate quests required before advancing to tiers 3 and 4 (none for tier 2). */
export const GATE_QUESTS: Partial<Record<Tier, { id: string; name: string }>> = {
  3: { id: "trial_of_paths", name: "Trial of Paths" },
  4: { id: "trial_of_mastery", name: "Trial of Mastery" },
};

/** Visual/behaviour archetype of a companion. */
export type CompanionKind =
  | "hound"
  | "wolf"
  | "bear"
  | "boar"
  | "drake"
  | "cat"
  | "rat"
  | "hawk"
  | "raven"
  | "owl"
  | "dove"
  | "crane"
  | "parrot"
  | "songbird"
  | "phoenix"
  | "wisp"
  | "skeleton"
  | "wraith"
  | "ancestor"
  | "treant"
  | "demon";

export interface CompanionDef {
  kind: CompanionKind;
  name: string;
  color: string;
  /** Size multiplier for the model. */
  scale?: number;
}

/**
 * How strong a companion is: pet lines get a young "pet" at 25, pet classes an
 * "empowered" companion at 50 (several times stronger), everyone else a "familiar" at 50.
 */
export type CompanionPower = "familiar" | "pet" | "empowered";

export type Alignment = "good" | "evil";

/**
 * Moral leaning of a class. Set on the classes where a path turns toward the
 * light or the dark (and back); a character's alignment is the deepest one set
 * on their path, neutral otherwise. Used for faith blessings.
 */
export type ClassAlignment = "good" | "neutral" | "evil";

export interface BaseClassDef {
  id: BaseClassId;
  resource: ResourceType;
  primaryStat: StatId;
  baseStats: Stats;
  /** Stats gained per level. */
  growth: Partial<Stats>;
  basicAttack: BasicAttackDef;
  starterWeapon: string;
}

export interface ClassNode {
  id: string;
  name: string;
  tier: Tier;
  base: BaseClassId;
  parent: string | null;
  role: Role;
  tagline: string;
  description: string;
  color: string;
  /** Flat stats added when this class is taken. */
  statBonus: Partial<Stats>;
  /** Ability learned at this tier (ability slot = tier - 1). */
  ability: AbilityDef;
  /** Replaces the basic attack from this tier on (e.g. Woodsmen switch to bows). */
  basicAttack?: BasicAttackDef;
  /** End classes only: the second base this hybrid blends in. */
  hybrid?: BaseClassId;
  /** Tier 3 only: brings a young companion at level 25 and leads to a pet class. */
  petLine?: boolean;
  /** Where this class turns the path's alignment (inherited by everything below it). */
  alignment?: ClassAlignment;
  /** Tier 4 only: a pet class, and whether it is the base's good or evil one. */
  pet?: Alignment;
  /** Tier 3 pet lines: the young companion. Tier 4: the familiar, or the pet class's empowered companion. */
  companion?: CompanionDef;
}

// ---------------------------------------------------------------------------
// Builders (keep the tree readable)
// ---------------------------------------------------------------------------

const s = (might: number, agility: number, intellect: number, vitality: number, spirit: number): Stats => ({
  might,
  agility,
  intellect,
  vitality,
  spirit,
});

function ability(id: string, name: string, description: string, cost: number, cooldown: number, range: number, effect: AbilityEffect): AbilityDef {
  return { id, name, description, cost, cooldown, range, effect };
}
const strike = (multiplier: number, radius = 0, lifesteal?: number): AbilityEffect => ({ type: "strike", multiplier, radius, lifesteal });
const nova = (multiplier: number, radius: number): AbilityEffect => ({ type: "nova", multiplier, radius });
const heal = (fraction: number, radius: number): AbilityEffect => ({ type: "heal", fraction, radius });
const dash = (distance: number, multiplier = 0, radius = 0): AbilityEffect => ({ type: "dash", distance, multiplier, radius });
const buff = (stat: "damage" | "speed" | "armor", amount: number, duration: number, radius = 0): AbilityEffect => ({ type: "buff", stat, amount, duration, radius });

const BOW: BasicAttackDef = { kind: "ranged", range: 14, damage: [5, 9], cooldown: 0.85, projectile: "arrow" };

type NodeInput = Omit<ClassNode, "tier" | "base" | "parent">;

const NODES: ClassNode[] = [];

function node(base: BaseClassId, tier: Tier, parent: string | null, n: NodeInput): string {
  NODES.push({ ...n, tier, base, parent });
  return n.id;
}

// ---------------------------------------------------------------------------
// Base classes
// ---------------------------------------------------------------------------

export const BASE_CLASSES: Record<BaseClassId, BaseClassDef> = {
  fighter: {
    id: "fighter",
    resource: "rage",
    primaryStat: "might",
    baseStats: s(14, 9, 4, 13, 5),
    growth: { might: 2, vitality: 2, agility: 1 },
    basicAttack: { kind: "melee", range: 2.2, damage: [6, 10], cooldown: 0.9 },
    starterWeapon: "rusty_shortsword",
  },
  mage: {
    id: "mage",
    resource: "mana",
    primaryStat: "intellect",
    baseStats: s(4, 7, 16, 8, 10),
    growth: { intellect: 3, spirit: 1 },
    basicAttack: { kind: "ranged", range: 12, damage: [5, 9], cooldown: 1.0, projectile: "bolt" },
    starterWeapon: "cracked_wand",
  },
  priest: {
    id: "priest",
    resource: "faith",
    primaryStat: "spirit",
    baseStats: s(8, 6, 8, 11, 15),
    growth: { spirit: 3, vitality: 1 },
    basicAttack: { kind: "ranged", range: 10, damage: [4, 7], cooldown: 1.0, projectile: "orb" },
    starterWeapon: "oak_cudgel",
  },
  thief: {
    id: "thief",
    resource: "energy",
    primaryStat: "agility",
    baseStats: s(8, 15, 7, 9, 6),
    growth: { agility: 3, might: 1 },
    basicAttack: { kind: "melee", range: 2.0, damage: [4, 7], cooldown: 0.6 },
    starterWeapon: "chipped_dagger",
  },
};

// ===========================================================================
// FIGHTER — strength, steel and grit
//   Warrior:  Knight (Paladin*, Juggernaut) · Woodsman [good pet line] (Beastlord, Ranger*)
//   Marauder: Berserker (Warlord, Bloodreaver) · Dark Knight [evil pet line] (Death Knight, Shadow Knight*)
// ===========================================================================
{
  const B = "fighter";
  const root = node(B, 1, null, {
    id: "fighter",
    name: "Fighter",
    role: "Melee DPS",
    tagline: "Steel in hand, back to the wall",
    description: "Trusts muscle, armour and a sharp edge. Builds rage by trading blows.",
    color: "#b5452f",
    statBonus: {},
    ability: ability("heavy_blow", "Heavy Blow", "A slow, crushing swing at one enemy.", 10, 4, 2.5, strike(1.6)),
  });

  const warrior = node(B, 2, root, {
    id: "warrior",
    name: "Warrior",
    role: "Melee DPS",
    tagline: "Master of arms",
    description: "A disciplined soldier: shield and sword in the line, or bow and axe in the wilds.",
    color: "#a8402c",
    statBonus: { might: 2, vitality: 2 },
    ability: ability("cleave", "Cleave", "A wide swing that hits every enemy in front of you.", 15, 5, 2.5, strike(1.3, 2.2)),
  });
  const knight = node(B, 3, warrior, {
    id: "knight",
    alignment: "good",
    name: "Knight",
    role: "Tank",
    tagline: "Shield and oath",
    description: "A sworn protector who stands between allies and harm.",
    color: "#8c95a0",
    statBonus: { vitality: 4, spirit: 1 },
    ability: ability("shield_wall", "Shield Wall", "Take 50% less damage for 6 seconds.", 20, 18, 0, buff("armor", 0.5, 6)),
  });
  node(B, 4, knight, {
    id: "paladin",
    alignment: "good",
    name: "Paladin",
    role: "Tank",
    tagline: "Holy steel",
    description: "A knight whose oath is answered by the light. Shields allies and heals them.",
    color: "#d8b54a",
    hybrid: "priest",
    statBonus: { vitality: 4, spirit: 4 },
    ability: ability("lay_on_hands", "Lay on Hands", "Heal yourself and nearby allies for 40% of maximum health.", 30, 25, 0, heal(0.4, 7)),
    companion: { kind: "wisp", name: "Light Wisp", color: "#ffe08a" },
  });
  node(B, 4, knight, {
    id: "juggernaut",
    alignment: "good",
    name: "Juggernaut",
    role: "Tank",
    tagline: "Nothing stops me",
    description: "Plate, shield and stubbornness. Shrugs off blows that would fell anyone else.",
    color: "#7a7e86",
    statBonus: { vitality: 7, might: 2 },
    ability: ability("unstoppable", "Unstoppable", "Take 55% less damage for 8 seconds.", 25, 22, 0, buff("armor", 0.55, 8)),
    companion: { kind: "boar", name: "Iron Boar", color: "#6a6460" },
  });
  const woodsman = node(B, 3, warrior, {
    id: "woodsman",
    name: "Woodsman",
    role: "Ranged DPS",
    tagline: "The forest is home",
    description: "A tracker and archer who takes to the bow. A wolf pup joins you at level 25.",
    color: "#4f8a3a",
    petLine: true,
    statBonus: { agility: 4 },
    basicAttack: BOW,
    ability: ability("aimed_shot", "Aimed Shot", "A careful shot that hits hard at long range.", 20, 7, 16, strike(2.0)),
    companion: { kind: "wolf", name: "Wolf Pup", color: "#9a9aa0", scale: 0.75 },
  });
  node(B, 4, woodsman, {
    id: "beastlord",
    alignment: "good",
    name: "Beastlord",
    role: "Summoner",
    tagline: "Guardian of the wild",
    description: "Your wolf grows into a great alpha, sworn protector of forest and folk. You fight as one.",
    color: "#7a8a4a",
    pet: "good",
    statBonus: { vitality: 4, might: 4 },
    ability: ability("pack_fury", "Pack Fury", "You and nearby allies deal 35% more damage for 10 seconds.", 30, 22, 0, buff("damage", 0.35, 10, 10)),
    companion: { kind: "wolf", name: "Alpha Wolf", color: "#c8c8cc", scale: 1.6 },
  });
  node(B, 4, woodsman, {
    id: "ranger",
    name: "Ranger",
    role: "Ranged DPS",
    tagline: "Gone before you see me",
    description: "A woodsman who learned a thief's tricks. Shoots, slips away, shoots again.",
    color: "#3f7a3a",
    hybrid: "thief",
    statBonus: { agility: 6, might: 2 },
    ability: ability("fade_step", "Fade Step", "Dart through the undergrowth, striking where you land.", 25, 8, 8, dash(7, 1.4, 2)),
    companion: { kind: "cat", name: "Red Fox", color: "#c8642a", scale: 0.9 },
  });

  const marauder = node(B, 2, root, {
    id: "marauder",
    alignment: "evil",
    name: "Marauder",
    role: "Melee DPS",
    tagline: "Take what you can",
    description: "Fights without mercy or rules, and finds power in darker places.",
    color: "#8a2a24",
    statBonus: { might: 3, vitality: 1 },
    ability: ability("rampage", "Rampage", "A frenzied spin that hits everything around you.", 15, 6, 0, nova(1.3, 2.5)),
  });
  const berserker = node(B, 3, marauder, {
    id: "berserker",
    alignment: "neutral",
    name: "Berserker",
    role: "Melee DPS",
    tagline: "Fury unchained",
    description: "Trades caution for overwhelming violence.",
    color: "#c0392b",
    statBonus: { might: 4 },
    ability: ability("bloodfury", "Bloodfury", "Deal 40% more damage for 6 seconds.", 20, 18, 0, buff("damage", 0.4, 6)),
  });
  node(B, 4, berserker, {
    id: "warlord",
    alignment: "neutral",
    name: "Warlord",
    role: "Melee DPS",
    tagline: "Where I stand, the line holds",
    description: "A battlefield commander whose war cries drive allies into a frenzy.",
    color: "#d4442e",
    statBonus: { might: 5, vitality: 3 },
    ability: ability("rallying_cry", "Rallying Cry", "You and nearby allies deal 30% more damage for 10 seconds.", 30, 25, 0, buff("damage", 0.3, 10, 10)),
    companion: { kind: "hound", name: "War Hound", color: "#7a5a3a" },
  });
  node(B, 4, berserker, {
    id: "bloodreaver",
    alignment: "evil",
    name: "Bloodreaver",
    role: "Melee DPS",
    tagline: "Every wound feeds me",
    description: "Drinks the life of every foe struck. The more blood, the harder to kill.",
    color: "#9a1a2a",
    statBonus: { might: 5, vitality: 3 },
    ability: ability("blood_frenzy", "Blood Frenzy", "A savage strike that heals you for 40% of the damage.", 30, 8, 2.5, strike(2.4, 0, 0.4)),
    companion: { kind: "raven", name: "Carrion Crow", color: "#1e1a1e" },
  });
  const darkKnight = node(B, 3, marauder, {
    id: "dark_knight",
    alignment: "evil",
    name: "Dark Knight",
    role: "Tank",
    tagline: "An oath to darker things",
    description: "Swears to powers that should not be served. A nightmare hound stalks at your side from level 25.",
    color: "#4a2a4a",
    petLine: true,
    statBonus: { vitality: 3, intellect: 2 },
    ability: ability("soul_rend", "Soul Rend", "Rip at an enemy's soul, healing yourself for 40% of the damage.", 25, 8, 3, strike(1.8, 0, 0.4)),
    companion: { kind: "hound", name: "Nightmare Hound", color: "#3a1c24" },
  });
  node(B, 4, darkKnight, {
    id: "death_knight",
    alignment: "evil",
    name: "Death Knight",
    role: "Summoner",
    tagline: "Death rides with me",
    description: "Your hound returns from the grave as a hellhound wreathed in black fire.",
    color: "#3a2a3a",
    pet: "evil",
    statBonus: { might: 4, vitality: 4 },
    ability: ability("unholy_blight", "Unholy Blight", "A wave of death magic bursts around you.", 30, 9, 0, nova(2.0, 4)),
    companion: { kind: "hound", name: "Hellhound", color: "#5a1a14", scale: 1.5 },
  });
  node(B, 4, darkKnight, {
    id: "shadow_knight",
    alignment: "evil",
    name: "Shadow Knight",
    role: "Tank",
    tagline: "Steel and sorcery",
    description: "A dark knight who studied forbidden magic. Shadow-edged swings tear through groups.",
    color: "#4a3a6a",
    hybrid: "mage",
    statBonus: { vitality: 3, intellect: 5 },
    ability: ability("shadow_cleave", "Shadow Cleave", "A shadow-wreathed swing through everything in front of you.", 30, 8, 3, strike(2.2, 2.5)),
    companion: { kind: "wisp", name: "Void Wisp", color: "#8a5aff" },
  });
}

// ===========================================================================
// MAGE — study, will and forbidden knowledge
//   Arcanist:  Elementalist (Archmage, Spellblade*) · Conjurer [good pet line] (Phoenix Caller, Illusionist*)
//   Occultist: Necromancer [evil pet line] (Lich, Deathspeaker*) · Warlock (Voidcaller, Hexmaster)
// ===========================================================================
{
  const B = "mage";
  const root = node(B, 1, null, {
    id: "mage",
    name: "Mage",
    role: "Caster",
    tagline: "Knowledge is power",
    description: "A scholar of the arcane, fragile but devastating at range.",
    color: "#3f5fc4",
    statBonus: {},
    ability: ability("arcane_missile", "Arcane Missile", "A bolt of raw force at one enemy.", 12, 4, 12, strike(1.6)),
  });

  const arcanist = node(B, 2, root, {
    id: "arcanist",
    name: "Arcanist",
    role: "Caster",
    tagline: "The pure art",
    description: "Masters the fundamental forces: the elements, and the spirits that live in them.",
    color: "#4a6ad8",
    statBonus: { intellect: 3, spirit: 1 },
    ability: ability("blink", "Blink", "Teleport a short distance.", 15, 8, 8, dash(8)),
  });
  const elementalist = node(B, 3, arcanist, {
    id: "elementalist",
    name: "Elementalist",
    role: "Caster",
    tagline: "Fire, frost and storm",
    description: "Bends the elements into explosive area damage.",
    color: "#d8642a",
    statBonus: { intellect: 4 },
    ability: ability("fireball", "Fireball", "Hurl an exploding ball of fire.", 25, 6, 14, strike(2.0, 3)),
  });
  node(B, 4, elementalist, {
    id: "archmage",
    name: "Archmage",
    role: "Caster",
    tagline: "The sky falls at my word",
    description: "The pinnacle of elemental magic.",
    color: "#5a7aff",
    statBonus: { intellect: 8 },
    ability: ability("meteor", "Meteor", "Call down a burning star on an area.", 45, 16, 16, strike(3.0, 5)),
    companion: { kind: "wisp", name: "Arcane Wisp", color: "#7fa0ff" },
  });
  node(B, 4, elementalist, {
    id: "spellblade",
    name: "Spellblade",
    role: "Melee DPS",
    tagline: "The blade is the spell",
    description: "A mage who wraps steel in fire and fights up close.",
    color: "#c8502a",
    hybrid: "fighter",
    statBonus: { intellect: 4, might: 4 },
    basicAttack: { kind: "melee", range: 2.3, damage: [8, 12], cooldown: 0.85 },
    ability: ability("arcane_edge", "Arcane Edge", "A burst of blazing steel around you.", 30, 8, 0, nova(1.9, 3.5)),
    companion: { kind: "wisp", name: "Flame Sprite", color: "#ff8a3a" },
  });
  const conjurer = node(B, 3, arcanist, {
    id: "conjurer",
    alignment: "good",
    name: "Conjurer",
    role: "Summoner",
    tagline: "Something answers",
    description: "Calls spirits of light and illusion. A firebird hatchling answers you at level 25.",
    color: "#e0904a",
    petLine: true,
    statBonus: { intellect: 3, spirit: 2 },
    ability: ability("binding_circle", "Binding Circle", "A circle of runes flares and burns everything inside it.", 25, 8, 12, strike(1.8, 3)),
    companion: { kind: "phoenix", name: "Firebird Hatchling", color: "#ffa040", scale: 0.8 },
  });
  node(B, 4, conjurer, {
    id: "phoenix_caller",
    alignment: "good",
    name: "Phoenix Caller",
    role: "Summoner",
    tagline: "From the ashes",
    description: "Your firebird becomes a phoenix of living sunfire that guards the faithful and burns the wicked.",
    color: "#ff9a2a",
    pet: "good",
    statBonus: { intellect: 5, spirit: 3 },
    ability: ability("sunfire", "Sunfire", "A column of holy flame falls on an area.", 35, 9, 14, strike(2.4, 4)),
    companion: { kind: "phoenix", name: "Phoenix", color: "#ff8a1a", scale: 1.6 },
  });
  node(B, 4, conjurer, {
    id: "illusionist",
    alignment: "neutral",
    name: "Illusionist",
    role: "Caster",
    tagline: "You never saw me",
    description: "Blends magic with a thief's misdirection. Strikes from where it isn't.",
    color: "#b06ad8",
    hybrid: "thief",
    statBonus: { intellect: 4, agility: 4 },
    ability: ability("mirror_step", "Mirror Step", "Vanish and reappear, shattering illusions on enemies nearby.", 30, 9, 8, dash(8, 1.5, 2.5)),
    companion: { kind: "wisp", name: "Mirror Sprite", color: "#e0b0ff" },
  });

  const occultist = node(B, 2, root, {
    id: "occultist",
    alignment: "evil",
    name: "Occultist",
    role: "Caster",
    tagline: "What others fear to learn",
    description: "Studies death, curses and the things beyond the veil.",
    color: "#5a3a7a",
    statBonus: { intellect: 3, vitality: 1 },
    ability: ability("drain_life", "Drain Life", "Rip life from an enemy, healing yourself for half the damage.", 18, 6, 10, strike(1.3, 0, 0.5)),
  });
  const necromancer = node(B, 3, occultist, {
    id: "necromancer",
    name: "Necromancer",
    role: "Summoner",
    tagline: "The dead remember",
    description: "Commands bone and the border between life and death. Raises a skeletal servant at level 25.",
    color: "#6b3f8f",
    petLine: true,
    statBonus: { intellect: 3, vitality: 1 },
    ability: ability("bone_spear", "Bone Spear", "Launch a jagged spear of bone at long range.", 25, 7, 16, strike(2.2)),
    companion: { kind: "skeleton", name: "Skeletal Servant", color: "#d8d0b8" },
  });
  node(B, 4, necromancer, {
    id: "lich",
    name: "Lich",
    role: "Summoner",
    tagline: "Death is a door",
    description: "Has stepped through death and back, and commands a skeletal champion. Waves of grave-cold follow.",
    color: "#4a6a7a",
    pet: "evil",
    statBonus: { intellect: 6, vitality: 2 },
    ability: ability("death_nova", "Death Nova", "A wave of grave-cold bursts out around you.", 35, 9, 0, nova(1.9, 5)),
    companion: { kind: "skeleton", name: "Skeletal Champion", color: "#e8e2cc", scale: 1.3 },
  });
  node(B, 4, necromancer, {
    id: "deathspeaker",
    alignment: "neutral",
    name: "Deathspeaker",
    role: "Healer",
    tagline: "The dead and the divine",
    description: "Speaks to spirits on both sides of death. Last rites mend the living.",
    color: "#7a8a9a",
    hybrid: "priest",
    statBonus: { intellect: 4, spirit: 4 },
    ability: ability("last_rites", "Last Rites", "Heal yourself and nearby allies for 30% of maximum health.", 30, 18, 0, heal(0.3, 8)),
    companion: { kind: "wraith", name: "Bound Wraith", color: "#9fb4c8" },
  });
  const warlock = node(B, 3, occultist, {
    id: "warlock",
    name: "Warlock",
    role: "Caster",
    tagline: "Power has a price",
    description: "Bound by a pact. Curses and rifts tear enemies apart.",
    color: "#3d8f7a",
    statBonus: { intellect: 4 },
    ability: ability("curse_of_agony", "Curse of Agony", "A spreading curse damages everything in an area.", 25, 8, 12, strike(1.7, 3.5)),
  });
  node(B, 4, warlock, {
    id: "voidcaller",
    name: "Voidcaller",
    role: "Caster",
    tagline: "Gaze into the abyss",
    description: "Opens rifts to the void, unleashing raw destruction.",
    color: "#4a2a6a",
    statBonus: { intellect: 8 },
    ability: ability("void_rift", "Void Rift", "Tear open a rift that crushes everything nearby.", 40, 12, 12, strike(2.6, 4)),
    companion: { kind: "wisp", name: "Void Eye", color: "#8a4aff" },
  });
  node(B, 4, warlock, {
    id: "hexmaster",
    name: "Hexmaster",
    role: "Caster",
    tagline: "Every curse, perfected",
    description: "A master of single, devastating hexes.",
    color: "#2a6a5a",
    statBonus: { intellect: 6, spirit: 2 },
    ability: ability("hex", "Hex", "A ruinous curse on one enemy that feeds you its life.", 35, 9, 14, strike(2.8, 0, 0.3)),
    companion: { kind: "raven", name: "Hex Raven", color: "#2a2a34" },
  });
}

// ===========================================================================
// PRIEST — faith, nature and the spirit world
//   Cleric: Lifebinder (Saint, Oracle) · Monk (Grandmaster*, Ascendant*)
//   Druid:  Wildcaller [good pet line] (Archdruid, Primalist) · Shaman [evil pet line] (Witch Doctor, Tempest*)
// ===========================================================================
{
  const B = "priest";
  const root = node(B, 1, null, {
    id: "priest",
    name: "Priest",
    role: "Healer",
    tagline: "Faith is a shield",
    description: "Channels faith to mend allies and smite the wicked.",
    color: "#d8c27a",
    statBonus: {},
    ability: ability("mend", "Mend", "Heal yourself and nearby allies for 25% of maximum health.", 20, 8, 0, heal(0.25, 5)),
  });

  const cleric = node(B, 2, root, {
    id: "cleric",
    alignment: "good",
    name: "Cleric",
    role: "Healer",
    tagline: "Servant of the light",
    description: "Devoted to the old gods, in temple and in battle.",
    color: "#e8e2c8",
    statBonus: { spirit: 3, vitality: 1 },
    ability: ability("smite", "Smite", "Call down holy fire on an area.", 20, 6, 12, strike(1.8, 2)),
  });
  const lifebinder = node(B, 3, cleric, {
    id: "lifebinder",
    name: "Lifebinder",
    role: "Healer",
    tagline: "None fall on my watch",
    description: "A dedicated healer.",
    color: "#f2e6a8",
    statBonus: { spirit: 4 },
    ability: ability("sanctuary", "Sanctuary", "Heal yourself and nearby allies for 35% of maximum health.", 30, 18, 0, heal(0.35, 9)),
  });
  node(B, 4, lifebinder, {
    id: "saint",
    name: "Saint",
    role: "Healer",
    tagline: "A living miracle",
    description: "The greatest healer of all. Can pull a whole party back from the brink.",
    color: "#fff2c0",
    statBonus: { spirit: 8 },
    ability: ability("miracle", "Miracle", "Heal yourself and nearby allies for 70% of maximum health.", 50, 40, 0, heal(0.7, 10)),
    companion: { kind: "dove", name: "White Dove", color: "#f4f4f0" },
  });
  node(B, 4, lifebinder, {
    id: "oracle",
    name: "Oracle",
    role: "Support",
    tagline: "I have seen this already",
    description: "Glimpses the next moment and shields allies from it.",
    color: "#c8b0f0",
    statBonus: { spirit: 5, intellect: 3 },
    ability: ability("foresight", "Foresight", "You and nearby allies take 40% less damage for 8 seconds.", 35, 24, 0, buff("armor", 0.4, 8, 10)),
    companion: { kind: "owl", name: "Seer Owl", color: "#e8e0d0" },
  });
  const monk = node(B, 3, cleric, {
    id: "monk",
    alignment: "neutral",
    name: "Monk",
    role: "Melee DPS",
    tagline: "The body is the temple",
    description: "Turns discipline into speed and strength. Fights barehanded.",
    color: "#d07a2c",
    statBonus: { agility: 3, might: 2 },
    basicAttack: { kind: "melee", range: 2.0, damage: [5, 8], cooldown: 0.55 },
    ability: ability("flying_kick", "Flying Kick", "Leap at a target, striking on landing.", 25, 7, 7, dash(7, 1.4, 1.8)),
  });
  node(B, 4, monk, {
    id: "grandmaster",
    name: "Grandmaster",
    role: "Tank",
    tagline: "Unbreakable",
    description: "A monk with a soldier's iron. Parries, counters and refuses to fall.",
    color: "#b86a2a",
    hybrid: "fighter",
    statBonus: { might: 4, vitality: 4 },
    ability: ability("hundred_palms", "Hundred Palms", "A blinding flurry of strikes on one enemy.", 35, 9, 2.5, strike(3.0)),
    companion: { kind: "crane", name: "Red-crowned Crane", color: "#f0f0ea" },
  });
  node(B, 4, monk, {
    id: "ascendant",
    name: "Ascendant",
    role: "Melee DPS",
    tagline: "Swift as the gale",
    description: "A monk with a thief's lightness. Untouchable, everywhere at once.",
    color: "#e09a4a",
    hybrid: "thief",
    statBonus: { agility: 6, spirit: 2 },
    ability: ability("cyclone_kick", "Cyclone Kick", "A spinning kick that strikes all nearby enemies.", 30, 8, 0, nova(1.8, 4)),
    companion: { kind: "wisp", name: "Wind Sprite", color: "#c8f0d8" },
  });

  const druid = node(B, 2, root, {
    id: "druid",
    name: "Druid",
    role: "Hybrid",
    tagline: "The old ways",
    description: "Faith in the land itself: root, beast, storm and spirit.",
    color: "#7a5a2e",
    statBonus: { spirit: 2, intellect: 1, vitality: 1 },
    ability: ability("thornlash", "Thornlash", "Thorned vines erupt beneath a target.", 15, 5, 10, strike(1.6)),
  });
  const wildcaller = node(B, 3, druid, {
    id: "wildcaller",
    alignment: "good",
    name: "Wildcaller",
    role: "Healer",
    tagline: "The forest provides",
    description: "Tends the living wild. A young treant sapling follows you from level 25.",
    color: "#5a8a4a",
    petLine: true,
    statBonus: { spirit: 3, vitality: 1 },
    ability: ability("rejuvenation", "Rejuvenation", "Heal yourself and nearby allies for 30% of maximum health.", 25, 14, 0, heal(0.3, 8)),
    companion: { kind: "treant", name: "Treant Sapling", color: "#6a5a36", scale: 0.7 },
  });
  node(B, 4, wildcaller, {
    id: "archdruid",
    name: "Archdruid",
    role: "Summoner",
    tagline: "Voice of the grove",
    description: "Your sapling grows into an ancient treant guardian, and you mend the land and its people.",
    color: "#4a7a3a",
    pet: "good",
    statBonus: { spirit: 6, vitality: 2 },
    ability: ability("tranquility", "Tranquility", "Heal yourself and nearby allies for 50% of maximum health.", 40, 28, 0, heal(0.5, 10)),
    companion: { kind: "treant", name: "Ancient Treant", color: "#5a4a2e", scale: 1.4 },
  });
  node(B, 4, wildcaller, {
    id: "primalist",
    alignment: "neutral",
    name: "Primalist",
    role: "Tank",
    tagline: "Claw and fang",
    description: "Takes on a bear's hide to stand in front of the fight.",
    color: "#8a5a2a",
    statBonus: { vitality: 5, might: 3 },
    ability: ability("bear_form", "Bear Form", "Take 45% less damage for 10 seconds.", 30, 20, 0, buff("armor", 0.45, 10)),
    companion: { kind: "bear", name: "Bear Cub", color: "#6a4a2e", scale: 0.7 },
  });
  const shaman = node(B, 3, druid, {
    id: "shaman",
    name: "Shaman",
    role: "Hybrid",
    tagline: "Speaker to spirits",
    description: "Bargains with restless spirits of storm and grave. A lesser loa haunts your steps from level 25.",
    color: "#2f7fa8",
    petLine: true,
    statBonus: { spirit: 3, intellect: 1 },
    ability: ability("earthshock", "Earthshock", "A jolt of earth energy shakes an area.", 20, 6, 10, strike(1.8, 2.5)),
    companion: { kind: "demon", name: "Lesser Loa", color: "#5a7a3a", scale: 0.75 },
  });
  node(B, 4, shaman, {
    id: "witch_doctor",
    alignment: "evil",
    name: "Witch Doctor",
    role: "Summoner",
    tagline: "The spirits demand payment",
    description: "Feeds your loa with blood and bone until it becomes a vengeful horror. It answers every insult tenfold.",
    color: "#4a6a2a",
    pet: "evil",
    statBonus: { spirit: 5, intellect: 3 },
    ability: ability("voodoo_curse", "Voodoo Curse", "A spreading curse withers everything in an area.", 35, 9, 12, strike(2.4, 3.5)),
    companion: { kind: "demon", name: "Bound Loa", color: "#3e5a2a", scale: 1.35 },
  });
  node(B, 4, shaman, {
    id: "tempest",
    name: "Tempest",
    role: "Caster",
    tagline: "The sky answers",
    description: "A shaman who studied the arcane. Commands lightning like a mage.",
    color: "#3a8ad8",
    hybrid: "mage",
    statBonus: { spirit: 4, intellect: 4 },
    ability: ability("chain_lightning", "Chain Lightning", "Lightning arcs between every enemy in an area.", 30, 8, 14, strike(2.2, 4.5)),
    companion: { kind: "wisp", name: "Storm Wisp", color: "#9ad8ff" },
  });
}

// ===========================================================================
// THIEF — speed, shadow and wit
//   Rogue:    Assassin [evil pet line] (Plaguebringer, Nightblade) · Shadowdancer (Phantom*, Swashbuckler*)
//   Wanderer: Scout [good pet line] (Falconer, Deadeye) · Bard (Troubadour*, Virtuoso)
// ===========================================================================
{
  const B = "thief";
  const root = node(B, 1, null, {
    id: "thief",
    name: "Thief",
    role: "Melee DPS",
    tagline: "Quick hands, quicker feet",
    description: "Lives by speed and cunning. Strikes where it hurts most.",
    color: "#6b6f7d",
    statBonus: {},
    ability: ability("backstab", "Backstab", "A vicious stab at one enemy.", 25, 5, 2.4, strike(2.0)),
  });

  const rogue = node(B, 2, root, {
    id: "rogue",
    name: "Rogue",
    role: "Melee DPS",
    tagline: "A knife in the dark",
    description: "Close-quarters killer who moves through shadows.",
    color: "#5b5f6b",
    statBonus: { agility: 3, might: 1 },
    ability: ability("shadowstep", "Shadowstep", "Blink forward through the shadows and stab whatever you land beside.", 30, 7, 8, dash(8, 1.2, 1.8)),
  });
  const assassin = node(B, 3, rogue, {
    id: "assassin",
    alignment: "evil",
    name: "Assassin",
    role: "Melee DPS",
    tagline: "Death, delivered",
    description: "Poison and a quick blade. A plague rat scurries after you from level 25.",
    color: "#3a3a48",
    petLine: true,
    statBonus: { agility: 4 },
    ability: ability("eviscerate", "Eviscerate", "A brutal finishing strike.", 40, 8, 2.5, strike(3.0)),
    companion: { kind: "rat", name: "Plague Rat", color: "#5a6a3a" },
  });
  node(B, 4, assassin, {
    id: "plaguebringer",
    name: "Plaguebringer",
    role: "Summoner",
    tagline: "Rot spreads",
    description: "Your rat swells into a bloated rat king, and your poisons become plagues.",
    color: "#6a8a2a",
    pet: "evil",
    statBonus: { agility: 4, intellect: 4 },
    ability: ability("plague_cloud", "Plague Cloud", "Release a choking cloud over an area.", 35, 9, 12, strike(2.0, 4.5)),
    companion: { kind: "rat", name: "Rat King", color: "#4a5a2a", scale: 2.0 },
  });
  node(B, 4, assassin, {
    id: "nightblade",
    name: "Nightblade",
    role: "Melee DPS",
    tagline: "No one sees the last cut",
    description: "The deadliest single-target killer there is.",
    color: "#2a2a3a",
    statBonus: { agility: 8 },
    ability: ability("death_mark", "Death Mark", "An execution strike of enormous power.", 50, 14, 3, strike(4.0)),
    companion: { kind: "cat", name: "Shadow Cat", color: "#24242c" },
  });
  const shadowdancer = node(B, 3, rogue, {
    id: "shadowdancer",
    alignment: "neutral",
    name: "Shadowdancer",
    role: "Melee DPS",
    tagline: "Never where you strike",
    description: "Evasion, flourish and footwork.",
    color: "#6a5a7a",
    statBonus: { agility: 3, vitality: 1 },
    ability: ability("evasion", "Evasion", "Take 40% less damage for 5 seconds.", 25, 14, 0, buff("armor", 0.4, 5)),
  });
  node(B, 4, shadowdancer, {
    id: "phantom",
    name: "Phantom",
    role: "Melee DPS",
    tagline: "Through the veil",
    description: "A shadowdancer who learned to slip between worlds with shadow magic.",
    color: "#5a4a8a",
    hybrid: "mage",
    statBonus: { agility: 4, intellect: 4 },
    ability: ability("phase_strike", "Phase Strike", "Phase through space and tear into enemies where you emerge.", 40, 9, 9, dash(9, 2.0, 2.5)),
    companion: { kind: "wisp", name: "Shade", color: "#6a5aa8" },
  });
  node(B, 4, shadowdancer, {
    id: "swashbuckler",
    name: "Swashbuckler",
    role: "Melee DPS",
    tagline: "Fight dirty, look good",
    description: "A shadowdancer with a brawler's grit. Takes a punch and throws two.",
    color: "#a84a3a",
    hybrid: "fighter",
    statBonus: { agility: 4, might: 3, vitality: 1 },
    ability: ability("dirty_brawl", "Dirty Brawl", "A flurry of fists, hilts and boots in front of you.", 35, 8, 3, strike(2.2, 2.5)),
    companion: { kind: "parrot", name: "Parrot", color: "#3ab84a" },
  });

  const wanderer = node(B, 2, root, {
    id: "wanderer",
    name: "Wanderer",
    role: "Ranged DPS",
    tagline: "Every road, every trick",
    description: "A traveller living on wits, thrown blades and a good tune.",
    color: "#8a7a4a",
    statBonus: { agility: 2, spirit: 2 },
    basicAttack: { kind: "ranged", range: 11, damage: [4, 7], cooldown: 0.75, projectile: "dagger" },
    ability: ability("fan_of_knives", "Fan of Knives", "Hurl knives at every enemy around you.", 30, 8, 0, nova(1.3, 4)),
  });
  const scout = node(B, 3, wanderer, {
    id: "scout",
    name: "Scout",
    role: "Ranged DPS",
    tagline: "Eyes on the horizon",
    description: "Takes up the bow. A hunting hawk flies with you from level 25.",
    color: "#7a6a3a",
    petLine: true,
    statBonus: { agility: 3, vitality: 1 },
    basicAttack: BOW,
    ability: ability("marked_shot", "Marked Shot", "A precise shot at one enemy.", 25, 7, 16, strike(2.0)),
    companion: { kind: "hawk", name: "Hunting Hawk", color: "#8a5a2a" },
  });
  node(B, 4, scout, {
    id: "falconer",
    alignment: "good",
    name: "Falconer",
    role: "Summoner",
    tagline: "Death from above",
    description: "Hunts as a pair with a great war-falcon, a guardian of the open roads.",
    color: "#9a6a2a",
    pet: "good",
    statBonus: { agility: 6, spirit: 2 },
    basicAttack: { kind: "ranged", range: 15, damage: [6, 10], cooldown: 0.85, projectile: "arrow" },
    ability: ability("talon_strike", "Talon Strike", "A precise shot at long range, marked by your falcon.", 40, 10, 18, strike(3.0)),
    companion: { kind: "hawk", name: "War Falcon", color: "#6a4a2a", scale: 1.5 },
  });
  node(B, 4, scout, {
    id: "deadeye",
    name: "Deadeye",
    role: "Ranged DPS",
    tagline: "One arrow, one kill",
    description: "The finest shot alive.",
    color: "#7a5a2a",
    statBonus: { agility: 8 },
    ability: ability("deadly_aim", "Deadly Aim", "A drawn-out shot of enormous power at extreme range.", 45, 12, 20, strike(3.4)),
    companion: { kind: "raven", name: "Watcher Crow", color: "#2a2a30" },
  });
  const bard = node(B, 3, wanderer, {
    id: "bard",
    name: "Bard",
    role: "Support",
    tagline: "Songs with teeth",
    description: "Music that heals friends and rattles foes.",
    color: "#c2477f",
    statBonus: { spirit: 3, agility: 1 },
    basicAttack: { kind: "ranged", range: 10, damage: [4, 7], cooldown: 0.8, projectile: "note" },
    ability: ability("song_of_vigor", "Song of Vigor", "Restore 20% health to yourself and nearby allies.", 25, 10, 0, heal(0.2, 9)),
  });
  node(B, 4, bard, {
    id: "troubadour",
    alignment: "good",
    name: "Troubadour",
    role: "Healer",
    tagline: "A hymn for the road",
    description: "A bard who sings sacred hymns. Heals like a priest.",
    color: "#e07aa8",
    hybrid: "priest",
    statBonus: { spirit: 6, agility: 2 },
    ability: ability("hymn_of_renewal", "Hymn of Renewal", "Heal yourself and nearby allies for 40% of maximum health.", 35, 18, 0, heal(0.4, 10)),
    companion: { kind: "songbird", name: "Songbird", color: "#f0c040" },
  });
  node(B, 4, bard, {
    id: "virtuoso",
    name: "Virtuoso",
    role: "Caster",
    tagline: "The final chord",
    description: "Turns music into a weapon. A single note can shatter stone.",
    color: "#a83a7a",
    statBonus: { agility: 4, spirit: 4 },
    ability: ability("dissonance", "Dissonance", "A jarring chord that damages all nearby enemies.", 35, 8, 0, nova(2.2, 5)),
    companion: { kind: "wisp", name: "Echo", color: "#ff9ad8" },
  });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const CLASS_NODES: readonly ClassNode[] = NODES;
const NODE_MAP = new Map<string, ClassNode>(NODES.map((n) => [n.id, n]));

export const BASE_CLASS_IDS: readonly BaseClassId[] = ["fighter", "mage", "priest", "thief"];

export function getClassNode(id: string): ClassNode | undefined {
  return NODE_MAP.get(id);
}

export function isBaseClass(id: unknown): id is BaseClassId {
  return typeof id === "string" && (BASE_CLASS_IDS as readonly string[]).includes(id);
}

export function childrenOf(id: string): ClassNode[] {
  return NODES.filter((n) => n.parent === id);
}

/** Path from the base class down to `id` (inclusive). */
export function classPath(id: string): ClassNode[] {
  const out: ClassNode[] = [];
  let cur = NODE_MAP.get(id);
  while (cur) {
    out.unshift(cur);
    cur = cur.parent ? NODE_MAP.get(cur.parent) : undefined;
  }
  return out;
}

export function endClassesOf(base: BaseClassId): ClassNode[] {
  return NODES.filter((n) => n.base === base && n.tier === 4);
}

/** True for the 8 pet end classes (2 per base: one good, one evil). */
export function isPetClass(id: string): boolean {
  return !!NODE_MAP.get(id)?.pet;
}

export interface ResolvedKit {
  base: BaseClassDef;
  node: ClassNode;
  path: ClassNode[];
  /** Abilities by slot (slot = tier - 1). */
  abilities: AbilityDef[];
  basicAttack: BasicAttackDef;
  /** Colour of the current class (UI, placeholder models). */
  color: string;
}

export function resolveKit(classId: string): ResolvedKit | undefined {
  const path = classPath(classId);
  if (path.length === 0) return undefined;
  const node = path[path.length - 1]!;
  const base = BASE_CLASSES[node.base];
  let basicAttack = base.basicAttack;
  for (const n of path) if (n.basicAttack) basicAttack = n.basicAttack;
  return { base, node, path, abilities: path.map((n) => n.ability), basicAttack, color: node.color };
}

/**
 * The companion a class has, if any:
 *   - pet lines (tier 3) bring a young companion at 25,
 *   - pet classes (tier 4) turn it into an "empowered" companion at 50,
 *   - every other end class has a "familiar" at 50.
 */
export function companionFor(classId: string): { def: CompanionDef; power: CompanionPower } | null {
  const node = NODE_MAP.get(classId);
  if (!node?.companion) return null;
  if (node.tier === 3 && node.petLine) return { def: node.companion, power: "pet" };
  if (node.tier === 4) return { def: node.companion, power: node.pet ? "empowered" : "familiar" };
  return null;
}

/** Next tier's choices and what's required to take them. */
export function advancementOptions(classId: string): { tier: Tier; level: number; quest?: { id: string; name: string }; options: ClassNode[] } | null {
  const node = NODE_MAP.get(classId);
  if (!node || node.tier >= 4) return null;
  const tier = (node.tier + 1) as Tier;
  return { tier, level: TIER_LEVELS[tier], quest: GATE_QUESTS[tier], options: childrenOf(classId) };
}

/** Alignment of a character on this class: the deepest alignment set along the path. */
export function classAlignment(classId: string): ClassAlignment {
  let a: ClassAlignment = "neutral";
  for (const n of classPath(classId)) if (n.alignment) a = n.alignment;
  return a;
}

/** Labels for UI, e.g. "Hybrid · Fighter + Priest", "Pet class · Good", "Pet at 25". */
export function classTags(n: ClassNode): string[] {
  const tags: string[] = [];
  const cap = (b: string) => b[0]!.toUpperCase() + b.slice(1);
  if (n.hybrid) tags.push(`Hybrid · ${cap(n.base)} + ${cap(n.hybrid)}`);
  else if (n.tier === 4) tags.push("Pure");
  if (n.pet) tags.push(`Pet class · ${n.pet === "good" ? "Good" : "Evil"}`);
  if (n.petLine) tags.push("Pet at 25");
  const a = classAlignment(n.id);
  if (n.tier > 1 && a !== "neutral" && !n.pet) tags.push(a === "good" ? "Good" : "Evil");
  return tags;
}
