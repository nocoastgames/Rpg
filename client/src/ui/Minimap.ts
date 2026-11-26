import {
  distanceToTrail,
  distanceToWater,
  forestDensity,
  fromUV,
  terrainHeight,
  toUV,
  valleyBase,
  valleySdf,
  ZONES,
  getFaith,
  type LandmarkDef,
  type World,
} from "@rpg/shared";
import { h } from "./dom.ts";

const xz = (u: number, v: number): [number, number] => {
  const p = fromUV(u, v);
  return [p.x, p.z];
};

/** Map area in the valley's screen-aligned (u, v) frame, so the map matches the camera orientation. */
const U0 = -75;
const U1 = 95;
const V0 = -100;
const V1 = 100;
const RES = 2; // world metres per background pixel

export interface MapMarker {
  x: number;
  z: number;
  /** node: a quest pick-up you still need; objective: where the current quest step points. */
  kind: "self" | "player" | "enemy" | "node" | "objective";
  facing?: number;
}

/** What the map should highlight for the local player. */
export interface MapContext {
  /** Your god: their shrine is always marked, even before you find it. */
  faith: string;
  /** Hunting grounds the current quest steps send you to. */
  objectiveZones?: string[];
  /** Owns a map of the valley: no fog. */
  hasMap?: boolean;
}

/** How far around you the map fills in as you explore (m). */
const EXPLORE_RADIUS = 24;

/**
 * Corner minimap (M toggles a large view). The background is rendered once
 * from the shared world definition; markers are drawn each frame.
 */
export class Minimap {
  readonly el: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bg: HTMLCanvasElement;
  /** What you've explored (alpha), and the background cut to it. */
  private readonly mask: HTMLCanvasElement;
  private readonly explored: HTMLCanvasElement;
  private lastExplore: { u: number; v: number } | null = null;
  private large = false;

  constructor(private readonly world: World) {
    this.bg = this.renderBackground();
    this.mask = document.createElement("canvas");
    this.mask.width = this.bg.width;
    this.mask.height = this.bg.height;
    this.explored = document.createElement("canvas");
    this.explored.width = this.bg.width;
    this.explored.height = this.bg.height;
    this.canvas = h("canvas.minimap-canvas");
    this.ctx = this.canvas.getContext("2d")!;
    this.el = h("div.minimap", { title: "Map (M)" }, this.canvas);
    this.el.addEventListener("click", () => this.toggle());
  }

  toggle(): void {
    this.large = !this.large;
    this.el.classList.toggle("large", this.large);
  }

