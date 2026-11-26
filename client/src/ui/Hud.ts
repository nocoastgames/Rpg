import {
  ABILITY_SLOTS,
  INVENTORY_SLOTS,
  RESOURCES,
  advancementOptions,
  classPath,
  classTags,
  companionFor,
  getClassNode,
  getItem,
  getBackground,
  getFaith,
  availableFavorQuests,
  epicQuestName,
  loreFlag,
  blessingInfo,
  classAlignment,
  memoriesAt,
  backgroundRevealed,
  resolveKit,
  getQuest,
  getStatus,
  REST,
  VALLEY_LEVELS,
  type MemoryEvent,
  type ReadEvent,
  formatWorldCode,
  type CutsceneEvent,
  type ResolvedKit,
} from "@rpg/shared";
import type { PlayerView } from "../types.ts";
import { h } from "./dom.ts";
import { glyph, type GameAction, type InputMode } from "./glyphs.ts";

export interface HudCallbacks {
  onUseItem(slot: number): void;
  onChat(text: string): void;
  onTypingChange(typing: boolean): void;
  onAbility(slot: number): void;
  onInteract(): void;
  /** Permanently advance into a class (child of the current class). */
  onAdvance(classId: string): void;
  /** Take off the equipped weapon or armour. */
  onUnequip(slot: "weapon" | "armor"): void;
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
  private readonly pathEl: HTMLElement;
  private readonly pastEl: HTMLElement;
  private pastKey = "";
  private readonly memoryEl: HTMLElement;
  private memoryTimer = 0;
  private readonly memoryReadyAt = performance.now() + 3800;
  private pathKey = "";
  private pendingChoice: string | null = null;
  private readonly notices: HTMLElement;
  private readonly target: HTMLElement;
  private readonly targetName: HTMLElement;
  private readonly targetFill: HTMLElement;
  private readonly party: HTMLElement;
  private readonly tracker: HTMLElement;
  private readonly channel: HTMLElement;
  private readonly bookEl: HTMLElement;
  private readonly channelFill: HTMLElement;
  private readonly channelText: HTMLElement;
  private trackerKey = "";
  private readonly death: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly interactHint: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private bannerTimer = 0;
  private bagKey = "";
  private partyKey = "";
  private hintKey = "";
  private kit: ResolvedKit | null = null;
  private kitFor = "";
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
    for (let i = 0; i < ABILITY_SLOTS; i++) mkSlot(`ability${i}` as GameAction, "", () => cb.onAbility(i));
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
    this.pathEl = h("div.path");
    this.pastEl = h("div.past");
    this.memoryEl = h("div.memory.hidden");
    this.bagGrid = h("div.bag-grid");
    this.bag = h(
      "div.panel.bag.hidden",
      { onpointerdown: stop },
      h("div.panel-title", null, "Character", h("button.panel-close", { type: "button", onclick: () => this.toggleBag() }, "×")),
      this.charInfo,
      this.pastEl,
      this.pathEl,
      this.equip,
      h("div.panel-sub", null, "Pack"),
      this.bagGrid,
    );

    this.notices = h("div.notices");
    this.targetName = h("div.target-name");
    this.targetFill = h("div.target-fill");
    this.target = h("div.target.hidden", null, this.targetName, h("div.target-bar", null, this.targetFill));
    this.party = h("div.party");
    this.tracker = h("div.tracker.hidden");
    this.bookEl = h("div.book.hidden", { onpointerdown: stop });
    this.channelFill = h("div.channel-fill");
    this.channelText = h("div.channel-text");
    this.channel = h("div.channel.hidden", null, this.channelText, h("div.channel-bar", null, this.channelFill));
    this.death = h("div.death.hidden", null, h("div.death-title", null, "You have fallen"), h("div.death-sub", null, "You will wake again soon…"));
    this.interactHint = h("div.interact-hint.hidden");
    this.help = this.buildHelp(stop);

