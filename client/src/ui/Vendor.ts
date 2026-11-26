import { VENDOR_LINES, VENDOR_NPC, VILLAGE_QUEST, canEquip, getItem, getQuest, type QuestDef } from "@rpg/shared";
import type { PlayerView } from "../types.ts";
import { h } from "./dom.ts";

export interface VendorCallbacks {
  buy(index: number): void;
  sell(slot: number, all: boolean): void;
  sellJunk(): void;
  accept(questId: string): void;
  turnIn(questId: string): void;
  requestWeapon(): void;
  close(): void;
}

type Tab = "talk" | "buy" | "sell";

/**
 * Talking and trading with Haskel: his story and quests, his odd jobs, a
 * spare weapon if you've lost yours, and his wares. Rendered from shared
 * data and your synced state; every action is checked on the server.
 */
export class VendorPanel {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly tabs: Record<Tab, HTMLButtonElement>;
  private tab: Tab = "talk";
  private key = "";

  constructor(private readonly cb: VendorCallbacks) {
    const stop = (e: Event) => e.stopPropagation();
    const mkTab = (t: Tab, label: string) => h("button.vendor-tab", { type: "button", onclick: () => this.show(t) }, label) as HTMLButtonElement;
    this.tabs = { talk: mkTab("talk", "Talk"), buy: mkTab("buy", "Buy"), sell: mkTab("sell", "Sell") };
    this.body = h("div.vendor-body");
    this.coinsEl = h("div.vendor-coins");
    this.el = h(
      "div.panel.vendor.hidden",
      { onpointerdown: stop },
      h(
        "div.panel-title",
        null,
        `${VENDOR_NPC.name}, ${VENDOR_NPC.title}`,
        h("button.panel-close", { type: "button", onclick: () => cb.close() }, "×"),
      ),
      h("div.vendor-tabs", null, this.tabs.talk, this.tabs.buy, this.tabs.sell),
      this.body,
      this.coinsEl,
    );
  }

  get isOpen(): boolean {
    return !this.el.classList.contains("hidden");
  }

  open(): void {
    this.el.classList.remove("hidden");
    this.show("talk");
  }

  close(): void {
    this.el.classList.add("hidden");
  }

  private show(t: Tab): void {
    this.tab = t;
    this.key = "";
    for (const [id, b] of Object.entries(this.tabs)) b.setAttribute("aria-pressed", String(id === t));
  }

  render(p: PlayerView, baseClass: string): void {
    if (!this.isOpen) return;
    const parts = [this.tab, p.coins, p.fetchOffer, p.weapon, p.quests.length];
    p.active.forEach((q) => parts.push(`${q.id}:${q.step}:${q.count}`));
    p.inventory.forEach((s) => parts.push(`${s.itemId}:${s.qty}`));
    const key = parts.join("|");
    if (key === this.key) return;
    this.key = key;
    this.coinsEl.textContent = `🪙 ${p.coins} coins`;
    this.body.replaceChildren(...(this.tab === "talk" ? this.talk(p, baseClass) : this.tab === "buy" ? this.shop(p) : this.sellList(p)));
  }

  private talk(p: PlayerView, baseClass: string): HTMLElement[] {
    const out: HTMLElement[] = [];
    const say = (text: string) => out.push(h("p.vendor-line", null, text));
    const village = p.active.find((q) => q.id === VILLAGE_QUEST.id);
    const done = p.quests.includes(VILLAGE_QUEST.id);
    if (done) say(VENDOR_LINES.after);
    else if (village) say(VENDOR_LINES.during);
    else {
      VENDOR_LINES.intro.forEach(say);
      say(VENDOR_LINES.ask);
      out.push(this.button(`Accept: ${VILLAGE_QUEST.name}`, () => this.cb.accept(VILLAGE_QUEST.id), true));
    }

    // Odd jobs: one at a time.
    out.push(h("div.panel-sub", null, "Odd jobs"));
    const job = p.active.find((q) => getQuest(q.id)?.repeatable === true);
    if (job) {
      const q = getQuest(job.id)!;
      const o = q.steps[0]!.objective;
      if (o.type === "deliver") {
        const have = this.count(p, o.item);
        out.push(h("p.vendor-line", null, `${q.name}: ${q.steps[0]!.text} (${Math.min(have, o.count)}/${o.count})`));
        out.push(this.button(`Hand over ${o.count} ${getItem(o.item)?.name ?? o.item}`, () => this.cb.turnIn(job.id), have >= o.count));
      }
    } else {
      const offer = getQuest(p.fetchOffer);
      if (offer) {
        out.push(h("p.vendor-line", null, `${offer.name}: ${offer.intro} ${this.rewardText(offer)}`));
        out.push(this.button("Take the job", () => this.cb.accept(offer.id), true));
      }
    }

    // Lost your weapon? He'll spare one.
    const hasWeapon = !!p.weapon || Array.from(p.inventory).some((s) => {
      const d = getItem(s.itemId);
      return d?.kind === "weapon" && canEquip(d, baseClass);
    });
    if (!hasWeapon) {
      out.push(h("div.panel-sub", null, "No weapon"));
      say(VENDOR_LINES.noWeapon);
      out.push(this.button("Take a weapon", () => this.cb.requestWeapon(), true));
    }
    return out;
  }

  private shop(p: PlayerView): HTMLElement[] {
    return VENDOR_NPC.shop.map((entry, i) => {
      const item = getItem(entry.item)!;
      return h(
        "div.vendor-row",
        { title: item.description },
        h("span.vendor-icon", null, item.icon),
        h("span.vendor-name", null, `${item.name}${entry.qty > 1 ? ` ×${entry.qty}` : ""}`),
        h("span.vendor-price", null, `${entry.price}🪙`),
        this.button("Buy", () => this.cb.buy(i), p.coins >= entry.price),
      );
    });
  }

  private sellList(p: PlayerView): HTMLElement[] {
    const rows: HTMLElement[] = [];
    let junk = 0;
    p.inventory.forEach((s, i) => {
      const item = getItem(s.itemId);
      if (!item?.value) return;
      if (item.kind === "material") junk += item.value * s.qty;
      rows.push(
        h(
          "div.vendor-row",
          { title: item.description },
          h("span.vendor-icon", null, item.icon),
          h("span.vendor-name", null, `${item.name}${s.qty > 1 ? ` ×${s.qty}` : ""}`),
          h("span.vendor-price", null, `${item.value}🪙`),
          this.button("Sell", () => this.cb.sell(i, false), true),
          s.qty > 1 ? this.button("All", () => this.cb.sell(i, true), true) : h("span"),
        ),
      );
    });
    if (rows.length === 0) return [h("p.vendor-line", null, "\"Nothing I'd buy, friend. Bring me pelts, hides, silk, bones. Things the valley leaves behind.\"")];
    return [this.button(`Sell all loot (${junk}🪙)`, () => this.cb.sellJunk(), junk > 0), ...rows];
  }

  private rewardText(q: QuestDef): string {
    const xp = q.steps.reduce((t, s) => t + s.xp, 0);
    return `(Pays ${q.reward?.coins ?? 0} coins, ${xp} experience.)`;
  }

  private count(p: PlayerView, itemId: string): number {
    let n = 0;
    p.inventory.forEach((s) => {
      if (s.itemId === itemId) n += s.qty;
    });
    return n;
  }

  private button(label: string, onClick: () => void, enabled: boolean): HTMLElement {
    const b = h("button.btn.vendor-btn", { type: "button", onclick: onClick }, label) as HTMLButtonElement;
    b.disabled = !enabled;
    return b;
  }
}
