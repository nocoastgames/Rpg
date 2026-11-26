/**
 * Spatial focus navigation for menus when using a controller: the D-pad or
 * stick moves a highlight to the nearest control in that direction, A
 * activates it. Works on any container of buttons (character creation, bag).
 */
const FOCUSABLE = "button:not([disabled]), [data-nav]";

export class MenuNav {
  private current: HTMLElement | null = null;

  constructor(private readonly root: () => HTMLElement | null) {}

  private items(): HTMLElement[] {
    const r = this.root();
    if (!r) return [];
    return Array.from(r.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null && !el.classList.contains("empty"));
  }

  get focused(): HTMLElement | null {
    return this.current && this.current.isConnected ? this.current : null;
  }

  focus(el: HTMLElement | null): void {
    this.current?.classList.remove("pad-focus");
    this.current = el;
    if (el) {
      el.classList.add("pad-focus");
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      el.dispatchEvent(new PointerEvent("pointerenter"));
    }
  }

  /** Make sure something is focused (prefers a pressed/selected item). */
  ensure(): void {
    if (this.focused && this.items().includes(this.focused)) return;
    const items = this.items();
    this.focus(items.find((el) => el.getAttribute("aria-pressed") === "true") ?? items[0] ?? null);
  }

  clear(): void {
    this.focus(null);
  }

  move(dir: "up" | "down" | "left" | "right"): void {
    this.ensure();
    const from = this.focused;
    if (!from) return;
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of this.items()) {
      if (el === from) continue;
      const b = el.getBoundingClientRect();
      const vx = b.left + b.width / 2 - ax;
      const vy = b.top + b.height / 2 - ay;
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) this.focus(best);
  }

  activate(): void {
    this.focused?.click();
  }
}
