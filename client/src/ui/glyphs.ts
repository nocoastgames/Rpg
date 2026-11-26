import { h } from "./dom.ts";

export type InputMode = "kbm" | "gamepad" | "touch";

export type GameAction = "attack" | "ability0" | "ability1" | "interact" | "bag" | "map" | "help" | "zoom" | "quickHeal" | "quickResource";

/** Xbox layout is the default controller glyph set. */
const PAD_GLYPHS: Record<GameAction, string> = {
  attack: "A",
  ability0: "X",
  ability1: "Y",
  interact: "B",
  bag: "View",
  map: "RS",
  help: "Menu",
  zoom: "LB/RB",
  quickHeal: "D↑",
  quickResource: "D↓",
};

const KEY_GLYPHS: Record<GameAction, string> = {
  attack: "LMB",
  ability0: "1",
  ability1: "2",
  interact: "F",
  bag: "I",
  map: "M",
  help: "H",
  zoom: "Wheel",
  quickHeal: "3",
  quickResource: "4",
};

/** A small element showing the button for an action in the current input mode. */
export function glyph(action: GameAction, mode: InputMode): HTMLElement {
  if (mode === "gamepad") {
    const label = PAD_GLYPHS[action];
    const face = /^[ABXY]$/.test(label) ? `.glyph-${label.toLowerCase()}` : ".glyph-pad";
    return h(`span.glyph${face}` as "span", null, label);
  }
  if (mode === "touch") return h("span.glyph.glyph-touch", null, "tap");
  return h("kbd", null, KEY_GLYPHS[action]);
}

export function glyphText(action: GameAction, mode: InputMode): string {
  return mode === "gamepad" ? PAD_GLYPHS[action] : KEY_GLYPHS[action];
}
