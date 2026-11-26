import * as THREE from "three";
import {
  APPEARANCE_OPTIONS,
  BACKGROUNDS,
  BASE_CLASSES,
  BASE_CLASS_IDS,
  DEFAULT_APPEARANCE,
  EMPTY_ALLOCATION,
  FAITHS,
  NAME_MAX_LENGTH,
  POINT_BUY,
  RESOURCES,
  STAT_IDS,
  STAT_LABELS,
  allocationError,
  childrenOf,
  classTags,
  creationStats,
  critChanceFor,
  deriveMaxHp,
  deriveMaxResource,
  getBackground,
  getClassNode,
  getFaith,
  pointsRemaining,
  primaryDamageMultiplier,
  validateCreation,
  type Appearance,
  type BaseClassId,
  type ClassNode,
  type JoinOptions,
  type StatAllocation,
  type StatId,
} from "@rpg/shared";
import { PAD, GamepadInput } from "../controls/Gamepad.ts";
import { MenuNav } from "../controls/MenuNav.ts";
import { AssetLibrary } from "../scene/Assets.ts";
import { createPlayerAvatar, type Avatar } from "../scene/Avatars.ts";
import { toonMaterial } from "../scene/toon.ts";
import { h, safeStorageGet, safeStorageSet } from "./dom.ts";

const STORAGE_KEY = "rpg.lastCharacter.v2";

type StepId = "look" | "calling" | "memory" | "faith" | "attributes" | "review";
const STEPS: Array<{ id: StepId; label: string }> = [
  { id: "look", label: "Appearance" },
  { id: "calling", label: "Calling" },
  { id: "memory", label: "First memory" },
  { id: "faith", label: "Faith" },
  { id: "attributes", label: "Attributes" },
  { id: "review", label: "Wake up" },
];

interface Draft {
  name: string;
  classId: BaseClassId;
  backgroundId: string;
  faithId: string;
  alloc: StatAllocation;
  appearance: Appearance;
}

function loadDraft(): Draft {
  const fallback: Draft = {
    name: "",
    classId: "fighter",
    backgroundId: "",
    faithId: "",
    alloc: { ...EMPTY_ALLOCATION },
    appearance: { ...DEFAULT_APPEARANCE },
  };
  try {
    const saved = JSON.parse(safeStorageGet(STORAGE_KEY) ?? "null") as Partial<Draft> | null;
    if (!saved) return fallback;
    const merged: Draft = {
      ...fallback,
      ...saved,
      alloc: { ...EMPTY_ALLOCATION, ...saved.alloc },
      appearance: { ...DEFAULT_APPEARANCE, ...saved.appearance },
    };
    return allocationError(merged.alloc) ? { ...merged, alloc: { ...EMPTY_ALLOCATION } } : merged;
  } catch {
    return fallback;
  }
}

/**
 * A small rotating 3D preview of the character being created.
 * Uses the same procedural avatar as the game, in ragged clothes.
 */
class Preview {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private readonly assets = new AssetLibrary();
  private avatar: Avatar | null = null;
  private yaw = -0.5;
  private dragging = false;
  private lastX = 0;
  private raf = 0;
  private last = performance.now();
  private key = "";

  constructor() {
    this.canvas = h("canvas.cc-preview-canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight("#d6e6ff", "#3a4a2a", 1.3));
    const sun = new THREE.DirectionalLight("#fff0d6", 2.4);
    sun.position.set(-2, 4, 3);
    this.scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32).rotateX(-Math.PI / 2), toonMaterial({ color: "#3e5a2c" }));
    this.scene.add(ground);
    this.camera.position.set(0, 1.5, 5.6);
    this.camera.lookAt(0, 1.0, 0);
    this.canvas.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.012;
      this.lastX = e.clientX;
    });
    this.canvas.addEventListener("pointerup", () => (this.dragging = false));
    this.loop();
  }

  show(classId: string, appearance: Appearance): void {
    const key = `${classId}|${JSON.stringify(appearance)}`;
    if (key === this.key) return;
    this.key = key;
    if (this.avatar) {
      this.scene.remove(this.avatar.root);
      this.avatar.dispose();
    }
    this.avatar = createPlayerAvatar(this.assets, classId, BASE_CLASSES[classId as BaseClassId]?.starterWeapon ?? "", appearance);
    this.scene.add(this.avatar.root);
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.canvas.isConnected) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const w = this.canvas.clientWidth;
    const hgt = this.canvas.clientHeight;
    if (w && hgt && (this.canvas.width !== Math.round(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.round(hgt * this.renderer.getPixelRatio()))) {
      this.renderer.setSize(w, hgt, false);
      this.camera.aspect = w / hgt;
      this.camera.updateProjectionMatrix();
    }
    if (!this.dragging) this.yaw += dt * 0.25;
    if (this.avatar) {
      this.avatar.root.rotation.y = this.yaw;
      this.avatar.update(dt, 0);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.avatar?.dispose();
    this.renderer.dispose();
  }
}