  private renderBackground(): HTMLCanvasElement {
    const w = Math.round((U1 - U0) / RES);
    const hgt = Math.round((V1 - V0) / RES);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(w, hgt);
    for (let py = 0; py < hgt; py++) {
      for (let px = 0; px < w; px++) {
        const { x, z } = fromUV(U0 + px * RES, V0 + py * RES);
        const sdf = valleySdf(x, z);
        let r: number, g: number, b: number;
        if (distanceToWater(x, z) < 0.6) {
          [r, g, b] = [70, 130, 160];
        } else if (sdf > 0) {
          const d = forestDensity(this.world.seed, x, z);
          [r, g, b] = [86 - d * 30, 124 - d * 34, 62 - d * 20];
          if (distanceToTrail(x, z) < 1.5) [r, g, b] = [150, 128, 90];
        } else {
          const alt = terrainHeight(x, z) - valleyBase(toUV(x, z).v);
          const k = Math.min(1, alt / 28);
          [r, g, b] = [70 + k * 120, 70 + k * 115, 66 + k * 120];
        }
        const i = (py * w + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** Fill in the map around where you are (without a map, that's all you see). */
  explore(x: number, z: number): void {
    const { u, v } = toUV(x, z);
    if (this.lastExplore && Math.hypot(u - this.lastExplore.u, v - this.lastExplore.v) < 3) return;
    this.lastExplore = { u, v };
    const m = this.mask.getContext("2d")!;
    const px = (u - U0) / RES;
    const py = (v - V0) / RES;
    const r = EXPLORE_RADIUS / RES;
    const grad = m.createRadialGradient(px, py, r * 0.55, px, py, r);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    m.fillStyle = grad;
    m.beginPath();
    m.arc(px, py, r, 0, Math.PI * 2);
    m.fill();
    const e = this.explored.getContext("2d")!;
    e.globalCompositeOperation = "copy";
    e.drawImage(this.bg, 0, 0);
    e.globalCompositeOperation = "destination-in";
    e.drawImage(this.mask, 0, 0);
    e.globalCompositeOperation = "source-over";
  }

  draw(markers: MapMarker[], discovered: Set<string>, openGates: Set<string>, ctxInfo?: MapContext): void {
    const size = this.el.clientWidth;
    if (!size) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(size * dpr);
    const H = Math.round(this.el.clientHeight * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);

    // Large map shows the whole valley; the corner map follows the player.
    const self = markers.find((m) => m.kind === "self");
    let scale: number; // canvas px per metre
    let cu: number;
    let cv: number;
    if (this.large || !self) {
      scale = Math.min(W / (U1 - U0), H / (V1 - V0));
      cu = (U0 + U1) / 2;
      cv = (V0 + V1) / 2;
    } else {
      scale = W / 90;
      ({ u: cu, v: cv } = toUV(self.x, self.z));
    }
    const toPx = (x: number, z: number) => {
      const { u, v } = toUV(x, z);
      return { px: W / 2 + (u - cu) * scale, py: H / 2 + (v - cv) * scale };
    };

    ctx.imageSmoothingEnabled = true;
    const tl = { px: W / 2 + (U0 - cu) * scale, py: H / 2 + (V0 - cv) * scale };
    if (ctxInfo?.hasMap) ctx.drawImage(this.bg, tl.px, tl.py, (U1 - U0) * scale, (V1 - V0) * scale);
    else {
      // Unexplored land is blank parchment.
      ctx.fillStyle = "#2a2620";
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(this.explored, tl.px, tl.py, (U1 - U0) * scale, (V1 - V0) * scale);
    }

    // Hunting grounds: named on the large map once found; the quest's target ground is ringed.
    ctx.textAlign = "center";
    for (const zn of ZONES) {
      const c = toPx(...xz(zn.u, zn.v));
      const target = !!ctxInfo?.objectiveZones?.includes(zn.id);
      if (target) {
        ctx.save();
        ctx.setLineDash([4 * dpr, 4 * dpr]);
        ctx.strokeStyle = "#fff3b0";
        ctx.lineWidth = 1.5 * dpr;
        ctx.beginPath();
        ctx.arc(c.px, c.py, zn.radius * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (this.large && (discovered.has(zn.id) || target)) {
        ctx.font = `italic ${Math.round(11 * dpr)}px Georgia, serif`;
        ctx.fillStyle = "rgba(255, 230, 200, 0.85)";
        ctx.fillText(`${zn.name} (${zn.levels[0]}–${zn.levels[1]})`, c.px, c.py);
      }
    }

    // Landmarks (only once discovered; your god's shrine and the campsite always).
    ctx.font = `${Math.round(11 * dpr)}px Cinzel, Georgia, serif`;
    for (const l of this.world.landmarks) {
      const always = l.kind === "camp" || (l.kind === "shrine" && l.faith === ctxInfo?.faith);
      if (l.discoverRadius === 0 || (!discovered.has(l.id) && !always)) continue;
      const { px, py } = toPx(l.x, l.z);
      this.drawLandmark(ctx, l, px, py, dpr, !!l.gate && !openGates.has(l.gate), l.faith === ctxInfo?.faith);
      if (this.large) {
        ctx.fillStyle = "#f3e6c4";
        ctx.fillText(l.name, px, py - 9 * dpr);
      }
    }

    for (const m of markers) {
      const { px, py } = toPx(m.x, m.z);
      if (m.kind === "self") {
        // Arrow in screen space: facing is a world angle; convert via the u/v frame.
        const fx = Math.sin(m.facing ?? 0);
        const fz = Math.cos(m.facing ?? 0);
        const d = toUV(fx, fz);
        const ang = Math.atan2(d.v, d.u);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = "#ffd54a";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(6 * dpr, 0);
        ctx.lineTo(-4 * dpr, 4 * dpr);
        ctx.lineTo(-2 * dpr, 0);
        ctx.lineTo(-4 * dpr, -4 * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else if (m.kind === "node" || m.kind === "objective") {
        // Quest markers: small gold diamonds.
        const r = (m.kind === "objective" ? 5 : 3) * dpr;
        ctx.fillStyle = "#ffe07a";
        ctx.strokeStyle = "#3a2a00";
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = m.kind === "enemy" ? "#e0433a" : "#7fc8ff";
        ctx.beginPath();
        ctx.arc(px, py, (m.kind === "enemy" ? 2 : 3) * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawLandmark(ctx: CanvasRenderingContext2D, l: LandmarkDef, px: number, py: number, dpr: number, sealed: boolean, mine = false): void {
    if (l.kind === "shrine") {
      const color = getFaith(l.faith ?? "")?.color ?? "#ffffff";
      const r = (mine ? 6 : 4) * dpr;
      if (mine) {
        ctx.fillStyle = `${color}55`;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color;
      ctx.strokeStyle = "#000";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r * 0.7, py);
      ctx.lineTo(px, py + r);
      ctx.lineTo(px - r * 0.7, py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }
    if (l.kind === "camp") {
      ctx.fillStyle = "#ff9a3a";
      ctx.strokeStyle = "#3a1a00";
      ctx.lineWidth = dpr;
      ctx.beginPath();
      ctx.moveTo(px, py - 6 * dpr);
      ctx.quadraticCurveTo(px + 5 * dpr, py, px, py + 4 * dpr);
      ctx.quadraticCurveTo(px - 5 * dpr, py, px, py - 6 * dpr);
      ctx.fill();
      ctx.stroke();
      return;
    }
    ctx.fillStyle = sealed ? "#2a2018" : "#3d5a2a";
    ctx.strokeStyle = "#d8b54a";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(px, py, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#d8b54a";
    ctx.font = `bold ${Math.round(8 * dpr)}px Georgia, serif`;
    ctx.fillText(sealed ? "✕" : "?", px, py + 3 * dpr);
    ctx.font = `${Math.round(11 * dpr)}px Cinzel, Georgia, serif`;
    void l;
  }
}
