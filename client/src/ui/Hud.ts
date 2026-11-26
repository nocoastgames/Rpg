import { RESOURCES, getClass, getItem, getSubclass, INVENTORY_SLOTS, type ClassDef, type SubclassDef } from "@rpg/shared";
import type { PlayerView } from "../types.ts";
import { h } from "./dom.ts";
import { glyph, type GameAction, type InputMode } from "./glyphs.ts";

export interface HudCallbacks {
  onUseItem(slot: number): void;
  onChat(text: string): void;
  onTypingChange(typing: boolean): void;
  onAbility(slot: 0 | 1): void;
  onInteract(): void;
}

interface Slot {
  el: HTMLElement;
  key: HTMLElement;
  cd: HTMLElement;
  action: GameAction;
}

export interface PartyMember {
  name: string;
  level: number;
  classId: string;
  hp: number;
  maxHp: number;
}

/** Old-school HUD: health/resource orbs, hotbar, XP bar, chat, bag, target frame, minimap. */
export class Hud {
  readonly root: HTMLElement;
  readonly bag: HTMLElement;
  readonly help: HTMLElement;
  private readonly hpOrb: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly resOrb: HTMLElement;
  private readonly resText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly levelBadge: HTMLElement;
  private readonly slots: Slot[] = [];
  private readonly buffs: HTMLElement;
  private readonly chat: HTMLElement;
  private readonly chatLog: HTMLElement;
  private readonly chatInput: HTMLInputElement;
  private readonly bagGrid: HTMLElement;
  private readonly equip: HTMLElement;
  private readonly charInfo: HTMLElement;
  private readonly notices: HTMLElement;
  private readonly target: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetFill: HTMLElement;
  private readonly party: HTMLElement;
  private readonly death: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly interactHint: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private bannerTimer = 0;
  private bagKey = "";
  private partyKey = "";
  private hintKey = "";
  private cls: ClassDef | null = null;
  private sub: SubclassDef | null = null;
  private mode: InputMode = "kbm";

