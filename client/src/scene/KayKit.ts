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
    const [anim, ...models] = await Promise.all([loadModel(loader, dir, "animations"), ...SOURCES.map((s) => loadModel(loader, dir, s))]);
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

// ---------------------------------------------------------------------------
// Loading that works on strict hosts
// ---------------------------------------------------------------------------

interface GltfJson {
  buffers?: Array<{ byteLength: number; uri?: string }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number }>;
  images?: Array<{ bufferView?: number; mimeType?: string }>;
  textures?: Array<{ source?: number }>;
  samplers?: unknown[];
  materials?: Array<{ name?: string; pbrMetallicRoughness?: { baseColorTexture?: { index: number } } }>;
}

const GLB_MAGIC = 0x46546c67;

/**
 * Load a model as `.glb`, or as `.gltf.json` (the same model with its data
 * inlined, for hosts that won't serve .glb). Textures are decoded here
 * rather than by GLTFLoader, and the binary data is handed over directly, so
 * nothing goes through data: or blob: URLs, which some hosts' security
 * policies block.
 */
async function loadModel(loader: GLTFLoader, dir: string, name: string): Promise<GLTF> {
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  try {
    const res = await fetch(`${dir}${name}.glb`);
    const buf = res.ok ? await res.arrayBuffer() : null;
    if (buf && buf.byteLength > 20 && new DataView(buf).getUint32(0, true) === GLB_MAGIC) {
      const dv = new DataView(buf);
      const jsonLen = dv.getUint32(12, true);
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen))) as GltfJson;
      const binLen = dv.getUint32(20 + jsonLen, true);
      bin = new Uint8Array(buf, 28 + jsonLen, binLen);
    }
  } catch {
    // Fall through to the JSON copy.
  }
  if (!json || !bin) {
    const res = await fetch(`${dir}${name}.gltf.json`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    json = (await res.json()) as GltfJson;
    const uri = json.buffers?.[0]?.uri ?? "";
    const raw = atob(uri.slice(uri.indexOf(",") + 1));
    bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
  }

  // Take the textures out; they're decoded below and put back on the materials.
  const images = (json.images ?? []).map((img) => {
    const bv = json!.bufferViews[img.bufferView ?? -1];
    return bv ? { bytes: bin!.slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), mime: img.mimeType ?? "image/png" } : null;
  });
  const imageFor = new Map<string, number>();
  for (const m of json.materials ?? []) {
    const ti = m.pbrMetallicRoughness?.baseColorTexture?.index;
    if (ti === undefined) continue;
    const src = json.textures?.[ti]?.source;
    if (src !== undefined && m.name) imageFor.set(m.name, src);
    delete m.pbrMetallicRoughness!.baseColorTexture;
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;
  if (json.buffers?.[0]) delete json.buffers[0].uri;

  const gltf = await loader.parseAsync(packGlb(json, bin), dir);
  const textures = await Promise.all(
    images.map(async (img) => {
      if (!img) return null;
      const bitmap = await createImageBitmap(new Blob([img.bytes], { type: img.mime }), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
      const tex = new THREE.Texture(bitmap as unknown as HTMLImageElement);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      return tex;
    }),
  );
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const i = imageFor.get(mat.name);
      const tex = i !== undefined ? textures[i] : null;
      if (tex) {
        (mat as THREE.MeshStandardMaterial).map = tex;
        mat.needsUpdate = true;
      }
    }
  });
  return gltf;
}

function packGlb(json: GltfJson, bin: Uint8Array): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = (text.length + 3) & ~3;
  const binLen = (bin.length + 3) & ~3;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new ArrayBuffer(total);
  const dv = new DataView(out);
  const u8 = new Uint8Array(out);
  dv.setUint32(0, GLB_MAGIC, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true); // JSON
  u8.set(text, 20);
  u8.fill(0x20, 20 + text.length, 20 + jsonLen);
  const o = 20 + jsonLen;
  dv.setUint32(o, binLen, true);
  dv.setUint32(o + 4, 0x004e4942, true); // BIN
  u8.set(bin, o + 8);
  return out;
}
