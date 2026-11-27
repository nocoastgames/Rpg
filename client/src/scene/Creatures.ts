import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { loadModel } from "./KayKit.ts";
import { toToon } from "./toon.ts";

/**
 * Animated creatures from Quaternius's Ultimate Animated Animal and Easy
 * Enemy packs (CC0; see docs/ASSETS.md), built by scripts/build-models.ts
 * into public/assets/models/quaternius/. Each model is scaled to a length
 * in metres when it loads, so the packs' own units don't matter.
 */

type ClipRole = "idle" | "walk" | "run" | "attack" | "dead";

interface CreatureModel {
  file: string;
  /** Nose to tail (or longest side), in metres. */
  length: number;
  /** Clip names (the part after "Armature|"). */
  clips: Partial<Record<ClipRole, string>>;
  /** Multiplies the model's colours (Greyjaw is darker). */
  tint?: string;
  /** Hovering off the ground (wasps), metres. */
  hover?: number;
  /** Ground speed the walk and run clips were made for (m/s at this size). */
  walkPace?: number;
  runPace?: number;
}

const ANIMAL = { idle: "Idle", walk: "Walk", run: "Gallop", attack: "Attack", dead: "Death" };

/** Enemy (and companion) kinds that have a model. */
const MODELS: Record<string, CreatureModel> = {
  wolf: { file: "Wolf", length: 1.55, clips: ANIMAL, walkPace: 1.6, runPace: 5.5 },
  greyjaw: { file: "Wolf", length: 2.2, clips: ANIMAL, tint: "#6a6a74", walkPace: 2.2, runPace: 7 },
  deer: { file: "Deer", length: 1.7, clips: { ...ANIMAL, attack: "Attack_Headbutt" }, walkPace: 1.6, runPace: 7 },
  stag: { file: "Stag", length: 2.1, clips: { ...ANIMAL, attack: "Attack_Headbutt" }, walkPace: 1.8, runPace: 7.5 },
  spider: { file: "Spider", length: 2.1, clips: { idle: "Spider_Idle", walk: "Spider_Walk", attack: "Spider_Attack", dead: "Spider_Death" }, walkPace: 3 },
  giant_rat: { file: "Rat", length: 1.5, clips: { idle: "Rat_Idle", walk: "Rat_Walk", run: "Rat_Run", attack: "Rat_Attack", dead: "Rat_Death" }, walkPace: 1.5, runPace: 4.5 },
  wasp: { file: "Wasp", length: 0.5, clips: { idle: "Wasp_Flying", walk: "Wasp_Flying", attack: "Wasp_Attack", dead: "Wasp_Death" }, hover: 1.1 },
  adder: { file: "Snake_angry", length: 1.15, clips: { idle: "Snake_Idle", walk: "Snake_Walk", attack: "Snake_Attack" }, walkPace: 2.5 },
  bog_toad: { file: "Frog", length: 1.5, clips: { idle: "Frog_Idle", walk: "Frog_Jump", attack: "Frog_Attack", dead: "Frog_Death" }, walkPace: 2.5 },
};

/** Companions that borrow a creature model (pets are smaller; their colour tints the model). */
const COMPANION_MODELS: Record<string, string> = { wolf: "wolf", hound: "wolf", rat: "giant_rat" };

const FILES = [...new Set(Object.values(MODELS).map((m) => m.file))];

interface Source {
  gltf: GLTF;
  /** Scale that makes the model one metre long, and its height at that scale. */
  unit: number;
  heightPerMetre: number;
}

let library: CreatureLibrary | null = null;

export class CreatureLibrary {
  private readonly sources = new Map<string, Source>();
  private readonly materials = new Map<string, THREE.Material>();
  ready = false;

  async load(base: string): Promise<void> {
    const loader = new GLTFLoader();
    const dir = `${base}quaternius/`;
    const loaded = await Promise.all(FILES.map((f) => loadModel(loader, dir, f)));
    FILES.forEach((f, i) => {
      const gltf = loaded[i]!;
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const long = Math.max(size.x, size.z) || 1;
      this.sources.set(f, { gltf, unit: 1 / long, heightPerMetre: size.y / long });
    });
    this.ready = true;
    library = this;
  }

