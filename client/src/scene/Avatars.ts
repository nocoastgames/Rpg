import * as THREE from "three";
import { APPEARANCE_OPTIONS, DEFAULT_APPEARANCE, getAdventurer, getEnemy, resolveKit, type Appearance } from "@rpg/shared";
import type { AnimName, AssetLibrary, GltfInstance } from "./Assets.ts";
import { toonMaterial } from "./toon.ts";
import { createKitHuman, createKitUndead, kitReady } from "./KitAvatars.ts";

/**
 * Visual representation of a character or creature. The entity layer
 * positions `root`; the avatar animates itself from the server's anim state.
 */
export interface Avatar {
  readonly root: THREE.Group;
  /** Height in metres, for nameplates. */
  readonly height: number;
  /** Server-reported animation + action counter (bumps on every attack/cast). */
  setAnim(anim: string, actionSeq: number): void;
  update(dt: number, moveSpeed: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// glTF-backed avatar (used when the manifest provides a model)
// ---------------------------------------------------------------------------

class GltfAvatar implements Avatar {
  readonly root = new THREE.Group();
  readonly height = 1.9;
  private current: THREE.AnimationAction | null = null;
  private anim = "";
  private seq = -1;

  constructor(private readonly inst: GltfInstance) {
    this.root.add(inst.root);
    this.play("idle");
  }

  private play(name: AnimName, once = false): void {
    const next = this.inst.actions[name] ?? this.inst.actions.idle;
    if (!next) return;
    if (once) {
      next.reset();
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = name === "dead";
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (this.current && this.current !== next) next.crossFadeFrom(this.current, 0.15, false);
    next.enabled = true;
    next.play();
    this.current = next;
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && (anim === "attack" || anim === "cast")) {
      this.play(anim as AnimName, true);
    } else if (anim !== this.anim && anim !== "attack" && anim !== "cast") {
      this.play(anim as AnimName, anim === "dead");
    }
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number): void {
    this.inst.mixer.update(dt);
    // Return to the looping state once a one-shot finishes.
    if (this.current && !this.current.isRunning() && this.anim !== "dead") {
      this.play(this.anim === "walk" ? "walk" : "idle");
    }
  }

  dispose(): void {
    this.inst.mixer.stopAllAction();
  }
}

// ---------------------------------------------------------------------------
// Procedural placeholder humanoid
// ---------------------------------------------------------------------------

const matCache = new Map<string, THREE.MeshToonMaterial>();
function mat(color: string, emissive = false): THREE.MeshToonMaterial {
  const key = color + (emissive ? "!" : "");
  let m = matCache.get(key);
  if (!m) {
    m = toonMaterial({ color });
    if (emissive) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = 1.2;
    }
    matCache.set(key, m);
  }
  return m;
}

function mesh(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, emissive = false): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color, emissive));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Limb whose pivot is at the top (shoulder/hip). */
function limb(w: number, h: number, d: number, color: string): { pivot: THREE.Group; end: THREE.Group } {
  const pivot = new THREE.Group();
  const g = box(w, h, d);
  g.translate(0, -h / 2, 0);
  pivot.add(mesh(g, color));
  const end = new THREE.Group();
  end.position.y = -h;
  pivot.add(end);
  return { pivot, end };
}

const SKIN = "#e0b48f";
const ROBED = new Set(["wizard", "cleric", "necromancer", "druid", "warlock"]);

function buildWeapon(weaponId: string, classColor: string): THREE.Object3D | null {
  const g = new THREE.Group();
  const wood = "#7a5530";
  const steel = "#b8bcc4";
  switch (weaponId) {
    case "rusty_shortsword":
      g.add(mesh(box(0.06, 0.8, 0.12), "#a08c76", 0, -0.45, 0.05), mesh(box(0.28, 0.06, 0.08), "#5b4636", 0, -0.05, 0.05));
      break;
    case "rusted_longsword":
      g.add(mesh(box(0.07, 1.1, 0.13), "#9a6e4e", 0, -0.6, 0.05), mesh(box(0.34, 0.07, 0.09), "#4a3a2c", 0, -0.05, 0.05));
      break;
    case "rusted_flail": {
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 6), wood, 0, -0.25, 0.05));
      const ball = mesh(new THREE.DodecahedronGeometry(0.12, 0), "#8a6048", 0.1, -0.85, 0.05);
      g.add(ball, mesh(box(0.03, 0.3, 0.03), "#6a5a4a", 0.05, -0.65, 0.05));
      break;
    }
    case "rusted_dirk":
      g.add(mesh(box(0.05, 0.5, 0.08), "#9a7a5e", 0, -0.3, 0.05), mesh(box(0.18, 0.04, 0.06), "#4a3a2c", 0, -0.03, 0.05));
      break;
    case "gravewood_wand":
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.5, 5), "#3a3030", 0, -0.3, 0.05));
      g.add(mesh(new THREE.OctahedronGeometry(0.09, 0), "#8affc8", 0, 0.5, 0.05, true));
      break;
    case "dented_mace":
    case "oak_cudgel":
      g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), wood, 0, -0.3, 0.05));
      g.add(mesh(new THREE.DodecahedronGeometry(0.13, 0), weaponId === "dented_mace" ? steel : wood, 0, -0.65, 0.05));
      break;
    case "chipped_dagger":
      g.add(mesh(box(0.05, 0.35, 0.08), steel, 0, -0.22, 0.05));
      break;
    case "makeshift_bow": {
      const bow = mesh(new THREE.TorusGeometry(0.5, 0.025, 4, 12, Math.PI), wood, 0, -0.05, 0.1);
      bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
      g.add(bow);
      break;
    }
    case "cracked_wand":
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.5, 5), wood, 0, -0.3, 0.05));
      g.add(mesh(new THREE.OctahedronGeometry(0.09, 0), classColor, 0, 0.5, 0.05, true));
      break;
    case "bone_fetish":
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5), "#d8d0b8", 0, -0.3, 0.05));
      g.add(mesh(box(0.16, 0.16, 0.16), "#e8e2cc", 0, 0.5, 0.05));
      break;
    case "gnarled_branch":
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.6, 5), "#5e4129", 0, -0.3, 0.05));
      g.add(mesh(new THREE.IcosahedronGeometry(0.12, 0), "#6aa043", 0, 0.52, 0.05));
      break;
    case "battered_lute": {
      const body = mesh(new THREE.SphereGeometry(0.2, 7, 5), "#a0682e", 0, -0.45, 0.12);
      body.scale.set(1, 1.3, 0.5);
      g.add(body, mesh(box(0.06, 0.4, 0.04), "#5e4129", 0, -0.12, 0.12));
      break;
    }
    case "tarnished_sigil":
      g.add(mesh(new THREE.IcosahedronGeometry(0.11, 0), classColor, 0, -0.08, 0.14, true));
      break;
    case "splintered_spear":
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2, 5), wood, 0, -0.2, 0.05));
      g.add(mesh(new THREE.ConeGeometry(0.06, 0.25, 5), steel, 0, 0.9, 0.05));
      break;
    default:
      return null;
  }
  return g;
}

