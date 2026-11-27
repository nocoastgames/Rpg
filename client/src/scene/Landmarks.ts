import * as THREE from "three";
import { CRYPT_HEART, CRYPT_ORIGIN, CRYPT_ROOMS, cryptSdf, getFaith, mulberry32, type GateId, type Structure, type World } from "@rpg/shared";
import { applyOcclusionCutout } from "./occlusion.ts";
import { toonMaterial } from "./toon.ts";
import { groundHeight } from "./Environment.ts";

/**
 * Procedural meshes for the hand-placed landmarks: the unknown ruins, the
 * thorn-choked cave mouth and the rockslide across the pass. Gate pieces are
 * hidden (or moved) when the server opens the gate.
 */

const mats = new Map<string, THREE.MeshToonMaterial>();
function mat(color: string, emissive?: string): THREE.MeshToonMaterial {
  const key = color + (emissive ?? "");
  let m = mats.get(key);
  if (!m) {
    m = applyOcclusionCutout(toonMaterial({ color }));
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 1;
    }
    mats.set(key, m);
  }
  return m;
}

const STONE = "#a8a294";
const STONE_DARK = "#8a8478";
const MOSS = "#6f7d4a";

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export class Landmarks {
  readonly group = new THREE.Group();
  private readonly shrines = new Map<string, { obj: THREE.Object3D; light: THREE.PointLight; beacon: THREE.Mesh; color: string }>();
  private calling: { faith: string; prayed: boolean } | null = null;
  private camp: { site: THREE.Group; built: THREE.Group; flames: THREE.Mesh[]; fire: THREE.PointLight } | null = null;
  private campBuilt = false;
  private glowMul = 1;
  private crypt: { door: THREE.Object3D; thorns: THREE.Object3D; light: THREE.PointLight } | null = null;
  private cellTorch: { light: THREE.PointLight; flame: THREE.Mesh } | null = null;
  private cryptKey = "";
  /** The crypt under Ashford: its lights (only lit while you're down there) and the thorn heart. */
  private readonly cryptLights: THREE.Light[] = [];
  private cryptHeart: { thorns: THREE.Object3D; ash: THREE.Object3D; light: THREE.PointLight } | null = null;
  private readonly gated = new Map<GateId, THREE.Object3D[]>();
  private readonly runeMat: THREE.MeshToonMaterial;
  private readonly seals: THREE.Object3D[] = [];

  constructor(world: World) {
    this.runeMat = toonMaterial({ color: "#7fe3ff", emissive: "#4fd2ff", emissiveIntensity: 1.5 });
    const rng = mulberry32(777);
    for (const s of world.structures) {
      const obj = this.build(s, rng);
      if (!obj) continue;
      obj.position.set(s.x, groundHeight(s.x, s.z), s.z);
      obj.rotation.y = s.rotation;
      this.group.add(obj);
      // A few static glows give the sealed places a presence in the dark.
      if (s.kind === "thorns") this.glow(obj, "#8a5cff", 40, 14, 2.5);
      if (s.kind === "seal") this.glow(obj, "#4fd2ff", 18, 10, 1.6);
      if (s.kind === "shrine" && s.faith) this.registerShrine(s.faith, obj);
      if (s.gate) {
        let list = this.gated.get(s.gate);
        if (!list) this.gated.set(s.gate, (list = []));
        list.push(obj);
      }
    }
  }

  private readonly glows: Array<{ light: THREE.PointLight; base: number }> = [];

  private glow(parent: THREE.Object3D, color: string, intensity: number, distance: number, y: number): void {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.y = y;
    parent.add(light);
    this.glows.push({ light, base: intensity });
  }

  /** Scale landmark glows with the time of day (stronger at night). */
  setGlow(multiplier: number): void {
    this.glowMul = multiplier;
    for (const g of this.glows) g.light.intensity = g.base * multiplier;
  }

  // --- Shrines ----------------------------------------------------------------

  private registerShrine(faith: string, obj: THREE.Object3D): void {
    const color = getFaith(faith)?.color ?? "#ffffff";
    const light = new THREE.PointLight(color, 0, 9, 2);
    light.position.y = 2;
    obj.add(light);
    // A column of light that calls the god's followers from across the valley.
    const beaconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 26, 12, 1, true), beaconMat);
    beacon.position.y = 13;
    beacon.visible = false;
    obj.add(beacon);
    this.shrines.set(faith, { obj, light, beacon, color });
  }

  /** Your god's shrine calls to you: a pillar of light until you have prayed there, a warm glow after. */
  setCalling(faith: string, prayed: boolean): void {
    if (this.calling?.faith === faith && this.calling.prayed === prayed) return;
    this.calling = { faith, prayed };
    for (const [id, sh] of this.shrines) sh.beacon.visible = id === faith && !prayed;
  }

  /** Ashford's crypt: the door swings open once unlocked; the thorns burn away. */
  setCrypt(open: boolean, burned: boolean): void {
    const key = `${open}|${burned}`;
    if (!this.crypt || key === this.cryptKey) return;
    this.cryptKey = key;
    this.crypt.door.rotation.y = open ? -1.9 : 0;
    this.crypt.thorns.visible = !burned;
    this.crypt.light.color.set(burned ? "#ff9a4a" : "#8a5cff");
    if (this.cryptHeart) {
      this.cryptHeart.thorns.visible = !burned;
      this.cryptHeart.ash.visible = burned;
      this.cryptHeart.light.color.set(burned ? "#ff7a3a" : "#8a5cff");
      this.cryptHeart.light.intensity = burned ? 6 : 26;
    }
  }

  /** Underground lights only burn while you're underground (every light costs every surface). */
  setRegion(region: string): void {
    for (const l of this.cryptLights) l.visible = region === "crypt";
  }

  // --- Campsite ---------------------------------------------------------------

  setCampBuilt(built: boolean): void {
    if (!this.camp || this.campBuilt === built) return;
    this.campBuilt = built;
    this.camp.site.visible = !built;
    this.camp.built.visible = built;
  }

  setGateOpen(gate: GateId, open: boolean): void {
    for (const obj of this.gated.get(gate) ?? []) {
      if (this.seals.includes(obj)) {
        // The ruins' slab slides aside instead of vanishing.
        const child = obj.children[0];
        if (child) child.position.x = open ? 2.4 : 0;
      } else {
        obj.visible = !open;
      }
    }
  }

  update(time: number): void {
    this.runeMat.emissiveIntensity = 1.1 + Math.sin(time * 1.7) * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
    for (const [id, sh] of this.shrines) {
      const mine = this.calling?.faith === id;
      const base = mine ? (this.calling!.prayed ? 10 : 16 + pulse * 10) : 3;
      sh.light.intensity = base * Math.max(0.35, this.glowMul);
      if (sh.beacon.visible) (sh.beacon.material as THREE.MeshBasicMaterial).opacity = 0.12 + pulse * 0.14;
    }
    if (this.cellTorch) {
      const f = 1 + Math.sin(time * 8.3) * 0.1 + Math.sin(time * 4.1) * 0.08;
      this.cellTorch.light.intensity = 16 * f;
      this.cellTorch.flame.scale.set(1, f, 1);
    }
    if (this.camp && this.campBuilt) {
      const f = 1 + Math.sin(time * 9.1) * 0.08 + Math.sin(time * 5.3) * 0.06;
      this.camp.flames.forEach((m, i) => m.scale.set(1, f + Math.sin(time * 7 + i * 2) * 0.12, 1));
      this.camp.fire.intensity = 22 * f * Math.max(0.5, this.glowMul);
    }
  }

  private build(s: Structure, rng: () => number): THREE.Object3D | null {
    const g = new THREE.Group();
    switch (s.kind) {
      case "column": {
        const h = s.size ?? 4;
        g.add(mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), mat(STONE_DARK), 0, 0.17, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.42, 0.48, h, 8), mat(STONE), 0, h / 2 + 0.3, 0));
        g.add(mesh(new THREE.BoxGeometry(1.15, 0.35, 1.15), mat(STONE_DARK), 0, h + 0.45, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.49, 0.5, 0.8, 8), mat(MOSS), 0, 0.7, 0));
        break;
      }
      case "column_broken": {
        const h = s.size ?? 1.5;
        g.add(mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), mat(STONE_DARK), 0, 0.17, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.42, 0.48, h, 8), mat(STONE), 0, h / 2 + 0.3, 0));
        const top = mesh(new THREE.CylinderGeometry(0.0, 0.42, 0.5, 8), mat(STONE), 0.05, h + 0.5, 0);
        top.rotation.z = 0.5;
        g.add(top);
        g.add(mesh(new THREE.DodecahedronGeometry(0.35, 0), mat(STONE), 0.9, 0.2, 0.4));
        break;
      }
      case "column_fallen": {
        const len = s.size ?? 4;
        // Rotation points along the length; pieces lie along local Z.
        const a = mesh(new THREE.CylinderGeometry(0.42, 0.42, len * 0.55, 8), mat(STONE), 0, 0.42, -len * 0.2);
        a.rotation.x = Math.PI / 2;
        const b = mesh(new THREE.CylinderGeometry(0.42, 0.42, len * 0.35, 8), mat(STONE), 0.15, 0.4, len * 0.32);
        b.rotation.x = Math.PI / 2;
        b.rotation.z = 0.15;
        g.add(a, b, mesh(new THREE.BoxGeometry(1.1, 0.35, 1.1), mat(STONE_DARK), 0, 0.35, len * 0.55));
        break;
      }
      case "wall": {
        const len = s.size ?? 6;
        // Jagged top: blocks of varying height along local Z.
        const blocks = Math.max(2, Math.round(len / 1.1));
        for (let i = 0; i < blocks; i++) {
          const h = 1.2 + rng() * 1.8 * (1 - Math.abs(i / (blocks - 1) - 0.5));
          const z = (i / (blocks - 1) - 0.5) * (len - 1);
          g.add(mesh(new THREE.BoxGeometry(0.8, h, len / blocks + 0.05), mat(rng() < 0.25 ? MOSS : STONE), 0, h / 2, z));
        }
        g.add(mesh(new THREE.DodecahedronGeometry(0.45, 0), mat(STONE), 0.9, 0.2, len * 0.3));
        break;
      }
      case "arch": {
        for (const sx of [-2.1, 2.1]) {
          g.add(mesh(new THREE.BoxGeometry(1, 3.8, 1), mat(STONE), sx, 1.9, 0));
          g.add(mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), mat(STONE_DARK), sx, 0.2, 0));
        }
        const lintel = mesh(new THREE.BoxGeometry(5.6, 0.8, 1.1), mat(STONE_DARK), 0, 4.15, 0);
        lintel.rotation.z = 0.04;
        g.add(lintel);
        // Faint rune band across the lintel.
        g.add(mesh(new THREE.BoxGeometry(3.2, 0.08, 0.04), this.runeMat, 0, 4.15, 0.56));
        break;
      }
      case "dais": {
        g.add(mesh(new THREE.BoxGeometry(7.5, 0.35, 7.5), mat(STONE_DARK), 0, 0.17, 0));
        g.add(mesh(new THREE.BoxGeometry(5.5, 0.3, 5.5), mat(STONE), 0, 0.45, 0));
        // Dark stairwell opening (covered by the seal).
        g.add(mesh(new THREE.BoxGeometry(2, 0.05, 3), new THREE.MeshBasicMaterial({ color: "#050505" }), 0, 0.61, 0.6));
        break;
      }
      case "seal": {
        const slab = new THREE.Group();
        slab.add(mesh(new THREE.BoxGeometry(2.3, 0.22, 3.3), mat("#3c3a44"), 0, 0.72, 0));
        for (let i = 0; i < 5; i++) {
          const r = mesh(new THREE.BoxGeometry(0.08, 0.03, 0.6 + rng() * 1.6), this.runeMat, -0.8 + i * 0.4, 0.84, (rng() - 0.5) * 0.6);
          r.rotation.y = (rng() - 0.5) * 0.8;
          slab.add(r);
        }
        slab.add(mesh(new THREE.TorusGeometry(0.45, 0.04, 4, 16).rotateX(Math.PI / 2), this.runeMat, 0, 0.84, 0));
        g.add(slab);
        this.seals.push(g);
        break;
      }
      case "obelisk": {
        g.add(mesh(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 4), mat("#5a5866"), 0, 1.6, 0));
        const tip = mesh(new THREE.CylinderGeometry(0.0, 0.36, 1.3, 4), mat("#5a5866"), 0.5, 0.35, 1.1);
        tip.rotation.x = Math.PI / 2.2;
        g.add(tip);
        g.add(mesh(new THREE.BoxGeometry(0.05, 1.8, 0.05), this.runeMat, 0, 1.7, 0.42));
        break;
      }
      case "rubble": {
        for (let i = 0; i < 5; i++) {
          const b = mesh(new THREE.BoxGeometry(0.4 + rng() * 0.6, 0.3 + rng() * 0.4, 0.4 + rng() * 0.6), mat(rng() < 0.3 ? MOSS : STONE), (rng() - 0.5) * 1.8, 0.15, (rng() - 0.5) * 1.8);
          b.rotation.set(rng(), rng() * 3, rng() * 0.5);
          g.add(b);
        }
        g.scale.setScalar(s.scale);
        break;
      }
      case "boulder": {
        const b = mesh(new THREE.DodecahedronGeometry(1, 0), mat(rng() < 0.3 ? "#6e6a62" : "#7f7a70"), 0, 0.45, 0);
        b.scale.set(1.1, 0.8, 0.95);
        b.rotation.set(rng(), rng() * 3, rng());
        g.add(b);
        g.scale.setScalar(s.scale);
        break;
      }
      case "cave_mouth": {
        // Local +Z faces into the valley. Built a few metres back, at the cliff foot.
        const back = -3.4;
        const dark = new THREE.Mesh(new THREE.CircleGeometry(3, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: "#020203" }));
        dark.position.set(0, 0, back);
        dark.scale.set(1.15, 1.75, 1);
        g.add(dark);
        const inner = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.05, 3), new THREE.MeshBasicMaterial({ color: "#0b0b0d" }));
        inner.position.set(0, 0.03, back + 1.2);
        g.add(inner);
        // Rocky arch around the opening.
        for (let i = 0; i <= 10; i++) {
          const a = (i / 10) * Math.PI;
          const r = mesh(new THREE.DodecahedronGeometry(1 + rng() * 0.7, 0), mat(rng() < 0.4 ? "#5f5a54" : "#6f6a62"), Math.cos(a) * 3.9, Math.sin(a) * 5.6, back + 0.4 + rng() * 0.6);
          r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          g.add(r);
        }
        break;
      }
      case "thorns": {
        // A hedge of black thorns across the cave mouth. Local X runs across.
        for (let i = 0; i < 26; i++) {
          const x = (rng() - 0.5) * 6.8;
          const h = 1.0 + rng() * 1.9;
          const t = mesh(new THREE.ConeGeometry(0.12 + rng() * 0.12, h, 4), mat(rng() < 0.25 ? "#5a1a2e" : "#1c1424"), x, h / 2 - 0.1, (rng() - 0.5) * 1.4);
          t.rotation.set((rng() - 0.5) * 0.9, rng() * 3, (rng() - 0.5) * 0.9);
          g.add(t);
        }
        for (let i = 0; i < 8; i++) {
          const vine = mesh(new THREE.TorusGeometry(0.6 + rng() * 0.6, 0.05, 4, 8, Math.PI * 1.4), mat("#1c1620"), (rng() - 0.5) * 6, 0.8 + rng() * 1.4, (rng() - 0.5));
          vine.rotation.set(rng() * 3, rng() * 3, rng() * 3);
          g.add(vine);
        }
        break;
      }
      case "signpost": {
        g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), mat("#6b4e33"), 0, 1.1, 0));
        const arm = mesh(new THREE.BoxGeometry(0.1, 0.32, 1.2), mat("#7a5a3a"), 0, 1.8, 0.5);
        const arm2 = mesh(new THREE.BoxGeometry(0.1, 0.28, 0.9), mat("#7a5a3a"), 0, 1.35, -0.35);
        arm2.rotation.x = 0.35;
        g.add(arm, arm2);
        break;
      }
      case "shrine":
        this.buildShrine(g, s.faith ?? "", rng);
        break;
      case "camp":
        this.buildCamp(g, rng);
        break;
      case "vendor_cart":
        this.buildVendorCart(g);
        break;
      case "cottage":
      case "headman_house":
        this.buildCottage(g, s.kind === "headman_house", rng);
        break;
      case "chapel":
        this.buildChapel(g);
        break;
      case "well": {
        g.add(mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.8, 10, 1, true), mat(STONE), 0, 0.4, 0));
        g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 10), mat("#1c1620"), 0, 0.6, 0));
        for (const side of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), mat("#5e4329"), side * 0.75, 1.15, 0));
        g.add(mesh(new THREE.BoxGeometry(1.7, 0.1, 0.12), mat("#5e4329"), 0, 1.9, 0));
        // Black thorns spilling over the lip.
        for (let i = 0; i < 4; i++) {
          const t = mesh(new THREE.ConeGeometry(0.05, 0.6, 4), mat("#1c1620"), (rng() - 0.5) * 0.8, 0.85, (rng() - 0.5) * 0.8);
          t.rotation.set((rng() - 0.5) * 1.4, 0, (rng() - 0.5) * 1.4);
          g.add(t);
        }
        break;
      }
      case "cart": {
        g.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 2), mat("#7a5a3a"), 0, 0.75, 0));
        for (const [x, z] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6]] as const) {
          const wheel = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10), mat("#5e4329"), x, 0.42, z);
          wheel.rotation.z = Math.PI / 2;
          g.add(wheel);
        }
        // One wheel off, lying in the grass; the cart tilts.
        const off = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 10), mat("#5e4329"), 1.3, 0.05, -0.9);
        g.add(off);
        g.children[0]!.rotation.z = 0.12;
        g.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), mat("#8a6a42"), 0.1, 1.15, 0.4), mesh(new THREE.SphereGeometry(0.25, 6, 5), mat("#9a8a6a"), -0.2, 1.1, -0.4));
        break;
      }
      case "fence": {
        const len = s.size ?? 4;
        const posts = Math.max(2, Math.round(len / 1.4) + 1);
        for (let i = 0; i < posts; i++) {
          const t = i / (posts - 1) - 0.5;
          const post = mesh(new THREE.BoxGeometry(0.12, 0.9 + (i % 2) * 0.1, 0.12), mat("#6b4e33"), t * len, 0.45, 0);
          post.rotation.z = (rng() - 0.5) * 0.25;
          g.add(post);
        }
        for (const y of [0.35, 0.7]) {
          if (rng() < 0.2) continue;
          g.add(mesh(new THREE.BoxGeometry(len, 0.08, 0.06), mat("#7a5a3a"), 0, y, 0));
        }
        g.rotation.y = Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(g);
        return holder;
      }
      case "headstone": {
        const stone = mesh(new THREE.BoxGeometry(0.6, 0.8, 0.15), mat(rng() < 0.5 ? STONE : STONE_DARK), 0, 0.4, 0);
        stone.rotation.z = (rng() - 0.5) * 0.3;
        g.add(stone);
        // An open grave in front of most of them.
        if (rng() < 0.7) {
          const pit = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.6), mat("#2a2018"));
          pit.rotation.x = -Math.PI / 2;
          pit.position.set(0, 0.04, 1.05);
          g.add(pit, mesh(new THREE.DodecahedronGeometry(0.35, 0), mat("#5a4632"), 0.65, 0.12, 1.1));
        }
        break;
      }
      case "gate_posts":
        for (const side of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), mat("#5e4329"), side * 2, 1.1, 0));
        g.add(mesh(new THREE.BoxGeometry(4.4, 0.25, 0.25), mat("#5e4329"), 0, 2.1, 0));
        g.add(mesh(new THREE.BoxGeometry(1.4, 0.4, 0.06), mat("#8a6a42"), 0, 1.75, 0.15));
        break;
      case "crypt":
        this.buildCrypt(g, rng);
        break;
      case "cell":
        this.buildCell(g, rng);
        break;
      case "crypt_dungeon":
        this.buildCryptDungeon(g, rng);
        break;
      case "wolf_den":
        this.buildWolfDen(g, rng);
        break;
      case "drowned_mill":
      case "watchtower":
      case "standing_stones":
      case "barrow":
      case "hermit_hut":
      case "blackened_field":
      case "waystone":
      case "giant_ribs":
      case "glass_hollow":
        buildLoreSite(g, s.kind, rng);
        break;
      default:
        return null;
    }
    return g;
  }

  /** Every shrine stands on the same worn plinth; what rises from it says whose it is. */
  private buildShrine(g: THREE.Group, faith: string, rng: () => number): void {
    const color = getFaith(faith)?.color ?? "#cccccc";
    const glowMat = mat(color, color);
    g.add(mesh(new THREE.CylinderGeometry(1.1, 1.25, 0.3, 8), mat(STONE_DARK), 0, 0.15, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.25, 8), mat(STONE), 0, 0.42, 0));
    const top = 0.55;
    switch (faith) {
      case "solenne": {
        g.add(mesh(new THREE.BoxGeometry(0.5, 1.4, 0.4), mat("#ece6d6"), 0, top + 0.7, 0));
        const sun = mesh(new THREE.TorusGeometry(0.45, 0.07, 6, 16), mat("#e8c45a", "#e8b030"), 0, top + 1.75, 0);
        g.add(sun, mesh(new THREE.CircleGeometry(0.3, 12), glowMat, 0, top + 1.75, 0.01), mesh(new THREE.CircleGeometry(0.3, 12), glowMat, 0, top + 1.75, -0.01));
        (g.children[g.children.length - 1] as THREE.Mesh).rotation.y = Math.PI;
        break;
      }
      case "valdris": {
        const shield = mesh(new THREE.CylinderGeometry(0.7, 0.35, 1.8, 6, 1), mat("#9aa3ad"), 0, top + 0.9, 0);
        shield.scale.z = 0.25;
        g.add(shield, mesh(new THREE.SphereGeometry(0.18, 8, 6), glowMat, 0, top + 1.1, 0.18));
        break;
      }
      case "green_mother": {
        const stone = mesh(new THREE.DodecahedronGeometry(0.6, 0), mat(MOSS), 0, top + 0.45, 0);
        g.add(stone);
        const trunk = mesh(new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5), mat("#6b4e33"), 0.1, top + 1.3, 0);
        const crown = mesh(new THREE.IcosahedronGeometry(0.45, 0), mat("#4f8a3a"), 0.1, top + 2.0, 0);
        g.add(trunk, crown);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          g.add(mesh(new THREE.SphereGeometry(0.08, 5, 4), mat(["#e86a9a", "#f2d24a", "#ffffff"][i % 3]!, i % 3 === 1 ? "#a08020" : undefined), Math.sin(a) * 1.05, 0.34, Math.cos(a) * 1.05));
        }
        break;
      }
      case "orren": {
        g.add(mesh(new THREE.CylinderGeometry(0.14, 0.18, 2.4, 6), mat("#7a5a3a"), 0, top + 1.2, 0));
        for (let i = 0; i < 4; i++) {
          const arm = mesh(new THREE.BoxGeometry(0.9, 0.18, 0.06), mat(i % 2 ? "#8a6a42" : "#9a7a4a"), 0.35, top + 1.4 + i * 0.25, 0);
          arm.rotation.y = i * 1.4 + 0.3;
          arm.position.x = Math.cos(i * 1.4 + 0.3) * 0.35;
          arm.position.z = -Math.sin(i * 1.4 + 0.3) * 0.35;
          g.add(arm);
        }
        g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat, 0, top + 2.5, 0));
        break;
      }
      case "mirevel": {
        const slate = mesh(new THREE.BoxGeometry(1.1, 1.6, 0.18), mat("#4a4f5a"), 0, top + 0.8, 0);
        g.add(slate);
        for (let i = 0; i < 5; i++) g.add(mesh(new THREE.BoxGeometry(0.3 + rng() * 0.5, 0.05, 0.02), glowMat, (rng() - 0.5) * 0.3, top + 0.4 + i * 0.25, 0.1));
        break;
      }
      case "ferryman": {
        let y = top;
        for (let i = 0; i < 5; i++) {
          const r = 0.55 - i * 0.08;
          const st = mesh(new THREE.DodecahedronGeometry(r, 0), mat(i % 2 ? STONE_DARK : "#8f949a"), (rng() - 0.5) * 0.1, y + r * 0.6, (rng() - 0.5) * 0.1);
          st.scale.y = 0.6;
          g.add(st);
          y += r * 1.1;
        }
        g.add(mesh(new THREE.BoxGeometry(0.18, 0.26, 0.18), glowMat, 0, y + 0.1, 0));
        break;
      }
      case "kaelthar": {
        g.add(mesh(new THREE.BoxGeometry(1.3, 0.7, 0.8), mat("#2a2224"), 0, top + 0.35, 0));
        g.add(mesh(new THREE.BoxGeometry(1.1, 0.05, 0.08), glowMat, 0, top + 0.72, 0));
        const blade = mesh(new THREE.TorusGeometry(0.55, 0.06, 4, 12, Math.PI), mat("#5a4a4a"), 0, top + 0.75, 0);
        g.add(blade);
        break;
      }
      case "veiled_one": {
        const robe = mesh(new THREE.ConeGeometry(0.55, 1.9, 8), mat("#3a3248"), 0, top + 0.95, 0);
        const hood = mesh(new THREE.SphereGeometry(0.3, 8, 6), mat("#2e2838"), 0, top + 1.95, 0);
        hood.scale.set(1, 1.2, 1);
        g.add(robe, hood, mesh(new THREE.SphereGeometry(0.05, 5, 4), glowMat, -0.08, top + 1.95, 0.26), mesh(new THREE.SphereGeometry(0.05, 5, 4), glowMat, 0.08, top + 1.95, 0.26));
        break;
      }
      case "rot_below": {
        for (const side of [-1, 1]) {
          const half = mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.1, 6, 1, false, 0, Math.PI), mat("#4a3a2a"), side * 0.12, top + 0.55, 0);
          half.rotation.y = side > 0 ? 0 : Math.PI;
          half.rotation.z = side * 0.25;
          g.add(half);
        }
        for (let i = 0; i < 7; i++) {
          const thorn = mesh(new THREE.ConeGeometry(0.06, 0.6 + rng() * 0.4, 4), mat("#1c1620"), (rng() - 0.5) * 0.5, top + 1.0, (rng() - 0.5) * 0.5);
          thorn.rotation.set((rng() - 0.5) * 1.2, 0, (rng() - 0.5) * 1.2);
          g.add(thorn);
        }
        g.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), glowMat, 0, top + 0.6, 0));
        break;
      }
    }
  }

  /** Haskel's covered cart: a canvas hood, crates and a hanging lantern. */
  private buildVendorCart(g: THREE.Group): void {
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.5, 2.6), mat("#7a5a3a"), 0, 0.8, 0));
    for (const [x, z] of [[-0.9, 0.85], [0.9, 0.85], [-0.9, -0.85], [0.9, -0.85]] as const) {
      const wheel = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), mat("#5e4329"), x, 0.5, z);
      wheel.rotation.z = Math.PI / 2;
      g.add(wheel);
    }
    const hood = mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.5, 12, 1, true, 0, Math.PI), mat("#d8ccb0"), 0, 1.05, 0);
    hood.rotation.x = Math.PI / 2;
    hood.rotation.y = Math.PI / 2;
    g.add(hood);
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), mat("#8a6a42"), 1.3, 0.25, 0.9), mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), mat("#9a7a4a"), 1.35, 0.7, 0.85));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8), mat("#6b4e33"), 1.3, 0.25, -0.2));
    g.add(mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), mat("#5e4329"), -0.8, 1.6, 1.3));
    const lamp = mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), mat("#ffd27a", "#ffb030"), -0.8, 2.05, 1.45);
    g.add(lamp);
    this.glow(g, "#ffb35a", 10, 8, 2.1);
  }

  /** A farmhouse: plank walls, a sagging thatch roof with a hole, a dark doorway. */
  private buildCottage(g: THREE.Group, big: boolean, rng: () => number): void {
    const w = big ? 4.6 : 3.4;
    const d = big ? 3.6 : 2.8;
    const wall = mat(big ? "#a89474" : "#9a8a6e");
    g.add(mesh(new THREE.BoxGeometry(w, 2, d), wall, 0, 1, 0));
    g.add(mesh(new THREE.BoxGeometry(w + 0.1, 0.2, d + 0.1), mat("#6b4e33"), 0, 0.1, 0));
    for (const x of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.2, 2.1, 0.2), mat("#5e4329"), x, 1.05, d / 2));
    // Roof: two slopes, one with a hole torn in it.
    for (const side of [-1, 1]) {
      const slope = mesh(new THREE.BoxGeometry(w + 0.5, 0.18, d * 0.62), mat(side > 0 ? "#8a7448" : "#7a6640"), 0, 2.55, side * d * 0.25);
      slope.rotation.x = side * 0.62;
      g.add(slope);
    }
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.2, 0.7), mat("#2a2018"), w * 0.2, 2.62, d * 0.22));
    // Door hanging open, a dark window.
    g.add(mesh(new THREE.BoxGeometry(0.8, 1.4, 0.05), mat("#1c1814"), -w * 0.18, 0.7, d / 2 + 0.01));
    const door = mesh(new THREE.BoxGeometry(0.8, 1.4, 0.08), mat("#6b4e33"), -w * 0.18 - 0.55, 0.7, d / 2 + 0.35);
    door.rotation.y = 1.2;
    g.add(door);
    g.add(mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), mat("#1c1814"), w * 0.22, 1.3, d / 2 + 0.01));
    if (big) g.add(mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat(STONE_DARK), w / 2 - 0.4, 3.0, -d * 0.2));
    if (rng() < 0.6) g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat("#8a6a42"), w / 2 + 0.5, 0.25, d / 2 - 0.3));
  }

  /** Ashford's chapel: stone walls, a broken bell tower, eight-sided like the shrines. */
  private buildChapel(g: THREE.Group): void {
    g.add(mesh(new THREE.BoxGeometry(4, 3, 6.5), mat(STONE), 0, 1.5, 0));
    for (const side of [-1, 1]) {
      const slope = mesh(new THREE.BoxGeometry(2.7, 0.2, 6.9), mat("#5a5048"), side * 1.05, 3.6, 0);
      slope.rotation.z = -side * 0.62;
      g.add(slope);
    }
    g.add(mesh(new THREE.CylinderGeometry(1, 1.1, 5, 8), mat(STONE_DARK), 0, 2.5, -3.6));
    g.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.3, 8), mat("#6a6058"), 0, 5.1, -3.6));
    g.add(mesh(new THREE.BoxGeometry(1.1, 1.8, 0.08), mat("#1c1814"), 0, 0.9, 3.26));
    g.add(mesh(new THREE.CircleGeometry(0.55, 8), mat("#6a3a8a", "#3a1a5a"), 0, 2.3, 3.27));
  }

  /** The crypt beneath the chapel: steps down to an iron door, thorns pushing through. */
  private buildCrypt(g: THREE.Group, rng: () => number): void {
    g.add(mesh(new THREE.BoxGeometry(2.4, 0.4, 2.2), mat(STONE_DARK), 0, 0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.12, 1.6), mat("#1c1620"), 0, 0.41, 0.1));
    for (const side of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.3, 1.4, 0.3), mat(STONE), side * 0.95, 0.9, -0.85));
    g.add(mesh(new THREE.BoxGeometry(2.2, 0.35, 0.35), mat(STONE), 0, 1.75, -0.85));
    const hinge = new THREE.Group();
    hinge.position.set(-0.7, 0, -0.85);
    hinge.add(mesh(new THREE.BoxGeometry(1.4, 1.3, 0.1), mat("#4a4a52"), 0.7, 0.85, 0));
    hinge.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.14), mat("#8a8a92"), 1.2, 0.85, 0.06));
    g.add(hinge);
    const thorns = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const t = mesh(new THREE.ConeGeometry(0.07, 0.8 + rng() * 0.9, 4), mat("#1c1620"), (rng() - 0.5) * 2.4, 0.5, (rng() - 0.3) * 2);
      t.rotation.set((rng() - 0.5) * 1.3, 0, (rng() - 0.5) * 1.3);
      thorns.add(t);
    }
    g.add(thorns);
    const light = new THREE.PointLight("#8a5cff", 14, 9, 2);
    light.position.y = 1;
    g.add(light);
    this.glows.push({ light, base: 14 });
    this.crypt = { door: hinge, thorns, light };
  }

  /**
   * The castle dungeon cell: stone walls (the two facing the camera cut low,
   * isometric style), an iron-banded door, a barred slit of moonlight, a
   * torch outside the bars, straw, a bucket, chains. Darkness all around.
   */
  private buildCell(g: THREE.Group, rng: () => number): void {
    const W = 3.2;
    const D = 2.6;
    const stone = mat("#5a5650");
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ color: "#050404" }));
    dark.rotation.x = -Math.PI / 2;
    dark.position.y = -0.02;
    g.add(dark);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), mat("#4a4640"));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    g.add(floor);
    for (let i = 0; i < 14; i++) g.add(mesh(new THREE.BoxGeometry(0.9 + rng() * 0.5, 0.03, 0.6 + rng() * 0.4), mat(i % 2 ? "#55504a" : "#423e38"), (rng() - 0.5) * W * 1.8, 0.02, (rng() - 0.5) * D * 1.8));
    // Back walls (far from the camera): full height.
    g.add(mesh(new THREE.BoxGeometry(W * 2 + 0.8, 3.2, 0.4), stone, 0, 1.6, -D - 0.2));
    g.add(mesh(new THREE.BoxGeometry(0.4, 3.2, D * 2 + 0.8), stone, -W - 0.2, 1.6, 0));
    // Near walls: cut low so you can see in.
    g.add(mesh(new THREE.BoxGeometry(W * 2 + 0.8, 0.6, 0.4), stone, 0, 0.3, D + 0.2));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.6, D * 2 + 0.8), stone, W + 0.2, 0.3, 0));
    // Door in the back wall.
    g.add(mesh(new THREE.BoxGeometry(1.2, 2.1, 0.12), mat("#4a3424"), 0, 1.05, -D + 0.02));
    for (const y of [0.4, 1.05, 1.7]) g.add(mesh(new THREE.BoxGeometry(1.25, 0.08, 0.14), mat("#2a2a2e"), 0, y, -D + 0.04));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.06), mat("#1a1a1c"), 0, 1.6, -D + 0.08));
    // A barred slit of a window, high on the side wall, with moonlight.
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.9), mat("#0c1018", "#2a3a5a"), -W + 0.01, 2.6, 0));
    for (let i = -1; i <= 1; i++) g.add(mesh(new THREE.BoxGeometry(0.06, 0.56, 0.04), mat("#2a2a2e"), -W + 0.05, 2.6, i * 0.25));
    const moon = new THREE.SpotLight("#8aa0d8", 18, 9, 0.5, 0.6, 1.5);
    moon.position.set(-W + 0.3, 2.6, 0);
    moon.target.position.set(0.6, 0, 0.4);
    g.add(moon, moon.target);
    // Torch on the wall beside the door.
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat("#5e4329"), 1.2, 1.9, -D + 0.12));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), new THREE.MeshBasicMaterial({ color: "#ffb040" }));
    flame.geometry.translate(0, 0.16, 0);
    flame.position.set(1.2, 2.15, -D + 0.12);
    g.add(flame);
    const torch = new THREE.PointLight("#ff9a3a", 16, 9, 2);
    torch.position.set(1.2, 2.3, -D + 0.5);
    g.add(torch);
    this.cellTorch = { light: torch, flame };
    // Straw bed, bucket, shackles, scratches.
    const straw = mesh(new THREE.BoxGeometry(1.6, 0.2, 1.1), mat("#8a7a48"), 2.2, 0.1, 1.2);
    straw.rotation.y = 0.2;
    g.add(straw);
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.36, 8), mat("#5e4329"), 2.6, 0.18, -1.9));
    for (const z of [-0.8, 0.8]) {
      g.add(mesh(new THREE.TorusGeometry(0.1, 0.025, 4, 8), mat("#3a3a40"), -W + 0.06, 1.3, z));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), mat("#3a3a40"), -W + 0.06, 1.6, z));
    }
    for (let i = 0; i < 18; i++) g.add(mesh(new THREE.BoxGeometry(0.01, 0.18, 0.015), mat("#8a857c"), -W + 0.02, 1.0 + (i % 3) * 0.22, 0.2 + Math.floor(i / 3) * 0.08));
  }

  /** The clearing before and after you build your camp. */
  private buildCamp(g: THREE.Group, rng: () => number): void {
    const site = new THREE.Group();
    const built = new THREE.Group();
    // Before: just a fallen log and a patch of flattened grass.
    const log = mesh(new THREE.CylinderGeometry(0.22, 0.25, 2.4, 7), mat("#6b4e33"), 1.6, 0.22, 0.6);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = 0.4;
    site.add(log);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), mat("#7d8a4e"));
    patch.rotation.x = -Math.PI / 2;
    patch.position.y = 0.03;
    patch.receiveShadow = true;
    site.add(patch);

    // After: ring of stones, a fire, a hide lean-to, a bedroll, seats and a woodpile.
    const dirt = new THREE.Mesh(new THREE.CircleGeometry(2.6, 18), mat("#7a6648"));
    dirt.rotation.x = -Math.PI / 2;
    dirt.position.y = 0.03;
    dirt.receiveShadow = true;
    built.add(dirt);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = mesh(new THREE.DodecahedronGeometry(0.17 + rng() * 0.05, 0), mat(i % 2 ? STONE : STONE_DARK), Math.sin(a) * 0.62, 0.12, Math.cos(a) * 0.62);
      st.scale.y = 0.7;
      built.add(st);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const stick = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 5), mat("#5a3e28"), Math.sin(a) * 0.18, 0.3, Math.cos(a) * 0.18);
      stick.rotation.set(Math.cos(a) * 0.55, 0, -Math.sin(a) * 0.55);
      built.add(stick);
    }
    const flames: THREE.Mesh[] = [];
    for (const [x, z, h, c] of [[0, 0, 0.9, "#ff8a2a"], [0.08, 0.06, 0.6, "#ffd24a"], [-0.07, -0.04, 0.55, "#ff6a1a"]] as const) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, h, 6), new THREE.MeshBasicMaterial({ color: c }));
      fl.geometry.translate(0, h / 2, 0);
      fl.position.set(x, 0.15, z);
      flames.push(fl);
      built.add(fl);
    }
    const fire = new THREE.PointLight("#ff9a3a", 22, 14, 2);
    fire.position.y = 1.0;
    fire.castShadow = false;
    built.add(fire);
    // Lean-to: two posts, a ridge pole and a hide sloping to the ground.
    const lx = -2.3;
    for (const z of [-1, 1]) built.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 5), mat("#6b4e33"), lx, 0.85, z));
    const ridge = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.3, 5), mat("#6b4e33"), lx, 1.68, 0);
    ridge.rotation.x = Math.PI / 2;
    built.add(ridge);
    const hide = mesh(new THREE.BoxGeometry(1.9, 0.04, 2.2), mat("#8a6a4a"), lx - 0.75, 0.86, 0);
    hide.rotation.z = 1.05;
    built.add(hide);
    const bedroll = mesh(new THREE.BoxGeometry(0.7, 0.12, 1.7), mat("#6a5a48"), lx - 0.6, 0.08, 0);
    built.add(bedroll, mesh(new THREE.BoxGeometry(0.6, 0.16, 0.35), mat("#9a8a6a"), lx - 0.6, 0.16, -0.65));
    // Seats and a woodpile.
    const seat = mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 7), mat("#6b4e33"), 1.5, 0.2, 0.3);
    seat.rotation.z = Math.PI / 2;
    seat.rotation.y = 0.3;
    built.add(seat);
    for (let i = 0; i < 6; i++) {
      const w = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 5), mat(i % 2 ? "#7a5a3a" : "#6b4e33"), 0.6 + (i % 3) * 0.17, 0.1 + Math.floor(i / 3) * 0.15, -1.9);
      w.rotation.z = Math.PI / 2;
      built.add(w);
    }
    built.visible = false;
    g.add(site, built);
    this.camp = { site, built, flames, fire };
  }

  /**
   * The crypt under Ashford, from the shared floor plan: flagstone floors,
   * walls wherever the floor ends (cut low on the sides facing the camera),
   * stairs up, pillars, sarcophagi, bone piles, torches, and the heart of the
   * black thorns. Local coordinates match CRYPT_ROOMS.
   */
  private buildCryptDungeon(g: THREE.Group, rng: () => number): void {
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), new THREE.MeshBasicMaterial({ color: "#040303" }));
    dark.rotation.x = -Math.PI / 2;
    dark.position.set(24, -0.03, 12);
    g.add(dark);
    for (const r of CRYPT_ROOMS) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(r.corridor ? "#4a453e" : r.id === "thorns" ? "#463c4c" : "#5a554c"));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((r.x0 + r.x1) / 2, r.corridor ? 0.005 : 0.01, (r.z0 + r.z1) / 2);
      floor.receiveShadow = true;
      g.add(floor);
      if (!r.corridor) {
        for (let i = 0; i < Math.round((w * d) / 6); i++) {
          g.add(mesh(new THREE.BoxGeometry(0.8 + rng() * 0.5, 0.03, 0.6 + rng() * 0.4), mat(i % 2 ? "#55504a" : "#423e38"), r.x0 + 0.5 + rng() * (w - 1), 0.02, r.z0 + 0.5 + rng() * (d - 1)));
        }
      }
    }

    // Walls: one 1 m segment on every floor edge that meets rock.
    const inside = (lx: number, lz: number) => cryptSdf(CRYPT_ORIGIN.x + lx, CRYPT_ORIGIN.z + lz) > 0;
    const tall: THREE.Matrix4[] = [];
    const low: THREE.Matrix4[] = [];
    const m4 = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    for (let lx = -6; lx < 55; lx++) {
      for (let lz = -7; lz < 31; lz++) {
        const cx = lx + 0.5;
        const cz = lz + 0.5;
        if (!inside(cx, cz)) continue;
        // Far sides (toward -x and -z, away from the camera): full height.
        if (!inside(cx - 1, cz)) tall.push(m4(lx - 0.25, 1.6, cz, 0.5, 3.2, 1.02));
        if (!inside(cx, cz - 1)) tall.push(m4(cx, 1.6, lz - 0.25, 1.02, 3.2, 0.5));
        // Near sides: low, so you can see in.
        if (!inside(cx + 1, cz)) low.push(m4(lx + 1.25, 0.3, cz, 0.5, 0.6, 1.02));
        if (!inside(cx, cz + 1)) low.push(m4(cx, 0.3, lz + 1.25, 1.02, 0.6, 0.5));
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (const [list, color] of [[tall, "#5a5650"], [low, "#4e4a44"]] as const) {
      const inst = new THREE.InstancedMesh(box, mat(color), list.length);
      list.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      g.add(inst);
    }

    // Stairs up, against the far wall of the stair hall.
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.BoxGeometry(2.4, 0.22 * (i + 1), 0.45), mat(i % 2 ? "#5e5a52" : "#55514a"), 0, 0.11 * (i + 1), -1.6 - i * 0.42));
    // Light spilling down the stairs from the chapel above.
    const daylight = new THREE.PointLight("#c8d0e8", 10, 9, 2);
    daylight.position.set(0, 3, -3);
    g.add(daylight);
    this.cryptLights.push(daylight);

    // Pillars in the ossuary and the thorn chamber; sarcophagi in the burial hall (same spots as their colliders).
    for (const [x, z] of [[18, -3.5], [24, -3.5], [18, 3.5], [24, 3.5], [41, 14.5], [41, 25.5], [50, 14.5], [50, 25.5]] as const) {
      g.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 3.2, 8), mat("#6a655c"), x, 1.6, z));
    }
    for (const [x, z, rot] of [[17, 22, 0], [25, 18, 0.1]] as const) {
      const sar = new THREE.Group();
      sar.add(mesh(new THREE.BoxGeometry(1.0, 0.8, 2.2), mat("#6e6a62"), 0, 0.4, 0));
      sar.add(mesh(new THREE.BoxGeometry(1.15, 0.14, 2.35), mat("#7a766c"), 0.08, 0.86, 0));
      sar.position.set(x, 0, z);
      sar.rotation.y = rot + 0.6;
      g.add(sar);
    }
    // Bone piles and skulls along the ossuary's far walls.
    const bone = mat("#d8d0b8");
    for (let i = 0; i < 26; i++) {
      const alongX = i < 13;
      const t = rng();
      const x = alongX ? 16.4 + t * 9.2 : 16.4 + rng() * 0.6;
      const z = alongX ? -4.4 + rng() * 0.6 : -4.4 + t * 9;
      const b = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.5 + rng() * 0.3, 4), bone, x, 0.08 + rng() * 0.2, z);
      b.rotation.set(Math.PI / 2, rng() * 3, rng());
      g.add(b);
      if (i % 4 === 0) g.add(mesh(new THREE.SphereGeometry(0.13, 6, 5), bone, x, 0.15, z));
    }

    // A cold dim fill so the stone reads in the dark (only lit while you're down here).
    const fill = new THREE.HemisphereLight("#9aa4c8", "#3a3028", 2.6);
    g.add(fill);
    this.cryptLights.push(fill);
    // Torches on the far walls: flames everywhere, real light in the ossuary and the burial hall.
    for (const [x, z, lit] of [[-3.8, 2, false], [16.2, 0, true], [14.2, 20, true], [27.8, 15.2, false]] as const) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), new THREE.MeshBasicMaterial({ color: "#ffb040" }));
      flame.geometry.translate(0, 0.16, 0);
      flame.position.set(x, 2.1, z);
      g.add(flame, mesh(new THREE.BoxGeometry(0.08, 0.45, 0.08), mat("#5e4329"), x, 1.85, z));
      if (lit) {
        const torch = new THREE.PointLight("#ff9a3a", 18, 12, 2);
        torch.position.set(x + 1, 2.3, z);
        g.add(torch);
        this.cryptLights.push(torch);
      }
    }

    // The heart of the black thorns, and thorns creeping along the chamber.
    const thorns = new THREE.Group();
    const hx = CRYPT_HEART.x - CRYPT_ORIGIN.x;
    const hz = CRYPT_HEART.z - CRYPT_ORIGIN.z;
    for (let i = 0; i < 34; i++) {
      const a = rng() * Math.PI * 2;
      const r = rng() * 1.3;
      const h = 1.2 + rng() * 2.2;
      const t = mesh(new THREE.ConeGeometry(0.12 + rng() * 0.14, h, 4), mat(rng() < 0.25 ? "#5a1a2e" : "#1c1424"), hx + Math.cos(a) * r, h / 2 - 0.1, hz + Math.sin(a) * r);
      t.rotation.set((rng() - 0.5) * 0.8, rng() * 3, (rng() - 0.5) * 0.8);
      thorns.add(t);
    }
    thorns.add(mesh(new THREE.SphereGeometry(0.55, 8, 6), mat("#3a1030", "#8a2a7a"), hx, 1.0, hz));
    for (let i = 0; i < 40; i++) {
      const edge = i % 4;
      const x = edge === 0 ? 38.5 + rng() * 13 : edge === 1 ? 38.6 + rng() * 0.8 : 39 + rng() * 12;
      const z = edge === 0 ? 12.6 + rng() * 0.8 : edge === 1 ? 12.5 + rng() * 15 : 12.5 + rng() * 15;
      if (edge >= 2 && Math.hypot(x - hx, z - hz) < 4) continue;
      const h = 0.4 + rng() * 1.1;
      const t = mesh(new THREE.ConeGeometry(0.06 + rng() * 0.06, h, 4), mat("#1c1424"), x, h / 2, z);
      t.rotation.set((rng() - 0.5) * 0.9, rng() * 3, (rng() - 0.5) * 0.9);
      thorns.add(t);
    }
    g.add(thorns);
    const ash = new THREE.Mesh(new THREE.CircleGeometry(2.2, 14), mat("#2a2624"));
    ash.rotation.x = -Math.PI / 2;
    ash.position.set(hx, 0.03, hz);
    ash.visible = false;
    g.add(ash);
    const heartLight = new THREE.PointLight("#8a5cff", 26, 16, 2);
    heartLight.position.set(hx, 1.6, hz);
    g.add(heartLight);
    this.cryptLights.push(heartLight);
    this.cryptHeart = { thorns, ash, light: heartLight };
    for (const l of this.cryptLights) l.visible = false;
  }

  /** Greyjaw's den: a hollow under the roots of a fallen pine, rocks piled round, bones in the dirt. */
  private buildWolfDen(g: THREE.Group, rng: () => number): void {
    const hollow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 12), new THREE.MeshBasicMaterial({ color: "#0c0a08" }));
    hollow.rotation.x = -Math.PI / 2;
    hollow.position.set(0, 0.04, 0);
    hollow.scale.set(1.2, 0.8, 1);
    g.add(hollow);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * 0.15 + (i / 8) * Math.PI * 1.1;
      const r = mesh(new THREE.DodecahedronGeometry(0.55 + rng() * 0.45, 0), mat(rng() < 0.4 ? "#5f5a54" : "#6f6a62"), Math.cos(a) * 1.8, 0.35, -Math.sin(a) * 1.5);
      r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      g.add(r);
    }
    // The fallen pine: trunk across the back, its root plate standing up.
    const trunk = mesh(new THREE.CylinderGeometry(0.32, 0.4, 6, 7), mat("#5a3e28"), 0.4, 0.5, -1.9);
    trunk.rotation.z = Math.PI / 2;
    trunk.rotation.y = 0.15;
    g.add(trunk);
    const roots = mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.35, 9), mat("#4a3826"), -2.7, 1.1, -1.7);
    roots.rotation.z = Math.PI / 2;
    g.add(roots);
    const bone = mat("#d8d0b8");
    for (let i = 0; i < 9; i++) {
      const b = mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.45, 4), bone, (rng() - 0.5) * 3.4, 0.05, 0.6 + rng() * 1.4);
      b.rotation.set(Math.PI / 2, rng() * 3, 0);
      g.add(b);
    }
  }
}

