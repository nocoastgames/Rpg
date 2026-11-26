import { RESOURCES, getClass, getItem, getSubclass, INVENTORY_SLOTS, type ClassDef, type SubclassDef } from "@rpg/shared";
import type { PlayerView } from "../types.ts";
import { h } from "./dom.ts";

export interface HudCallbacks {
  onUseItem(slot: number): void;
  onChat(text: string): void;
  onTypingChange(typing: boolean): void;
  onAbility(slot: 0 | 1): void;
  onInteract(): void;
}

interface Slot {
  el: HTMLElement;
  cd: HTMLElement;
}

/** Old-school HUD: health/resource orbs, hotbar, XP bar, chat, bag, target frame. */
export class Hud {
  readonly root: HTMLElement;
  private readonly hpOrb: HTMLElement;
  private readonly hpText: HTMLElement;
  private readonly resOrb: HTMLElement;
  private readonly resText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly levelBadge: HTMLElement;
  private readonly slots: Slot[] = [];
  private readonly buffs: HTMLElement;
  private readonly chatLog: HTMLElement;
  private readonly chatInput: HTMLInputElement;
  private readonly bag: HTMLElement;
  private readonly bagGrid: HTMLElement;
  private readonly equip: HTMLElement;
  private readonly charInfo: HTMLElement;
  private readonly notices: HTMLElement;
  private readonly target: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetFill: HTMLElement;
  private readonly party: HTMLElement;
  private readonly death: HTMLElement;
  private readonly help: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly waterHint: HTMLElement;
  private bagKey = "";
  private partyKey = "";
  private cls: ClassDef | null = null;
  private sub: SubclassDef | null = null;

  constructor(
    container: HTMLElement,
    private readonly cb: HudCallbacks,
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
    const mkSlot = (key: string, label: string, onClick?: () => void) => {
      const cd = h("div.slot-cd");
      const el = h("button.slot", { type: "button", onclick: onClick }, h("span.slot-key", null, key), h("span.slot-label", null, label), cd);
      hotbar.append(el);
      const s = { el, cd };
      this.slots.push(s);
      return s;
    };
    mkSlot("LMB", "Attack");
    mkSlot("1", "", () => cb.onAbility(0));
    mkSlot("2", "", () => cb.onAbility(1));
    mkSlot("F", "Interact", () => cb.onInteract());
    mkSlot("I", "Bag", () => this.toggleBag());

    this.buffs = h("div.buffs");
    const bar = h(
      "div.bottom-bar",
      { onpointerdown: stop },
      this.hpOrb,
      h("div.bar-center", null, this.buffs, h("div.xp-bar", { title: "Experience" }, this.xpFill), h("div.bar-row", null, this.levelBadge, hotbar)),
      this.resOrb,
    );

    this.chatLog = h("div.chat-log");
    this.chatInput = h("input.chat-input", { type: "text", maxlength: 200, placeholder: "Press Enter to chat" });
    this.chatInput.addEventListener("focus", () => cb.onTypingChange(true));
    this.chatInput.addEventListener("blur", () => cb.onTypingChange(false));
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
    const chat = h("div.chat", { onpointerdown: stop }, this.chatLog, this.chatInput);

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
    this.waterHint = h("div.water-hint.hidden", null, "Press ", h("kbd", null, "F"), " to use the stream");
    this.help = h(
      "div.panel.help.hidden",
      { onpointerdown: stop },
      h("div.panel-title", null, "Controls", h("button.panel-close", { type: "button", onclick: () => this.toggleHelp() }, "×")),
      h(
        "table",
        null,
        ...[
          ["Left click ground", "Move (hold to keep walking)"],
          ["Left click enemy", "Attack"],
          ["W A S D", "Move"],
          ["Right click / 1", "Class ability at cursor"],
          ["2", "Subclass ability at cursor"],
          ["F", "Interact (fill waterskin, drink)"],
          ["I", "Character & pack"],
          ["Enter", "Chat"],
          ["Mouse wheel", "Zoom"],
          ["H", "Toggle this help"],
        ].map(([k, v]) => h("tr", null, h("td", null, h("kbd", null, k!)), h("td", null, v!))),
      ),
    );

    const zone = h("div.zone-banner", null, h("div.zone-name", null, "The Unknown Forest"), h("div.zone-sub", null, "Press H for controls"));
    setTimeout(() => zone.classList.add("fade"), 3500);

    this.root = h("div.hud", null, zone, this.party, this.target, this.notices, this.waterHint, this.death, chat, this.bag, this.help, bar, this.tooltip);
    container.replaceChildren(this.root);
  }

  get isTyping(): boolean {
    return document.activeElement === this.chatInput;
  }

  focusChat(): void {
    this.chatInput.focus();
  }

  toggleBag(): void {
    this.bag.classList.toggle("hidden");
  }

  toggleHelp(): void {
    this.help.classList.toggle("hidden");
  }

  chat(from: string, text: string, system = false): void {
    const line = h("div.chat-line", null, from ? h("b", null, `${from}: `) : null, text);
    if (system) line.classList.add("system");
    this.chatLog.append(line);
    while (this.chatLog.childElementCount > 60) this.chatLog.firstElementChild!.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  notice(text: string): void {
    const n = h("div.notice", null, text);
    this.notices.append(n);
    setTimeout(() => n.classList.add("fade"), 2500);
    setTimeout(() => n.remove(), 3500);
    while (this.notices.childElementCount > 4) this.notices.firstElementChild!.remove();
  }

  setTarget(name: string | null, hp = 0, maxHp = 1): void {
    this.target.classList.toggle("hidden", !name);
    if (!name) return;
    this.targetName.textContent = name;
    this.targetFill.style.width = `${Math.max(0, (hp / maxHp) * 100)}%`;
  }

  setNearWater(near: boolean): void {
    this.waterHint.classList.toggle("hidden", !near);
  }

  update(p: PlayerView, serverTime: number, others: Array<{ name: string; level: number; classId: string; hp: number; maxHp: number }>): void {
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

    for (let i = 0; i < 2; i++) {
      const ability = i === 0 ? this.cls?.ability : this.sub?.ability;
      const readyAt = p.cooldowns[i] ?? 0;
      const remaining = Math.max(0, readyAt - serverTime) / 1000;
      const slot = this.slots[i + 1]!;
      const frac = ability ? Math.min(1, remaining / ability.cooldown) : 0;
      slot.cd.style.setProperty("--cd", String(frac));
      slot.cd.textContent = remaining > 0.05 ? remaining.toFixed(remaining < 3 ? 1 : 0) : "";
      slot.el.classList.toggle("no-res", !!ability && p.resource < ability.cost);
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
        cell.addEventListener("pointerenter", () => this.showTooltip(cell, `<b>${def.name}</b><i>${def.kind}</i>${def.description}`));
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

  private renderParty(others: Array<{ name: string; level: number; classId: string; hp: number; maxHp: number }>): void {
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

  private showTooltip(anchor: HTMLElement, html: string): void {
    this.tooltip.innerHTML = html;
    const r = anchor.getBoundingClientRect();
    this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - 248, r.left - 100))}px`;
    this.tooltip.style.top = `${Math.max(8, r.top - 90)}px`;
    this.tooltip.classList.add("show");
  }
}
