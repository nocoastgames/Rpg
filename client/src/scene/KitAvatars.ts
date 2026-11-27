import * as THREE from "three";
import { APPEARANCE_OPTIONS, type Appearance } from "@rpg/shared";
import type { KayKitLibrary, KitProp, KitSource, KitSpec, Recolor } from "./KayKit.ts";

/**
 * Turns game state (appearance, armour, weapon, creature kind) into KayKit
 * characters, and animates them from the server's anim state.
 */

let library: KayKitLibrary | null = null;

/** Called once the KayKit models have loaded; until then (or if they fail) avatars stay procedural. */
export function setKitLibrary(lib: KayKitLibrary): void {
  library = lib;
}

export function kitReady(): boolean {
  return !!library?.ready;
}

/** How a character fights: picks idle, attack and cast clips. */
export type FightStyle = "1h" | "2h" | "dagger" | "unarmed" | "bow" | "magic" | "staff" | "lute" | "shamble";

interface ClipSet {
  idle: string;
  walk: string;
  run: string;
  attack: string[];
  cast: string[];
  dead: string;
  spawn?: string;
}

function clipsFor(style: FightStyle): ClipSet {
  const base = { idle: "Idle", walk: "Walking_A", run: "Running_A", dead: "Death_A" };
  switch (style) {
    case "1h":
      return { ...base, attack: ["1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Diagonal"], cast: ["1H_Melee_Attack_Slice_Horizontal"] };
    case "2h":
      return { ...base, idle: "2H_Melee_Idle", attack: ["2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice"], cast: ["2H_Melee_Attack_Spin"] };
    case "dagger":
      return { ...base, attack: ["1H_Melee_Attack_Stab", "Dualwield_Melee_Attack_Stab"], cast: ["Dualwield_Melee_Attack_Stab"] };
    case "unarmed":
      return { ...base, idle: "Unarmed_Idle", attack: ["Unarmed_Melee_Attack_Punch_A"], cast: ["Spellcast_Raise"] };
    case "bow":
      return { ...base, attack: ["2H_Ranged_Shoot"], cast: ["2H_Ranged_Shoot"] };
    case "lute":
      return { ...base, attack: ["Spellcast_Raise"], cast: ["Spellcast_Raise"] };
    case "magic":
    case "staff":
      return { ...base, attack: ["Spellcast_Shoot"], cast: ["Spellcast_Long", "Spellcast_Shoot"] };
    case "shamble":
      return { ...base, idle: "Idle_Combat", walk: "Walking_D_Skeletons", run: "Walking_D_Skeletons", attack: ["Unarmed_Melee_Attack_Punch_A", "1H_Melee_Attack_Chop"], cast: ["Spellcast_Shoot"], dead: "Death_B", spawn: "Skeletons_Awaken_Standing" };
  }
}

/** A one-shot (attack or cast) is squeezed into about this long, to match the game's swing timing. */
const ACTION_SECONDS = 0.62;
/** Walking pace the walk/run clips were authored for (m/s at our scale). */
const WALK_PACE = 1.8;
const RUN_PACE = 4.6;

export class KitAvatar {
  readonly root: THREE.Group;
  readonly height: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: ReadonlyMap<string, THREE.AnimationClip>;
  private readonly set: ClipSet;
  private current: THREE.AnimationAction | null = null;
  private currentName = "";
  private anim = "idle";
  private seq = -1;
  private oneShot = false;
  private swing = 0;

  constructor(spec: KitSpec, style: FightStyle) {
    const inst = library!.build(spec);
    this.root = inst.root;
    this.mixer = inst.mixer;
    this.clips = inst.clips;
    this.set = clipsFor(style);
    this.height = spec.height + 0.2;
    this.mixer.addEventListener("finished", () => {
      this.oneShot = false;
    });
    if (this.set.spawn) this.play(this.set.spawn, { once: true, fade: 0 });
    else this.play(this.set.idle);
  }

