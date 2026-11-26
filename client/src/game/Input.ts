/**
 * Raw input state. The game reads this every frame and turns it into
 * network intents; UI elements stop events from reaching the canvas.
 */
export class Input {
  readonly keys = new Set<string>();
  /** Mouse position in CSS pixels relative to the canvas. */
  mouseX = 0;
  mouseY = 0;
  leftDown = false;
  /** Set when the left button was pressed this frame (consumed by the game). */
  leftPressed = false;
  rightPressed = false;
  wheel = 0;
  /** True while typing in chat or another text box. */
  typing = false;
  /** Set whenever the mouse or keyboard is used (for switching the UI's input glyphs). */
  mouseActive = false;
  private readonly pressedKeys: string[] = [];

  constructor(private readonly el: HTMLElement) {
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    el.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return; // handled by TouchControls
      this.mouseActive = true;
      const r = el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return; // handled by TouchControls
      this.mouseActive = true;
      const r = el.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      if (e.button === 0) {
        this.leftDown = true;
        this.leftPressed = true;
      } else if (e.button === 2) {
        this.rightPressed = true;
      }
    });
    window.addEventListener("pointerup", (e) => {
      if (e.button === 0) this.leftDown = false;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.wheel += e.deltaY;
      },
      { passive: false },
    );
    window.addEventListener("keydown", (e) => {
      if (this.typing) return;
      this.mouseActive = true;
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressedKeys.push(k);
      this.keys.add(k);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.leftDown = false;
    });
  }

  /** Keys pressed since the last call (edge-triggered). */
  consumePressed(): string[] {
    return this.pressedKeys.splice(0);
  }

  get width(): number {
    return this.el.clientWidth;
  }

  get height(): number {
    return this.el.clientHeight;
  }
}
