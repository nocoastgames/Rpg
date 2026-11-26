import type { AbilityDef, BasicAttackDef } from "./abilities.ts";
import type { ResourceType, StatId, Stats } from "./stats.ts";

export type ClassId =
  | "warrior"
  | "paladin"
  | "ranger"
  | "rogue"
  | "wizard"
  | "cleric"
  | "necromancer"
  | "druid"
  | "monk"
  | "bard"
  | "warlock"
  | "shaman";

export type Role = "Tank" | "Melee DPS" | "Ranged DPS" | "Caster" | "Healer" | "Support" | "Hybrid";

export interface SubclassDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Flat stat bonuses applied on top of the base class. */
  statBonus: Partial<Stats>;
  /** Signature ability unlocked by this subclass. */
  ability: AbilityDef;
}

export interface ClassDef {
  id: ClassId;
  name: string;
  role: Role;
  description: string;
  /** Main colour for UI and placeholder models. */
  color: string;
  primaryStat: StatId;
  resource: ResourceType;
  baseStats: Stats;
  /** Stats gained per level. */
  growth: Partial<Stats>;
  basicAttack: BasicAttackDef;
  /** Ability every member of the class has. */
  ability: AbilityDef;
  /** Item id of the crude weapon the character wakes up with. */
  starterWeapon: string;
  subclasses: [SubclassDef, SubclassDef];
}

const s = (might: number, agility: number, intellect: number, vitality: number, spirit: number): Stats => ({
  might,
  agility,
  intellect,
  vitality,
  spirit,
});

