import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { toToon } from "./toon.ts";

/**
 * KayKit characters (CC0, Kay Lousberg; see docs/ASSETS.md), assembled from
 * parts. Every KayKit character shares one skeleton, so a head, hat, cloak or
 * weapon from one model fits any other, and one animation library drives
 * them all. Colours are changed by repainting cells of the models' palette
 * textures (each is an 8×4 grid of shaded swatches).
 *
 * Built by scripts/build-models.ts into public/assets/models/kaykit/.
 */

export type KitSource =
  | "Knight"
  | "Barbarian"
  | "Mage"
  | "Rogue"
  | "Rogue_Hooded"
  | "Skeleton_Minion"
  | "Skeleton_Warrior"
  | "Skeleton_Rogue"
  | "Skeleton_Mage"
  | "Skeleton_Axe"
  | "Skeleton_Blade"
  | "Skeleton_Staff"
  | "Skeleton_Shield_Small_A";

const SOURCES: readonly KitSource[] = [
  "Knight",
  "Barbarian",
  "Mage",
  "Rogue",
  "Rogue_Hooded",
  "Skeleton_Minion",
  "Skeleton_Warrior",
  "Skeleton_Rogue",
  "Skeleton_Mage",
  "Skeleton_Axe",
  "Skeleton_Blade",
  "Skeleton_Staff",
  "Skeleton_Shield_Small_A",
];

/** Palette cell "col,row" → colour. Keyed by the texture's material name (knight_texture, rogue_texture…). */
export type Recolor = Record<string, Record<string, string>>;

export interface KitProp {
  from: KitSource;
  node: string;
  /** Bone to hang it on (sanitised name, e.g. "handslotr"); default: where it hangs in its own model. */
  bone?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export interface KitSpec {
  /** Skinned body parts (any source). */
  parts: Array<{ from: KitSource; node: string }>;
  /** Rigid pieces: hats, cloaks, weapons, shields. */
  props?: KitProp[];
  /** Procedural objects to hang on bones (weapons KayKit doesn't have). */
  extras?: Array<{ object: THREE.Object3D; bone: string }>;
  recolor?: Recolor;
  /** Glowing eyes (skeletons): colour of the "Glow" material. */
  glow?: string;
  /** Overall height (m) and width factor. */
  height: number;
  width?: number;
}

export interface KitInstance {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: ReadonlyMap<string, THREE.AnimationClip>;
}

const CELL_COLS = 8;
const CELL_ROWS = 4;
/** Recoloured palettes are repainted at this size (the swatches are simple gradients). */
const PALETTE_SIZE = 256;

export class KayKitLibrary {
  private readonly sources = new Map<KitSource, GLTF>();
  private clips = new Map<string, THREE.AnimationClip>();
  /** Bind-pose height of a KayKit character, in model units. */
  private modelHeight = 2.6;
  private readonly materials = new Map<string, THREE.Material>();
  private readonly palettes = new Map<string, THREE.Texture>();
  ready = false;

