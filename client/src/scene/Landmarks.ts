import * as THREE from "three";
import { getFaith, mulberry32, type GateId, type Structure, type World } from "@rpg/shared";
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
}