function buildHeadgear(classId: string, flavor: string, color: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (classId) {
    case "warrior":
      if (flavor === "berserker") {
        const hornL = mesh(new THREE.ConeGeometry(0.05, 0.25, 5), "#e8e0c8", -0.2, 0.15, 0);
        const hornR = mesh(new THREE.ConeGeometry(0.05, 0.25, 5), "#e8e0c8", 0.2, 0.15, 0);
        hornL.rotation.z = 0.6;
        hornR.rotation.z = -0.6;
        g.add(hornL, hornR);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.2, 7), "#8a8f96", 0, 0.1, 0));
      break;
    case "paladin":
      g.add(mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.32, 7), "#d9c27a", 0, 0.04, 0));
      break;
    case "ranger":
    case "rogue":
    case "necromancer":
    case "warlock":
      g.add(mesh(new THREE.ConeGeometry(0.27, 0.45, 6), color, 0, 0.18, -0.03));
      break;
    case "wizard":
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 10), color, 0, 0.1, 0));
      g.add(mesh(new THREE.ConeGeometry(0.2, 0.6, 8), color, 0, 0.4, 0));
      break;
    case "druid": {
      const a = mesh(new THREE.ConeGeometry(0.03, 0.35, 4), "#6b4a2f", -0.12, 0.3, 0);
      const b = mesh(new THREE.ConeGeometry(0.03, 0.35, 4), "#6b4a2f", 0.12, 0.3, 0);
      a.rotation.z = 0.4;
      b.rotation.z = -0.4;
      g.add(a, b);
      break;
    }
    case "bard":
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10), color, 0, 0.12, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.18, 8), color, 0, 0.2, 0));
      g.add(mesh(box(0.03, 0.3, 0.08), "#f0e0a0", 0.15, 0.35, -0.05));
      break;
    case "shaman":
      for (let i = -2; i <= 2; i++) {
        const f = mesh(box(0.05, 0.3, 0.02), i % 2 ? "#c94f2c" : "#f2e6c8", i * 0.07, 0.22, -0.12);
        f.rotation.z = -i * 0.18;
        g.add(f);
      }
      break;
    default:
      return null;
  }
  return g;
}

interface Rig {
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  head: THREE.Object3D;
}

/** `classId` here is the outfit archetype (see LOOKS), `flavor` a variant such as "berserker" horns or a "guardian" shield. */
function buildHumanoid(opts: {
  classId: string;
  flavor: string;
  color: string;
  weapon: string;
  scale?: number;
  skin?: string;
}): { root: THREE.Group; rig: Rig } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const c = opts.color;
  const skin = opts.skin ?? SKIN;
  const robed = ROBED.has(opts.classId);
  const pants = robed ? c : "#4a3b2c";

  const legL = limb(0.17, 0.78, 0.19, pants);
  const legR = limb(0.17, 0.78, 0.19, pants);
  legL.pivot.position.set(-0.13, 0.8, 0);
  legR.pivot.position.set(0.13, 0.8, 0);
  legL.end.add(mesh(box(0.19, 0.08, 0.26), "#3a2a1c", 0, 0.03, 0.04));
  legR.end.add(mesh(box(0.19, 0.08, 0.26), "#3a2a1c", 0, 0.03, 0.04));
  body.add(legL.pivot, legR.pivot);

  if (robed) body.add(mesh(new THREE.CylinderGeometry(0.26, 0.42, 0.75, 8), c, 0, 0.55, 0));
  body.add(mesh(box(0.54, 0.68, 0.32), c, 0, 1.15, 0));
  body.add(mesh(box(0.56, 0.08, 0.34), "#3a2a1c", 0, 0.86, 0)); // belt

  const head = new THREE.Group();
  head.position.set(0, 1.72, 0);
  head.add(mesh(box(0.34, 0.36, 0.34), opts.classId === "monk" ? "#d8a27a" : skin));
  head.add(mesh(box(0.06, 0.05, 0.02), "#1a1a1a", -0.08, 0.03, 0.17), mesh(box(0.06, 0.05, 0.02), "#1a1a1a", 0.08, 0.03, 0.17));
  const gear = buildHeadgear(opts.classId, opts.flavor, c);
  if (gear) {
    gear.position.y = 0.16;
    head.add(gear);
  }
  body.add(head);

  const armL = limb(0.14, 0.68, 0.15, c);
  const armR = limb(0.14, 0.68, 0.15, c);
  armL.pivot.position.set(-0.36, 1.45, 0);
  armR.pivot.position.set(0.36, 1.45, 0);
  armL.end.add(mesh(box(0.13, 0.13, 0.13), skin));
  armR.end.add(mesh(box(0.13, 0.13, 0.13), skin));
  body.add(armL.pivot, armR.pivot);

  const weapon = buildWeapon(opts.weapon, c);
  if (weapon) {
    if (opts.weapon === "makeshift_bow") armL.end.add(weapon);
    else if (opts.weapon === "battered_lute") {
      weapon.position.set(0, 1.35, -0.25);
      weapon.rotation.z = 0.5;
      body.add(weapon);
    } else armR.end.add(weapon);
  }
  if ((opts.classId === "warrior" && opts.flavor === "guardian") || opts.classId === "paladin") {
    const shield = mesh(box(0.08, 0.55, 0.45), opts.classId === "paladin" ? "#d9c27a" : "#6b4a2f", -0.1, -0.05, 0.1);
    armL.end.add(shield);
  }
  if (opts.classId === "rogue") armL.end.add(buildWeapon("chipped_dagger", c)!);

  if (opts.scale) root.scale.setScalar(opts.scale);
  return { root, rig: { body, armL: armL.pivot, armR: armR.pivot, legL: legL.pivot, legR: legR.pivot, head } };
}