  async load(base: string): Promise<void> {
    const loader = new GLTFLoader();
    const dir = `${base}kaykit/`;
    // Hosts that won't serve .glb get the same models as embedded glTF JSON.
    const get = (name: string) => loader.loadAsync(`${dir}${name}.glb`).catch(() => loader.loadAsync(`${dir}${name}.gltf.json`));
    const [anim, ...models] = await Promise.all([get("animations"), ...SOURCES.map((s) => get(s))]);
    SOURCES.forEach((s, i) => this.sources.set(s, models[i]!));
    this.clips = new Map(anim!.animations.map((c) => [c.name, c]));
    const knight = this.sources.get("Knight")!.scene;
    knight.updateMatrixWorld(true);
    const box = new THREE.Box3();
    knight.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.geometry.computeBoundingBox();
      box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
    });
    if (!box.isEmpty()) this.modelHeight = box.max.y - box.min.y;
    this.ready = true;
  }

  build(spec: KitSpec): KitInstance {
    // The rig comes from the first part's model; everything else is bound to its bones.
    const rigSource = spec.parts[0]?.from ?? "Knight";
    const rig = SkeletonUtils.clone(this.sources.get(rigSource)!.scene);
    const bones = new Map<string, THREE.Bone>();
    rig.traverse((o) => {
      if ((o as THREE.Bone).isBone) bones.set(o.name, o as THREE.Bone);
    });
    // Drop every mesh the rig model came with; parts are added back below.
    const drop: THREE.Object3D[] = [];
    rig.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) drop.push(o);
    });
    for (const o of drop) o.removeFromParent();
    const armature = rig.getObjectByName("Rig") ?? rig;

    const props: KitProp[] = [...(spec.props ?? [])];
    for (const part of spec.parts) {
      const src = this.find(part.from, part.node) as THREE.SkinnedMesh | undefined;
      if (!src) continue;
      if (!src.isSkinnedMesh) {
        // A rigid piece (hat, hood, cape) listed as a part: hang it where it hangs in its own model.
        props.push(part);
        continue;
      }
      const mesh = new THREE.SkinnedMesh(src.geometry, this.material(src.material as THREE.Material, spec));
      mesh.name = src.name;
      mesh.position.copy(src.position);
      mesh.quaternion.copy(src.quaternion);
      mesh.scale.copy(src.scale);
      const skeleton = new THREE.Skeleton(
        src.skeleton.bones.map((b) => bones.get(b.name) ?? b),
        src.skeleton.boneInverses,
      );
      armature.add(mesh);
      mesh.bind(skeleton, src.bindMatrix);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
    }

    for (const prop of props) {
      const src = this.find(prop.from, prop.node);
      if (!src) continue;
      const obj = src.clone(true);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.material = this.material(m.material as THREE.Material, spec);
        m.castShadow = true;
      });
      const bone = bones.get(prop.bone ?? src.parent?.name ?? "") ?? armature;
      if (prop.position) obj.position.set(...prop.position);
      if (prop.rotation) obj.rotation.set(...prop.rotation);
      if (prop.scale) obj.scale.multiplyScalar(prop.scale);
      bone.add(obj);
    }
    for (const e of spec.extras ?? []) (bones.get(e.bone) ?? armature).add(e.object);

    const root = new THREE.Group();
    const s = spec.height / this.modelHeight;
    rig.scale.set(s * (spec.width ?? 1), s, s * (spec.width ?? 1));
    root.add(rig);
    return { root, mixer: new THREE.AnimationMixer(rig), clips: this.clips };
  }

  private find(source: KitSource, node: string): THREE.Object3D | undefined {
    return this.sources.get(source)?.scene.getObjectByName(node);
  }

  /** The toon version of a model's material, with its palette repainted for this spec (cached and shared). */
  private material(src: THREE.Material, spec: KitSpec): THREE.Material {
    const texName = src.name;
    const recolor = spec.recolor?.[texName];
    const glow = src.name === "Glow" ? spec.glow : undefined;
    const key = `${src.uuid}|${recolor ? JSON.stringify(recolor) : ""}|${glow ?? ""}`;
    let m = this.materials.get(key);
    if (m) return m;
    const toon = toToon(src);
    const map = (src as THREE.MeshStandardMaterial).map;
    if (recolor && map?.image) toon.map = this.palette(map, recolor);
    if (glow) {
      toon.color.set(glow);
      toon.emissive.set(glow);
      toon.emissiveIntensity = 1.2;
    }
    m = toon;
    this.materials.set(key, m);
    return m;
  }

  private palette(map: THREE.Texture, recolor: Record<string, string>): THREE.Texture {
    const key = `${map.uuid}|${JSON.stringify(recolor)}`;
    const hit = this.palettes.get(key);
    if (hit) return hit;
    const canvas = document.createElement("canvas");
    canvas.width = PALETTE_SIZE;
    canvas.height = PALETTE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(map.image as CanvasImageSource, 0, 0, PALETTE_SIZE, PALETTE_SIZE);
    const cw = PALETTE_SIZE / CELL_COLS;
    const ch = PALETTE_SIZE / CELL_ROWS;
    for (const [cell, hex] of Object.entries(recolor)) {
      const [cx, cy] = cell.split(",").map(Number) as [number, number];
      const img = ctx.getImageData(cx * cw, cy * ch, cw, ch);
      const d = img.data;
      // Keep the swatch's shading: scale the new colour by each pixel's brightness relative to the swatch's average.
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;
      const avg = Math.max(1, sum / (d.length / 4));
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      for (let i = 0; i < d.length; i += 4) {
        const k = (0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!) / avg;
        d[i] = Math.min(255, r * k);
        d[i + 1] = Math.min(255, g * k);
        d[i + 2] = Math.min(255, b * k);
      }
      ctx.putImageData(img, cx * cw, cy * ch);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = map.flipY;
    tex.colorSpace = map.colorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.palettes.set(key, tex);
    return tex;
  }
}
