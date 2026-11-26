import {
  CLASSES,
  NAME_MAX_LENGTH,
  RESOURCES,
  STAT_IDS,
  STAT_LABELS,
  type AbilityDef,
  type ClassDef,
  type JoinOptions,
} from "@rpg/shared";
import { h, safeStorageGet, safeStorageSet } from "./dom.ts";

const STORAGE_KEY = "rpg.lastCharacter";

/** Character creation: pick a name, one of 12 classes, and one of its 2 subclasses. */
export function showCharacterCreate(root: HTMLElement, error?: string): Promise<JoinOptions> {
  let saved: Partial<JoinOptions> = {};
  try {
    saved = JSON.parse(safeStorageGet(STORAGE_KEY) ?? "{}");
  } catch {
    saved = {};
  }

  let cls: ClassDef = CLASSES.find((c) => c.id === saved.classId) ?? CLASSES[0]!;
  let subId = cls.subclasses.some((s) => s.id === saved.subclassId) ? saved.subclassId! : cls.subclasses[0].id;

  return new Promise((resolve) => {
    const nameInput = h("input.cc-name", {
      type: "text",
      maxlength: NAME_MAX_LENGTH,
      placeholder: "Your name",
      value: saved.name ?? "",
      autocomplete: "off",
      spellcheck: "false",
    });
    const grid = h("div.cc-grid");
    const detail = h("div.cc-detail");
    const submit = h("button.btn.btn-primary", { type: "submit" }, "Wake Up");

    const abilityLine = (a: AbilityDef) =>
      h(
        "div.cc-ability",
        null,
        h("span.cc-ability-name", null, a.name),
        h("span.cc-ability-meta", null, `${a.cost} cost · ${a.cooldown}s`),
        h("div.cc-ability-desc", null, a.description),
      );

    const renderGrid = () => {
      grid.replaceChildren(
        ...CLASSES.map((c) =>
          h(
            "button.cc-class",
            {
              type: "button",
              style: `--class-color:${c.color}`,
              "aria-pressed": c.id === cls.id ? "true" : "false",
              onclick: () => {
                cls = c;
                subId = c.subclasses[0].id;
                renderGrid();
                renderDetail();
              },
            },
            h("span.cc-class-swatch"),
            h("span.cc-class-name", null, c.name),
            h("span.cc-class-role", null, c.role),
          ),
        ),
      );
    };

    const renderDetail = () => {
      const res = RESOURCES[cls.resource];
      const stats = h(
        "div.cc-stats",
        null,
        ...STAT_IDS.map((id) =>
          h(
            "div.cc-stat",
            null,
            h("span", null, STAT_LABELS[id]),
            h("span.cc-stat-bar", { style: `--v:${Math.min(1, cls.baseStats[id] / 18)}` }),
            h("b", null, String(cls.baseStats[id])),
          ),
        ),
      );
      detail.replaceChildren(
        h("h2", { style: `color:${cls.color}` }, cls.name),
        h("p.cc-desc", null, cls.description),
        h(
          "div.cc-tags",
          null,
          h("span.tag", null, cls.role),
          h("span.tag", { style: `border-color:${res.color};color:${res.color}` }, res.label),
          h("span.tag", null, cls.basicAttack.kind === "melee" ? "Melee" : "Ranged"),
        ),
        stats,
        h("h3", null, "Class ability"),
        abilityLine(cls.ability),
        h("h3", null, "Choose a path"),
        h(
          "div.cc-subs",
          null,
          ...cls.subclasses.map((s) =>
            h(
              "button.cc-sub",
              {
                type: "button",
                "aria-pressed": s.id === subId ? "true" : "false",
                style: `--class-color:${cls.color}`,
                onclick: () => {
                  subId = s.id;
                  renderDetail();
                },
              },
              h("div.cc-sub-name", null, s.name),
              h("div.cc-sub-tag", null, s.tagline),
              h("div.cc-sub-desc", null, s.description),
              abilityLine(s.ability),
            ),
          ),
        ),
      );
    };

    const form = h(
      "form.cc",
      {
        onsubmit: (e: Event) => {
          e.preventDefault();
          const name = nameInput.value.trim() || "Wanderer";
          const opts: JoinOptions = { name, classId: cls.id, subclassId: subId };
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
    root.replaceChildren(h("div.screen.cc-screen", null, form));
    nameInput.focus();
  });
}
