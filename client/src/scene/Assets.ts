import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { PropKind } from "@rpg/shared";
import { applyOcclusionCutout } from "./occlusion.ts";
import { toToon } from "./toon.ts";
import { KayKitLibrary } from "./KayKit.ts";
import { CreatureLibrary } from "./Creatures.ts";
import { setKitLibrary } from "./KitAvatars.ts";

/**
 * Optional glTF model overrides.
 *
 * The game ships with procedural low-poly placeholders so it runs with zero
 * downloads. Drop CC0 model packs into client/public/assets/models/ and map
 * them in manifest.json (see manifest.example.json and docs/ASSETS.md) to
 * replace any character, enemy or prop. Anything missing or failing to load
 * silently falls back to the placeholder.
 */

export type AnimName = "idle" | "walk" | "attack" | "cast" | "dead";

export interface ModelEntry {
  /** Path relative to /assets/models/. */
  url: string;
  scale?: number;
  /** Extra Y rotation (radians) if the model doesn't face +Z. */
  rotationY?: number;
  /** Optional separate file holding animation clips for the same skeleton. */
  animations?: string;
  /** Map our animation names to clip names inside the glTF. */
  clips?: Partial<Record<AnimName, string>>;
}

export interface Manifest {
  /** Keys: a class id from the progression tree (e.g. "paladin"), a base class ("fighter"), or "default". */
  characters?: Record<string, ModelEntry>;
  /** Keys: enemy kind id (wolf, boar, thornling). */
  enemies?: Record<string, ModelEntry>;
  props?: Partial<Record<PropKind, ModelEntry>>;
}

interface Loaded {
  entry: ModelEntry;
  gltf: GLTF;
  clips: THREE.AnimationClip[];
}

const BASE = `${import.meta.env.BASE_URL}assets/models/`;

export class AssetLibrary {
  private readonly characters = new Map<string, Loaded>();
  private readonly enemies = new Map<string, Loaded>();
  private readonly props = new Map<string, Loaded>();
  /** The KayKit characters (people and the undead); procedural placeholders until loaded. */
  readonly kaykit = new KayKitLibrary();
  /** Quaternius creatures (wolves, spiders, deer…); procedural beasts until loaded. */
  readonly creatures = new CreatureLibrary();
  /** Why the character models didn't load (shown under the creation preview). */
  kitError = "";
  private loading: Promise<void> | null = null;

  /** Load once; later calls share the same promise. */
  load(onProgress?: (text: string) => void): Promise<void> {
    this.loading ??= this.loadAll(onProgress);
    return this.loading;
  }

  private async loadAll(onProgress?: (text: string) => void): Promise<void> {
    // ?placeholders keeps the procedural characters (weak devices, or comparing).
    const skipKit = new URLSearchParams(location.search).has("placeholders");
    const kit = (skipKit ? Promise.reject(new Error("placeholders requested")) : this.kaykit.load(BASE)).then(
      () => setKitLibrary(this.kaykit),
      (err) => {
        if (!skipKit) this.kitError = String((err as Error)?.message ?? err);
        console.warn("[assets] KayKit characters unavailable, using placeholders", err);
      },
    );
    let manifest: Manifest = {};
    try {
      const res = await fetch(`${BASE}manifest.json`, { cache: "no-cache" });
      if (res.ok) manifest = (await res.json()) as Manifest;
    } catch {
      // No manifest: placeholders only.
    }

    const loader = new GLTFLoader();
    const jobs: Promise<void>[] = [];
    const queue = (bucket: Map<string, Loaded>, key: string, entry: ModelEntry) => {
      jobs.push(
        (async () => {
          try {
            const gltf = await loader.loadAsync(BASE + entry.url);
            let clips = gltf.animations;
            if (entry.animations) {
              const anim = await loader.loadAsync(BASE + entry.animations);
              clips = [...clips, ...anim.animations];
            }
            bucket.set(key, { entry, gltf, clips });
            onProgress?.(`Loaded ${entry.url}`);
          } catch (err) {
            console.warn(`[assets] could not load ${entry.url}, using placeholder`, err);
          }
        })(),
      );
    };
    for (const [k, e] of Object.entries(manifest.characters ?? {})) queue(this.characters, k, e);
    for (const [k, e] of Object.entries(manifest.enemies ?? {})) queue(this.enemies, k, e);
    for (const [k, e] of Object.entries(manifest.props ?? {})) if (e) queue(this.props, k, e);
    const creatures = (skipKit ? Promise.reject(new Error("placeholders requested")) : this.creatures.load(BASE)).catch((err) => {
      console.warn("[assets] creature models unavailable, using placeholders", err);
    });
    await Promise.all([...jobs, kit, creatures]);
  }

  character(classId: string, baseId: string): GltfInstance | null {
    const l = this.characters.get(classId) ?? this.characters.get(baseId) ?? this.characters.get("default");
    return l ? instantiate(l) : null;
  }

  enemy(kind: string): GltfInstance | null {
    const l = this.enemies.get(kind);
    return l ? instantiate(l) : null;
  }

  hasProp(kind: PropKind): boolean {
    return this.props.has(kind);
  }

  /** Build InstancedMeshes for every mesh in a glTF prop, or null if none is configured. */
  instancedProp(kind: PropKind, matrices: THREE.Matrix4[]): THREE.InstancedMesh[] | null {
    const l = this.props.get(kind);
    if (!l) return null;
    const root = l.gltf.scene;
    const base = new THREE.Matrix4().compose(
      new THREE.Vector3(),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), l.entry.rotationY ?? 0),
      new THREE.Vector3().setScalar(l.entry.scale ?? 1),
    );
    root.updateMatrixWorld(true);
    const out: THREE.InstancedMesh[] = [];
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const local = base.clone().multiply(mesh.matrixWorld);
      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => applyOcclusionCutout(toToon(m)));
      const inst = new THREE.InstancedMesh(mesh.geometry, materials.length === 1 ? materials[0]! : materials, matrices.length);
      const tmp = new THREE.Matrix4();
      matrices.forEach((m, i) => inst.setMatrixAt(i, tmp.multiplyMatrices(m, local)));
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      out.push(inst);
    });
    return out;
  }
}

export interface GltfInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Partial<Record<AnimName, THREE.AnimationAction>>;
}

function instantiate(l: Loaded): GltfInstance {
  const model = SkeletonUtils.clone(l.gltf.scene);
  model.scale.setScalar(l.entry.scale ?? 1);
  model.rotation.y = l.entry.rotationY ?? 0;
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Match the cel-shaded look of the rest of the world.
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(toToon) : toToon(mesh.material);
    }
  });
  const root = new THREE.Group();
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions: GltfInstance["actions"] = {};
  const names: AnimName[] = ["idle", "walk", "attack", "cast", "dead"];
  for (const n of names) {
    const clipName = l.entry.clips?.[n];
    const clip = clipName ? THREE.AnimationClip.findByName(l.clips, clipName) : guessClip(l.clips, n);
    if (clip) actions[n] = mixer.clipAction(clip);
  }
  return { root, mixer, actions };
}

/** Best-effort clip lookup by common naming conventions when the manifest doesn't specify one. */
function guessClip(clips: THREE.AnimationClip[], name: AnimName): THREE.AnimationClip | undefined {
  const patterns: Record<AnimName, RegExp> = {
    idle: /idle/i,
    walk: /walk|run/i,
    attack: /attack|slash|chop|stab|punch|shoot/i,
    cast: /cast|spell|magic|shoot/i,
    dead: /death|die|dead/i,
  };
  return clips.find((c) => patterns[name].test(c.name));
}
