import * as THREE from "three";
import { h } from "./dom.ts";

interface Plate {
  el: HTMLElement;
  fill: HTMLElement | null;
  used: boolean;
}

interface Floater {
  el: HTMLElement;
  pos: THREE.Vector3;
  t: number;
}

/**
 * Screen-space overlay for things that should stay crisp regardless of
 * zoom: nameplates, health bars and floating combat numbers.
 */
export class Overlay {
  private readonly plates = new Map<string, Plate>();
  private readonly floaters: Floater[] = [];
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly root: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {}

  private project(pos: THREE.Vector3): { x: number; y: number; visible: boolean } {
    this.tmp.copy(pos).project(this.camera);
    const w = this.root.clientWidth;
    const hgt = this.root.clientHeight;
    return {
      x: (this.tmp.x * 0.5 + 0.5) * w,
      y: (-this.tmp.y * 0.5 + 0.5) * hgt,
      visible: this.tmp.z < 1 && this.tmp.x > -1.2 && this.tmp.x < 1.2 && this.tmp.y > -1.2 && this.tmp.y < 1.2,
    };
  }

  beginFrame(): void {
    for (const p of this.plates.values()) p.used = false;
  }

  /** Draw/refresh a nameplate. `hpFrac` null = no bar. */
  plate(id: string, pos: THREE.Vector3, label: string, hpFrac: number | null, kind: "self" | "player" | "enemy" | "pet"): void {
    let p = this.plates.get(id);
    if (!p) {
      const fill = hpFrac !== null ? h("div.plate-fill") : null;
      const el = h(`div.plate.plate-${kind}`, null, h("div.plate-name"), fill ? h("div.plate-bar", null, fill) : null);
      this.root.append(el);
      p = { el, fill, used: true };
      this.plates.set(id, p);
    }
    p.used = true;
    const s = this.project(pos);
    p.el.style.display = s.visible ? "" : "none";
    p.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    const nameEl = p.el.firstElementChild as HTMLElement;
    if (nameEl.textContent !== label) nameEl.textContent = label;
    if (p.fill && hpFrac !== null) p.fill.style.width = `${Math.max(0, hpFrac * 100)}%`;
  }

  endFrame(): void {
    for (const [id, p] of this.plates) {
      if (!p.used) {
        p.el.remove();
        this.plates.delete(id);
      }
    }
  }

  floatText(pos: THREE.Vector3, text: string, cls: string): void {
    const el = h(`div.floater.${cls}`, null, text);
    this.root.append(el);
    this.floaters.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, 0)), t: 0 });
  }

  update(dt: number): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]!;
      f.t += dt;
      const s = this.project(f.pos);
      f.el.style.transform = `translate(${s.x}px, ${s.y - f.t * 60}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.3 - f.t)})`;
      f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.1));
      if (f.t > 1.1) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  }
}
