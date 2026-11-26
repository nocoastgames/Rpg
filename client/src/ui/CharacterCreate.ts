import {
  BASE_CLASSES,
  BASE_CLASS_IDS,
  NAME_MAX_LENGTH,
  RESOURCES,
  STAT_IDS,
  STAT_LABELS,
  childrenOf,
  classTags,
  getClassNode,
  type BaseClassId,
  type ClassNode,
  type JoinOptions,
} from "@rpg/shared";
import { PAD, GamepadInput } from "../controls/Gamepad.ts";
import { MenuNav } from "../controls/MenuNav.ts";
import { h, safeStorageGet, safeStorageSet } from "./dom.ts";

const STORAGE_KEY = "rpg.lastCharacter";

/** Character creation: a name and one of the four base classes, with a preview of where each can lead. */
export function showCharacterCreate(root: HTMLElement, error?: string): Promise<JoinOptions> {
  let saved: Partial<JoinOptions> = {};
  try {
    saved = JSON.parse(safeStorageGet(STORAGE_KEY) ?? "{}");
  } catch {
    saved = {};
  }
  let base: BaseClassId = (BASE_CLASS_IDS as readonly string[]).includes(saved.classId ?? "") ? (saved.classId as BaseClassId) : "fighter";

  return new Promise((resolve) => {
    const nameInput = h("input.cc-name", {
      type: "text",
      maxlength: NAME_MAX_LENGTH,
      placeholder: "Your name",
      value: saved.name ?? "",
      autocomplete: "off",
      spellcheck: "false",
    });
    const grid = h("div.cc-grid.cc-grid-base");
    const detail = h("div.cc-detail");
    const submit = h("button.btn.btn-primary", { type: "submit" }, "Wake Up");

    const renderGrid = () => {
      grid.replaceChildren(
        ...BASE_CLASS_IDS.map((id) => {
          const n = getClassNode(id)!;
          return h(
            "button.cc-class",
            {
              type: "button",
              style: `--class-color:${n.color}`,
              "aria-pressed": id === base ? "true" : "false",
              onclick: () => {
                base = id;
                renderGrid();
                renderDetail();
              },
            },
            h("span.cc-class-swatch"),
            h("span.cc-class-name", null, n.name),
            h("span.cc-class-role", null, n.tagline),
          );
        }),
      );
    };

    /** Compact tree: level-10 paths → level-25 specialisations → level-50 end classes. */
    const renderTree = (rootId: string) => {
      const leaf = (n: ClassNode) =>
        h(
          "div.tree-leaf",
          { style: `--class-color:${n.color}`, title: `${n.description} — ${n.ability.name}: ${n.ability.description}` },
          h("span.tree-name", null, n.name),
          ...classTags(n)
            .filter((t) => t !== "Pure")
            .map((t) => h(`span.tree-tag${n.pet === "evil" && t.startsWith("Pet") ? ".evil" : n.pet && t.startsWith("Pet") ? ".good" : ""}` as "span", null, t.startsWith("Hybrid") ? `+${t.split(" + ")[1]}` : t.replace("Pet class · ", "") + " pet")),
        );
      return h(
        "div.tree",
        null,
        ...childrenOf(rootId).map((t2) =>
          h(
            "div.tree-branch",
            null,
            h("div.tree-node.tier2", { style: `--class-color:${t2.color}`, title: t2.description }, h("small", null, "Lv 10"), t2.name),
            ...childrenOf(t2.id).map((t3) =>
              h(
                "div.tree-sub",
                null,
                h(
                  "div.tree-node.tier3",
                  { style: `--class-color:${t3.color}`, title: t3.description },
                  h("small", null, "Lv 25"),
                  t3.name,
                  t3.petLine ? h("span.tree-tag", null, "Pet at 25") : null,
                ),
                h("div.tree-leaves", null, h("small", null, "Lv 50"), ...childrenOf(t3.id).map(leaf)),
              ),
            ),
          ),
        ),
      );
    };

    const renderDetail = () => {
      const n = getClassNode(base)!;
      const def = BASE_CLASSES[base];
      const res = RESOURCES[def.resource];
      const stats = h(
        "div.cc-stats",
        null,
        ...STAT_IDS.map((id) =>
          h(
            "div.cc-stat",
            null,
            h("span", null, STAT_LABELS[id]),
            h("span.cc-stat-bar", { style: `--v:${Math.min(1, def.baseStats[id] / 18)}` }),
            h("b", null, String(def.baseStats[id])),
          ),
        ),
      );
      detail.replaceChildren(
        h("h2", { style: `color:${n.color}` }, n.name),
        h("p.cc-desc", null, n.description),
        h(
          "div.cc-tags",
          null,
          h("span.tag", null, n.role),
          h("span.tag", { style: `border-color:${res.color};color:${res.color}` }, res.label),
          h("span.tag", null, def.basicAttack.kind === "melee" ? "Melee" : "Ranged"),
        ),
        stats,
        h("h3", null, "Starting ability"),
        h(
          "div.cc-ability",
          null,
          h("span.cc-ability-name", null, n.ability.name),
          h("span.cc-ability-meta", null, `${n.ability.cost} ${res.label} · ${n.ability.cooldown}s`),
          h("div.cc-ability-desc", null, n.ability.description),
        ),
        h("h3", null, "Where this path can lead"),
        h(
          "p.cc-hint",
          null,
          "Choose a new path at levels 10, 25 and 50 (25 and 50 need a trial). Choices are permanent. Every class gains a companion at 50. Two pet classes per path, one good and one evil, raise theirs from 25 into something far stronger.",
        ),
        renderTree(base),
      );
    };

    const form = h(
      "form.cc",
      {
        onsubmit: (e: Event) => {
          e.preventDefault();
          const name = nameInput.value.trim() || "Wanderer";
          const opts: JoinOptions = { name, classId: base };
          safeStorageSet(STORAGE_KEY, JSON.stringify(opts));
          submit.disabled = true;
          submit.textContent = "Waking…";
          resolve(opts);
        },
      },
      h(
        "header.cc-header",
        null,
        h("h1", null, "Who were you?"),
        h("p", null, "You wake on the bank of a cold stream, in a forest you don't recognise. Your memories are thin, but your hands remember a trade."),
      ),
      error ? h("div.cc-error", null, error) : null,
      h("div.cc-body", null, h("div.cc-left", null, h("label.cc-label", null, "Name"), nameInput, grid), detail),
      h("footer.cc-footer", null, submit),
    );

    renderGrid();
    renderDetail();
    const screen = h("div.screen.cc-screen", null, form);
    root.replaceChildren(screen);
    if (!matchMedia("(pointer: coarse)").matches) nameInput.focus();

    // Controller support: D-pad/stick moves a highlight, A selects, Menu starts.
    const pad = new GamepadInput();
    const nav = new MenuNav(() => form);
    const hint = h("div.cc-pad-hint.hidden", null, h("span.glyph.glyph-a", null, "A"), " Select   ", h("span.glyph.glyph-pad", null, "Menu"), " Wake up");
    form.querySelector(".cc-footer")?.append(hint);
    const poll = () => {
      if (!screen.isConnected || submit.disabled) return;
      requestAnimationFrame(poll);
      pad.poll();
      if (!pad.active) return;
      hint.classList.remove("hidden");
      if (document.activeElement === nameInput) nameInput.blur();
      const dir = pad.navDirection(performance.now());
      if (dir) nav.move(dir);
      else nav.ensure();
      if (pad.pressed(PAD.A)) {
        const focused = nav.focused;
        nav.activate();
        // Re-rendering replaces buttons; keep the highlight on the same item.
        if (focused?.classList.contains("cc-class")) nav.focus(grid.querySelector<HTMLElement>('[aria-pressed="true"]'));
      }
      if (pad.pressed(PAD.MENU)) form.requestSubmit();
    };
    requestAnimationFrame(poll);
  });
}