  constructor(
    container: HTMLElement,
    private readonly cb: HudCallbacks,
    minimap: HTMLElement,
    touchUi: HTMLElement,
  ) {
    this.tooltip = h("div.tooltip");
    const stop = (e: Event) => e.stopPropagation();

    this.hpText = h("div.orb-text");
    this.hpOrb = h("div.orb.orb-hp", { title: "Health" }, h("div.orb-fill"), h("div.orb-shine"), this.hpText);
    this.resText = h("div.orb-text");
    this.resOrb = h("div.orb.orb-res", null, h("div.orb-fill"), h("div.orb-shine"), this.resText);
    this.xpFill = h("div.xp-fill");
    this.levelBadge = h("div.level-badge");

    const hotbar = h("div.hotbar");
    const mkSlot = (action: GameAction, label: string, onClick?: () => void) => {
      const cd = h("div.slot-cd");
      const key = h("span.slot-key");
      const el = h("button.slot", { type: "button", onclick: onClick }, key, h("span.slot-label", null, label), cd);
      hotbar.append(el);
      this.slots.push({ el, key, cd, action });
    };
    mkSlot("attack", "Attack");
    mkSlot("ability0", "", () => cb.onAbility(0));
    mkSlot("ability1", "", () => cb.onAbility(1));
    mkSlot("interact", "Interact", () => cb.onInteract());
    mkSlot("bag", "Bag", () => this.toggleBag());

    this.buffs = h("div.buffs");
    const bar = h(
      "div.bottom-bar",
      { onpointerdown: stop },
      this.hpOrb,
      h("div.bar-center", null, this.buffs, h("div.xp-bar", { title: "Experience" }, this.xpFill), h("div.bar-row", null, this.levelBadge, hotbar)),
      this.resOrb,
    );

    this.chatLog = h("div.chat-log");
    this.chatInput = h("input.chat-input", { type: "text", maxlength: 200, placeholder: "Press Enter to chat", enterkeyhint: "send" });
    this.chatInput.addEventListener("focus", () => cb.onTypingChange(true));
    this.chatInput.addEventListener("blur", () => {
      cb.onTypingChange(false);
      this.chat.classList.remove("open");
    });
    this.chatInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        const text = this.chatInput.value.trim();
        if (text) cb.onChat(text);
        this.chatInput.value = "";
        this.chatInput.blur();
      } else if (e.key === "Escape") {
        this.chatInput.blur();
      }
    });
    this.chat = h("div.chat", { onpointerdown: stop }, this.chatLog, this.chatInput);

    this.equip = h("div.equip");
    this.charInfo = h("div.char-info");
    this.bagGrid = h("div.bag-grid");
    this.bag = h(
      "div.panel.bag.hidden",
      { onpointerdown: stop },
      h("div.panel-title", null, "Character", h("button.panel-close", { type: "button", onclick: () => this.toggleBag() }, "×")),
      this.charInfo,
      this.equip,
      h("div.panel-sub", null, "Pack"),
      this.bagGrid,
    );

    this.notices = h("div.notices");
    this.targetName = h("div.target-name");
    this.targetFill = h("div.target-fill");
    this.target = h("div.target.hidden", null, this.targetName, h("div.target-bar", null, this.targetFill));
    this.party = h("div.party");
    this.death = h("div.death.hidden", null, h("div.death-title", null, "You have fallen"), h("div.death-sub", null, "You will wake by the stream again…"));
    this.interactHint = h("div.interact-hint.hidden");
    this.help = this.buildHelp(stop);

    this.bannerEl = h("div.zone-banner", null, h("div.zone-name", null, "The Unknown Forest"), h("div.zone-sub", null, "A valley walled in by mountains"));
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add("fade"), 3500);

    this.root = h(
      "div.hud",
      null,
      this.bannerEl,
      this.party,
      this.target,
      this.notices,
      this.interactHint,
      this.death,
      minimap,
      this.chat,
      touchUi,
      this.bag,
      this.help,
      bar,
      this.tooltip,
    );
    container.replaceChildren(this.root);
    this.setInputMode("kbm");
  }

  private buildHelp(stop: (e: Event) => void): HTMLElement {
    const table = (mode: string, rows: Array<[string, string]>) =>
      h(`table.help-${mode}` as "table", null, ...rows.map(([k, v]) => h("tr", null, h("td", null, h("kbd", null, k)), h("td", null, v))));
    return h(
      "div.panel.help.hidden",
      { onpointerdown: stop },
      h("div.panel-title", null, "Controls", h("button.panel-close", { type: "button", onclick: () => this.toggleHelp() }, "×")),
      table("kbm", [
        ["Left click ground", "Move (hold to keep walking)"],
        ["Left click enemy", "Attack"],
        ["W A S D", "Move"],
        ["Right click / 1", "Class ability at cursor"],
        ["2", "Subclass ability at cursor"],
        ["F", "Interact / inspect"],
        ["3 / 4", "Quick-use food / water"],
        ["I", "Character & pack"],
        ["M", "Map"],
        ["Enter", "Chat"],
        ["Mouse wheel", "Zoom"],
        ["H", "Toggle this help"],
      ]),
      table("gamepad", [
        ["Left stick", "Move (push lightly to walk)"],
        ["Right stick", "Aim abilities"],
        ["A", "Attack nearest enemy (hold to keep fighting)"],
        ["X", "Class ability"],
        ["Y", "Subclass ability"],
        ["B", "Interact / inspect · close menus"],
        ["D-pad ↑ / ↓", "Quick-use food / water"],
        ["LB / RB", "Zoom out / in"],
        ["View", "Character & pack"],
        ["Right stick click", "Map"],
        ["Menu", "Toggle this help"],
      ]),
      table("touch", [
        ["Left side", "Drag to move"],
        ["Tap ground / enemy", "Walk there / attack"],
        ["⚔", "Attack nearest enemy (hold)"],
        ["Ability buttons", "Tap to auto-aim, drag to aim"],
        ["✋", "Interact (appears when something is near)"],
        ["Pinch", "Zoom"],
        ["🎒 🗺 💬", "Pack, map, chat"],
      ]),
    );
  }

  get isTyping(): boolean {
    return document.activeElement === this.chatInput;
  }

  get bagOpen(): boolean {
    return !this.bag.classList.contains("hidden");
  }

  get helpOpen(): boolean {
    return !this.help.classList.contains("hidden");
  }

  setInputMode(mode: InputMode): void {
    this.mode = mode;
    document.body.dataset.input = mode;
    for (const s of this.slots) s.key.replaceChildren(glyph(s.action, mode));
    this.hintKey = "";
    this.chatInput.placeholder = mode === "touch" ? "Say something…" : "Press Enter to chat";
  }

  focusChat(): void {
    this.chat.classList.add("open");
    this.chatInput.focus();
  }

  toggleBag(force?: boolean): void {
    this.bag.classList.toggle("hidden", force === undefined ? undefined : !force);
  }

  toggleHelp(force?: boolean): void {
    this.help.classList.toggle("hidden", force === undefined ? undefined : !force);
  }

  closePanels(): boolean {
    const any = this.bagOpen || this.helpOpen;
    this.toggleBag(false);
    this.toggleHelp(false);
    return any;
  }

  chatLine(from: string, text: string, system = false): void {
    const line = h("div.chat-line", null, from ? h("b", null, `${from}: `) : null, text);
    if (system) line.classList.add("system");
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 60) this.chatLog.firstElementChild!.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  notice(text: string): void {
    const n = h("div.notice", null, text);
    this.notices.append(n);
    const life = Math.max(3500, text.length * 55);
    setTimeout(() => n.classList.add("fade"), life - 1000);
    setTimeout(() => n.remove(), life);
    while (this.notices.childElementCount > 4) this.notices.firstElementChild!.remove();
  }

  /** Large zone/landmark title, e.g. on discovering the ruins. */
  banner(title: string, sub = ""): void {
    window.clearTimeout(this.bannerTimer);
    this.bannerEl.replaceChildren(h("div.zone-name", null, title), sub ? h("div.zone-sub", null, sub) : "");
    this.bannerEl.classList.remove("fade");
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add("fade"), 3000);
  }

  setInteractHint(text: string | null): void {
    const key = `${text}|${this.mode}`;
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.interactHint.classList.toggle("hidden", !text);
    if (text) this.interactHint.replaceChildren(this.mode === "touch" ? "" : glyph("interact", this.mode), " ", text);
  }

  setTarget(name: string | null, hp = 0, maxHp = 1): void {
    this.target.classList.toggle("hidden", !name);
    if (!name) return;
    this.targetName.textContent = name;
    this.targetFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
  }

  /** Ability info for touch buttons and the hotbar: [fraction, text, noResource]. */
  abilityState(p: PlayerView, serverTime: number, slot: 0 | 1): { frac: number; text: string; noRes: boolean } {
    const ability = slot === 0 ? this.cls?.ability : this.sub?.ability;
    const remaining = Math.max(0, (p.cooldowns[slot] ?? 0) - serverTime) / 1000;
    return {
      frac: ability ? Math.min(1, remaining / ability.cooldown) : 0,
      text: remaining > 0.05 ? remaining.toFixed(remaining < 3 ? 1 : 0) : "",
      noRes: !!ability && p.resource < ability.cost,
    };
  }

  get abilityNames(): [string, string] {
    return [this.cls?.ability.name ?? "", this.sub?.ability.name ?? ""];
  }

  update(p: PlayerView, serverTime: number, others: PartyMember[]): void {
    if (!this.cls || this.cls.id !== p.classId || this.sub?.id !== p.subclassId) {
      this.cls = getClass(p.classId) ?? null;
      this.sub = getSubclass(p.classId, p.subclassId) ?? null;
      if (this.cls && this.sub) {
        const res = RESOURCES[this.cls.resource];
        this.resOrb.style.setProperty("--orb-color", res.color);
        this.resOrb.title = res.label;
        this.slots[1]!.el.querySelector(".slot-label")!.textContent = this.cls.ability.name;
        this.slots[2]!.el.querySelector(".slot-label")!.textContent = this.sub.ability.name;
        this.slots[1]!.el.title = `${this.cls.ability.name} — ${this.cls.ability.description} (${this.cls.ability.cost} ${res.label})`;
        this.slots[2]!.el.title = `${this.sub.ability.name} — ${this.sub.ability.description} (${this.sub.ability.cost} ${res.label})`;
        this.slots[0]!.el.title = `${this.cls.basicAttack.kind === "melee" ? "Melee" : "Ranged"} attack`;
      }
    }

    this.hpOrb.style.setProperty("--fill", String(Math.max(0, p.hp / Math.max(1, p.maxHp))));
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    this.resOrb.style.setProperty("--fill", String(Math.max(0, p.resource / Math.max(1, p.maxResource))));
    this.resText.textContent = `${Math.floor(p.resource)} / ${p.maxResource}`;
    this.xpFill.style.width = `${(p.xp / Math.max(1, p.xpNext)) * 100}%`;
    this.levelBadge.textContent = String(p.level);
    this.levelBadge.title = `Level ${p.level} — ${p.xp} / ${p.xpNext} XP`;

    for (const slot of [0, 1] as const) {
      const st = this.abilityState(p, serverTime, slot);
      const s = this.slots[slot + 1]!;
      s.cd.style.setProperty("--cd", String(st.frac));
      s.cd.textContent = st.text;
      s.el.classList.toggle("no-res", st.noRes);
    }

    const buffNodes: HTMLElement[] = [];
    p.buffs.forEach((b) => {
      const left = Math.max(0, (b.expiresAt - serverTime) / 1000);
      if (left > 0) buffNodes.push(h("div.buff", { title: `+${Math.round(b.amount * 100)}% ${b.stat}` }, `${b.stat} ${left.toFixed(0)}s`));
    });
    this.buffs.replaceChildren(...buffNodes);

    this.death.classList.toggle("hidden", p.anim !== "dead");
    this.renderBag(p);
    this.renderParty(others);
  }

  private renderBag(p: PlayerView): void {
    const parts: string[] = [p.weapon, p.armor, String(p.level)];
    p.inventory.forEach((s) => parts.push(`${s.itemId}:${s.qty}`));
    const key = parts.join("|");
    if (key === this.bagKey) return;
    this.bagKey = key;

    this.charInfo.replaceChildren(
      h("div.char-name", null, p.name),
      h("div.char-class", { style: `color:${this.cls?.color}` }, `Level ${p.level} ${this.sub?.name ?? ""} ${this.cls?.name ?? ""}`),
    );

    const itemCell = (itemId: string, qty: number, onClick?: () => void) => {
      const def = getItem(itemId);
      const cell = h("button.bag-cell", { type: "button", onclick: onClick }, def ? def.icon : "", qty > 1 ? h("span.qty", null, String(qty)) : null);
      if (def) {
        cell.addEventListener("pointerenter", () => this.showTooltip(cell, def.name, def.kind, def.description));
        cell.addEventListener("pointerleave", () => this.tooltip.classList.remove("show"));
      }
      return cell;
    };
    this.equip.replaceChildren(
      h("div.equip-slot", null, h("span", null, "Weapon"), itemCell(p.weapon, 1)),
      h("div.equip-slot", null, h("span", null, "Armor"), itemCell(p.armor, 1)),
    );
    const cells: HTMLElement[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const s = p.inventory[i];
      cells.push(s ? itemCell(s.itemId, s.qty, () => this.cb.onUseItem(i)) : h("div.bag-cell.empty"));
    }
    this.bagGrid.replaceChildren(...cells);
  }

  private renderParty(others: PartyMember[]): void {
    const key = others.map((o) => `${o.name}${o.level}${Math.round((o.hp / o.maxHp) * 20)}`).join("|");
    if (key === this.partyKey) return;
    this.partyKey = key;
    this.party.replaceChildren(
      ...others.slice(0, 8).map((o) =>
        h(
          "div.party-member",
          { style: `--class-color:${getClass(o.classId)?.color ?? "#888"}` },
          h("div.party-name", null, `${o.name} · ${o.level}`),
          h("div.party-bar", null, h("div.party-fill", { style: `width:${Math.max(0, (o.hp / o.maxHp) * 100)}%` })),
        ),
      ),
    );
  }

  hideTooltip(): void {
    this.tooltip.classList.remove("show");
  }

  private showTooltip(anchor: HTMLElement, name: string, kind: string, desc: string): void {
    this.tooltip.replaceChildren(h("b", null, name), h("i", null, kind), desc);
    const r = anchor.getBoundingClientRect();
    this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 248, r.left - 100))}px`;
    this.tooltip.style.top = `${Math.max(8, r.top - 90)}px`;
    this.tooltip.classList.add("show");
  }
}
