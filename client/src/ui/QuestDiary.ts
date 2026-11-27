import { FAITHS, LORE_SITES, getItem, getQuest, loreFlag, loreReadFlag, type QuestDef } from "@rpg/shared";
import type { PlayerView } from "../types.ts";
import { h } from "./dom.ts";

export interface DiaryCallbacks {
  track(questId: string): void;
}

/**
 * The quest diary (J): every quest you're on, what you've done so far in your
 * own words, what's next, the quests you've finished, and the epic quests
 * you've only heard rumours of. Pick which quest the map arrow follows.
 */
export class QuestDiary {
  readonly el: HTMLElement;
  private readonly list: HTMLElement;
  private readonly page: HTMLElement;
  private selected = "";
  private key = "";

  constructor(private readonly cb: DiaryCallbacks) {
    const stop = (e: Event) => e.stopPropagation();
    this.list = h("div.diary-list");
    this.page = h("div.diary-page");
    this.el = h(
      "div.panel.diary.hidden",
      { onpointerdown: stop },
      h("div.panel-title", null, "Quest Diary", h("button.panel-close", { type: "button", onclick: () => this.toggle(false) }, "×")),
      h("div.diary-body", null, this.list, this.page),
    );
  }

  get isOpen(): boolean {
    return !this.el.classList.contains("hidden");
  }

  toggle(force?: boolean, questId?: string): void {
    this.el.classList.toggle("hidden", force === undefined ? undefined : !force);
    if (questId) this.selected = questId;
    this.key = "";
  }

  render(p: PlayerView, tracked: string): void {
    if (!this.isOpen) return;
    const parts = [this.selected, tracked, p.quests.length];
    p.active.forEach((q) => parts.push(`${q.id}:${q.step}:${q.count}`));
    p.inventory.forEach((s) => parts.push(`${s.itemId}:${s.qty}`));
    const key = parts.join("|");
    if (key === this.key) return;
    this.key = key;

    const active: QuestDef[] = [];
    p.active.forEach((qs) => {
      const q = getQuest(qs.id);
      if (q) active.push(q);
    });
    const done: QuestDef[] = [];
    for (let i = 0; i < p.quests.length; i++) {
      const q = getQuest(p.quests[i]!);
      if (q && !q.repeatable && !active.includes(q)) done.push(q);
    }
    const rumours = FAITHS.filter((f) => f.favorQuest && p.quests.includes(loreFlag(f.id)) && !p.quests.includes(f.favorQuest.id));

    const ids = [...active, ...done].map((q) => q.id);
    const lore = LORE_SITES.filter((l) => p.quests.includes(loreReadFlag(l.id)));
    if (!ids.includes(this.selected) && !this.selected.startsWith("rumour:") && !this.selected.startsWith("lore:")) this.selected = tracked && ids.includes(tracked) ? tracked : (ids[0] ?? "");

    const entry = (id: string, name: string, sub: string, cls = "") =>
      h(
        `button.diary-entry${cls}${id === this.selected ? ".sel" : ""}` as "button",
        { type: "button", onclick: () => ((this.selected = id), (this.key = ""), this.render(p, tracked)) },
        h("span.diary-entry-name", null, id === tracked ? `➤ ${name}` : name),
        h("span.diary-entry-sub", null, sub),
      );
    const listChildren: HTMLElement[] = [h("div.panel-sub", null, "In progress")];
    if (active.length === 0) listChildren.push(h("div.diary-empty", null, "Nothing right now."));
    for (const q of active) {
      const qs = p.active.find((s) => s.id === q.id)!;
      listChildren.push(entry(q.id, q.name, q.repeatable ? "Odd job" : `Step ${qs.step + 1} of ${q.steps.length}`));
    }
    if (done.length) {
      listChildren.push(h("div.panel-sub", null, "Finished"));
      for (const q of done) listChildren.push(entry(q.id, q.name, "Done", ".done"));
    }
    if (rumours.length) {
      listChildren.push(h("div.panel-sub", null, "Rumours"));
      for (const f of rumours) listChildren.push(entry(`rumour:${f.id}`, f.favorQuest!.name, `An epic quest of ${f.name}`, ".rumour"));
    }
    listChildren.push(h("div.panel-sub", null, `Valley lore (${lore.length}/${LORE_SITES.length})`));
    if (!lore.length) listChildren.push(h("div.diary-empty", null, "Old places have stories. Stop and look."));
    for (const l of lore) listChildren.push(entry(`lore:${l.id}`, l.title, l.name, ".lore"));
    this.list.replaceChildren(...listChildren);
    this.page.replaceChildren(...this.pageFor(p, tracked));
  }