/**
 * A player character: built from their chosen appearance, wearing the same
 * ragged clothes as everyone else. Visible equipment will layer on later; for
 * now only the weapon in hand shows.
 */
/** Body armour shapes layered over the ragged clothes. */
function addArmor(body: THREE.Group, armL: THREE.Group, armR: THREE.Group, armorId: string, w: number): void {
  const look: Record<string, { color: string; trim: string; robe?: boolean; studs?: boolean; hood?: boolean; quilted?: boolean }> = {
    militia_brigandine: { color: "#4a3a2e", trim: "#a8acb4", studs: true },
    hedge_robe: { color: "#2e3e6e", trim: "#d8c890", robe: true },
    chapel_vestments: { color: "#ece6d6", trim: "#d9b44a", robe: true },
    poacher_leathers: { color: "#5a4030", trim: "#2e2a22", hood: true },
    peddler_coat: { color: "#5e6a3e", trim: "#7a5a3a", quilted: true },
    moth_eaten_gambeson: { color: "#b09a74", trim: "#8a7656", quilted: true },
  };
  const a = look[armorId];
  if (!a) return;
  body.add(mesh(box(0.58 * w, 0.66, 0.36), a.color, 0, 1.17, 0));
  if (a.robe) {
    body.add(mesh(new THREE.CylinderGeometry(0.3 * w, 0.42 * w, 0.72, 8), a.color, 0, 0.5, 0));
    body.add(mesh(box(0.1, 1.2, 0.02), a.trim, 0, 0.85, 0.19));
  }
  if (a.studs) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) body.add(mesh(box(0.05, 0.05, 0.02), a.trim, (i - 1) * 0.16 * w, 1.0 + j * 0.17, 0.185));
    body.add(mesh(box(0.2, 0.1, 0.24), a.trim, -(0.3 * w), 1.48, 0), mesh(box(0.2, 0.1, 0.24), a.trim, 0.3 * w, 1.48, 0));
  }
  if (a.quilted) for (let j = 0; j < 4; j++) body.add(mesh(box(0.59 * w, 0.02, 0.37), a.trim, 0, 0.92 + j * 0.16, 0));
  if (a.hood) body.add(mesh(box(0.4, 0.3, 0.12), a.color, 0, 1.62, -0.2));
  body.add(mesh(box(0.6 * w, 0.06, 0.38), a.trim, 0, 0.88, 0));
  for (const arm of [armL, armR]) arm.add(mesh(box(0.19, 0.4, 0.2), a.color, 0, -0.18, 0));
}

function buildPlayerBody(app: Appearance, weaponId: string, armorId = ""): { root: THREE.Group; rig: Rig } {
  const o = APPEARANCE_OPTIONS;
  const build = o.build[app.build] ?? o.build[1];
  const skin = o.skin[app.skin] ?? o.skin[2];
  // The placeholder approximates the KayKit faces: cropped, bearded, swept back, long.
  const face = (o.head[app.head] ?? o.head[0]).id;
  const hairStyle: string = face === "long" ? "long" : face === "swept" ? "ponytail" : "short";
  const hairColor = o.hairColor[app.hairColor] ?? o.hairColor[2];
  const beard: string = face === "bearded" ? "long" : "none";
  const cloth = (o.dye[app.dye] ?? o.dye[0]).color;
  const clothDark = `#${new THREE.Color(cloth).multiplyScalar(0.7).getHexString()}`;
  const trousers = "#4a3e30";
  const wraps = "#7a6a50";
  const w = build.width;

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Legs: ragged trousers, bare shins, cloth foot-wraps.
  const legL = limb(0.17 * w, 0.78, 0.19, trousers);
  const legR = limb(0.17 * w, 0.78, 0.19, trousers);
  legL.pivot.position.set(-0.13 * w, 0.8, 0);
  legR.pivot.position.set(0.13 * w, 0.8, 0);
  for (const l of [legL, legR]) {
    l.end.add(mesh(box(0.16 * w, 0.16, 0.17), skin, 0, 0.14, 0));
    l.end.add(mesh(box(0.19 * w, 0.1, 0.26), wraps, 0, 0.04, 0.04));
  }
  body.add(legL.pivot, legR.pivot);

  // Torso: a torn tunic with a jagged hem, a patch and a rope belt.
  body.add(mesh(box(0.54 * w, 0.68, 0.32), cloth, 0, 1.15, 0));
  const hem = [0.12, 0.05, 0.15, 0.07, 0.11];
  hem.forEach((drop, i) => {
    const x = (i / (hem.length - 1) - 0.5) * 0.48 * w;
    body.add(mesh(box(0.11 * w, drop, 0.33), cloth, x, 0.81 - drop / 2, 0));
  });
  body.add(mesh(box(0.14, 0.14, 0.02), clothDark, 0.12 * w, 1.25, 0.165));
  body.add(mesh(box(0.56 * w, 0.05, 0.34), "#9a8458", 0, 0.9, 0));

  // Head, face, hair, beard.
  const head = new THREE.Group();
  head.position.set(0, 1.72, 0);
  head.add(mesh(box(0.34, 0.36, 0.34), skin));
  head.add(mesh(box(0.06, 0.05, 0.02), "#1a1a1a", -0.08, 0.03, 0.17), mesh(box(0.06, 0.05, 0.02), "#1a1a1a", 0.08, 0.03, 0.17));
  const hair = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => head.add(mesh(geo, hairColor, x, y, z));
  if (hairStyle !== "none" && hairStyle !== "mohawk") {
    hair(box(0.37, 0.1, 0.37), 0, 0.2, -0.01);
    hair(box(0.37, 0.22, 0.08), 0, 0.08, -0.16);
  }
  if (hairStyle === "long") hair(box(0.38, 0.42, 0.09), 0, -0.1, -0.17);
  if (hairStyle === "ponytail") hair(new THREE.CylinderGeometry(0.05, 0.03, 0.34, 5), 0, -0.02, -0.24);
  if (hairStyle === "braid") hair(box(0.07, 0.55, 0.07), 0, -0.2, -0.22);
  if (hairStyle === "mohawk") hair(box(0.08, 0.14, 0.38), 0, 0.24, -0.01);
  if (beard === "stubble") head.add(mesh(box(0.3, 0.1, 0.02), `#${new THREE.Color(hairColor).lerp(new THREE.Color(skin), 0.55).getHexString()}`, 0, -0.12, 0.172));
  if (beard === "short") hair(box(0.3, 0.13, 0.06), 0, -0.13, 0.18);
  if (beard === "long") hair(box(0.28, 0.3, 0.07), 0, -0.2, 0.18);
  body.add(head);

  // Arms: short ragged sleeves over bare arms.
  const armL = limb(0.14, 0.68, 0.15, skin);
  const armR = limb(0.14, 0.68, 0.15, skin);
  armL.pivot.position.set(-(0.27 * w + 0.09), 1.45, 0);
  armR.pivot.position.set(0.27 * w + 0.09, 1.45, 0);
  for (const a of [armL, armR]) {
    a.pivot.add(mesh(box(0.17, 0.24, 0.18), cloth, 0, -0.1, 0));
    a.end.add(mesh(box(0.13, 0.13, 0.13), skin));
  }
  body.add(armL.pivot, armR.pivot);

  addArmor(body, armL.pivot, armR.pivot, armorId, w);

  const weapon = buildWeapon(weaponId, "#8a8a8a");
  if (weapon) {
    if (weaponId === "makeshift_bow") armL.end.add(weapon);
    else if (weaponId === "battered_lute") {
      weapon.position.set(0, 1.35, -0.25);
      weapon.rotation.z = 0.5;
      body.add(weapon);
    } else armR.end.add(weapon);
  }

  root.scale.setScalar(build.height);
  return { root, rig: { body, armL: armL.pivot, armR: armR.pivot, legL: legL.pivot, legR: legR.pivot, head } };
}

