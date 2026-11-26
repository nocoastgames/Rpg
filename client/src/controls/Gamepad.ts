/**
 * Gamepad polling with the Xbox controller layout as the default
 * (W3C "standard" mapping, which Xbox pads report in every major browser).
 * PlayStation / Switch Pro pads use the same indices, so they work too;
 * only the on-screen glyphs say A/B/X/Y.
 */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  LS: 10,
  RS: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;
export type PadButton = (typeof PAD)[keyof typeof PAD];

export interface Stick {
  x: number;
  /** Up is positive (already flipped from the browser's convention). */
  y: number;
  mag: number;
}

const DEADZONE = 0.18;

function radial(x: number, y: number): Stick {
  const mag = Math.hypot(x, y);
  if (mag < DEADZONE) return { x: 0, y: 0, mag: 0 };
  const m = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE));
  return { x: (x / mag) * m, y: (-y / mag) * m, mag: m };
}

export class GamepadInput {
  connected = false;
  id = "";
  left: Stick = { x: 0, y: 0, mag: 0 };
  right: Stick = { x: 0, y: 0, mag: 0 };
  /** True if any button/stick was used this poll (for switching the UI to controller glyphs). */
  active = false;
  private cur: boolean[] = [];
  private prev: boolean[] = [];
  private index: number | null = null;
  /** First poll after creation: buttons already held (e.g. the press that started the game) don't count as new presses. */
  private primed = false;
  private repeatAt = new Map<string, number>();

  constructor() {
    window.addEventListener("gamepadconnected", (e) => {
      this.index ??= (e as GamepadEvent).gamepad.index;
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      if ((e as GamepadEvent).gamepad.index === this.index) this.index = null;
    });
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads?.() ?? [];
    if (this.index !== null && pads[this.index]) return pads[this.index]!;
    for (const p of pads) {
      if (p && p.connected) {
        this.index = p.index;
        return p;
      }
    }
    return null;
  }

  poll(): void {
    const p = this.pad();
    this.prev = this.cur;
    this.connected = !!p;
    if (!p) {
      this.cur = [];
      this.left = this.right = { x: 0, y: 0, mag: 0 };
      this.active = false;
      return;
    }
    this.id = p.id;
    this.cur = p.buttons.map((b) => b.pressed || b.value > 0.5);
    if (!this.primed) {
      this.prev = this.cur;
      this.primed = true;
    }
    this.left = radial(p.axes[0] ?? 0, p.axes[1] ?? 0);
    this.right = radial(p.axes[2] ?? 0, p.axes[3] ?? 0);
    this.active = this.cur.some(Boolean) || this.left.mag > 0 || this.right.mag > 0;
  }

  held(b: PadButton): boolean {
    return !!this.cur[b];
  }

  pressed(b: PadButton): boolean {
    return !!this.cur[b] && !this.prev[b];
  }

  /**
   * Menu-style direction with key-repeat, from the D-pad or left stick.
   * Returns null when nothing is pressed or the repeat delay hasn't elapsed.
   */
  navDirection(now: number): "up" | "down" | "left" | "right" | null {
    let dir: "up" | "down" | "left" | "right" | null = null;
    if (this.held(PAD.UP) || this.left.y > 0.6) dir = "up";
    else if (this.held(PAD.DOWN) || this.left.y < -0.6) dir = "down";
    else if (this.held(PAD.LEFT) || this.left.x < -0.6) dir = "left";
    else if (this.held(PAD.RIGHT) || this.left.x > 0.6) dir = "right";
    if (!dir) {
      this.repeatAt.clear();
      return null;
    }
    const next = this.repeatAt.get(dir);
    if (next === undefined) {
      this.repeatAt.clear();
      this.repeatAt.set(dir, now + 380);
      return dir;
    }
    if (now >= next) {
      this.repeatAt.set(dir, now + 140);
      return dir;
    }
    return null;
  }

  rumble(strength = 0.5, ms = 120): void {
    const p = this.pad() as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, o: object) => Promise<unknown> } }) | null;
    try {
      void p?.vibrationActuator?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strength, weakMagnitude: strength * 0.6 })?.catch(() => {});
    } catch {
      // Rumble unsupported - ignore.
    }
  }
}