  private pageFor(p: PlayerView, tracked: string): HTMLElement[] {
    if (this.selected.startsWith("lore:")) {
      const l = LORE_SITES.find((s) => `lore:${s.id}` === this.selected);
      if (!l) return [];
      return [h("h3.diary-title", null, l.title), h("p.diary-note", null, l.name), ...l.text.map((t) => h("p.diary-lore", null, t))];
    }
    if (this.selected.startsWith("rumour:")) {
      const f = FAITHS.find((g) => `rumour:${g.id}` === this.selected);
      if (!f?.favorQuest) return [];
      return [
        h("h3.diary-title", null, f.favorQuest.name),
        h("p.diary-intro", null, `An epic quest of ${f.name}${f.title ? `, ${f.title}` : ""}. ${f.description}`),
        h("p.diary-note", null, "You've only read of it. Whoever completes it wins the god's favour, and the god becomes their own. Where it begins, you don't know yet."),
      ];
    }
    const q = getQuest(this.selected);
    if (!q) return [h("p.diary-intro", null, "Your diary is empty. Something will need doing soon enough.")];
    const qs = p.active.find((s) => s.id === q.id);
    const finished = !qs;
    const out: HTMLElement[] = [h("h3.diary-title", null, q.name), h("p.diary-intro", null, q.intro)];
    const steps = h("ol.diary-steps");
    q.steps.forEach((s, i) => {
      if (finished || i < qs!.step) {
        steps.append(h("li.diary-step.done", null, h("b", null, s.title), h("span", null, ` ${s.doneText}`)));
      } else if (i === qs!.step) {
        steps.append(h("li.diary-step.now", null, h("b", null, `${s.title}${this.progress(p, qs!.count, s.objective)}`), h("span", null, ` ${s.text}`)));
      }
    });
    if (!finished && qs!.step < q.steps.length - 1) steps.append(h("li.diary-step.later", null, "…"));
    out.push(steps);
    if (q.reward && !q.repeatable) {
      const bits: string[] = [];
      if (q.reward.coins) bits.push(`${q.reward.coins} coins`);
      if (q.reward.classItem) bits.push("gear for your calling");
      if (q.reward.opensGate) bits.push("a way out");
      if (bits.length) out.push(h("p.diary-note", null, `Reward: ${bits.join(", ")}.`));
    }
    if (finished) out.push(h("p.diary-note", null, "Finished."));
    else {
      const b = h("button.btn.diary-track", { type: "button", onclick: () => this.cb.track(q.id) }, tracked === q.id ? "Following on the map" : "Follow on the map") as HTMLButtonElement;
      b.disabled = tracked === q.id;
      out.push(b);
    }
    return out;
  }

  private progress(p: PlayerView, count: number, o: QuestDef["steps"][number]["objective"]): string {
    if (o.type === "gather" || o.type === "kill") return ` (${count}/${o.count})`;
    if (o.type === "deliver") {
      let have = 0;
      p.inventory.forEach((s) => {
        if (s.itemId === o.item) have += s.qty;
      });
      return ` (${Math.min(have, o.count)}/${o.count} ${getItem(o.item)?.name ?? o.item})`;
    }
    return "";
  }
}