class ProceduralHumanoid implements Avatar {
  readonly root: THREE.Group;
  readonly height: number;
  private readonly rig: Rig;
  private phase = 0;
  private anim = "idle";
  private seq = -1;
  private action: { kind: "attack" | "cast"; t: number } | null = null;
  private deadT = 0;
  private readonly ranged: boolean;
  /** "shamble": the walking dead lurch with arms outstretched. */
  private readonly pose: string;

  constructor(opts: Parameters<typeof buildHumanoid>[0] & { ranged?: boolean; appearance?: Appearance; armor?: string; pose?: string }) {
    const built = opts.appearance ? buildPlayerBody(opts.appearance, opts.weapon, opts.armor) : buildHumanoid(opts);
    this.root = built.root;
    this.rig = built.rig;
    this.height = 2.1 * (opts.scale ?? 1);
    this.ranged = !!opts.ranged;
    this.pose = opts.pose ?? "";
  }

  /** The head group, for adding hats and crowns after construction. */
  get head(): THREE.Object3D {
    return this.rig.head;
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && (anim === "attack" || anim === "cast")) {
      this.action = { kind: anim, t: 0 };
    }
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number, moveSpeed: number): void {
    const r = this.rig;
    const walking = moveSpeed > 0.3 && this.anim !== "dead";
    this.phase += dt * (walking ? 9 : 2);
    const swing = walking ? Math.sin(this.phase) * 0.7 : 0;

    r.legL.rotation.x = swing;
    r.legR.rotation.x = -swing;
    r.armL.rotation.x = -swing * 0.7;
    r.armR.rotation.x = swing * 0.7;
    r.armL.rotation.z = 0.05;
    r.armR.rotation.z = -0.05;
    r.body.position.y = walking ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(this.phase) * 0.012;
    if (this.pose === "shamble") {
      r.armL.rotation.x = -1.35 + swing * 0.15;
      r.armR.rotation.x = -1.25 - swing * 0.15;
      r.legL.rotation.x = swing * 0.5;
      r.legR.rotation.x = -swing * 0.5;
    }

    if (this.action) {
      this.action.t += dt / 0.35;
      const t = Math.min(1, this.action.t);
      if (this.action.kind === "attack" && !this.ranged) {
        // Overhead chop on the weapon arm.
        r.armR.rotation.x = t < 0.4 ? THREE.MathUtils.lerp(0, -2.6, t / 0.4) : THREE.MathUtils.lerp(-2.6, 0.5, (t - 0.4) / 0.6);
      } else if (this.action.kind === "attack") {
        // Draw/fire: both arms forward.
        r.armL.rotation.x = -1.5;
        r.armR.rotation.x = -1.5 + Math.sin(t * Math.PI) * 0.4;
      } else {
        // Cast: arms up then thrust forward.
        const a = t < 0.5 ? THREE.MathUtils.lerp(0, -2.8, t / 0.5) : THREE.MathUtils.lerp(-2.8, -1.4, (t - 0.5) / 0.5);
        r.armL.rotation.x = a;
        r.armR.rotation.x = a;
        r.armL.rotation.z = 0.3;
        r.armR.rotation.z = -0.3;
      }
      if (this.action.t >= 1) this.action = null;
    }

    // Death: topple backwards.
    this.deadT = THREE.MathUtils.clamp(this.deadT + (this.anim === "dead" ? dt * 3 : -dt * 3), 0, 1);
    r.body.rotation.x = -this.deadT * Math.PI * 0.48 + (this.pose === "shamble" ? 0.22 * (1 - this.deadT) : 0);
    r.body.position.z = -this.deadT * 0.3;
  }

  dispose(): void {
    // Geometries are small and per-avatar; let GC handle them. Materials are shared.
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

// ---------------------------------------------------------------------------
// Procedural four-legged beast (wolf, boar)
// ---------------------------------------------------------------------------

class ProceduralBeast implements Avatar {
  readonly root = new THREE.Group();
  readonly height: number;
  private readonly body = new THREE.Group();
  private readonly legs: THREE.Group[] = [];
  private readonly head = new THREE.Group();
  private phase = Math.random() * 10;
  private anim = "idle";
  private seq = -1;
  private lunge = 0;
  private deadT = 0;
  private readonly wings: THREE.Group[] = [];
  private readonly headZ: number;

  constructor(kind: string, color: string, scale: number) {
    const boar = kind === "boar";
    const bear = kind === "bear";
    const drake = kind === "drake";
    const rat = kind === "rat";
    const cat = kind === "cat";
    const hare = kind === "hare";
    const len = boar ? 1.0 : bear ? 1.25 : drake ? 1.2 : 1.1;
    const h = boar ? 0.55 : bear ? 0.72 : 0.5;
    const w = bear ? 0.72 : 0.5;
    const dark = `#${new THREE.Color(color).multiplyScalar(0.62).getHexString()}`;
    this.height = (bear ? 1.7 : 1.4) * scale;
    this.root.add(this.body);
    this.body.add(mesh(box(w, h, len), color, 0, 0.55 + h / 2 - 0.1, 0));
    const legPositions = [
      [-0.17, len / 2 - 0.12],
      [0.17, len / 2 - 0.12],
      [-0.17, -len / 2 + 0.12],
      [0.17, -len / 2 + 0.12],
    ] as const;
    for (const [x, z] of legPositions) {
      const l = limb(bear ? 0.2 : 0.12, 0.5, bear ? 0.2 : 0.12, boar ? "#3d2a1c" : dark);
      l.pivot.position.set(x, 0.52, z);
      this.legs.push(l.pivot);
      this.body.add(l.pivot);
    }
    this.headZ = len / 2 + 0.1;
    this.head.position.set(0, 0.85 + (bear ? 0.15 : 0), this.headZ);
    this.head.add(mesh(box(bear ? 0.46 : 0.36, 0.34, 0.38), color));
    this.head.add(mesh(box(0.2, 0.18, 0.25), boar ? "#c49a8a" : rat ? "#d89aa0" : dark, 0, -0.06, 0.28));
    this.head.add(mesh(box(0.05, 0.05, 0.02), "#ffcc33", -0.1, 0.06, 0.2, true), mesh(box(0.05, 0.05, 0.02), "#ffcc33", 0.1, 0.06, 0.2, true));
    if (boar) {
      const tl = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), "#f2ead8", -0.12, -0.05, 0.42);
      const tr = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), "#f2ead8", 0.12, -0.05, 0.42);
      tl.rotation.x = tr.rotation.x = -1.1;
      this.head.add(tl, tr);
    } else if (hare) {
      // Long upright ears and a white tuft of a tail.
      for (const side of [-1, 1]) {
        const ear = mesh(box(0.08, 0.42, 0.05), color, side * 0.09, 0.36, -0.06);
        ear.rotation.z = side * -0.15;
        this.head.add(ear);
      }
      this.body.add(mesh(box(0.18, 0.18, 0.12), "#f2ede2", 0, 0.8, -len / 2 - 0.05));
    } else if (bear || rat) {
      // Round ears.
      this.head.add(mesh(box(0.1, 0.1, 0.06), dark, -0.16, 0.2, -0.05), mesh(box(0.1, 0.1, 0.06), dark, 0.16, 0.2, -0.05));
      if (rat) {
        const tail = mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.9, 4), "#c88a90", 0, 0.6, -len / 2 - 0.4);
        tail.rotation.x = Math.PI / 2.4;
        this.body.add(tail);
      }
    } else {
      this.head.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 4), drake ? "#e8d8b0" : color, -0.11, 0.22, -0.05), mesh(new THREE.ConeGeometry(0.06, 0.16, 4), drake ? "#e8d8b0" : color, 0.11, 0.22, -0.05));
      const tail = mesh(box(0.1, 0.1, drake ? 0.8 : 0.45), color, 0, cat ? 1.0 : 0.85, -len / 2 - (drake ? 0.35 : 0.15));
      tail.rotation.x = cat ? 1.0 : 0.5;
      this.body.add(tail);
    }
    if (drake) {
      for (const side of [-1, 1]) {
        const wing = new THREE.Group();
        wing.position.set(side * 0.24, 0.95, 0.1);
        const membrane = mesh(new THREE.BoxGeometry(0.9, 0.04, 0.6), dark, side * 0.45, 0, 0);
        wing.add(membrane);
        this.wings.push(wing);
        this.body.add(wing);
      }
    }
    this.body.add(this.head);
    this.root.scale.setScalar(scale);
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && anim === "attack") this.lunge = 1;
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number, moveSpeed: number): void {
    const walking = moveSpeed > 0.3 && this.anim !== "dead";
    this.phase += dt * (walking ? 4 + moveSpeed * 1.5 : 1.5);
    const s = walking ? Math.sin(this.phase) * 0.6 : 0;
    this.legs[0]!.rotation.x = s;
    this.legs[3]!.rotation.x = s;
    this.legs[1]!.rotation.x = -s;
    this.legs[2]!.rotation.x = -s;
    this.lunge = Math.max(0, this.lunge - dt * 3);
    this.head.position.z = this.headZ + Math.sin(this.lunge * Math.PI) * 0.3;
    this.wings.forEach((wg, i) => (wg.rotation.z = (i === 0 ? 1 : -1) * (0.25 + Math.sin(this.phase * 1.6) * 0.35)));
    this.head.rotation.x = -Math.sin(this.lunge * Math.PI) * 0.3;
    this.deadT = THREE.MathUtils.clamp(this.deadT + (this.anim === "dead" ? dt * 3 : -dt * 3), 0, 1);
    this.body.rotation.z = this.deadT * Math.PI * 0.5;
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

// ---------------------------------------------------------------------------
// Spider: a low body, a bulbous abdomen and eight jointed legs
// ---------------------------------------------------------------------------

class ProceduralSpider implements Avatar {
  readonly root = new THREE.Group();
  readonly height: number;
  private readonly body = new THREE.Group();
  private readonly legs: Array<{ pivot: THREE.Group; side: number; i: number }> = [];
  private readonly fangs: THREE.Object3D[] = [];
  private phase = Math.random() * 10;
  private anim = "idle";
  private seq = -1;
  private lunge = 0;
  private deadT = 0;

  constructor(color: string, scale: number) {
    const dark = `#${new THREE.Color(color).multiplyScalar(0.6).getHexString()}`;
    const mark = "#b8324a";
    this.height = 1.1 * scale;
    this.root.add(this.body);
    this.body.position.y = 0.42;
    // Head-chest and abdomen.
    const thorax = mesh(new THREE.SphereGeometry(0.26, 8, 6), color, 0, 0, 0.18);
    thorax.scale.set(1, 0.7, 1.1);
    const abdomen = mesh(new THREE.SphereGeometry(0.4, 9, 7), color, 0, 0.12, -0.42);
    abdomen.scale.set(1, 0.85, 1.2);
    // An hourglass-ish marking on the back.
    const spot = mesh(new THREE.SphereGeometry(0.12, 6, 5), mark, 0, 0.42, -0.42);
    spot.scale.set(1, 0.3, 1.5);
    this.body.add(thorax, abdomen, spot);
    // Eyes: a cluster of small glowing beads.
    for (const [x, y] of [[-0.08, 0.06], [0.08, 0.06], [-0.13, 0.1], [0.13, 0.1], [-0.04, 0.12], [0.04, 0.12]] as const) {
      this.body.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), "#ff5a3a", x, y, 0.42, true));
    }
    for (const side of [-1, 1]) {
      const f = mesh(new THREE.ConeGeometry(0.035, 0.16, 4), "#e8e0c8", side * 0.07, -0.08, 0.42);
      f.rotation.x = Math.PI;
      this.fangs.push(f);
      this.body.add(f);
    }
    // Eight legs: an upper segment that rises, then a lower one reaching down to the ground.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.16, 0, 0.3 - i * 0.16);
        pivot.rotation.y = side * (0.5 + (i - 1.5) * -0.45) + (side < 0 ? Math.PI : 0);
        const upper = new THREE.Group();
        upper.rotation.z = 0.7;
        const ug = box(0.5, 0.06, 0.06);
        ug.translate(0.25, 0, 0);
        upper.add(mesh(ug, dark));
        const knee = new THREE.Group();
        knee.position.x = 0.5;
        knee.rotation.z = -1.9;
        const lg = box(0.62, 0.05, 0.05);
        lg.translate(0.31, 0, 0);
        knee.add(mesh(lg, dark));
        upper.add(knee);
        pivot.add(upper);
        this.body.add(pivot);
        this.legs.push({ pivot, side, i });
      }
    }
    this.root.scale.setScalar(scale);
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && anim === "attack") this.lunge = 1;
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number, moveSpeed: number): void {
    const walking = moveSpeed > 0.3 && this.anim !== "dead";
    this.phase += dt * (walking ? 9 + moveSpeed * 2 : 1.2);
    for (const l of this.legs) {
      const alt = (l.i + (l.side > 0 ? 1 : 0)) % 2 === 0 ? 1 : -1;
      const base = l.side * (0.5 + (l.i - 1.5) * -0.45) + (l.side < 0 ? Math.PI : 0);
      l.pivot.rotation.y = base + (walking ? Math.sin(this.phase) * 0.28 * alt : Math.sin(this.phase + l.i) * 0.03);
      l.pivot.rotation.x = walking ? Math.max(0, Math.cos(this.phase) * alt) * 0.25 * l.side : 0;
    }
    this.body.position.y = 0.42 + (walking ? Math.abs(Math.sin(this.phase * 2)) * 0.03 : Math.sin(this.phase) * 0.01);
    this.lunge = Math.max(0, this.lunge - dt * 3);
    this.body.rotation.x = -Math.sin(this.lunge * Math.PI) * 0.35;
    this.body.position.z = Math.sin(this.lunge * Math.PI) * 0.25;
    for (const f of this.fangs) f.rotation.z = Math.sin(this.lunge * Math.PI) * 0.5 * (f.position.x > 0 ? 1 : -1);
    this.deadT = THREE.MathUtils.clamp(this.deadT + (this.anim === "dead" ? dt * 3 : -dt * 3), 0, 1);
    this.body.rotation.z = this.deadT * Math.PI;
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** What the character visibly holds: their starter weapon, or a class tool (bow, lute…) once their path calls for it. */
function weaponVisual(path: string[], projectile: string | undefined, item: string): string {
  if (projectile === "arrow") return "makeshift_bow";
  if (projectile === "note") return "battered_lute";
  if (path.includes("monk")) return "hand_wraps";
  if (path.includes("spellblade")) return "rusty_shortsword";
  if (path.includes("necromancer")) return "bone_fetish";
  if (path.includes("druid")) return "gnarled_branch";
  if (path.includes("warlock")) return "tarnished_sigil";
  if (path.includes("shaman")) return "splintered_spear";
  return item;
}

export function createPlayerAvatar(assets: AssetLibrary, classId: string, weapon: string, appearance: Appearance = DEFAULT_APPEARANCE, armor = ""): Avatar {
  const kit = resolveKit(classId);
  const path = kit?.path.map((n) => n.id) ?? [classId];
  const gltf = assets.character(classId, kit?.base.id ?? classId);
  if (gltf) return new GltfAvatar(gltf);
  const held = weaponVisual(path, kit?.basicAttack.projectile, weapon);
  if (kitReady()) return createKitHuman({ appearance, armor, weapon: held }, (id) => buildWeapon(id, kit?.color ?? "#888888"));
  return new ProceduralHumanoid({
    classId: "player",
    flavor: "",
    color: kit?.color ?? "#888888",
    weapon: weaponVisual(path, kit?.basicAttack.projectile, weapon),
    ranged: kit?.basicAttack.kind === "ranged",
    appearance,
    armor,
  });
}

/** One of the King's soldiers: helmet, blue tabard, spear. */
export function createGuardAvatar(): Avatar {
  if (kitReady()) {
    return createKitHuman(
      { appearance: { build: 2, skin: Math.floor(Math.random() * 6), head: 0, hairColor: 1, headwear: 4, outfit: 0, dye: 0, cloak: 1 }, armor: "militia_brigandine", weapon: "splintered_spear", cloth: "#2e4a8a", height: 1.95 },
      (id) => buildWeapon(id, "#2e4a8a"),
    );
  }
  const g = new ProceduralHumanoid({ classId: "warrior", flavor: "", color: "#2e4a8a", weapon: "splintered_spear", scale: 1.05 });
  g.root.traverse((o) => {
    if (o.position.y === 1.15 && (o as THREE.Mesh).isMesh) o.add(mesh(box(0.2, 0.2, 0.02), "#c8ccd4", 0, 0.1, 0.17));
  });
  return g;
}

/** One of the adventurers from Haskel's camp, in their own gear. */
export function createAdventurerAvatar(id: string): Avatar {
  const def = getAdventurer(id);
  if (!def) return new ProceduralWisp("#ffffff", 1);
  if (kitReady()) return createKitHuman({ appearance: def.appearance, armor: def.armor, weapon: def.weapon }, (w) => buildWeapon(w, def.color));
  return new ProceduralHumanoid({ classId: "player", flavor: "", color: def.color, weapon: def.weapon, appearance: def.appearance, armor: def.armor, ranged: def.power.ranged });
}

/** People in the world. Haskel: grey-bearded, in a travel-stained coat and a wide hat. */
export function createNpcAvatar(npc: string): Avatar {
  if (npc.startsWith("adv_")) return createAdventurerAvatar(npc.slice(4));
  if (kitReady()) {
    // Haskel: grey beard, travel coat, a wide hat and a mug of something.
    return createKitHuman(
      {
        appearance: { build: 2, skin: 2, head: 1, hairColor: 6, headwear: 3, outfit: 1, dye: 1, cloak: 0 },
        armor: "peddler_coat",
        offhand: { from: "Barbarian", node: "Mug" },
      },
      (w) => buildWeapon(w, "#6a7a4a"),
    );
  }
  const h = new ProceduralHumanoid({
    classId: "player",
    flavor: "",
    color: "#6a7a4a",
    weapon: "",
    appearance: { build: 2, skin: 2, head: 1, hairColor: 6, headwear: 0, outfit: 1, dye: 1, cloak: 0 },
    armor: npc === "vendor" ? "peddler_coat" : "",
  });
  const hat = new THREE.Group();
  hat.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), "#4a3a2a", 0, 0.2, 0));
  hat.add(mesh(new THREE.CylinderGeometry(0.2, 0.23, 0.22, 10), "#4a3a2a", 0, 0.3, 0));
  hat.add(mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 10), "#8a3a2a", 0, 0.22, 0));
  h.head.add(hat);
  return h;
}

