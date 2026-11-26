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
 * side. One level-25 specialisation per base is a pet line: it grants a
 * companion at 25, and its two end classes are pet classes whose companion is
 * far stronger at 50. Every other end class gains a lesser familiar at 50.
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
  | "wisp"
  | "skeleton"
  | "wraith"
  | "ancestor"
  | "treant";

export interface CompanionDef {
  kind: CompanionKind;
  name: string;
  color: string;
  /** Size multiplier for the model. */
  scale?: number;
}

/** How strong a companion is. Pet classes get "pet" at 25 and "empowered" at 50; everyone else gets a "familiar" at 50. */
export type CompanionPower = "familiar" | "pet" | "empowered";

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
  /** Replaces the basic attack from this tier on (e.g. Hunters switch to bows). */
  basicAttack?: BasicAttackDef;
  /** End classes only: the second base this hybrid blends in. */
  hybrid?: BaseClassId;
  /** Tier 3 only: this specialisation is a pet line (companion at 25; both end classes are pet classes). */
  petLine?: boolean;
  /** Tier-3 pet lines: their pet. Tier 4: the end class's familiar or empowered pet. */
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
    description: "Heavy weapons, heavy armour, front of the line.",
    color: "#a8402c",
    statBonus: { might: 2, vitality: 2 },
    ability: ability("cleave", "Cleave", "A wide swing that hits every enemy in front of you.", 15, 5, 2.5, strike(1.3, 2.2)),
  });
  const berserker = node(B, 3, warrior, {
    id: "berserker",
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
    id: "juggernaut",
    name: "Juggernaut",
    role: "Tank",
    tagline: "Nothing stops me",
    description: "Rage hardened into armour. Shrugs off blows that would fell anyone else.",
    color: "#8e3a2a",
    statBonus: { vitality: 7, might: 2 },
    ability: ability("unstoppable", "Unstoppable", "Take 55% less damage for 8 seconds.", 25, 22, 0, buff("armor", 0.55, 8)),
    companion: { kind: "boar", name: "Iron Boar", color: "#6a6460" },
  });
  const knight = node(B, 3, warrior, {
    id: "knight",
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
    id: "shadow_knight",
    name: "Shadow Knight",
    role: "Tank",
    tagline: "An oath to darker things",
    description: "A knight who bargained with forbidden magic. Feeds on the life of every foe.",
    color: "#4a3a6a",
    hybrid: "mage",
    statBonus: { vitality: 3, intellect: 5 },
    ability: ability("soul_rend", "Soul Rend", "Rip at an enemy's soul, healing yourself for half the damage.", 25, 8, 3, strike(2.0, 0, 0.5)),
    companion: { kind: "hound", name: "Shadow Hound", color: "#2c2438" },
  });

  const hunter = node(B, 2, root, {
    id: "hunter",
    name: "Hunter",
    role: "Ranged DPS",
    tagline: "Bow, blade and patience",
    description: "Trades the shield for a bow and learns to read the wild.",
    color: "#5f7a34",
    statBonus: { agility: 3, might: 1 },
    basicAttack: { kind: "ranged", range: 14, damage: [5, 9], cooldown: 0.85, projectile: "arrow" },
    ability: ability("volley", "Volley", "Loose a spray of arrows into an area.", 15, 6, 14, strike(1.0, 3)),
  });
  const woodsman = node(B, 3, hunter, {
    id: "woodsman",
    name: "Woodsman",
    role: "Ranged DPS",
    tagline: "The forest is home",
    description: "A tracker and archer who strikes from the treeline.",
    color: "#4f8a3a",
    statBonus: { agility: 4 },
    ability: ability("aimed_shot", "Aimed Shot", "A careful shot that hits hard at long range.", 20, 7, 16, strike(2.0)),
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
    companion: { kind: "wolf", name: "Grey Wolf", color: "#8a8a90" },
  });
  node(B, 4, woodsman, {
    id: "warden",
    name: "Warden",
    role: "Ranged DPS",
    tagline: "Keeper of the old roads",
    description: "Guardian of the wild places. Lays snares and holds ground.",
    color: "#5a7a2a",
    statBonus: { agility: 4, vitality: 4 },
    ability: ability("bramble_trap", "Bramble Trap", "Thorned snares burst from the ground in an area.", 25, 12, 10, strike(2.2, 3)),
    companion: { kind: "owl", name: "Barn Owl", color: "#c8a878" },
  });
  const beastmaster = node(B, 3, hunter, {
    id: "beastmaster",
    name: "Beastmaster",
    role: "Summoner",
    tagline: "Never hunts alone",
    description: "Bonds with a wolf that fights at your side from level 25.",
    color: "#7a6a3a",
    petLine: true,
    statBonus: { vitality: 2, spirit: 2 },
    ability: ability("call_of_the_wild", "Call of the Wild", "You and nearby allies move 40% faster for 8 seconds.", 20, 18, 0, buff("speed", 0.4, 8, 8)),
    companion: { kind: "wolf", name: "Bonded Wolf", color: "#9a8a70" },
  });
  node(B, 4, beastmaster, {
    id: "beastlord",
    name: "Beastlord",
    role: "Summoner",
    tagline: "The pack answers",
    description: "Your bond deepens into a mighty dire bear. You and your beast fight as one.",
    color: "#8a6a3a",
    statBonus: { vitality: 4, might: 4 },
    ability: ability("pack_fury", "Pack Fury", "You and nearby allies deal 35% more damage for 10 seconds.", 30, 22, 0, buff("damage", 0.35, 10, 10)),
    companion: { kind: "bear", name: "Dire Bear", color: "#5a3e2a", scale: 1.3 },
  });
  node(B, 4, beastmaster, {
    id: "dragon_knight",
    name: "Dragon Knight",
    role: "Summoner",
    tagline: "Wings of fire",
    description: "Raises a young drake that breathes fire alongside you.",
    color: "#b4522a",
    statBonus: { might: 4, vitality: 4 },
    ability: ability("dragons_breath", "Dragon's Breath", "A gout of flame scorches an area in front of you.", 30, 10, 8, strike(2.0, 4)),
    companion: { kind: "drake", name: "Young Drake", color: "#a83a24", scale: 1.2 },
  });
}

