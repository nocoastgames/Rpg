import * as THREE from "three";
import { mulberry32, type GateId, type Structure, type World } from "@rpg/shared";
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
    for (const g of this.glows) g.light.intensity = g.base * multiplier;
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
      default:
        return null;
    }
    return g;
  }
}
