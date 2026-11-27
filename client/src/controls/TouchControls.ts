import { h } from "../ui/dom.ts";

export type TouchAction = "attack" | "interact" | "bag" | "diary" | "map" | "chat" | "help" | "fullscreen";

export interface AbilityRelease {
  slot: number;
  /** Screen-space aim direction (y up) with magnitude 0..1, or null for a quick tap (auto-target). */
  aim: { x: number; y: number; mag: number } | null;
}

const STICK_RADIUS = 56;

/**
 * On-screen controls for phones and tablets:
 *  - floating virtual joystick on the left half of the screen
 *  - attack / ability / interact buttons on the right (drag an ability to aim it)
 *  - tap the world to walk there or attack what you tapped
 *  - pinch to zoom
 */
export class TouchControls {
  readonly el: HTMLElement;
  /** Joystick vector in screen space (x right, y up), magnitude 0..1. */
  move = { x: 0, y: 0 };
  attackHeld = false;
  /** Current drag-aim of an ability button, for drawing the reticle. */
  aiming: AbilityRelease | null = null;
  private readonly actions: TouchAction[] = [];
  private readonly releases: AbilityRelease[] = [];
  private readonly taps: Array<{ x: number; y: number }> = [];
  private pinch = 0;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private stickStart = { x: 0, y: 0, t: 0, moved: 0 };
  private readonly worldTouches = new Map<number, { x: number; y: number; t: number; sx: number; sy: number }>();
  private pinchDist = 0;
  readonly abilityButtons: HTMLButtonElement[] = [];
  readonly interactButton: HTMLButtonElement;

  constructor(private readonly surface: HTMLElement) {
    this.knob = h("div.stick-knob");
    this.stick = h("div.stick.hidden", null, this.knob);

    const attack = h("button.t-btn.t-attack", { type: "button", "aria-label": "Attack" }, "⚔");
    this.bindHold(attack, (down) => {
      this.attackHeld = down;
      if (down) this.actions.push("attack");
    });

    const mkAbility = (slot: number) => {
      const b = h(`button.t-btn.t-ability.t-ab${slot}`, { type: "button" }, h("span.t-label"), h("span.t-cd")) as HTMLButtonElement;
      this.bindAbility(b, slot);
      this.abilityButtons.push(b);
      return b;
    };
    const abilityButtons = [0, 1, 2, 3].map(mkAbility);

    this.interactButton = h("button.t-btn.t-interact.hidden", { type: "button", "aria-label": "Interact" }, "✋") as HTMLButtonElement;
    this.bindTap(this.interactButton, "interact");

    const small = (label: string, act: TouchAction, title: string) => {
      const b = h("button.t-small", { type: "button", title, "aria-label": title }, label);
      this.bindTap(b, act);
      return b;
    };
    const top = h(
      "div.touch-top",
      null,
      small("🎒", "bag", "Character & pack"),
      small("📜", "diary", "Quest diary"),
      small("🗺", "map", "Map"),
      small("💬", "chat", "Chat"),
      small("?", "help", "Help"),
      document.fullscreenEnabled ? small("⛶", "fullscreen", "Fullscreen") : null,
    );

    this.el = h("div.touch-ui", null, this.stick, h("div.touch-actions", null, attack, ...abilityButtons, this.interactButton), top);
    this.bindSurface();
  }

  /** Labels per slot; an empty label hides the button (ability not learned yet). */
  setAbilityLabels(labels: string[]): void {
    this.abilityButtons.forEach((b, i) => {
      const label = labels[i] ?? "";
      (b.querySelector(".t-label") as HTMLElement).textContent = label;
      b.classList.toggle("hidden", !label);
    });
  }

  setCooldown(slot: number, frac: number, text: string, noResource: boolean): void {
    const b = this.abilityButtons[slot]!;
    (b.querySelector(".t-cd") as HTMLElement).style.setProperty("--cd", String(frac));
    (b.querySelector(".t-cd") as HTMLElement).textContent = text;
    b.classList.toggle("no-res", noResource);
  }

  setInteract(visible: boolean): void {
    this.interactButton.classList.toggle("hidden", !visible);
  }

  consumeActions(): TouchAction[] {
    return this.actions.splice(0);
  }

  consumeAbilityReleases(): AbilityRelease[] {
    return this.releases.splice(0);
  }

  consumeTaps(): Array<{ x: number; y: number }> {
    return this.taps.splice(0);
  }