// ===========================================================================
// MAGE — study, will and forbidden knowledge
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
    description: "Masters the fundamental forces: elements, time and space.",
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
  const enchanter = node(B, 3, arcanist, {
    id: "enchanter",
    name: "Enchanter",
    role: "Support",
    tagline: "Weaver of wards",
    description: "Shields allies and bends time and perception.",
    color: "#8a6ad8",
    statBonus: { intellect: 3, spirit: 2 },
    ability: ability("mana_ward", "Mana Ward", "You and nearby allies take 35% less damage for 8 seconds.", 25, 18, 0, buff("armor", 0.35, 8, 8)),
  });
  node(B, 4, enchanter, {
    id: "timeweaver",
    name: "Timeweaver",
    role: "Support",
    tagline: "Every second is mine",
    description: "Speeds allies and slows the world around them.",
    color: "#6ab0d8",
    statBonus: { intellect: 5, spirit: 3 },
    ability: ability("haste", "Haste", "You and nearby allies move 50% faster for 8 seconds.", 30, 20, 0, buff("speed", 0.5, 8, 10)),
    companion: { kind: "owl", name: "Clockwork Owl", color: "#b89a5a" },
  });
  node(B, 4, enchanter, {
    id: "illusionist",
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
    description: "Raises a skeletal servant at level 25.",
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
    description: "Commands a skeletal champion and unleashes waves of grave-cold.",
    color: "#4a6a7a",
    statBonus: { intellect: 6, vitality: 2 },
    ability: ability("death_nova", "Death Nova", "A wave of grave-cold bursts out around you.", 35, 9, 0, nova(1.9, 5)),
    companion: { kind: "skeleton", name: "Skeletal Champion", color: "#e8e2cc", scale: 1.25 },
  });
  node(B, 4, necromancer, {
    id: "deathspeaker",
    name: "Deathspeaker",
    role: "Summoner",
    tagline: "The dead and the divine",
    description: "Speaks to spirits on both sides of death. A wraith guards you; last rites mend the living.",
    color: "#7a8a9a",
    hybrid: "priest",
    statBonus: { intellect: 4, spirit: 4 },
    ability: ability("last_rites", "Last Rites", "Heal yourself and nearby allies for 30% of maximum health.", 30, 18, 0, heal(0.3, 8)),
    companion: { kind: "wraith", name: "Bound Wraith", color: "#9fb4c8", scale: 1.1 },
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
    description: "Faith in the land itself: root, beast and storm.",
    color: "#7a5a2e",
    statBonus: { spirit: 2, intellect: 1, vitality: 1 },
    ability: ability("thornlash", "Thornlash", "Thorned vines erupt beneath a target.", 15, 5, 10, strike(1.6)),
  });
  const wildcaller = node(B, 3, druid, {
    id: "wildcaller",
    name: "Wildcaller",
    role: "Summoner",
    tagline: "The forest provides",
    description: "A spirit wolf answers your call at level 25.",
    color: "#5a8a4a",
    petLine: true,
    statBonus: { spirit: 3, vitality: 1 },
    ability: ability("rejuvenation", "Rejuvenation", "Heal yourself and nearby allies for 30% of maximum health.", 25, 14, 0, heal(0.3, 8)),
    companion: { kind: "wolf", name: "Spirit Wolf", color: "#a8e0c8" },
  });
  node(B, 4, wildcaller, {
    id: "archdruid",
    name: "Archdruid",
    role: "Healer",
    tagline: "Voice of the grove",
    description: "Awakens an ancient treant guardian and mends the land and its people.",
    color: "#4a7a3a",
    statBonus: { spirit: 6, vitality: 2 },
    ability: ability("tranquility", "Tranquility", "Heal yourself and nearby allies for 50% of maximum health.", 40, 28, 0, heal(0.5, 10)),
    companion: { kind: "treant", name: "Ancient Treant", color: "#5a4a2e", scale: 1.3 },
  });
  node(B, 4, wildcaller, {
    id: "primalist",
    name: "Primalist",
    role: "Tank",
    tagline: "Claw and fang",
    description: "Takes on a bear's hide and fights beside a great spirit bear.",
    color: "#8a5a2a",
    statBonus: { vitality: 5, might: 3 },
    ability: ability("bear_form", "Bear Form", "Take 45% less damage for 10 seconds.", 30, 20, 0, buff("armor", 0.45, 10)),
    companion: { kind: "bear", name: "Spirit Bear", color: "#c8d8e0", scale: 1.2 },
  });
  const shaman = node(B, 3, druid, {
    id: "shaman",
    name: "Shaman",
    role: "Hybrid",
    tagline: "Speaker to spirits",
    description: "Calls on earth, sky and ancestors.",
    color: "#2f7fa8",
    statBonus: { spirit: 3, intellect: 1 },
    ability: ability("earthshock", "Earthshock", "A jolt of earth energy shakes an area.", 20, 6, 10, strike(1.8, 2.5)),
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
  node(B, 4, shaman, {
    id: "soulkeeper",
    name: "Soulkeeper",
    role: "Support",
    tagline: "Ancestors guide me",
    description: "Keeper of ancestral spirits who guard and restore the living.",
    color: "#4aa8a0",
    statBonus: { spirit: 6, vitality: 2 },
    ability: ability("ancestral_spirits", "Ancestral Spirits", "Heal yourself and nearby allies for 40% of maximum health.", 35, 20, 0, heal(0.4, 9)),
    companion: { kind: "ancestor", name: "Ancestor Spirit", color: "#a8e8e0" },
  });
}

// ===========================================================================
// THIEF — speed, shadow and wit
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
    name: "Assassin",
    role: "Melee DPS",
    tagline: "Death, delivered",
    description: "Specialises in single, lethal strikes.",
    color: "#3a3a48",
    statBonus: { agility: 4 },
    ability: ability("eviscerate", "Eviscerate", "A brutal finishing strike.", 40, 8, 2.5, strike(3.0)),
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
  node(B, 4, assassin, {
    id: "phantom",
    name: "Phantom",
    role: "Melee DPS",
    tagline: "Through the veil",
    description: "An assassin who learned to slip between worlds with shadow magic.",
    color: "#5a4a8a",
    hybrid: "mage",
    statBonus: { agility: 4, intellect: 4 },
    ability: ability("phase_strike", "Phase Strike", "Phase through space and tear into enemies where you emerge.", 40, 9, 9, dash(9, 2.0, 2.5)),
    companion: { kind: "wisp", name: "Shade", color: "#6a5aa8" },
  });
  const duelist = node(B, 3, rogue, {
    id: "duelist",
    name: "Duelist",
    role: "Melee DPS",
    tagline: "En garde",
    description: "Parry, riposte, repeat.",
    color: "#7a6a5a",
    statBonus: { agility: 3, vitality: 1 },
    ability: ability("riposte", "Riposte", "Take 40% less damage for 5 seconds.", 25, 14, 0, buff("armor", 0.4, 5)),
  });
  node(B, 4, duelist, {
    id: "blademaster",
    name: "Blademaster",
    role: "Melee DPS",
    tagline: "A storm of steel",
    description: "Perfect blade-work against any number of foes.",
    color: "#8a8a9a",
    statBonus: { agility: 6, might: 2 },
    ability: ability("blade_storm", "Blade Storm", "Become a whirlwind of blades, cutting everything around you.", 40, 9, 0, nova(2.0, 4)),
    companion: { kind: "raven", name: "Steel Raven", color: "#3a3a44" },
  });
  node(B, 4, duelist, {
    id: "swashbuckler",
    name: "Swashbuckler",
    role: "Melee DPS",
    tagline: "Fight dirty, look good",
    description: "A duelist with a brawler's grit. Takes a punch and throws two.",
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
  const trapper = node(B, 3, wanderer, {
    id: "trapper",
    name: "Trapper",
    role: "Summoner",
    tagline: "Patience and a hawk",
    description: "Trains a hawk that hunts with you from level 25.",
    color: "#7a6a3a",
    petLine: true,
    statBonus: { agility: 3, vitality: 1 },
    ability: ability("bear_trap", "Bear Trap", "Spring a hidden trap under an enemy.", 25, 9, 10, strike(2.0, 2)),
    companion: { kind: "hawk", name: "Hunting Hawk", color: "#8a5a2a" },
  });
  node(B, 4, trapper, {
    id: "falconer",
    name: "Falconer",
    role: "Summoner",
    tagline: "Death from above",
    description: "Hunts as a pair with a great war-falcon.",
    color: "#9a6a2a",
    statBonus: { agility: 6, spirit: 2 },
    basicAttack: { kind: "ranged", range: 15, damage: [6, 10], cooldown: 0.85, projectile: "arrow" },
    ability: ability("talon_strike", "Talon Strike", "A precise shot at long range, marked by your falcon.", 40, 10, 18, strike(3.0)),
    companion: { kind: "hawk", name: "War Falcon", color: "#6a4a2a", scale: 1.4 },
  });
  node(B, 4, trapper, {
    id: "plaguebringer",
    name: "Plaguebringer",
    role: "Summoner",
    tagline: "Rot spreads",
    description: "Commands a swollen plague rat and spreads poison clouds.",
    color: "#6a8a2a",
    statBonus: { agility: 4, intellect: 4 },
    ability: ability("plague_cloud", "Plague Cloud", "Release a choking cloud over an area.", 35, 9, 12, strike(2.0, 4.5)),
    companion: { kind: "rat", name: "Plague Rat", color: "#5a6a3a", scale: 1.3 },
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

/** True if this node is an end class of a pet line (or the pet-line specialisation itself). */
export function isPetClass(id: string): boolean {
  return classPath(id).some((n) => n.petLine);
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
 *   - pet lines get their pet at tier 3 (level 25) with "pet" power,
 *   - pet classes (tier 4 under a pet line) get an "empowered" companion,
 *   - every other end class gets a "familiar" at tier 4 (level 50).
 */
export function companionFor(classId: string): { def: CompanionDef; power: CompanionPower } | null {
  const path = classPath(classId);
  const node = path[path.length - 1];
  if (!node) return null;
  const petLine = path.some((n) => n.petLine);
  if (node.tier === 3 && node.petLine && node.companion) return { def: node.companion, power: "pet" };
  if (node.tier === 4 && node.companion) return { def: node.companion, power: petLine ? "empowered" : "familiar" };
  return null;
}

/** Next tier's choices and what's required to take them. */
export function advancementOptions(classId: string): { tier: Tier; level: number; quest?: { id: string; name: string }; options: ClassNode[] } | null {
  const node = NODE_MAP.get(classId);
  if (!node || node.tier >= 4) return null;
  const tier = (node.tier + 1) as Tier;
  return { tier, level: TIER_LEVELS[tier], quest: GATE_QUESTS[tier], options: childrenOf(classId) };
}

/** Label for UI: "Hybrid · Fighter + Priest", "Pet class", "Pure". */
export function classTags(n: ClassNode): string[] {
  const tags: string[] = [];
  const cap = (b: string) => b[0]!.toUpperCase() + b.slice(1);
  if (n.hybrid) tags.push(`Hybrid · ${cap(n.base)} + ${cap(n.hybrid)}`);
  else if (n.tier === 4) tags.push("Pure");
  if (n.petLine || (n.tier === 4 && isPetClass(n.id))) tags.push("Pet class");
  return tags;
}