  create(kind: string, opts: { scale?: number; tint?: string } = {}): CreatureAvatar | null {
    const def = MODELS[kind];
    const src = def ? this.sources.get(def.file) : undefined;
    if (!def || !src) return null;
    const length = def.length * (opts.scale ?? 1);
    const model = SkeletonUtils.clone(src.gltf.scene);
    const tint = opts.tint ?? def.tint;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.frustumCulled = false;
      m.material = Array.isArray(m.material) ? m.material.map((x) => this.material(x, tint)) : this.material(m.material, tint);
    });
    model.scale.multiplyScalar(src.unit * length);
    return new CreatureAvatar(model, src.gltf.animations, def, src.heightPerMetre * length);
  }

  private material(src: THREE.Material, tint?: string): THREE.Material {
    const key = `${src.uuid}|${tint ?? ""}`;
    let m = this.materials.get(key);
    if (!m) {
      const toon = toToon(src);
      if (tint) toon.color.multiply(new THREE.Color(tint));
      m = toon;
      this.materials.set(key, m);
    }
    return m;
  }
}

/** A creature for an enemy kind, if there's a model for it and it has loaded. */
export function createCreatureAvatar(kind: string): CreatureAvatar | null {
  return library?.ready ? library.create(kind) : null;
}

/** A pet (wolf pup, hound, rat) from a creature model, tinted its own colour. */
export function createCreatureCompanion(kind: string, color: string, scale: number): CreatureAvatar | null {
  const model = COMPANION_MODELS[kind];
  if (!model || !library?.ready) return null;
  return library.create(model, { scale: 0.75 * scale, tint: `#${new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35).getHexString()}` });
}

const ACTION_SECONDS = 0.6;

export class CreatureAvatar {
  readonly root = new THREE.Group();
  readonly height: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipRole, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private anim = "idle";
  private seq = -1;
  private oneShot = false;
  /** Creatures without a death clip topple over instead. */
  private topple = 0;

  constructor(
    private readonly model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    private readonly def: CreatureModel,
    height: number,
  ) {
    this.height = height + (def.hover ?? 0) + 0.3;
    this.root.add(model);
    model.position.y = def.hover ?? 0;
    this.mixer = new THREE.AnimationMixer(model);
    for (const [role, name] of Object.entries(def.clips) as Array<[ClipRole, string]>) {
      const clip = clips.find((c) => c.name === name || c.name.endsWith(`|${name}`));
      if (clip) this.actions.set(role, this.mixer.clipAction(clip));
    }
    this.mixer.addEventListener("finished", () => {
      this.oneShot = false;
    });
    this.play("idle");
  }

  private play(role: ClipRole, opts: { once?: boolean; clamp?: boolean } = {}): THREE.AnimationAction | null {
    const action = this.actions.get(role) ?? (role === "run" ? this.actions.get("walk") : undefined) ?? this.actions.get("idle");
    if (!action) return null;
    if (opts.once) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = !!opts.clamp;
      action.timeScale = opts.clamp ? 1 : action.getClip().duration / ACTION_SECONDS;
      this.oneShot = !opts.clamp;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      if (this.current === action) return action;
    }
    if (this.current && this.current !== action) {
      action.enabled = true;
      action.setEffectiveWeight(1);
      action.crossFadeFrom(this.current, 0.12, false);
    }
    action.play();
    this.current = action;
    return action;
  }

  setAnim(anim: string, actionSeq: number): void {
    if (actionSeq !== this.seq && this.seq !== -1 && (anim === "attack" || anim === "cast")) this.play("attack", { once: true });
    else if (anim === "dead" && this.anim !== "dead") {
      if (this.actions.has("dead")) this.play("dead", { once: true, clamp: true });
      else this.play("idle");
    } else if (this.anim === "dead" && anim !== "dead") {
      this.oneShot = false;
      this.play("idle");
    }
    this.anim = anim;
    this.seq = actionSeq;
  }

  update(dt: number, moveSpeed: number): void {
    const dead = this.anim === "dead";
    if (!dead && !this.oneShot) {
      if (moveSpeed > 0.3) {
        const run = !!this.def.runPace && moveSpeed > (this.def.walkPace ?? 1.5) * 1.6;
        const a = this.play(run ? "run" : "walk");
        const pace = run ? this.def.runPace! : (this.def.walkPace ?? 0);
        if (a) a.timeScale = pace ? THREE.MathUtils.clamp(moveSpeed / pace, 0.6, 2) : 1;
      } else {
        const a = this.play("idle");
        if (a) a.timeScale = 1;
      }
    }
    // No death clip: roll onto its side and settle.
    this.topple = THREE.MathUtils.clamp(this.topple + (dead && !this.actions.has("dead") ? dt * 3 : -dt * 3), 0, 1);
    this.model.rotation.z = this.topple * Math.PI * 0.5;
    if (this.def.hover) this.model.position.y = this.def.hover * (dead ? Math.max(0, 1 - this.topple) : 1) + (dead ? 0 : Math.sin(performance.now() / 180) * 0.08);
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
  }
}