/** Character creation: appearance, calling (base class), first memory (hidden background), faith, attributes. */
export function showCharacterCreate(root: HTMLElement, error?: string): Promise<JoinOptions> {
  const draft = loadDraft();
  let step: StepId = draft.backgroundId && draft.faithId ? "review" : "look";
  const preview = new Preview();
  const save = () => safeStorageSet(STORAGE_KEY, JSON.stringify(draft));

  return new Promise((resolve) => {
    const tabs = h("nav.cc-steps");
    const content = h("div.cc-step");
    const errorBox = h("div.cc-error.hidden");
    const back = h("button.btn", { type: "button" }, "Back");
    const next = h("button.btn.btn-primary", { type: "button" }, "Next");

    const stepIndex = () => STEPS.findIndex((s) => s.id === step);
    const complete = (id: StepId): boolean => {
      if (id === "memory") return !!draft.backgroundId;
      if (id === "faith") return !!draft.faithId;
      return true;
    };
    const go = (id: StepId) => {
      step = id;
      render();
    };

    // --- small builders -----------------------------------------------------
    const choiceRow = <T,>(items: readonly T[], selected: number, label: (t: T, i: number) => Node | string, onPick: (i: number) => void, swatch?: (t: T) => string) =>
      h(
        "div.cc-choices",
        null,
        ...items.map((it, i) =>
          h(
            `button.cc-choice${swatch ? ".swatch" : ""}` as "button",
            {
              type: "button",
              "aria-pressed": i === selected ? "true" : "false",
              style: swatch ? `--swatch:${swatch(it)}` : undefined,
              title: typeof label(it, i) === "string" ? (label(it, i) as string) : undefined,
              onclick: () => onPick(i),
            },
            swatch ? "" : label(it, i),
          ),
        ),
      );
    const field = (label: string, control: Node) => h("div.cc-field", null, h("div.cc-label", null, label), control);
    const setApp = (key: keyof Appearance, i: number) => {
      draft.appearance[key] = i;
      render();
    };

    // --- steps -------------------------------------------------------------
    const stepLook = () => {
      const nameInput = h("input.cc-name", {
        type: "text",
        maxlength: NAME_MAX_LENGTH,
        placeholder: "Wanderer",
        value: draft.name,
        autocomplete: "off",
        spellcheck: "false",
      });
      nameInput.addEventListener("input", () => {
        draft.name = nameInput.value;
        save();
      });
      const o = APPEARANCE_OPTIONS;
      const a = draft.appearance;
      return [
        h("h2", null, "Who wakes by the stream?"),
        h("p.cc-desc", null, "You don't remember your name. Choose the one you'll answer to."),
        field("Name", nameInput),
        field("Build", choiceRow(o.build, a.build, (b) => b.label, (i) => setApp("build", i))),
        field("Skin", choiceRow(o.skin, a.skin, (_c, i) => `Tone ${i + 1}`, (i) => setApp("skin", i), (c) => c)),
        field("Hair", choiceRow(o.hair, a.hair, (x) => x.label, (i) => setApp("hair", i))),
        field("Hair colour", choiceRow(o.hairColor, a.hairColor, (_c, i) => `Colour ${i + 1}`, (i) => setApp("hairColor", i), (c) => c)),
        field("Beard", choiceRow(o.beard, a.beard, (x) => x.label, (i) => setApp("beard", i))),
        field("Ragged clothes", choiceRow(o.dye, a.dye, (d) => d.label, (i) => setApp("dye", i), (d) => d.color)),
        h(
          "button.btn.btn-small",
          {
            type: "button",
            onclick: () => {
              const r = (n: number) => Math.floor(Math.random() * n);
              draft.appearance = { build: r(o.build.length), skin: r(o.skin.length), hair: r(o.hair.length), hairColor: r(o.hairColor.length), beard: r(o.beard.length), dye: r(o.dye.length) };
              render();
            },
          },
          "Randomise",
        ),
      ];
    };

    const renderTree = (rootId: string) => {
      const leaf = (n: ClassNode) =>
        h(
          "div.tree-leaf",
          { style: `--class-color:${n.color}`, title: `${n.description} — ${n.ability.name}: ${n.ability.description}` },
          h("span.tree-name", null, n.name),
          ...classTags(n)
            .filter((t) => t !== "Pure")
            .map((t) =>
              h(
                `span.tree-tag${n.pet === "evil" && t.startsWith("Pet") ? ".evil" : n.pet && t.startsWith("Pet") ? ".good" : ""}` as "span",
                null,
                t.startsWith("Hybrid") ? `+${t.split(" + ")[1]}` : t.replace("Pet class · ", "") + " pet",
              ),
            ),
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
                h("div.tree-node.tier3", { style: `--class-color:${t3.color}`, title: t3.description }, h("small", null, "Lv 25"), t3.name, t3.petLine ? h("span.tree-tag", null, "Pet at 25") : null),
                h("div.tree-leaves", null, h("small", null, "Lv 50"), ...childrenOf(t3.id).map(leaf)),
              ),
            ),
          ),
        ),
      );
    };

    const stepCalling = () => {
      const n = getClassNode(draft.classId)!;
      const def = BASE_CLASSES[draft.classId];
      const res = RESOURCES[def.resource];
      return [
        h("h2", null, "Your hands remember a trade"),
        h(
          "div.cc-grid.cc-grid-base",
          null,
          ...BASE_CLASS_IDS.map((id) => {
            const c = getClassNode(id)!;
            return h(
              "button.cc-class",
              {
                type: "button",
                style: `--class-color:${c.color}`,
                "aria-pressed": id === draft.classId ? "true" : "false",
                onclick: () => {
                  draft.classId = id;
                  render();
                },
              },
              h("span.cc-class-swatch"),
              h("span.cc-class-name", null, c.name),
              h("span.cc-class-role", null, c.tagline),
            );
          }),
        ),
        h("p.cc-desc", null, n.description),
        h(
          "div.cc-tags",
          null,
          h("span.tag", null, n.role),
          h("span.tag", { style: `border-color:${res.color};color:${res.color}` }, res.label),
          h("span.tag", null, def.basicAttack.kind === "melee" ? "Melee" : "Ranged"),
        ),
        h("div.cc-ability", null, h("span.cc-ability-name", null, n.ability.name), h("span.cc-ability-meta", null, `${n.ability.cost} ${res.label} · ${n.ability.cooldown}s`), h("div.cc-ability-desc", null, n.ability.description)),
        h("h3", null, "Where this path can lead"),
        h(
          "p.cc-hint",
          null,
          "Choose a new path at levels 10, 25 and 50 (25 and 50 need a trial). Choices are permanent. Every class gains a companion at 50; two pet classes per path, one good and one evil, raise theirs from 25.",
        ),
        renderTree(draft.classId),
      ];
    };

    const stepMemory = () => [
      h("h2", null, "What do you remember?"),
      h("p.cc-desc", null, "Your past is a blur. One image keeps coming back. The rest will return to you in time."),
      h(
        "div.cc-memories",
        null,
        ...BACKGROUNDS.map((b) =>
          h(
            "button.cc-memory",
            {
              type: "button",
              "aria-pressed": b.id === draft.backgroundId ? "true" : "false",
              onclick: () => {
                draft.backgroundId = b.id;
                render();
              },
            },
            b.impression,
          ),
        ),
      ),
    ];

    const stepFaith = () => [
      h("h2", null, "A prayer on your lips"),
      h("p.cc-desc", null, "When you woke, a prayer was already on your lips. Which god did it call to?"),
      h(
        "div.cc-faiths",
        null,
        ...FAITHS.map((f) =>
          h(
            "button.cc-faith",
            {
              type: "button",
              style: `--faith-color:${f.color}`,
              "aria-pressed": f.id === draft.faithId ? "true" : "false",
              onclick: () => {
                draft.faithId = f.id;
                render();
              },
            },
            h("div.cc-faith-name", null, f.name, f.title ? h("span.cc-faith-title", null, ` ${f.title}`) : null),
            h("div.cc-faith-domain", null, f.domain, h("span.tag", null, f.leaning)),
            h("div.cc-faith-desc", null, f.description),
          ),
        ),
      ),
    ];

    const derived = () => {
      const stats = creationStats(draft.classId, draft.backgroundId, draft.alloc);
      const def = BASE_CLASSES[draft.classId];
      const res = RESOURCES[def.resource];
      return [
        ["Health", String(deriveMaxHp(stats, 1))],
        [res.label, String(deriveMaxResource(def.resource, stats, 1))],
        ["Damage", `+${Math.round((primaryDamageMultiplier(stats[def.primaryStat]) - 1) * 100)}%`],
        ["Critical chance", `${(critChanceFor(stats.agility) * 100).toFixed(1)}%`],
      ] as const;
    };

    const stepAttributes = () => {
      const remaining = pointsRemaining(draft.alloc);
      const def = BASE_CLASSES[draft.classId];
      const base = creationStats(draft.classId, draft.backgroundId, EMPTY_ALLOCATION);
      const bump = (id: StatId, d: number) => {
        const nextAlloc = { ...draft.alloc, [id]: draft.alloc[id] + d };
        if (!allocationError(nextAlloc)) {
          draft.alloc = nextAlloc;
          render();
        }
      };
      return [
        h("h2", null, "Body and mind"),
        h("p.cc-desc", null, `Spend ${POINT_BUY.points} points. Raise a stat by up to ${POINT_BUY.maxRaise}, or lower one by up to ${POINT_BUY.maxLower} to get points back. ${getClassNode(draft.classId)!.name}s rely on ${STAT_LABELS[def.primaryStat]}.`),
        h("div.cc-points", null, "Points left: ", h("b", { class: remaining < 0 ? "bad" : "" }, String(remaining))),
        h(
          "div.cc-alloc",
          null,
          ...STAT_IDS.map((id) =>
            h(
              "div.cc-alloc-row",
              { class: id === def.primaryStat ? "primary" : "" },
              h("span.cc-alloc-name", null, STAT_LABELS[id]),
              h("button.cc-step-btn", { type: "button", "aria-label": `Lower ${STAT_LABELS[id]}`, disabled: !!allocationError({ ...draft.alloc, [id]: draft.alloc[id] - 1 }), onclick: () => bump(id, -1) }, "−"),
              h("span.cc-alloc-val", null, String(base[id] + draft.alloc[id])),
              h("button.cc-step-btn", { type: "button", "aria-label": `Raise ${STAT_LABELS[id]}`, disabled: !!allocationError({ ...draft.alloc, [id]: draft.alloc[id] + 1 }), onclick: () => bump(id, 1) }, "+"),
              h("span.cc-alloc-delta", null, draft.alloc[id] ? `${draft.alloc[id] > 0 ? "+" : ""}${draft.alloc[id]}` : ""),
            ),
          ),
        ),
        h(
          "div.cc-derived",
          null,
          ...derived().map(([k, v]) => h("div.cc-derived-item", null, h("span", null, k), h("b", null, v))),
        ),
        h(
          "button.btn.btn-small",
          {
            type: "button",
            onclick: () => {
              draft.alloc = { ...EMPTY_ALLOCATION };
              render();
            },
          },
          "Reset points",
        ),
      ];
    };

    const stepReview = () => {
      const n = getClassNode(draft.classId)!;
      const faith = getFaith(draft.faithId);
      const bg = getBackground(draft.backgroundId);
      const stats = creationStats(draft.classId, draft.backgroundId, draft.alloc);
      const check = validateCreation({ ...draft, name: draft.name || "Wanderer" });
      return [
        h("h2", null, draft.name.trim() || "Wanderer"),
        h("div.cc-review", null,
          h("div", null, h("span.cc-label", null, "Calling"), h("b", { style: `color:${n.color}` }, n.name)),
          h("div", null, h("span.cc-label", null, "Faith"), faith ? h("b", { style: `color:${faith.color}` }, `${faith.name}${faith.title ? " " + faith.title : ""}`) : h("i", null, "not chosen")),
          h("div", null, h("span.cc-label", null, "First memory"), bg ? h("i", null, bg.impression) : h("i", null, "not chosen")),
          h("div.cc-review-stats", null, ...STAT_IDS.map((id) => h("span", null, `${STAT_LABELS[id]} `, h("b", null, String(stats[id]))))),
        ),
        h("div.cc-derived", null, ...derived().map(([k, v]) => h("div.cc-derived-item", null, h("span", null, k), h("b", null, v)))),
        !check.ok ? h("div.cc-error", null, check.error) : null,
        pointsRemaining(draft.alloc) > 0 ? h("p.cc-hint", null, `You have ${pointsRemaining(draft.alloc)} unspent attribute points.`) : null,
      ];
    };

    // --- frame ------------------------------------------------------------
    const render = () => {
      save();
      preview.show(draft.classId, draft.appearance);
      tabs.replaceChildren(
        ...STEPS.map((s, i) =>
          h(
            "button.cc-tab",
            { type: "button", "aria-current": s.id === step ? "step" : undefined, class: complete(s.id) ? "done" : "", onclick: () => go(s.id) },
            h("span.cc-tab-num", null, String(i + 1)),
            s.label,
          ),
        ),
      );
      const builders: Record<StepId, () => Array<Node | null>> = {
        look: stepLook,
        calling: stepCalling,
        memory: stepMemory,
        faith: stepFaith,
        attributes: stepAttributes,
        review: stepReview,
      };
      content.replaceChildren(...builders[step]().filter((x): x is Node => !!x));
      const idx = stepIndex();
      back.disabled = idx === 0;
      const last = idx === STEPS.length - 1;
      next.textContent = last ? "Wake Up" : "Next";
      next.disabled = (step === "memory" && !draft.backgroundId) || (step === "faith" && !draft.faithId) || (last && !validateCreation(draft).ok);
    };

    const submit = () => {
      const result = validateCreation(draft);
      if (!result.ok) {
        errorBox.textContent = result.error;
        errorBox.classList.remove("hidden");
        const missing = !draft.backgroundId ? "memory" : !draft.faithId ? "faith" : null;
        if (missing) go(missing);
        return;
      }
      next.disabled = true;
      next.textContent = "Waking…";
      done = true;
      preview.dispose();
      resolve(result.value);
    };
    let done = false;

    back.addEventListener("click", () => {
      const i = stepIndex();
      if (i > 0) go(STEPS[i - 1]!.id);
    });
    next.addEventListener("click", () => {
      const i = stepIndex();
      if (i === STEPS.length - 1) submit();
      else go(STEPS[i + 1]!.id);
    });

    const form = h(
      "div.cc.cc-v2",
      null,
      h("header.cc-header", null, h("h1", null, "Who were you?"), h("p", null, "You wake on the bank of a cold stream, in a forest you don't recognise. Your memories are thin.")),
      error ? h("div.cc-error", null, error) : null,
      errorBox,
      tabs,
      h("div.cc-body", null, h("div.cc-preview", null, preview.canvas, h("div.cc-preview-hint", null, "Drag to turn")), h("div.cc-detail", null, content)),
      h("footer.cc-footer", null, back, next),
    );

    render();
    const screen = h("div.screen.cc-screen", null, form);
    root.replaceChildren(screen);

    // Controller: D-pad/stick moves the highlight, A selects, LB/RB change step, Menu wakes up.
    const pad = new GamepadInput();
    const nav = new MenuNav(() => form);
    const poll = () => {
      if (!screen.isConnected || done) return;
      requestAnimationFrame(poll);
      pad.poll();
      if (!pad.active) return;
      if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
      const dir = pad.navDirection(performance.now());
      if (dir) nav.move(dir);
      else nav.ensure();
      if (pad.pressed(PAD.A)) {
        const focused = nav.focused;
        const label = focused?.textContent;
        nav.activate();
        // Re-rendering replaces buttons; keep the highlight on the "same" control.
        const again = [...form.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === label && b.className === focused?.className);
        if (again) nav.focus(again);
      }
      if (pad.pressed(PAD.LB) && stepIndex() > 0) go(STEPS[stepIndex() - 1]!.id);
      if (pad.pressed(PAD.RB) && stepIndex() < STEPS.length - 1) go(STEPS[stepIndex() + 1]!.id);
      if (pad.pressed(PAD.MENU)) submit();
    };
    requestAnimationFrame(poll);
  });
}
