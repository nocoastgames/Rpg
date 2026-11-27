import {
  CRYPT_ROOMS,
  cryptPoint,
  distanceToTrail,
  distanceToWater,
  forestDensity,
  fromUV,
  toUV,
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
const U0 = -1800;
const U1 = 2000;
const V0 = -2450;
const V1 = 2450;
const RES = 6; // world metres per background pixel
/** The corner map shows this many metres across; the large map (without Haskel's map) shows this much. */
const CORNER_SPAN = 180;
const LARGE_SPAN = 1100;

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
  /** Somewhere the map doesn't cover (the castle dungeon). */
  unknown?: boolean;
  /** Under Ashford: the crypt's rooms are drawn instead of the valley. */
  underground?: boolean;
  /** Where the followed quest points: marked, with an arrow at the edge when it's off the map. */
  quest?: { x: number; z: number; radius: number; label: string };
}

/** How far around you the map fills in as you explore (m). */
const EXPLORE_RADIUS = 45;

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
    this.bg = this.createBackground();
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

  /** The map background is painted a few rows per frame (it covers kilometres). */
  private createBackground(): HTMLCanvasElement {
    const w = Math.round((U1 - U0) / RES);
    const hgt = Math.round((V1 - V0) / RES);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = hgt;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#3a3a36";
    ctx.fillRect(0, 0, w, hgt);
    let row = 0;
    const paint = () => {
      const start = performance.now();
      while (row < hgt && performance.now() - start < 6) {
        const img = ctx.createImageData(w, 1);
        for (let px = 0; px < w; px++) {
          const [r, g, b] = this.pixel(U0 + px * RES, V0 + row * RES);
          img.data[px * 4] = r;
          img.data[px * 4 + 1] = g;
          img.data[px * 4 + 2] = b;
          img.data[px * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, row);
        row++;
      }
      if (row < hgt) requestAnimationFrame(paint);
      this.lastExplore = null; // refresh the explored copy as rows arrive
    };
    requestAnimationFrame(paint);
    return c;
  }

  private pixel(u: number, v: number): [number, number, number] {
    const { x, z } = fromUV(u, v);
    const sdf = valleySdf(x, z);
    if (distanceToWater(x, z) < 1.5 && sdf > -20) return [70, 130, 160];
    if (sdf > 0) {
      if (distanceToTrail(x, z) < 3) return [150, 128, 90];
      const d = forestDensity(this.world.seed, x, z);
      return [86 - d * 30, 124 - d * 34, 62 - d * 20];
    }
    // Mountains: lighter with height (approximated by distance into the rock).
    const k = Math.min(1, -sdf / 120);
    return [70 + k * 120, 70 + k * 115, 66 + k * 120];
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
    if (ctxInfo?.unknown) {
      ctx.fillStyle = "#14110e";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#8a7a60";
      ctx.font = `italic ${Math.round(12 * dpr)}px Georgia, serif`;
      ctx.textAlign = "center";
      ctx.fillText("You don't know", W / 2, H / 2 - 7 * dpr);
      ctx.fillText("where you are.", W / 2, H / 2 + 9 * dpr);
      return;
    }

    // Large map shows the whole valley; the corner map follows the player.
    const self = markers.find((m) => m.kind === "self");
    let scale: number; // canvas px per metre
    let cu: number;
    let cv: number;
    if (ctxInfo?.underground && self) {
      // The crypt is small: zoom right in.
      scale = Math.min(W, H) / (this.large ? 70 : 45);
      ({ u: cu, v: cv } = toUV(self.x, self.z));
    } else if ((this.large && ctxInfo?.hasMap) || !self) {
      // With Haskel's map: the whole valley.
      scale = Math.min(W / (U1 - U0), H / (V1 - V0));
      cu = (U0 + U1) / 2;
      cv = (V0 + V1) / 2;
    } else if (this.large) {
      // Without one: the country around you (the valley is kilometres across).
      scale = Math.min(W, H) / LARGE_SPAN;
      ({ u: cu, v: cv } = toUV(self.x, self.z));
    } else {
      scale = W / CORNER_SPAN;
      ({ u: cu, v: cv } = toUV(self.x, self.z));
    }
    const toPx = (x: number, z: number) => {
      const { u, v } = toUV(x, z);
      return { px: W / 2 + (u - cu) * scale, py: H / 2 + (v - cv) * scale };
    };

    if (ctxInfo?.underground) {
      // Under Ashford: just the crypt's rooms and corridors, as you'd sketch them.
      ctx.fillStyle = "#0e0c0a";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4a4238";
      ctx.strokeStyle = "#7a6a50";
      ctx.lineWidth = dpr;
      for (const r of CRYPT_ROOMS) {
        const corners = [cryptPoint(r.x0, r.z0), cryptPoint(r.x1, r.z0), cryptPoint(r.x1, r.z1), cryptPoint(r.x0, r.z1)].map((c) => toPx(c.x, c.z));
        ctx.beginPath();
        corners.forEach((c, i) => (i ? ctx.lineTo(c.px, c.py) : ctx.moveTo(c.px, c.py)));
        ctx.closePath();
        ctx.fill();
      }
      if (this.large) {
        ctx.fillStyle = "#c8b890";
        ctx.font = `italic ${Math.round(10 * dpr)}px Georgia, serif`;
        ctx.textAlign = "center";
        for (const r of CRYPT_ROOMS) {
          if (!r.name) continue;
          const c = cryptPoint((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
          const { px, py } = toPx(c.x, c.z);
          ctx.fillText(r.name, px, py);
        }
      }
    } else {
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
    }

    if (ctxInfo?.quest) this.drawQuestTarget(ctx, ctxInfo.quest, toPx, W, H, scale, dpr);

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

  /** The followed quest: a pulsing marker on the map, or an arrow on the rim pointing the way. */
  private drawQuestTarget(ctx: CanvasRenderingContext2D, q: NonNullable<MapContext["quest"]>, toPx: (x: number, z: number) => { px: number; py: number }, W: number, H: number, scale: number, dpr: number): void {
    const { px, py } = toPx(q.x, q.z);
    const cx = W / 2;
    const cy = H / 2;
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    // The corner map is round; keep the arrow just inside its rim.
    const rim = Math.min(W, H) / 2 - 11 * dpr;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 260);
    const areaR = q.radius * scale;
    if (dist - areaR * 0.5 <= rim) {
      // On the map: ring the spot (an area already has its dashed ring).
      if (areaR < 6 * dpr) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 224, 122, ${0.5 + 0.5 * pulse})`;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.arc(px, py, (7 + pulse * 4) * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      if (dist > rim) return;
      ctx.fillStyle = "#ffe07a";
      ctx.strokeStyle = "#3a2a00";
      ctx.lineWidth = dpr;
      const r = 5 * dpr;
      ctx.beginPath();
      ctx.moveTo(px, py - r);
      ctx.lineTo(px + r, py);
      ctx.lineTo(px, py + r);
      ctx.lineTo(px - r, py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }
    // Off the map: a gold arrow on the rim, pointing at it.
    const ang = Math.atan2(dy, dx);
    const ax = cx + Math.cos(ang) * rim;
    const ay = cy + Math.sin(ang) * rim;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    const s = (1 + pulse * 0.15) * dpr;
    ctx.fillStyle = "#ffe07a";
    ctx.strokeStyle = "#3a2a00";
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.moveTo(9 * s, 0);
    ctx.lineTo(-6 * s, 7 * s);
    ctx.lineTo(-2 * s, 0);
    ctx.lineTo(-6 * s, -7 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
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