// ---------------------------------------------------------------------------
// Companions (pets and familiars)
// ---------------------------------------------------------------------------

/** A small flying companion: hawk, raven, owl, dove, crane, parrot, songbird. */
class ProceduralBird implements Avatar {
  readonly root = new THREE.Group();
  readonly height: number;
  private readonly body = new THREE.Group();
  private readonly wings: THREE.Group[] = [];
  private phase = Math.random() * 10;
  private anim = "idle";
  private seq = -1;
  private dive = 0;

  constructor(kind: string, color: string, scale: number) {
    const crane = kind === "crane";
    const phoenix = kind === "phoenix";
    const dark = phoenix ? "#ffd040" : `#${new THREE.Color(color).multiplyScalar(0.7).getHexString()}`;
    const beak = kind === "parrot" ? "#e8c040" : crane ? "#c84030" : "#e0b040";
    this.height = 2.3;
    this.root.add(this.body);
    const torso = mesh(new THREE.SphereGeometry(0.18, 8, 6), color, 0, 0, 0, phoenix);
    torso.scale.set(0.9, 0.9, crane ? 1.6 : 1.3);
    this.body.add(torso);
    this.body.add(mesh(new THREE.SphereGeometry(0.11, 8, 6), crane ? "#c83a30" : color, 0, 0.1, crane ? 0.36 : 0.22, phoenix));
    const b = mesh(new THREE.ConeGeometry(0.035, crane ? 0.22 : 0.12, 4), beak, 0, 0.09, crane ? 0.52 : 0.34);
    b.rotation.x = Math.PI / 2;
    this.body.add(b);
    // Tail: a long flame for the phoenix.
    const tail = mesh(box(phoenix ? 0.22 : 0.14, 0.03, phoenix ? 0.6 : 0.22), dark, 0, 0, phoenix ? -0.45 : -0.28, phoenix);
    this.body.add(tail);
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.12, 0.04, 0);
      wing.add(mesh(box(crane || phoenix ? 0.6 : 0.42, 0.03, phoenix ? 0.28 : 0.2), dark, side * (crane || phoenix ? 0.3 : 0.21), 0, 0, phoenix));
      this.wings.push(wing);
      this.body.add(wing);
    }
    this.root.scale.setScalar(scale);
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && anim === "attack") this.dive = 1;
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number, moveSpeed: number): void {
    this.phase += dt * (moveSpeed > 0.3 ? 16 : 9);
    this.dive = Math.max(0, this.dive - dt * 2.5);
    const down = this.anim === "dead" ? 1.4 : Math.sin(this.dive * Math.PI) * 1.0;
    this.body.position.y = 1.7 + Math.sin(this.phase * 0.25) * 0.12 - down;
    this.body.position.z = Math.sin(this.dive * Math.PI) * 0.6;
    this.body.rotation.x = this.dive > 0 ? 0.5 : 0;
    const flap = this.anim === "dead" ? 0 : Math.sin(this.phase) * 0.7;
    this.wings[0]!.rotation.z = flap;
    this.wings[1]!.rotation.z = -flap;
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/** A floating spirit light: elemental sprites, wisps, shades, the void eye. */
class ProceduralWisp implements Avatar {
  readonly root = new THREE.Group();
  readonly height = 2.1;
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Mesh;
  private readonly motes: THREE.Mesh[] = [];
  private phase = Math.random() * 10;
  private anim = "idle";
  private seq = -1;
  private pulse = 0;

  constructor(color: string, scale: number) {
    const c = new THREE.Color(color);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: c }));
    this.halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.3, 1),
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.root.add(this.core, this.halo);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: c }));
      this.motes.push(m);
      this.root.add(m);
    }
    this.root.scale.setScalar(scale);
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && anim === "attack") this.pulse = 1;
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number): void {
    this.phase += dt;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    const y = this.anim === "dead" ? 0.3 : 1.5 + Math.sin(this.phase * 2) * 0.15;
    this.core.position.y = this.halo.position.y = y;
    this.core.rotation.y += dt * 2;
    const s = 1 + this.pulse * 0.8 + Math.sin(this.phase * 5) * 0.06;
    this.halo.scale.setScalar(s);
    (this.halo.material as THREE.MeshBasicMaterial).opacity = this.anim === "dead" ? 0.05 : 0.25 + this.pulse * 0.3;
    this.motes.forEach((m, i) => {
      const a = this.phase * 2.2 + (i * Math.PI * 2) / 3;
      m.position.set(Math.cos(a) * 0.35, y + Math.sin(a * 1.3) * 0.12, Math.sin(a) * 0.35);
    });
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose();
    });
  }
}