  consumePinch(): number {
    const p = this.pinch;
    this.pinch = 0;
    return p;
  }

  // -------------------------------------------------------------------------

  private bindTap(el: HTMLElement, act: TouchAction): void {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.actions.push(act);
    });
  }

  private bindHold(el: HTMLElement, cb: (down: boolean) => void): void {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.classList.add("down");
      cb(true);
    });
    const up = () => {
      el.classList.remove("down");
      cb(false);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  /** Tap = auto-target; drag = aim in the drag direction (like twin-stick MOBA controls). */
  private bindAbility(el: HTMLElement, slot: number): void {
    let start: { x: number; y: number } | null = null;
    let aim: AbilityRelease["aim"] = null;
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.classList.add("down");
      start = { x: e.clientX, y: e.clientY };
      aim = null;
    });
    el.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = start.y - e.clientY;
      const d = Math.hypot(dx, dy);
      if (d > 18) {
        const mag = Math.min(1, d / 110);
        aim = { x: dx / d, y: dy / d, mag };
        this.aiming = { slot, aim };
      }
    });
    const finish = (cancel: boolean) => {
      if (!start) return;
      el.classList.remove("down");
      if (!cancel) this.releases.push({ slot, aim });
      start = null;
      aim = null;
      this.aiming = null;
    };
    el.addEventListener("pointerup", () => finish(false));
    el.addEventListener("pointercancel", () => finish(true));
  }

  private bindSurface(): void {
    const s = this.surface;
    s.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      e.preventDefault();
      const r = s.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (this.stickId === null && x < r.width * 0.45 && this.worldTouches.size === 0) {
        this.stickId = e.pointerId;
        this.stickOrigin = { x: e.clientX, y: e.clientY };
        this.stickStart = { x, y, t: performance.now(), moved: 0 };
        this.stick.style.left = `${e.clientX}px`;
        this.stick.style.top = `${e.clientY}px`;
        this.stick.classList.remove("hidden");
        this.knob.style.transform = "translate(-50%, -50%)";
        s.setPointerCapture(e.pointerId);
        return;
      }
      this.worldTouches.set(e.pointerId, { x, y, sx: x, sy: y, t: performance.now() });
      if (this.worldTouches.size === 2) this.pinchDist = this.touchSpread();
      s.setPointerCapture(e.pointerId);
    });
    s.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "touch") return;
      if (e.pointerId === this.stickId) {
        const dx = e.clientX - this.stickOrigin.x;
        const dy = e.clientY - this.stickOrigin.y;
        const d = Math.hypot(dx, dy);
        this.stickStart.moved = Math.max(this.stickStart.moved, d);
        const k = d > STICK_RADIUS ? STICK_RADIUS / d : 1;
        this.knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
        const mag = Math.min(1, d / STICK_RADIUS);
        this.move = mag < 0.15 ? { x: 0, y: 0 } : { x: (dx / (d || 1)) * mag, y: (-dy / (d || 1)) * mag };
        return;
      }
      const t = this.worldTouches.get(e.pointerId);
      if (!t) return;
      const r = s.getBoundingClientRect();
      t.x = e.clientX - r.left;
      t.y = e.clientY - r.top;
      if (this.worldTouches.size === 2) {
        const d = this.touchSpread();
        if (this.pinchDist > 0) this.pinch += (this.pinchDist - d) * 2;
        this.pinchDist = d;
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (e.pointerId === this.stickId) {
        this.stickId = null;
        this.move = { x: 0, y: 0 };
        this.stick.classList.add("hidden");
        // A quick tap (no drag) on the joystick side is a tap on the world: walk there.
        if (e.type === "pointerup" && this.stickStart.moved < 12 && performance.now() - this.stickStart.t < 300) {
          this.taps.push({ x: this.stickStart.x, y: this.stickStart.y });
        }
        return;
      }
      const t = this.worldTouches.get(e.pointerId);
      if (!t) return;
      const wasPinch = this.worldTouches.size > 1;
      this.worldTouches.delete(e.pointerId);
      if (this.worldTouches.size < 2) this.pinchDist = 0;
      if (e.type === "pointerup" && !wasPinch && Math.hypot(t.x - t.sx, t.y - t.sy) < 14 && performance.now() - t.t < 350) {
        this.taps.push({ x: t.x, y: t.y });
      }
    };
    s.addEventListener("pointerup", end);
    s.addEventListener("pointercancel", end);
  }

  private touchSpread(): number {
    const [a, b] = [...this.worldTouches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