// ---------------------------------------------------------------------------
// Lore sites (shared/src/lore.ts). Local +z is the front, where you stand to read.
// ---------------------------------------------------------------------------

const WOOD = "#6b4e33";
const WOOD_DARK = "#4a3826";
const THATCH = "#8a7a48";

function buildLoreSite(g: THREE.Group, kind: string, rng: () => number): void {
  const add = (geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, emissive?: string) => {
    const m = mesh(geo, mat(color, emissive), x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  };
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
  switch (kind) {
    case "drowned_mill": {
      // Stone footing, timber walls leaning, half a roof, and the wheel in the stream behind.
      add(box(5.2, 1.1, 4.4), STONE_DARK, 0, 0.45, 0);
      add(box(4.4, 2.6, 3.6), WOOD, 0, 2.2, 0, 0, 0, 0.04);
      add(box(1.0, 1.8, 0.1), "#1a1410", 0.6, 1.9, 1.82);
      const roof = add(box(4.8, 0.15, 2.6), THATCH, 0, 3.9, 0.85, 0.55, 0, 0);
      roof.scale.x = 1;
      add(box(3.2, 0.15, 2.6), THATCH, -0.8, 3.7, -0.9, -0.6, 0, 0.1);
      // Broken rafters where the rest of the roof fell in.
      for (let i = 0; i < 3; i++) add(box(0.12, 0.12, 2.4), WOOD_DARK, 1.0 + i * 0.5, 3.75, -0.9, -0.6, 0, 0);
      const wheel = new THREE.Group();
      wheel.add(mesh(new THREE.TorusGeometry(1.7, 0.12, 6, 18), mat(WOOD_DARK)));
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const paddle = mesh(box(0.5, 0.08, 0.55), mat(WOOD), Math.cos(a) * 1.7, Math.sin(a) * 1.7, 0);
        paddle.rotation.z = a;
        wheel.add(paddle);
        const spoke = mesh(box(0.08, 1.7, 0.08), mat(WOOD_DARK), Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0);
        spoke.rotation.z = a + Math.PI / 2;
        wheel.add(spoke);
      }
      wheel.position.set(1.2, 1.2, -3.1);
      wheel.rotation.set(0, Math.PI / 2, 0.25);
      g.add(wheel);
      for (let i = 0; i < 14; i++) add(new THREE.CylinderGeometry(0.02, 0.03, 0.9 + rng() * 0.6, 4), "#7a8a4a", (rng() - 0.5) * 6, 0.5, -2.2 + (rng() - 0.5) * 1.6, (rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
      break;
    }
    case "watchtower": {
      // A round stone tower, broken off unevenly, with its door facing the road.
      add(new THREE.CylinderGeometry(1.9, 2.1, 5.5, 12), STONE, 0, 2.75, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const h = 0.4 + rng() * 1.4;
        if (rng() < 0.3) continue;
        add(box(0.7, h, 0.5), STONE, Math.cos(a) * 1.75, 5.5 + h / 2, Math.sin(a) * 1.75, 0, -a, 0);
      }
      add(box(0.9, 1.9, 0.2), "#1a1410", 0, 0.95, 1.98);
      add(box(1.2, 0.18, 0.3), STONE_DARK, 0, 2.0, 2.0);
      for (let i = 0; i < 6; i++) add(new THREE.DodecahedronGeometry(0.35 + rng() * 0.3, 0), STONE_DARK, -1.5 + rng() * 3, 0.25, -2.6 + rng() * 1.2, rng(), rng(), rng());
      // Arrow slits.
      for (const y of [2.6, 4.2]) add(box(0.12, 0.7, 0.1), "#1a1410", 1.2, y, 1.5, 0, 0.7, 0);
      break;
    }
    case "standing_stones": {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const stone = add(box(0.9, 2.2 + rng() * 0.5, 0.55), "#8a8680", Math.cos(a) * 4.5, 1.1, Math.sin(a) * 4.5, 0, -a + Math.PI / 2, (rng() - 0.5) * 0.08);
        // The inside face, unweathered.
        const face = mesh(box(0.8, 2.0, 0.02), mat("#b8b4ac"), 0, 0, 0.29);
        stone.add(face);
        if (i % 3 === 0) stone.add(mesh(box(0.3, 0.4, 0.02), mat(["#a83a2a", "#3a6aa8", "#c8a040"][i % 3]!), 0.2, -0.2, -0.29));
      }
      add(new THREE.CylinderGeometry(1.1, 1.2, 0.25, 8), "#8a8680", 0, 0.12, 0);
      break;
    }
    case "barrow": {
      const mound = add(new THREE.SphereGeometry(4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#5e7a3e", 0, -0.4, -0.6);
      mound.scale.set(1.25, 0.6, 1.6);
      // The door: two uprights, a lintel, and a slab sealed with clay.
      add(box(0.5, 2.0, 0.6), STONE, -1.0, 1.0, 3.6);
      add(box(0.5, 2.0, 0.6), STONE, 1.0, 1.0, 3.6);
      add(box(2.7, 0.5, 0.7), STONE, 0, 2.2, 3.6);
      add(box(1.5, 1.9, 0.25), "#9a958a", 0, 0.95, 3.75);
      for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), "#c8a040", -0.5 + i * 0.25, 1.3 + (i % 2) * 0.15, 3.9, Math.PI / 2);
      break;
    }
    case "hermit_hut": {
      add(box(3.0, 2.1, 3.0), WOOD, 0, 1.05, 0);
      const roof = add(new THREE.ConeGeometry(2.6, 1.8, 4), THATCH, 0, 3.0, 0, 0, Math.PI / 4, 0);
      roof.scale.y = 1;
      add(box(0.9, 1.7, 0.1), "#1a1410", 0, 0.85, 1.52);
      add(box(0.45, 1.6, 0.45), STONE_DARK, 1.0, 3.2, -0.8);
      // Woodpile, a stool, herbs drying on a rack.
      for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 5), WOOD_DARK, -2.0, 0.12 + Math.floor(i / 3) * 0.2, -0.6 + (i % 3) * 0.22, 0, 0, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 6), WOOD_DARK, 1.2, 0.22, 2.2);
      add(box(1.4, 0.06, 0.06), WOOD_DARK, -0.6, 1.8, 1.65);
      for (let i = 0; i < 5; i++) add(box(0.12, 0.35, 0.06), "#7a8a4a", -1.1 + i * 0.25, 1.6, 1.68);
      break;
    }
    case "blackened_field": {
      // Patches of black, glassy earth rather than one disc.
      for (let i = 0; i < 9; i++) {
        const a = rng() * Math.PI * 2;
        const r = i === 0 ? 0 : 3 + rng() * 5;
        const patch = new THREE.Mesh(new THREE.CircleGeometry(2.2 + rng() * 2.6, 9), mat(i % 2 ? "#3a332a" : "#2c2722"));
        patch.rotation.x = -Math.PI / 2;
        patch.rotation.z = rng() * 3;
        patch.position.set(Math.cos(a) * r, 0.04 + i * 0.002, Math.sin(a) * r);
        patch.scale.y = 0.6 + rng() * 0.5;
        patch.receiveShadow = true;
        g.add(patch);
      }
      for (let i = 0; i < 46; i++) {
        const a = rng() * Math.PI * 2;
        const r = 2 + rng() * 8.5;
        const h = 0.3 + rng() * 1.3;
        add(new THREE.ConeGeometry(0.06 + rng() * 0.08, h, 4), rng() < 0.2 ? "#5a1a2e" : "#1c1424", Math.cos(a) * r, h / 2, Math.sin(a) * r, (rng() - 0.5) * 0.6, rng() * 3, (rng() - 0.5) * 0.6);
      }
      // The warning board on its stake.
      add(new THREE.CylinderGeometry(0.06, 0.07, 1.6, 5), WOOD_DARK, 0, 0.8, 0);
      add(box(1.1, 0.6, 0.06), WOOD, 0, 1.35, 0.06, 0, 0, 0.06);
      break;
    }
    case "waystone": {
      add(box(0.55, 1.15, 0.38), "#8a8680", 0, 0.57, 0);
      add(box(0.55, 1.0, 0.38), "#8a8680", 0.35, 0.55, -0.55, 0.9, 0.3, 0.2);
      add(new THREE.TorusGeometry(0.08, 0.02, 4, 8), "#b08a40", 0, 0.95, 0.21, 0, 0, 0, "#3a2a10");
      for (let i = 0; i < 4; i++) add(box(0.32, 0.04, 0.01), "#4a4640", 0, 0.35 + i * 0.16, 0.2);
      break;
    }
    case "giant_ribs": {
      // Pale ribs as straight as rulers, arching out of the ground, smaller toward the ends.
      const bone = "#d8d2c2";
      for (let i = 0; i < 5; i++) {
        const z = -5 + i * 2.5;
        const k = 1 - Math.abs(i - 2) * 0.18;
        for (const side of [-1, 1]) add(box(0.45, 5.2 * k, 0.45), bone, side * 3.2 * k, 2.3 * k, z, 0, 0, side * 0.42);
      }
      add(box(0.6, 0.6, 12), bone, 0, 0.2, 0, 0.05, 0, 0);
      // The red hand on the biggest rib.
      add(box(0.02, 0.45, 0.35), "#a82a1a", 3.0, 1.6, 0.0, 0, 0, 0.42);
      break;
    }
    case "glass_hollow": {
      const rim = add(new THREE.TorusGeometry(8.5, 1.6, 6, 28), "#6a5a44", 0, -0.6, 0, Math.PI / 2);
      rim.scale.z = 0.5;
      const glass = new THREE.Mesh(new THREE.CircleGeometry(7.5, 28), mat("#2e6a56", "#06241a"));
      glass.rotation.x = -Math.PI / 2;
      glass.position.y = 0.05;
      g.add(glass);
      for (let i = 0; i < 18; i++) {
        const a = rng() * Math.PI * 2;
        const r = rng() * 6.5;
        add(new THREE.DodecahedronGeometry(0.2 + rng() * 0.25, 0), "#4aa07a", Math.cos(a) * r, 0.1, Math.sin(a) * r, rng(), rng(), rng(), "#0a3a2a");
      }
      add(box(0.35, 0.02, 0.25), "#c8d0d8", 0.8, 0.08, 0.6, 0, 0.5, 0);
      break;
    }
  }
}