export const CLASSES: readonly ClassDef[] = [
  {
    id: "warrior",
    name: "Warrior",
    role: "Melee DPS",
    description: "A hardened fighter who turns pain into rage and rage into broken bones.",
    color: "#b5452f",
    primaryStat: "might",
    resource: "rage",
    baseStats: s(14, 9, 4, 13, 5),
    growth: { might: 2, vitality: 2, agility: 1 },
    basicAttack: { kind: "melee", range: 2.2, damage: [6, 10], cooldown: 0.9 },
    ability: {
      id: "cleave",
      name: "Cleave",
      description: "A wide swing that hits every enemy in front of you.",
      cost: 15,
      cooldown: 4,
      range: 2.5,
      effect: { type: "strike", multiplier: 1.4, radius: 2.2 },
    },
    starterWeapon: "rusty_shortsword",
    subclasses: [
      {
        id: "berserker",
        name: "Berserker",
        tagline: "Fury unchained",
        description: "Trades defence for overwhelming offence.",
        statBonus: { might: 3, agility: 1 },
        ability: {
          id: "bloodfury",
          name: "Bloodfury",
          description: "Enter a frenzy, increasing damage dealt by 40% for 6 seconds.",
          cost: 20,
          cooldown: 18,
          range: 0,
          effect: { type: "buff", stat: "damage", amount: 0.4, duration: 6, radius: 0 },
        },
      },
      {
        id: "guardian",
        name: "Guardian",
        tagline: "The wall that does not fall",
        description: "Shield-bearing protector who soaks damage so allies don't have to.",
        statBonus: { vitality: 4 },
        ability: {
          id: "shield_wall",
          name: "Shield Wall",
          description: "Raise your shield, reducing damage taken by 50% for 6 seconds.",
          cost: 20,
          cooldown: 18,
          range: 0,
          effect: { type: "buff", stat: "armor", amount: 0.5, duration: 6, radius: 0 },
        },
      },
    ],
  },
  {
    id: "paladin",
    name: "Paladin",
    role: "Hybrid",
    description: "A holy knight bound by oath, equally at home leading a charge or holding a line.",
    color: "#d8b54a",
    primaryStat: "might",
    resource: "mana",
    baseStats: s(12, 6, 6, 12, 10),
    growth: { might: 2, vitality: 1, spirit: 2 },
    basicAttack: { kind: "melee", range: 2.2, damage: [6, 9], cooldown: 1.0 },
    ability: {
      id: "holy_strike",
      name: "Holy Strike",
      description: "A blow wreathed in light.",
      cost: 12,
      cooldown: 5,
      range: 2.5,
      effect: { type: "strike", multiplier: 1.6, radius: 0 },
    },
    starterWeapon: "dented_mace",
    subclasses: [
      {
        id: "crusader",
        name: "Crusader",
        tagline: "Zeal made steel",
        description: "An offensive paladin who calls down judgement on the wicked.",
        statBonus: { might: 3, spirit: 1 },
        ability: {
          id: "judgement",
          name: "Judgement",
          description: "Hammer of light crashes onto the target area.",
          cost: 25,
          cooldown: 10,
          range: 9,
          effect: { type: "strike", multiplier: 2.0, radius: 3 },
        },
      },
      {
        id: "lightwarden",
        name: "Lightwarden",
        tagline: "Shelter in the dark",
        description: "A protector who mends allies with radiant auras.",
        statBonus: { spirit: 3, vitality: 1 },
        ability: {
          id: "radiant_aura",
          name: "Radiant Aura",
          description: "Heal yourself and nearby allies for 30% of maximum health.",
          cost: 30,
          cooldown: 20,
          range: 0,
          effect: { type: "heal", fraction: 0.3, radius: 7 },
        },
      },
    ],
  },
  {
    id: "ranger",
    name: "Ranger",
    role: "Ranged DPS",
    description: "Wilderness hunter and peerless archer. The forest is home, not a threat.",
    color: "#4f8a3a",
    primaryStat: "agility",
    resource: "focus",
    baseStats: s(7, 15, 6, 10, 7),
    growth: { agility: 3, vitality: 1 },
    basicAttack: { kind: "ranged", range: 14, damage: [5, 8], cooldown: 0.8, projectile: "arrow" },
    ability: {
      id: "multishot",
      name: "Multishot",
      description: "Loose a spray of arrows into an area.",
      cost: 20,
      cooldown: 6,
      range: 14,
      effect: { type: "strike", multiplier: 1.0, radius: 3 },
    },
    starterWeapon: "makeshift_bow",
    subclasses: [
      {
        id: "beastmaster",
        name: "Beastmaster",
        tagline: "Never hunts alone",
        description: "Bonded with the wild. Future versions add an animal companion.",
        statBonus: { vitality: 2, spirit: 2 },
        ability: {
          id: "feral_instinct",
          name: "Feral Instinct",
          description: "Move 40% faster for 8 seconds.",
          cost: 20,
          cooldown: 16,
          range: 0,
          effect: { type: "buff", stat: "speed", amount: 0.4, duration: 8, radius: 0 },
        },
      },
      {
        id: "sharpshooter",
        name: "Sharpshooter",
        tagline: "One arrow, one kill",
        description: "Patient marksman who lands devastating long-range shots.",
        statBonus: { agility: 4 },
        ability: {
          id: "piercing_shot",
          name: "Piercing Shot",
          description: "A drawn-out shot that deals massive damage at long range.",
          cost: 35,
          cooldown: 10,
          range: 20,
          effect: { type: "strike", multiplier: 3.0, radius: 0 },
        },
      },
    ],
  },
  {
    id: "rogue",
    name: "Rogue",
    role: "Melee DPS",
    description: "A knife in the dark. Quick, quiet and gone before the body hits the floor.",
    color: "#5b5f6b",
    primaryStat: "agility",
    resource: "energy",
    baseStats: s(8, 15, 7, 9, 6),
    growth: { agility: 3, might: 1 },
    basicAttack: { kind: "melee", range: 2.0, damage: [4, 7], cooldown: 0.6 },
    ability: {
      id: "shadowstep",
      name: "Shadowstep",
      description: "Blink forward through the shadows and stab whatever you land beside.",
      cost: 30,
      cooldown: 7,
      range: 8,
      effect: { type: "dash", distance: 8, multiplier: 1.2, radius: 1.8 },
    },
    starterWeapon: "chipped_dagger",
    subclasses: [
      {
        id: "assassin",
        name: "Assassin",
        tagline: "Death, delivered",
        description: "Specialises in single, lethal strikes.",
        statBonus: { agility: 3, might: 1 },
        ability: {
          id: "eviscerate",
          name: "Eviscerate",
          description: "A brutal finishing strike.",
          cost: 40,
          cooldown: 8,
          range: 2.5,
          effect: { type: "strike", multiplier: 3.0, radius: 0 },
        },
      },
      {
        id: "shadowdancer",
        name: "Shadowdancer",
        tagline: "A storm of steel",
        description: "Acrobatic duelist who fights many foes at once.",
        statBonus: { agility: 2, vitality: 2 },
        ability: {
          id: "fan_of_blades",
          name: "Fan of Blades",
          description: "Spin and hurl blades at every enemy around you.",
          cost: 35,
          cooldown: 8,
          range: 0,
          effect: { type: "nova", multiplier: 1.3, radius: 4 },
        },
      },
    ],
  },
  {
    id: "wizard",
    name: "Wizard",
    role: "Caster",
    description: "Scholar of the arcane who bends raw elemental force to their will.",
    color: "#3f5fc4",
    primaryStat: "intellect",
    resource: "mana",
    baseStats: s(4, 7, 16, 8, 10),
    growth: { intellect: 3, spirit: 1 },
    basicAttack: { kind: "ranged", range: 12, damage: [5, 9], cooldown: 1.0, projectile: "bolt" },
    ability: {
      id: "arcane_blink",
      name: "Arcane Blink",
      description: "Teleport a short distance.",
      cost: 15,
      cooldown: 8,
      range: 8,
      effect: { type: "dash", distance: 8, multiplier: 0, radius: 0 },
    },
    starterWeapon: "cracked_wand",
    subclasses: [
      {
        id: "pyromancer",
        name: "Pyromancer",
        tagline: "Everything burns",
        description: "Master of flame and explosive area damage.",
        statBonus: { intellect: 4 },
        ability: {
          id: "fireball",
          name: "Fireball",
          description: "Hurl an exploding ball of fire.",
          cost: 25,
          cooldown: 6,
          range: 14,
          effect: { type: "strike", multiplier: 2.2, radius: 3 },
        },
      },
      {
        id: "cryomancer",
        name: "Cryomancer",
        tagline: "Still as winter",
        description: "Controls the battlefield with ice. Future versions add slows and freezes.",
        statBonus: { intellect: 2, vitality: 2 },
        ability: {
          id: "frost_nova",
          name: "Frost Nova",
          description: "A ring of ice bursts out around you.",
          cost: 25,
          cooldown: 9,
          range: 0,
          effect: { type: "nova", multiplier: 1.4, radius: 5 },
        },
      },
    ],
  },
  {
    id: "cleric",
    name: "Cleric",
    role: "Healer",
    description: "Faithful servant of the old gods, keeping companions alive against all odds.",
    color: "#e8e2c8",
    primaryStat: "spirit",
    resource: "mana",
    baseStats: s(8, 6, 8, 11, 15),
    growth: { spirit: 3, vitality: 1 },
    basicAttack: { kind: "ranged", range: 10, damage: [4, 7], cooldown: 1.0, projectile: "orb" },
    ability: {
      id: "mend",
      name: "Mend",
      description: "Heal yourself and nearby allies for 25% of maximum health.",
      cost: 20,
      cooldown: 8,
      range: 0,
      effect: { type: "heal", fraction: 0.25, radius: 5 },
    },
    starterWeapon: "oak_cudgel",
    subclasses: [
      {
        id: "lifebinder",
        name: "Lifebinder",
        tagline: "None fall on my watch",
        description: "Devoted healer with powerful group restoration.",
        statBonus: { spirit: 4 },
        ability: {
          id: "sanctuary",
          name: "Sanctuary",
          description: "A great wave of healing for 45% of maximum health.",
          cost: 40,
          cooldown: 25,
          range: 0,
          effect: { type: "heal", fraction: 0.45, radius: 9 },
        },
      },
      {
        id: "inquisitor",
        name: "Inquisitor",
        tagline: "Faith as a weapon",
        description: "Battle priest who punishes the unholy.",
        statBonus: { spirit: 2, might: 2 },
        ability: {
          id: "smite",
          name: "Smite",
          description: "Call down holy fire on the target area.",
          cost: 25,
          cooldown: 7,
          range: 12,
          effect: { type: "strike", multiplier: 2.2, radius: 2.5 },
        },
      },
    ],
  },
  {
    id: "necromancer",
    name: "Necromancer",
    role: "Caster",
    description: "Walker of the border between life and death who commands decay itself.",
    color: "#6b3f8f",
    primaryStat: "intellect",
    resource: "mana",
    baseStats: s(5, 6, 15, 10, 9),
    growth: { intellect: 3, vitality: 1 },
    basicAttack: { kind: "ranged", range: 11, damage: [5, 8], cooldown: 1.0, projectile: "shadow" },
    ability: {
      id: "drain_life",
      name: "Drain Life",
      description: "Rip life from an enemy, healing yourself for half the damage dealt.",
      cost: 18,
      cooldown: 6,
      range: 10,
      effect: { type: "strike", multiplier: 1.3, radius: 0, lifesteal: 0.5 },
    },
    starterWeapon: "bone_fetish",
    subclasses: [
      {
        id: "bonecaller",
        name: "Bonecaller",
        tagline: "The dead remember",
        description: "Shapes bone into weapons. Future versions raise skeletal minions.",
        statBonus: { intellect: 3, vitality: 1 },
        ability: {
          id: "bone_spear",
          name: "Bone Spear",
          description: "Launch a jagged spear of bone at long range.",
          cost: 25,
          cooldown: 7,
          range: 16,
          effect: { type: "strike", multiplier: 2.4, radius: 0 },
        },
      },
      {
        id: "plaguebringer",
        name: "Plaguebringer",
        tagline: "Rot spreads",
        description: "Spreads disease and lingering decay across groups of foes.",
        statBonus: { intellect: 2, spirit: 2 },
        ability: {
          id: "plague_cloud",
          name: "Plague Cloud",
          description: "Release a choking cloud over an area.",
          cost: 30,
          cooldown: 9,
          range: 12,
          effect: { type: "strike", multiplier: 1.7, radius: 4 },
        },
      },
    ],
  },
  {
    id: "druid",
    name: "Druid",
    role: "Hybrid",
    description: "Keeper of the old groves who speaks with root, beast and storm.",
    color: "#7a5a2e",
    primaryStat: "spirit",
    resource: "mana",
    baseStats: s(8, 8, 10, 10, 12),
    growth: { spirit: 2, intellect: 1, vitality: 1 },
    basicAttack: { kind: "ranged", range: 10, damage: [5, 8], cooldown: 1.0, projectile: "orb" },
    ability: {
      id: "thornlash",
      name: "Thornlash",
      description: "Thorned vines erupt beneath the target.",
      cost: 15,
      cooldown: 5,
      range: 10,
      effect: { type: "strike", multiplier: 1.5, radius: 0 },
    },
    starterWeapon: "gnarled_branch",
    subclasses: [
      {
        id: "shapeshifter",
        name: "Shapeshifter",
        tagline: "Claw and fang",
        description: "Takes the form of beasts. Future versions add full bear and wolf forms.",
        statBonus: { might: 2, vitality: 2 },
        ability: {
          id: "bear_form",
          name: "Bear Form",
          description: "Take on the hide of a bear, reducing damage taken by 40% for 10 seconds.",
          cost: 25,
          cooldown: 20,
          range: 0,
          effect: { type: "buff", stat: "armor", amount: 0.4, duration: 10, radius: 0 },
        },
      },
      {
        id: "grovekeeper",
        name: "Grovekeeper",
        tagline: "The forest provides",
        description: "Nurturing druid who channels the regrowth of the wild.",
        statBonus: { spirit: 4 },
        ability: {
          id: "rejuvenation",
          name: "Rejuvenation",
          description: "Heal yourself and nearby allies for 35% of maximum health.",
          cost: 30,
          cooldown: 16,
          range: 0,
          effect: { type: "heal", fraction: 0.35, radius: 7 },
        },
      },
    ],
  },
  {
    id: "monk",
    name: "Monk",
    role: "Melee DPS",
    description: "Disciplined martial artist whose body is the only weapon needed.",
    color: "#d07a2c",
    primaryStat: "agility",
    resource: "energy",
    baseStats: s(10, 13, 6, 10, 9),
    growth: { agility: 2, might: 1, spirit: 1 },
    basicAttack: { kind: "melee", range: 2.0, damage: [4, 7], cooldown: 0.55 },
    ability: {
      id: "flying_kick",
      name: "Flying Kick",
      description: "Leap at a target, striking on landing.",
      cost: 30,
      cooldown: 7,
      range: 7,
      effect: { type: "dash", distance: 7, multiplier: 1.4, radius: 1.8 },
    },
    starterWeapon: "hand_wraps",
    subclasses: [
      {
        id: "iron_fist",
        name: "Iron Fist",
        tagline: "Unbreakable",
        description: "Hard-style fighter delivering crushing single blows.",
        statBonus: { might: 3, vitality: 1 },
        ability: {
          id: "hundred_palms",
          name: "Hundred Palms",
          description: "A blinding flurry of strikes on one enemy.",
          cost: 40,
          cooldown: 9,
          range: 2.5,
          effect: { type: "strike", multiplier: 2.8, radius: 0 },
        },
      },
      {
        id: "windwalker",
        name: "Windwalker",
        tagline: "Swift as the gale",
        description: "Fluid fighter who sweeps through crowds.",
        statBonus: { agility: 3, spirit: 1 },
        ability: {
          id: "cyclone_kick",
          name: "Cyclone Kick",
          description: "Spinning kick that strikes all nearby enemies.",
          cost: 35,
          cooldown: 8,
          range: 0,
          effect: { type: "nova", multiplier: 1.5, radius: 3.5 },
        },
      },
    ],
  },
  {
    id: "bard",
    name: "Bard",
    role: "Support",
    description: "Wandering minstrel whose songs carry real power over friend and foe.",
    color: "#c2477f",
    primaryStat: "spirit",
    resource: "mana",
    baseStats: s(6, 11, 10, 9, 12),
    growth: { spirit: 2, agility: 1, intellect: 1 },
    basicAttack: { kind: "ranged", range: 10, damage: [4, 7], cooldown: 0.9, projectile: "note" },
    ability: {
      id: "song_of_vigor",
      name: "Song of Vigor",
      description: "Restore 15% health to yourself and nearby allies.",
      cost: 20,
      cooldown: 10,
      range: 0,
      effect: { type: "heal", fraction: 0.15, radius: 9 },
    },
    starterWeapon: "battered_lute",
    subclasses: [
      {
        id: "skald",
        name: "Skald",
        tagline: "Songs of war",
        description: "Battle-singer who drives allies to greater violence.",
        statBonus: { might: 2, spirit: 2 },
        ability: {
          id: "war_chant",
          name: "War Chant",
          description: "You and nearby allies deal 30% more damage for 10 seconds.",
          cost: 30,
          cooldown: 22,
          range: 0,
          effect: { type: "buff", stat: "damage", amount: 0.3, duration: 10, radius: 9 },
        },
      },
      {
        id: "trickster",
        name: "Trickster",
        tagline: "Now you see me",
        description: "Illusionist who confounds enemies with discordant magic.",
        statBonus: { agility: 2, intellect: 2 },
        ability: {
          id: "dissonance",
          name: "Dissonance",
          description: "A jarring chord that damages all nearby enemies.",
          cost: 25,
          cooldown: 8,
          range: 0,
          effect: { type: "nova", multiplier: 1.4, radius: 5 },
        },
      },
    ],
  },
  {
    id: "warlock",
    name: "Warlock",
    role: "Caster",
    description: "Bound by a pact to something that should not be named, and paid well for it.",
    color: "#3d8f7a",
    primaryStat: "intellect",
    resource: "mana",
    baseStats: s(6, 7, 14, 10, 9),
    growth: { intellect: 3, vitality: 1 },
    basicAttack: { kind: "ranged", range: 11, damage: [5, 9], cooldown: 1.0, projectile: "shadow" },
    ability: {
      id: "soul_siphon",
      name: "Soul Siphon",
      description: "Tear at an enemy's soul, healing yourself for half the damage.",
      cost: 18,
      cooldown: 6,
      range: 10,
      effect: { type: "strike", multiplier: 1.3, radius: 0, lifesteal: 0.5 },
    },
    starterWeapon: "tarnished_sigil",
    subclasses: [
      {
        id: "hexblade",
        name: "Hexblade",
        tagline: "A cursed edge",
        description: "Channels the patron's power through a bound blade.",
        statBonus: { might: 2, vitality: 2 },
        ability: {
          id: "cursed_edge",
          name: "Cursed Edge",
          description: "Empower your attacks, dealing 50% more damage for 8 seconds.",
          cost: 25,
          cooldown: 20,
          range: 0,
          effect: { type: "buff", stat: "damage", amount: 0.5, duration: 8, radius: 0 },
        },
      },
      {
        id: "voidcaller",
        name: "Voidcaller",
        tagline: "Gaze into the abyss",
        description: "Opens rifts to the void, unleashing raw destruction.",
        statBonus: { intellect: 4 },
        ability: {
          id: "void_rift",
          name: "Void Rift",
          description: "Tear open a rift that crushes everything nearby.",
          cost: 30,
          cooldown: 9,
          range: 12,
          effect: { type: "strike", multiplier: 2.0, radius: 3.5 },
        },
      },
    ],
  },
  {
    id: "shaman",
    name: "Shaman",
    role: "Hybrid",
    description: "Speaker to the spirits of earth, sky and ancestors.",
    color: "#2f7fa8",
    primaryStat: "spirit",
    resource: "mana",
    baseStats: s(10, 7, 9, 11, 12),
    growth: { spirit: 2, might: 1, vitality: 1 },
    basicAttack: { kind: "melee", range: 2.4, damage: [5, 9], cooldown: 0.95 },
    ability: {
      id: "earthshock",
      name: "Earthshock",
      description: "A jolt of earth energy strikes the target.",
      cost: 15,
      cooldown: 5,
      range: 10,
      effect: { type: "strike", multiplier: 1.5, radius: 0 },
    },
    starterWeapon: "splintered_spear",
    subclasses: [
      {
        id: "stormcaller",
        name: "Stormcaller",
        tagline: "The sky answers",
        description: "Commands lightning and thunder.",
        statBonus: { intellect: 3, spirit: 1 },
        ability: {
          id: "chain_lightning",
          name: "Chain Lightning",
          description: "Lightning arcs between every enemy in an area.",
          cost: 28,
          cooldown: 8,
          range: 14,
          effect: { type: "strike", multiplier: 1.8, radius: 4 },
        },
      },
      {
        id: "spiritwalker",
        name: "Spiritwalker",
        tagline: "Ancestors guide me",
        description: "Calls on ancestral spirits to restore the living.",
        statBonus: { spirit: 3, vitality: 1 },
        ability: {
          id: "ancestral_spirits",
          name: "Ancestral Spirits",
          description: "Heal yourself and nearby allies for 30% of maximum health.",
          cost: 30,
          cooldown: 18,
          range: 0,
          effect: { type: "heal", fraction: 0.3, radius: 7 },
        },
      },
    ],
  },
];

const CLASS_MAP = new Map<string, ClassDef>(CLASSES.map((c) => [c.id, c]));

export function getClass(id: string): ClassDef | undefined {
  return CLASS_MAP.get(id);
}

export function getSubclass(classId: string, subclassId: string): SubclassDef | undefined {
  return getClass(classId)?.subclasses.find((sc) => sc.id === subclassId);
}

export function isValidClassChoice(classId: unknown, subclassId: unknown): boolean {
  return typeof classId === "string" && typeof subclassId === "string" && !!getSubclass(classId, subclassId);
}