/** Translucent, slightly floating humanoid for spirits. */
function ghostify(av: ProceduralHumanoid, opacity: number): void {
  av.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.Material).clone();
    mat.transparent = true;
    mat.opacity = opacity;
    mat.depthWrite = false;
    m.material = mat;
    m.castShadow = false;
  });
  av.root.children[0]!.position.y += 0.25;
}

export function createCompanionAvatar(kind: string, color: string, scale: number): Avatar {
  if (kind.startsWith("adv:")) return createAdventurerAvatar(kind.slice(4));
  switch (kind) {
    case "hound":
    case "wolf":
    case "bear":
    case "boar":
    case "drake":
      return new ProceduralBeast(kind, color, 0.85 * scale);
    case "cat":
    case "rat":
      return new ProceduralBeast(kind, color, 0.55 * scale);
    case "hawk":
    case "raven":
    case "owl":
    case "dove":
    case "crane":
    case "parrot":
    case "songbird":
    case "phoenix":
      return new ProceduralBird(kind, color, (kind === "songbird" ? 0.75 : 1) * scale);
    case "demon": {
      const d = new ProceduralHumanoid({ classId: "minion", flavor: "", color, weapon: "", scale: 0.95 * scale, skin: color });
      d.root.traverse((o) => {
        if (o.position.y !== 1.72) return;
        for (const side of [-1, 1]) {
          const horn = mesh(new THREE.ConeGeometry(0.06, 0.32, 5), "#1a1414", side * 0.15, 0.3, 0);
          horn.rotation.z = -side * 0.5;
          o.add(horn);
        }
        o.add(mesh(box(0.07, 0.04, 0.02), "#ffcc33", -0.08, 0.03, 0.18, true), mesh(box(0.07, 0.04, 0.02), "#ffcc33", 0.08, 0.03, 0.18, true));
      });
      return d;
    }
    case "wisp":
      return new ProceduralWisp(color, scale);
    case "skeleton":
      return new ProceduralHumanoid({ classId: "minion", flavor: "", color, weapon: "rusty_shortsword", scale: 0.8 * scale, skin: color });
    case "treant": {
      const t = new ProceduralHumanoid({ classId: "minion", flavor: "", color, weapon: "", scale: 1.1 * scale, skin: "#6a5a3a" });
      t.root.traverse((o) => {
        if (o.position.y === 1.72) o.add(mesh(new THREE.IcosahedronGeometry(0.45, 0), "#4a7a30", 0, 0.35, 0));
      });
      return t;
    }
    case "wraith":
    case "ancestor": {
      const g = new ProceduralHumanoid({ classId: "minion", flavor: "", color, weapon: "", scale: 0.9 * scale, skin: color });
      ghostify(g, kind === "wraith" ? 0.55 : 0.6);
      return g;
    }
    default:
      return new ProceduralWisp(color, scale);
  }
}