  private play(name: string, opts: { once?: boolean; fade?: number; seconds?: number; clamp?: boolean } = {}): void {
    const clip = this.clips.get(name) ?? this.clips.get("Idle");
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    if (opts.once) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = !!opts.clamp;
      action.timeScale = opts.seconds ? clip.duration / opts.seconds : 1;
      this.oneShot = !opts.clamp;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      if (this.current === action) return;
    }
    const fade = opts.fade ?? 0.15;
    if (this.current && this.current !== action) {
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.crossFadeFrom(this.current, fade, false);
    }
    action.play();
    this.current = action;
    this.currentName = name;
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && (anim === "attack" || anim === "cast")) {
      const list = anim === "attack" ? this.set.attack : this.set.cast;
      this.play(list[this.swing++ % list.length]!, { once: true, seconds: ACTION_SECONDS, fade: 0.08 });
    } else if (anim === "dead" && this.anim !== "dead") {
      this.play(this.set.dead, { once: true, clamp: true });
    } else if (this.anim === "dead" && anim !== "dead") {
      this.oneShot = false;
      this.play(this.set.idle);
    }
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number, moveSpeed: number): void {
    if (this.anim !== "dead" && !this.oneShot) {
      if (moveSpeed > 0.3) {
        const run = moveSpeed > 3 && this.set.run !== this.set.walk;
        const name = run ? this.set.run : this.set.walk;
        this.play(name);
        if (this.current) this.current.timeScale = THREE.MathUtils.clamp(moveSpeed / (run ? RUN_PACE : WALK_PACE), 0.5, 1.8);
      } else {
        this.play(this.set.idle);
        if (this.current) this.current.timeScale = 1;
      }
    }
    this.mixer.update(dt);
    void this.currentName;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

type Outfit = "tunic" | "furs" | "robe" | "plate";

const OUTFIT_SOURCE: Record<Outfit, "Rogue" | "Barbarian" | "Mage" | "Knight"> = { tunic: "Rogue", furs: "Barbarian", robe: "Mage", plate: "Knight" };
const HEADS: Record<string, { from: KitSource; node: string }> = {
  cropped: { from: "Knight", node: "Knight_Head" },
  bearded: { from: "Barbarian", node: "Barbarian_Head" },
  swept: { from: "Mage", node: "Mage_Head" },
  long: { from: "Rogue", node: "Rogue_Head" },
};
const TEXTURES = ["knight_texture", "barbarian_texture", "mage_texture", "rogue_texture"];

/** What armour looks like: which clothes, and their colour (null: the character's own dye). */
const ARMOR_LOOKS: Record<string, { outfit: Outfit; cloth: string | null; cape?: string }> = {
  militia_brigandine: { outfit: "plate", cloth: null },
  moth_eaten_gambeson: { outfit: "tunic", cloth: "#9a8a68" },
  hedge_robe: { outfit: "robe", cloth: "#4e5e30", cape: "#3a2a1a" },
  chapel_vestments: { outfit: "robe", cloth: "#e0d8c4", cape: "#c8a040" },
  poacher_leathers: { outfit: "tunic", cloth: "#6a5030" },
  peddler_coat: { outfit: "furs", cloth: "#6a4a30" },
};

/** Which KayKit weapon a game weapon looks like, and how it's swung. Missing: drawn procedurally. */
const WEAPON_LOOKS: Record<string, { style: FightStyle; prop?: KitProp; rusty?: boolean }> = {
  rusty_shortsword: { style: "1h", prop: { from: "Knight", node: "1H_Sword" }, rusty: true },
  rusted_longsword: { style: "2h", prop: { from: "Knight", node: "2H_Sword" }, rusty: true },
  chipped_dagger: { style: "dagger", prop: { from: "Rogue", node: "Knife" } },
  rusted_dirk: { style: "dagger", prop: { from: "Rogue", node: "Knife" }, rusty: true },
  cracked_wand: { style: "magic", prop: { from: "Mage", node: "1H_Wand" } },
  gravewood_wand: { style: "magic", prop: { from: "Mage", node: "1H_Wand" } },
  gnarled_branch: { style: "staff", prop: { from: "Mage", node: "2H_Staff" } },
  dented_mace: { style: "1h" },
  oak_cudgel: { style: "1h" },
  rusted_flail: { style: "1h" },
  splintered_spear: { style: "2h" },
  makeshift_bow: { style: "bow" },
  battered_lute: { style: "lute" },
  hand_wraps: { style: "unarmed" },
  bone_fetish: { style: "magic" },
  tarnished_sigil: { style: "magic" },
};

function darken(hex: string, k: number): string {
  return `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
}

export interface HumanLook {
  appearance: Appearance;
  armor?: string;
  weapon?: string;
  /** Overrides: clothes colour (guards' blue), cloak and headwear. */
  cloth?: string;
  headwear?: string;
  cloak?: boolean;
  /** Something extra in the off hand (Haskel's mug). */
  offhand?: KitProp;
  height?: number;
}

/**
 * A person: face, hair, clothes (or the armour they wear), headwear, cloak
 * and weapon. `buildWeapon` draws weapons KayKit doesn't have.
 */
export function createKitHuman(look: HumanLook, buildWeapon: (id: string) => THREE.Object3D | null): KitAvatar {
  const o = APPEARANCE_OPTIONS;
  const a = look.appearance;
  const armorLook = look.armor ? ARMOR_LOOKS[look.armor] : undefined;
  const outfit: Outfit = armorLook?.outfit ?? ((o.outfit[a.outfit] ?? o.outfit[0]).id as Outfit);
  const dye = (o.dye[a.dye] ?? o.dye[0]).color;
  const cloth = look.cloth ?? armorLook?.cloth ?? dye;
  const skin = o.skin[a.skin] ?? o.skin[1];
  const hair = o.hairColor[a.hairColor] ?? o.hairColor[2];
  const headwear = look.headwear ?? (o.headwear[a.headwear] ?? o.headwear[0]).id;
  const cloak = look.cloak ?? (o.cloak[a.cloak] ?? o.cloak[0]).id === "cloak";
  const build = o.build[a.build] ?? o.build[1];

  const src = OUTFIT_SOURCE[outfit];
  const parts: KitSpec["parts"] = ["ArmLeft", "ArmRight", "Body", "LegLeft", "LegRight"].map((p) => ({ from: src, node: `${src}_${p}` }));
  // The hood is a whole head; everything else sits on the chosen face.
  parts.unshift(headwear === "hood" ? { from: "Rogue_Hooded", node: "Rogue_Head_Hooded" } : (HEADS[(o.head[a.head] ?? o.head[0]).id] ?? HEADS.cropped!));
  const props: KitProp[] = [];
  if (headwear === "furcap") props.push({ from: "Barbarian", node: "Barbarian_Hat" });
  if (headwear === "widehat") props.push({ from: "Mage", node: "Mage_Hat" });
  if (headwear === "helm") props.push({ from: "Knight", node: "Knight_Helmet" });
  if (cloak) props.push({ from: src === "Knight" ? "Knight" : src, node: `${src}_Cape` });

  // Palette: skin and hair everywhere; clothes in the outfit's cloth swatches.
  const recolor: Recolor = {};
  for (const t of TEXTURES) recolor[t] = { "0,0": skin, "1,0": hair };
  recolor.rogue_texture!["0,1"] = darken(cloth, 0.8);
  recolor.rogue_texture!["1,1"] = cloth;
  recolor.barbarian_texture!["0,1"] = cloth;
  recolor.barbarian_texture!["1,1"] = darken(cloth, 0.85);
  recolor.mage_texture!["0,1"] = cloth;
  recolor.mage_texture!["1,1"] = headwear === "widehat" && outfit !== "robe" ? darken(cloth, 0.7) : cloth;
  recolor.mage_texture!["2,1"] = armorLook?.cape ?? darken(cloth, 0.6);
  recolor.knight_texture!["0,1"] = cloth;

  // Weapon.
  const weaponLook = look.weapon ? WEAPON_LOOKS[look.weapon] : undefined;
  const style: FightStyle = weaponLook?.style ?? (look.weapon ? "1h" : "unarmed");
  const extras: KitSpec["extras"] = [];
  if (weaponLook?.prop) {
    props.push({ ...weaponLook.prop, bone: "handslotr" });
    if (weaponLook.rusty) {
      recolor.knight_texture!["3,1"] = "#9a7a62";
      recolor.rogue_texture!["2,1"] = "#8a6a52";
    }
  } else if (look.weapon) {
    const w = buildWeapon(look.weapon);
    if (w) {
      // Procedural weapons hang down from the hand; KayKit's hand slot points up.
      const holder = new THREE.Group();
      holder.add(w);
      holder.rotation.x = Math.PI;
      holder.scale.setScalar(0.85);
      if (look.weapon === "makeshift_bow") extras.push({ object: holder, bone: "handslotl" });
      else if (look.weapon === "battered_lute") {
        w.rotation.z = 0.5;
        holder.rotation.set(0, Math.PI, 0);
        holder.position.set(0, 0.3, -0.35);
        extras.push({ object: holder, bone: "chest" });
      } else extras.push({ object: holder, bone: "handslotr" });
    }
  }
  if (look.offhand) props.push({ ...look.offhand, bone: "handslotl" });

  return new KitAvatar({ parts, props, extras, recolor, height: (look.height ?? 1.85) * build.height, width: build.width }, style);
}

/** The undead of Ashford, from the KayKit skeletons. */
export function createKitUndead(kind: string, scale: number, extras: KitSpec["extras"] = []): KitAvatar | null {
  const parts = (src: KitSource, names: string[]) => names.map((n) => ({ from: src, node: `${src}_${n}` }));
  switch (kind) {
    case "skeleton":
      return new KitAvatar(
        {
          parts: parts("Skeleton_Warrior", ["Head", "Jaw", "Eyes", "Body", "ArmLeft", "ArmRight", "LegLeft", "LegRight", "Helmet"]),
          props: [
            { from: "Skeleton_Blade", node: "Skeleton_Blade", bone: "handslotr" },
            { from: "Skeleton_Shield_Small_A", node: "Skeleton_Shield_Small_A", bone: "handslotl" },
          ],
          glow: "#7ad8ff",
          height: 1.8 * scale,
        },
        "1h",
      );
    case "risen":
      return new KitAvatar(
        { parts: parts("Skeleton_Minion", ["Head", "Jaw", "Eyes", "Body", "Cloak", "ArmLeft", "ArmRight", "LegLeft", "LegRight"]), glow: "#b6ff7a", height: 1.75 * scale },
        "shamble",
      );
    case "gravedigger":
      return new KitAvatar(
        {
          parts: parts("Skeleton_Rogue", ["Head", "Jaw", "Eyes", "Body", "ArmLeft", "ArmRight", "LegLeft", "LegRight", "Hood", "Cape"]),
          props: [
            { from: "Skeleton_Axe", node: "Skeleton_Axe", bone: "handslotr" },
          ],
          glow: "#ffa040",
          height: 1.9 * scale,
        },
        "2h",
      );
    case "hollow_priest":
      return new KitAvatar(
        {
          parts: parts("Skeleton_Mage", ["Skull", "Jaw", "Eyes", "Body", "ArmLeft", "ArmRight", "LegLeft", "LegRight", "Hat"]),
          props: [
            { from: "Skeleton_Staff", node: "Skeleton_Staff", bone: "handslotr" },
          ],
          extras,
          glow: "#b07aff",
          height: 1.9 * scale,
        },
        "staff",
      );
    default:
      return null;
  }
}