    this.bannerEl = h(
      "div.zone-banner",
      null,
      h("div.zone-name", null, "The Unknown Forest"),
      h("div.zone-sub", null, `A valley walled in by mountains · Level ${VALLEY_LEVELS[0]}–${VALLEY_LEVELS[1]}`),
    );
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add("fade"), 3500);

    this.root = h(
      "div.hud",
      null,
      this.bannerEl,
      h("div.top-left", null, this.tracker, this.party),
      this.target,
      this.notices,
      this.memoryEl,
      this.interactHint,
      this.channel,
      this.bookEl,
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
        ["Right click / 1", "First ability at cursor"],
        ["2 / 3 / 4", "Abilities learned at levels 10, 25, 50"],
        ["F", "Interact / inspect"],
        ["5 / 6", "Quick-use food / water"],
        ["I", "Character, path & pack"],
        ["M", "Map"],
        ["Enter", "Chat"],
        ["Mouse wheel", "Zoom"],
        ["H", "Toggle this help"],
      ]),
      table("gamepad", [
        ["Left stick", "Move (push lightly to walk)"],
        ["Right stick", "Aim abilities"],
        ["A", "Attack nearest enemy (hold to keep fighting)"],
        ["X / Y / RB / RT", "Abilities 1-4"],
        ["B", "Interact / inspect · close menus"],
        ["D-pad ↑ / ↓", "Quick-use food / water"],
        ["D-pad ← / →", "Zoom out / in"],
        ["View", "Character, path & pack"],
        ["Right stick click", "Map"],
        ["Menu", "Toggle this help"],
      ]),
      table("touch", [
        ["Left side", "Drag to move"],
        ["Tap ground / enemy", "Walk there / attack"],
        ["⚔", "Attack nearest enemy (hold)"],
        ["Ability buttons", "Tap to auto-aim, drag to aim (up to 4)"],
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

  /** A recovered memory: shown large, then kept in the character panel's journal. */
  memory(e: MemoryEvent): void {
    // Don't talk over the zone title when you first wake up.
    const wait = this.memoryReadyAt - performance.now();
    if (wait > 0) {
      window.setTimeout(() => this.memory(e), wait);
      return;
    }
    window.clearTimeout(this.memoryTimer);
    this.memoryEl.replaceChildren(
      h("div.memory-label", null, e.revealed ? "You remember who you were" : "A memory returns"),
      h("div.memory-text", null, e.text),
      e.revealed ? h("div.memory-reveal", null, `You were ${/^[aeiou]/i.test(e.revealed) ? "an" : "a"} ${e.revealed}.`) : "",
      e.passive ? h("div.memory-passive", null, e.passive) : "",
    );
    this.memoryEl.classList.remove("hidden", "fade");
    const life = Math.max(6000, e.text.length * 70);
    this.memoryTimer = window.setTimeout(() => {
      this.memoryEl.classList.add("fade");
      this.memoryTimer = window.setTimeout(() => this.memoryEl.classList.add("hidden"), 1500);
    }, life);
    this.pastKey = "";
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

  /** Ability info for touch buttons and the hotbar. */
  abilityState(p: PlayerView, serverTime: number, slot: number): { frac: number; text: string; noRes: boolean } {
    const ability = this.kit?.abilities[slot];
    const remaining = Math.max(0, (p.cooldowns[slot] ?? 0) - serverTime) / 1000;
    return {
      frac: ability ? Math.min(1, remaining / ability.cooldown) : 0,
      text: remaining > 0.05 ? remaining.toFixed(remaining < 3 ? 1 : 0) : "",
      noRes: !!ability && p.resource < ability.cost,
    };
  }

  /** Learned ability names by slot ("" where not learned yet). */
  get abilityNames(): string[] {
    return Array.from({ length: ABILITY_SLOTS }, (_, i) => this.kit?.abilities[i]?.name ?? "");
  }

  update(p: PlayerView, serverTime: number, others: PartyMember[]): void {
    if (this.kitFor !== p.classId) {
      this.kitFor = p.classId;
      this.kit = resolveKit(p.classId) ?? null;
      if (this.kit) {
        const res = RESOURCES[this.kit.base.resource];
        this.resOrb.style.setProperty("--orb-color", res.color);
        this.resOrb.title = res.label;
        for (let i = 0; i < ABILITY_SLOTS; i++) {
          const slot = this.slots[i + 1]!;
          const a = this.kit.abilities[i];
          const unlockLevel = [1, 10, 25, 50][i];
          slot.el.querySelector(".slot-label")!.textContent = a ? a.name : `Lv ${unlockLevel}`;
          slot.el.classList.toggle("locked", !a);
          slot.el.title = a ? `${a.name} — ${a.description} (${a.cost} ${res.label}, ${a.cooldown}s)` : `Learned when you advance at level ${unlockLevel}`;
        }
        this.slots[0]!.el.title = `${this.kit.basicAttack.kind === "melee" ? "Melee" : "Ranged"} attack`;
      }
    }

    this.hpOrb.style.setProperty("--fill", String(Math.max(0, p.hp / Math.max(1, p.maxHp))));
    this.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    this.resOrb.style.setProperty("--fill", String(Math.max(0, p.resource / Math.max(1, p.maxResource))));
    this.resText.textContent = `${Math.floor(p.resource)} / ${p.maxResource}`;
    this.xpFill.style.width = `${(p.xp / Math.max(1, p.xpNext)) * 100}%`;
    this.levelBadge.textContent = String(p.level);
    this.levelBadge.title = `Level ${p.level} — ${p.xp} / ${p.xpNext} XP`;

    for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
      const st = this.abilityState(p, serverTime, slot);
      const s = this.slots[slot + 1]!;
      s.cd.style.setProperty("--cd", String(st.frac));
      s.cd.textContent = st.text;
      s.el.classList.toggle("no-res", st.noRes);
    }

    const buffNodes: HTMLElement[] = [];
    const time = (sec: number) => (sec >= 90 ? `${Math.ceil(sec / 60)}m` : `${sec.toFixed(0)}s`);
    p.buffs.forEach((b) => {
      const left = Math.max(0, (b.expiresAt - serverTime) / 1000);
      if (left <= 0) return;
      const rested = b.stat === REST.buffStat;
      const label = rested ? "Well Rested" : b.stat === "food" ? "Eating" : b.stat;
      const title = rested ? `+${Math.round(b.amount * 100)}% experience, faster healing` : b.stat === "food" ? "Recovering health; fighting interrupts it" : `+${Math.round(b.amount * 100)}% ${b.stat}`;
      buffNodes.push(h("div.buff", { title }, `${label} ${time(left)}`));
    });
    p.statuses?.forEach((st) => {
      const def = getStatus(st.id);
      const left = Math.max(0, (st.expiresAt - serverTime) / 1000);
      if (def && left > 0) buffNodes.push(h("div.buff.status", { title: def.description, style: `--status:${def.color}` }, `${def.icon} ${def.name} ${time(left)}`));
    });
    this.buffs.replaceChildren(...buffNodes);
    this.renderTracker(p);
    const working = !!p.channelLabel && p.channelEnd > serverTime;
    this.channel.classList.toggle("hidden", !working);
    if (working) {
      this.channelText.textContent = `${p.channelLabel}…`;
      const frac = (serverTime - p.channelStart) / Math.max(1, p.channelEnd - p.channelStart);
      this.channelFill.style.width = `${Math.min(100, Math.max(0, frac * 100))}%`;
    }

    this.death.classList.toggle("hidden", p.anim !== "dead");
    const next = advancementOptions(p.classId);
    const ready = !!next && p.level >= next.level && (!next.quest || p.quests.includes(next.quest.id));
    this.slots[this.slots.length - 1]!.el.classList.toggle("ready", ready);
    this.renderPath(p);
    this.renderPast(p);
    this.renderBag(p);
    this.renderParty(others);
  }

  private renderBag(p: PlayerView): void {
    const parts: string[] = [p.weapon, p.armor, String(p.level), String(p.coins), this.worldCode];
    p.inventory.forEach((s) => parts.push(`${s.itemId}:${s.qty}`));
    const key = parts.join("|");
    if (key === this.bagKey) return;
    this.bagKey = key;

    const node = getClassNode(p.classId);
    this.charInfo.replaceChildren(
      h("div.char-name", null, p.name),
      h("div.char-class", { style: `color:${node?.color}` }, `Level ${p.level} ${node?.name ?? ""}`),
      h("div.char-coins", null, `🪙 ${p.coins} coins`),
      this.worldCode ? this.worldLine() : "",
    );

    const itemCell = (itemId: string, qty: number, onClick?: () => void) => {
      const def = getItem(itemId);
      const cell = h("button.bag-cell", { type: "button", onclick: onClick }, def ? def.icon : "", qty > 1 ? h("span.qty", null, String(qty)) : null);
      if (def) {
        const extra = [
          def.armor ? `Armour ${Math.round(def.armor * 100)}%` : "",
          def.damageBonus ? `+${def.damageBonus} damage` : "",
          def.stats ? Object.entries(def.stats).map(([k, v]) => `+${v} ${k}`).join(", ") : "",
          def.classes ? `${def.classes.map((c) => c[0]!.toUpperCase() + c.slice(1)).join("/")} only` : "",
          def.value ? `Sells for ${def.value}🪙` : "",
        ].filter(Boolean);
        cell.addEventListener("pointerenter", () => this.showTooltip(cell, def.name, def.kind, `${def.description}${extra.length ? `\n${extra.join(" · ")}` : ""}`));
        cell.addEventListener("pointerleave", () => this.tooltip.classList.remove("show"));
      }
      return cell;
    };
    this.equip.replaceChildren(
      h("div.equip-slot", null, h("span", null, "Weapon"), itemCell(p.weapon, 1, p.weapon ? () => this.cb.onUnequip("weapon") : undefined)),
      h("div.equip-slot", null, h("span", null, "Armor"), itemCell(p.armor, 1, p.armor ? () => this.cb.onUnequip("armor") : undefined)),
    );
    const cells: HTMLElement[] = [];
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const s = p.inventory[i];
      cells.push(s ? itemCell(s.itemId, s.qty, () => this.cb.onUseItem(i)) : h("div.bag-cell.empty"));
    }
    this.bagGrid.replaceChildren(...cells);
  }

  /** Faith and the half-remembered past: memories recovered so far; the background is named once fully remembered. */
  private renderPast(p: PlayerView): void {
    const key = `${p.faith}|${p.background}|${p.memories}|${p.level}|${p.classId}|${p.quests.length}|${p.abandoned.length}`;
    if (key === this.pastKey) return;
    this.pastKey = key;
    const faith = getFaith(p.faith);
    const bg = getBackground(p.background);
    const recovered = memoriesAt(p.background, p.level).slice(0, Math.max(p.memories, 0));
    const revealed = backgroundRevealed(p.background, p.level) && p.memories >= (bg?.memories.length ?? 99);
    const parts: Array<Node | null> = [
      h("div.panel-sub", null, "Past"),
      h(
        "div.past-row",
        null,
        h("span.past-label", null, "Faith "),
        faith ? h("span", { style: `color:${faith.color}` }, `${faith.name}${faith.title ? " " + faith.title : ""}`) : "—",
      ),
      ...this.blessingLine(p, faith),
      h("div.past-row", null, h("span.past-label", null, "Who you were "), revealed && bg ? h("b", null, bg.name) : h("i", null, "You don't remember yet.")),
      revealed && bg ? h("div.past-passive", null, bg.passiveText) : null,
      h(
        "div.past-memories",
        null,
        bg ? h("div.past-memory.first", null, bg.impression) : null,
        ...recovered.map((m) => h("div.past-memory", null, m.text)),
        bg && !revealed ? h("div.past-hint", null, `More will come back to you (next around level ${bg.memories.find((m) => m.level > p.level)?.level ?? "?"}).`) : null,
      ),
    ];
    this.pastEl.replaceChildren(...parts.filter((n): n is Node => !!n));
  }

  private blessingLine(p: PlayerView, faith: ReturnType<typeof getFaith>): HTMLElement[] {
    const info = faith?.blessing ? blessingInfo(p.faith, p.classId, p.quests) : undefined;
    const path = classAlignment(p.classId);
    // Epic quests are only named once you've learned of them from lore.
    const options = availableFavorQuests(p.faith, p.classId, p.quests, p.abandoned)
      .filter((g) => p.quests.includes(loreFlag(g.id)))
      .map((g) => `${g.favorQuest?.name} (${g.name})`)
      .join(", ");
    const status = !faith?.blessing || !info ? "No god watches over you." : {
      active: `Blessing: ${faith.blessingText}.`,
      awaitsPrayer: `${faith.name} favours your path. Pray at their shrine (marked on your map) to receive the blessing: ${faith.blessingText}.`,
      needsQuest: `Blessing not yet earned: ${faith.name} favours ${faith.leaning.toLowerCase()} paths and yours is ${path}. ${faith.name} would accept ${epicQuestName(faith.id, p.quests)}.`,
      opposed: `${faith.name} will never bless a ${path} path.`,
      none: "No god watches over you.",
    }[info.status];
    const abandoned = Array.from(p.abandoned, (id) => getFaith(id)?.name ?? id);
    return [
      h(`div.past-blessing${info?.blessedBy ? ".active" : ""}` as "div", null, status),
      options ? h("div.past-hint", null, `Epic quests you have heard of (completing one makes that god your god): ${options}.`) : null,
      abandoned.length ? h("div.past-hint", null, `Abandoned, never to take you back: ${abandoned.join(", ")}.`) : null,
    ].filter((n) => n !== null) as HTMLElement[];
  }

  /** Path breadcrumb, companion, and the next advancement choice. */
  private renderPath(p: PlayerView): void {
    const next = advancementOptions(p.classId);
    const hasQuest = next?.quest ? p.quests.includes(next.quest.id) : true;
    const key = `${p.classId}|${p.level}|${hasQuest}|${this.pendingChoice}`;
    if (key === this.pathKey) return;
    this.pathKey = key;

    const path = classPath(p.classId);
    const crumbs = h("div.path-crumbs", null, ...path.flatMap((n, i) => [i > 0 ? h("span.path-sep", null, "›") : "", h("span", { style: `color:${n.color}` }, n.name)]));
    const comp = companionFor(p.classId);
    const compLine = comp
      ? h("div.path-companion", null, `Companion: ${comp.def.name} `, h("span.tag", null, comp.power === "familiar" ? "Familiar" : comp.power === "pet" ? "Pet" : "Bonded pet"))
      : null;

    const children: Array<HTMLElement | null> = [h("div.panel-sub", null, "Path"), crumbs, compLine];
    if (next) {
      const levelOk = p.level >= next.level;
      const status = !levelOk
        ? `Reach level ${next.level} to choose your next path.`
        : !hasQuest
          ? `Complete the ${next.quest!.name} to choose your next path.`
          : this.pendingChoice
            ? "This choice is permanent. Select again to confirm."
            : "Choose your next path:";
      children.push(h("div.path-status", null, status));
      const cards = next.options.map((o) => {
        const c = companionFor(o.id);
        const picked = this.pendingChoice === o.id;
        return h(
          "button.path-option",
          {
            type: "button",
            style: `--class-color:${o.color}`,
            disabled: !levelOk || !hasQuest,
            "aria-pressed": picked ? "true" : "false",
            onclick: () => {
              if (this.pendingChoice === o.id) {
                this.pendingChoice = null;
                this.cb.onAdvance(o.id);
              } else {
                this.pendingChoice = o.id;
              }
              this.pathKey = "";
            },
          },
          h("div.path-name", null, o.name),
          h("div.path-tagline", null, o.tagline),
          h("div.path-tags", null, h("span.tag", null, o.role), ...classTags(o).map((t) => h("span.tag", null, t))),
          h("div.path-desc", null, o.description),
          h("div.path-ability", null, h("b", null, o.ability.name), ` — ${o.ability.description}`),
          c ? h("div.path-pet", null, `${c.power === "familiar" ? "Familiar" : "Pet"}: ${c.def.name}`) : null,
          picked ? h("div.path-confirm", null, "Select again to confirm") : null,
        );
      });
      children.push(h("div.path-options", null, ...cards));
    } else {
      children.push(h("div.path-status", null, "You have mastered your path."));
    }
    this.pathEl.replaceChildren(...children.filter((c): c is HTMLElement => !!c));
  }

  /** Quest tracker: every active quest, the step you're on and your progress. */
  private renderTracker(p: PlayerView): void {
    const parts: string[] = [];
    p.active.forEach((q) => parts.push(`${q.id}|${q.step}|${q.count}`));
    p.inventory.forEach((s) => parts.push(`${s.itemId}:${s.qty}`));
    const key = parts.join(",");
    if (key === this.trackerKey) return;
    this.trackerKey = key;
    const blocks: HTMLElement[] = [];
    p.active.forEach((qs) => {
      const quest = getQuest(qs.id);
      const step = quest?.steps[qs.step];
      if (!quest || !step) return;
      const o = step.objective;
      let count = "";
      if (o.type === "gather" || o.type === "kill") count = ` (${qs.count}/${o.count})`;
      if (o.type === "deliver") {
        let have = 0;
        p.inventory.forEach((s) => {
          if (s.itemId === o.item) have += s.qty;
        });
        count = ` (${Math.min(have, o.count)}/${o.count})`;
      }
      blocks.push(
        h(
          "div.tracker-entry",
          null,
          h("div.tracker-quest", null, quest.name),
          h("div.tracker-step", null, `${step.title}${count}`),
          h("div.tracker-text", null, step.text),
          quest.steps.length > 1 ? h("div.tracker-pips", null, ...quest.steps.map((_, i) => h(`span.pip${i < qs.step ? ".done" : i === qs.step ? ".now" : ""}` as "span"))) : null,
        ),
      );
    });
    this.tracker.classList.toggle("hidden", blocks.length === 0);
    this.tracker.replaceChildren(...blocks);
  }

  /** This world's share code (empty in single player). */
  worldCode = "";

  private worldLine(): HTMLElement {
    const link = `${location.origin}${location.pathname}?world=${formatWorldCode(this.worldCode)}`;
    const copy = h("button.btn.world-copy", { type: "button" }, "Copy invite link") as HTMLButtonElement;
    copy.addEventListener("click", () => {
      navigator.clipboard?.writeText(link).then(
        () => (copy.textContent = "Copied!"),
        () => (copy.textContent = link),
      );
    });
    return h("div.world-line", null, h("span.past-label", null, "World "), h("b.world-code", null, formatWorldCode(this.worldCode)), copy);
  }

  /** A book you're reading: title and pages, until you close it. */
  read(e: ReadEvent): void {
    this.bookEl.replaceChildren(
      h("div.book-title", null, e.title),
      ...e.text.map((t) => h("p.book-text", null, t)),
      h("button.btn.book-close", { type: "button", onclick: () => this.closeBook() }, "Close"),
    );
    this.bookEl.classList.remove("hidden");
  }

  closeBook(): void {
    this.bookEl.classList.add("hidden");
  }

  /** A scripted scene: the screen darkens, lines appear one by one, then it clears. */
  cutscene(e: CutsceneEvent): void {
    const lines = e.lines.map((t) => h("p.cutscene-line", null, t));
    const el = h("div.cutscene", null, h("div.cutscene-lines", null, ...lines));
    this.root.append(el);
    requestAnimationFrame(() => el.classList.add("dim"));
    const step = (e.ms - 2500) / lines.length;
    lines.forEach((l, i) => window.setTimeout(() => l.classList.add("show"), 600 + i * step));
    window.setTimeout(() => el.classList.add("black"), e.blackAt);
    window.setTimeout(() => el.classList.add("out"), e.ms - 1200);
    window.setTimeout(() => el.remove(), e.ms + 400);
  }

  get bookOpen(): boolean {
    return !this.bookEl.classList.contains("hidden");
  }

  private renderParty(others: PartyMember[]): void {
    const key = others.map((o) => `${o.name}${o.level}${Math.round((o.hp / o.maxHp) * 20)}`).join("|");
    if (key === this.partyKey) return;
    this.partyKey = key;
    this.party.replaceChildren(
      ...others.slice(0, 8).map((o) =>
        h(
          "div.party-member",
          { style: `--class-color:${getClassNode(o.classId)?.color ?? "#888"}` },
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
