import * as THREE from "three";
import { getClass, getEnemy } from "@rpg/shared";
import type { AnimName, AssetLibrary, GltfInstance } from "./Assets.ts";
import { toonMaterial } from "./toon.ts";

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

function buildHeadgear(classId: string, subclassId: string, color: string): THREE.Object3D | null {
  const g = new THREE.Group();
  switch (classId) {
    case "warrior":
      if (subclassId === "berserker") {
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

function buildHumanoid(opts: {
  classId: string;
  subclassId: string;
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
  const gear = buildHeadgear(opts.classId, opts.subclassId, c);
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
  if ((opts.classId === "warrior" && opts.subclassId === "guardian") || opts.classId === "paladin") {
    const shield = mesh(box(0.08, 0.55, 0.45), opts.classId === "paladin" ? "#d9c27a" : "#6b4a2f", -0.1, -0.05, 0.1);
    armL.end.add(shield);
  }
  if (opts.classId === "rogue") armL.end.add(buildWeapon("chipped_dagger", c)!);

  if (opts.scale) root.scale.setScalar(opts.scale);
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

  constructor(opts: Parameters<typeof buildHumanoid>[0] & { ranged?: boolean }) {
    const built = buildHumanoid(opts);
    this.root = built.root;
    this.rig = built.rig;
    this.height = 2.1 * (opts.scale ?? 1);
    this.ranged = !!opts.ranged;
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
    r.body.rotation.x = -this.deadT * Math.PI * 0.48;
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

  constructor(kind: string, color: string, scale: number) {
    const boar = kind === "boar";
    const len = boar ? 1.0 : 1.1;
    const h = boar ? 0.55 : 0.5;
    this.height = 1.4 * scale;
    this.root.add(this.body);
    this.body.add(mesh(box(0.5, h, len), color, 0, 0.55 + h / 2 - 0.1, 0));
    const legPositions = [
      [-0.17, len / 2 - 0.12],
      [0.17, len / 2 - 0.12],
      [-0.17, -len / 2 + 0.12],
      [0.17, -len / 2 + 0.12],
    ] as const;
    for (const [x, z] of legPositions) {
      const l = limb(0.12, 0.5, 0.12, boar ? "#3d2a1c" : "#5e5e63");
      l.pivot.position.set(x, 0.52, z);
      this.legs.push(l.pivot);
      this.body.add(l.pivot);
    }
    this.head.position.set(0, 0.85, len / 2 + 0.1);
    this.head.add(mesh(box(0.36, 0.34, 0.38), color));
    this.head.add(mesh(box(0.2, 0.18, 0.25), boar ? "#c49a8a" : "#4a4a4f", 0, -0.06, 0.28));
    this.head.add(mesh(box(0.05, 0.05, 0.02), "#ffcc33", -0.1, 0.06, 0.2, true), mesh(box(0.05, 0.05, 0.02), "#ffcc33", 0.1, 0.06, 0.2, true));
    if (boar) {
      const tl = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), "#f2ead8", -0.12, -0.05, 0.42);
      const tr = mesh(new THREE.ConeGeometry(0.03, 0.18, 4), "#f2ead8", 0.12, -0.05, 0.42);
      tl.rotation.x = tr.rotation.x = -1.1;
      this.head.add(tl, tr);
    } else {
      this.head.add(mesh(new THREE.ConeGeometry(0.06, 0.16, 4), color, -0.11, 0.22, -0.05), mesh(new THREE.ConeGeometry(0.06, 0.16, 4), color, 0.11, 0.22, -0.05));
      const tail = mesh(box(0.1, 0.1, 0.45), color, 0, 0.85, -len / 2 - 0.15);
      tail.rotation.x = 0.5;
      this.body.add(tail);
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
    this.head.position.z = 0.65 + Math.sin(this.lunge * Math.PI) * 0.3;
    this.head.rotation.x = -Math.sin(this.lunge * Math.PI) * 0.3;
    this.deadT = THREE.MathUtils.clamp(this.deadT + (this.anim === "dead" ? dt * 3 : -dt * 3), 0, 1);
    this.body.rotation.z = this.deadT * Math.PI * 0.5;
  }

  dispose(): void {
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

export function createPlayerAvatar(assets: AssetLibrary, classId: string, subclassId: string, weapon: string): Avatar {
  const gltf = assets.character(classId, subclassId);
  if (gltf) return new GltfAvatar(gltf);
  const cls = getClass(classId);
  return new ProceduralHumanoid({
    classId,
    subclassId,
    color: cls?.color ?? "#888888",
    weapon,
    ranged: cls?.basicAttack.kind === "ranged",
  });
}

export function createEnemyAvatar(assets: AssetLibrary, kind: string): Avatar {
  const gltf = assets.enemy(kind);
  if (gltf) return new GltfAvatar(gltf);
  const def = getEnemy(kind);
  const color = def?.color ?? "#777777";
  const scale = def?.scale ?? 1;
  if (kind === "wolf" || kind === "boar") return new ProceduralBeast(kind, color, scale);
  // Thornling: a small, spiky, bark-skinned humanoid.
  const h = new ProceduralHumanoid({ classId: "thornling", subclassId: "", color, weapon: "", scale: scale * 0.75, skin: "#5a7a3a" });
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
