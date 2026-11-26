import * as THREE from "three";
import type { FxEvent } from "@rpg/shared";
import { groundHeight } from "./Environment.ts";

interface ActiveFx {
  obj: THREE.Object3D;
  t: number;
  duration: number;
  tick(k: number): void;
}

const PROJECTILE_SPEED = 28;

/** Short-lived visual effects driven by server `fx` events. Pure cosmetics. */
export class FxSystem {
  private readonly active: ActiveFx[] = [];
  private readonly ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  private readonly discGeo = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
  private readonly orbGeo = new THREE.IcosahedronGeometry(0.15, 0);
  private readonly arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 4).rotateX(Math.PI / 2);
  private readonly pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 6, 12, 1, true);

  constructor(private readonly scene: THREE.Scene) {}

  spawn(e: FxEvent): void {
    const color = new THREE.Color(e.color ?? "#ffffff");
    switch (e.kind) {
      case "projectile":
        this.projectile(e, color);
        break;
      case "swing":
        this.ring(e.toX, e.toZ, 0.6, "#ffffff", 0.18, 0.5);
        break;
      case "strike":
        if ((e.radius ?? 0) > 0) {
          this.ring(e.toX, e.toZ, e.radius!, color, 0.45, 0.8);
          this.disc(e.toX, e.toZ, e.radius!, color, 0.45);
        } else {
          this.pillar(e.toX, e.toZ, color);
        }
        break;
      case "nova":
        this.ring(e.fromX, e.fromZ, e.radius ?? 3, color, 0.4, 0.9, true);
        break;
      case "heal":
        this.ring(e.fromX, e.fromZ, Math.max(1.2, e.radius ?? 1), "#7dff9a", 0.7, 0.7, true);
        this.pillar(e.fromX, e.fromZ, new THREE.Color("#7dff9a"));
        break;
      case "buff":
        this.ring(e.fromX, e.fromZ, Math.max(1.2, e.radius ?? 1), color, 0.8, 0.8);
        this.pillar(e.fromX, e.fromZ, color);
        break;
      case "dash":
        this.trail(e, color);
        if ((e.radius ?? 0) > 0) this.ring(e.toX, e.toZ, e.radius!, color, 0.35, 0.7, true);
        break;
      case "levelup":
        this.pillar(e.fromX, e.fromZ, new THREE.Color("#ffd54a"), 1.4);
        this.ring(e.fromX, e.fromZ, 3, "#ffd54a", 1.0, 0.9, true);
        break;
      case "death":
        this.ring(e.fromX, e.fromZ, 1.2, "#550000", 0.8, 0.6);
        break;
    }
  }

  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i]!;
      fx.t += dt;
      const k = Math.min(1, fx.t / fx.duration);
      fx.tick(k);
      if (k >= 1) {
        this.scene.remove(fx.obj);
        fx.obj.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          m?.dispose();
        });
        this.active.splice(i, 1);
      }
    }
  }

  private add(obj: THREE.Object3D, duration: number, tick: (k: number) => void): void {
    this.scene.add(obj);
    this.active.push({ obj, t: 0, duration, tick });
    tick(0);
  }

  private basic(color: THREE.ColorRepresentation, opacity: number): THREE.MeshBasicMaterial {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }

  private ring(x: number, z: number, radius: number, color: THREE.ColorRepresentation, duration: number, opacity: number, expand = false): void {
    const m = new THREE.Mesh(this.ringGeo, this.basic(color, opacity));
    m.position.set(x, groundHeight(x, z) + 0.06, z);
    this.add(m, duration, (k) => {
      const s = expand ? radius * (0.2 + 0.8 * k) : radius;
      m.scale.set(s, 1, s);
      (m.material as THREE.MeshBasicMaterial).opacity = opacity * (1 - k);
    });
  }

  private disc(x: number, z: number, radius: number, color: THREE.ColorRepresentation, duration: number): void {
    const m = new THREE.Mesh(this.discGeo, this.basic(color, 0.35));
    m.position.set(x, groundHeight(x, z) + 0.05, z);
    m.scale.set(radius, 1, radius);
    this.add(m, duration, (k) => ((m.material as THREE.MeshBasicMaterial).opacity = 0.35 * (1 - k)));
  }

  private pillar(x: number, z: number, color: THREE.Color, scale = 1): void {
    const m = new THREE.Mesh(this.pillarGeo, this.basic(color, 0.5));
    m.position.set(x, groundHeight(x, z) + 3 * scale, z);
    this.add(m, 0.6, (k) => {
      m.scale.set(scale * (1 - k * 0.6), scale, scale * (1 - k * 0.6));
      (m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
    });
  }

  private projectile(e: FxEvent, color: THREE.Color): void {
    const from = new THREE.Vector3(e.fromX, groundHeight(e.fromX, e.fromZ) + 1.3, e.fromZ);
    const to = new THREE.Vector3(e.toX, groundHeight(e.toX, e.toZ) + 0.8, e.toZ);
    const dist = from.distanceTo(to);
    const isArrow = e.variant === "arrow" || e.variant === "dagger";
    const m = new THREE.Mesh(isArrow ? this.arrowGeo : this.orbGeo, isArrow ? new THREE.MeshBasicMaterial({ color: "#d8c8a8" }) : this.basic(color, 1));
    m.lookAt(to.clone().sub(from).add(m.position));
    this.add(m, Math.max(0.08, dist / PROJECTILE_SPEED), (k) => {
      m.position.lerpVectors(from, to, k);
      m.position.y += Math.sin(k * Math.PI) * (isArrow ? 0.4 : 0.15);
      m.lookAt(to);
      if (k >= 1 && !isArrow) this.ring(to.x, to.z, 0.5, color, 0.25, 0.8, true);
    });
  }

  private trail(e: FxEvent, color: THREE.Color): void {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const k = i / (steps - 1);
      const x = THREE.MathUtils.lerp(e.fromX, e.toX, k);
      const z = THREE.MathUtils.lerp(e.fromZ, e.toZ, k);
      this.ring(x, z, 0.5, color, 0.3 + k * 0.2, 0.6);
    }
  }
}