export function createEnemyAvatar(assets: AssetLibrary, kind: string): Avatar {
  const gltf = assets.enemy(kind);
  if (gltf) return new GltfAvatar(gltf);
  const def = getEnemy(kind);
  const color = def?.color ?? "#777777";
  const scale = def?.scale ?? 1;
  if (kitReady()) {
    const extras: Array<{ object: THREE.Object3D; bone: string }> = [];
    if (kind === "hollow_priest") {
      // Thorns growing out of its back.
      const thorns = new THREE.Group();
      for (let i = 0; i < 6; i++) {
        const t = mesh(new THREE.ConeGeometry(0.07, 0.7, 4), "#1c1620", (i - 2.5) * 0.16, 0.1 + (i % 2) * 0.25, -0.35);
        t.rotation.x = -0.9;
        thorns.add(t);
      }
      extras.push({ object: thorns, bone: "chest" });
    }
    const undead = createKitUndead(kind, scale, extras);
    if (undead) return undead;
  }
  if (kind === "wolf" || kind === "boar") return new ProceduralBeast(kind, color, scale);
  if (kind === "spider") return new ProceduralSpider(color, scale);
  if (kind === "hare") return new ProceduralBeast("hare", color, scale);
  if (kind === "skeleton") {
    const sk = new ProceduralHumanoid({ classId: "minion", flavor: "", color: "#d8d2c0", weapon: "rusty_shortsword", scale: 0.92 * scale, skin: "#e8e2cc" });
    // Hollow ribs and a jaw: dark bars across the chest.
    sk.root.traverse((o) => {
      if (o.position.y === 1.15 && (o as THREE.Mesh).isMesh) {
        for (let i = 0; i < 3; i++) o.add(mesh(box(0.56, 0.05, 0.02), "#3a362e", 0, 0.18 - i * 0.14, 0.165));
      }
    });
    return sk;
  }
  if (kind === "risen" || kind === "gravedigger") {
    const r = new ProceduralHumanoid({
      classId: "minion",
      flavor: "",
      color: kind === "gravedigger" ? "#4a4436" : "#6a5a48",
      weapon: "",
      scale,
      skin: "#8a9a78",
      pose: "shamble",
    });
    if (kind === "gravedigger") {
      // A battered hat, and a shovel slung across his back.
      r.head.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 10), "#2e2a22", 0, 0.2, 0), mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.22, 8), "#2e2a22", 0, 0.32, 0));
      const shovel = new THREE.Group();
      shovel.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 5), "#6a4a2a", 0, 0, 0), mesh(box(0.25, 0.32, 0.04), "#7a7a72", 0, -0.8, 0));
      shovel.position.set(0, 1.25, -0.22);
      shovel.rotation.z = 0.7;
      r.root.children[0]!.add(shovel);
    }
    return r;
  }
  if (kind === "hollow_priest") {
    const pr = new ProceduralHumanoid({ classId: "cleric", flavor: "", color, weapon: "", scale, skin: "#2a2430" });
    pr.head.add(mesh(new THREE.ConeGeometry(0.28, 0.5, 6), "#2e2838", 0, 0.2, -0.04));
    pr.head.add(mesh(box(0.06, 0.05, 0.03), "#b07aff", -0.08, 0.03, 0.18, true), mesh(box(0.06, 0.05, 0.03), "#b07aff", 0.08, 0.03, 0.18, true));
    // Thorns growing out of its back.
    for (let i = 0; i < 6; i++) {
      const t = mesh(new THREE.ConeGeometry(0.05, 0.5, 4), "#1c1620", (i - 2.5) * 0.12, 1.35 + (i % 2) * 0.2, -0.2);
      t.rotation.x = -0.9;
      pr.root.children[0]!.add(t);
    }
    return pr;
  }
  // Thornling: a small, spiky, bark-skinned humanoid.
  const h = new ProceduralHumanoid({ classId: "thornling", flavor: "", color, weapon: "", scale: scale * 0.75, skin: "#5a7a3a" });
  h.root.traverse((o) => {
    if (o.position.y === 1.72) {
      for (let i = 0; i < 5; i++) {
        const spike = mesh(new THREE.ConeGeometry(0.05, 0.3, 4), "#8a6a3a", (i - 2) * 0.08, 0.25, 0);
        spike.rotation.z = (i - 2) * 0.3;
        o.add(spike);
      }
    }
  });
  return h;
}
