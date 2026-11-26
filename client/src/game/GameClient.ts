import * as THREE from "three";
import {
  BASE_MOVE_SPEED,
  C2S,
  S2C,
  findInteractable,
  generateWorld,
  getFaith,
  getQuest,
  prayedFlag,
  zoneAt,
  NODE_NAMES,
  type GatherNode,
  type Interactable,
  ABILITY_SLOTS,
  getEnemy,
  getItem,
  resolveKit,
  ZONES,
  stepMovement,
  type AbilityDef,
  type ChatEvent,
  type FxEvent,
  type GateId,
  type HitEvent,
  type MemoryEvent,
  WATER_SPEED_MULTIPLIER,
  passiveBonus,
  type MoveIntent,
  type World,
} from "@rpg/shared";
import { PAD, GamepadInput } from "../controls/Gamepad.ts";
import { MenuNav } from "../controls/MenuNav.ts";
import { TouchControls } from "../controls/TouchControls.ts";
import type { GameRoom } from "../net.ts";
import type { AssetLibrary } from "../scene/Assets.ts";
import { createCompanionAvatar, createEnemyAvatar, createPlayerAvatar, type Avatar } from "../scene/Avatars.ts";
import { CelPost } from "../scene/CelPost.ts";
import { DEFAULT_HOUR, lightingAt, type LightingPreset } from "../scene/Lighting.ts";
import { Environment, groundHeight } from "../scene/Environment.ts";
import { FxSystem } from "../scene/Fx.ts";
import { IsoCamera } from "../scene/IsoCamera.ts";
import { Landmarks } from "../scene/Landmarks.ts";
import { QuestNodes } from "../scene/QuestNodes.ts";
import { updateOcclusion } from "../scene/occlusion.ts";
import type { EnemyView, PlayerView } from "../types.ts";
import { safeStorageGet, safeStorageSet } from "../ui/dom.ts";
import type { InputMode } from "../ui/glyphs.ts";
import { Hud, type PartyMember } from "../ui/Hud.ts";
import { Minimap, type MapContext, type MapMarker } from "../ui/Minimap.ts";
import { Overlay } from "../ui/Overlay.ts";
import { Input } from "./Input.ts";

interface Entity {
  avatar: Avatar;
  /** Smoothed render position. */
  pos: THREE.Vector3;
  facing: number;
  speed: number;
  ring?: THREE.Mesh;
  hitbox?: THREE.Mesh;
  /** Key that identifies the visual (rebuild avatar when it changes, e.g. new weapon). */
  look: string;
}

/** Screen-space aim from a stick or touch drag (x right, y up, magnitude 0..1). */
type ScreenAim = { x: number; y: number; mag: number };

const MOVE_RESEND_MS = 120;
const MOVE_DIR_MIN_INTERVAL = 50;
const AUTO_ATTACK_REACQUIRE_MS = 350;
const DISCOVERY_KEY = "rpg.discovered";

export function isLowPowerDevice(): boolean {
  return matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) <= 4;
}

/**
 * Owns the 3D scene and the per-frame loop: reads mouse/keyboard, gamepad
 * and touch input, predicts the local player, mirrors the server state into
 * avatars, and drives HUD/overlay/minimap.
 */
export class GameClient {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly iso: IsoCamera;
  private readonly env: Environment;
  private readonly landmarks: Landmarks;
  private readonly questNodes: QuestNodes;
  /** Hunting ground the player is in (for the zone banner). */
  private zone: string | null = null;
  private readonly fx: FxSystem;
  private readonly overlay: Overlay;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly input: Input;
  private readonly pad = new GamepadInput();
  private readonly touch: TouchControls;
  private readonly menuNav: MenuNav;
  private readonly world: World;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly players = new Map<string, Entity>();
  private readonly enemies = new Map<string, Entity>();
  private readonly companionEnts = new Map<string, Entity>();
  private readonly selfRingMat = new THREE.MeshBasicMaterial({ color: "#ffd54a", transparent: true, opacity: 0.8, depthWrite: false });
  private readonly enemyRingMat = new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.9, depthWrite: false });
  private readonly ringGeo = new THREE.RingGeometry(0.55, 0.68, 32).rotateX(-Math.PI / 2);
  private readonly hitboxMat = new THREE.MeshBasicMaterial({ visible: false });
  private readonly reticle: THREE.Mesh;
  private readonly post: CelPost;
  /** Warm glow carried by your character; brightness follows the time of day. */
  private readonly lantern = new THREE.PointLight("#ffb366", 0, 16, 2);
  /**
   * Hour of the day (0..24). Fixed for now; a day/night cycle only needs to
   * advance this (ideally from server time). Preview with ?time=21 in the URL.
   */
  private hour = DEFAULT_HOUR;
  private appliedHour = Number.NaN;
  private lighting!: LightingPreset;

  // Local player prediction
  private readonly pred = new THREE.Vector3();
  private predInit = false;
  private readonly intent: MoveIntent = { dirX: 0, dirZ: 0, target: null };
  private attackTarget: string | null = null;
  private lastDir = { x: 0, z: 0 };
  private lastDirSentAt = 0;
  private lastMoveSent = 0;
  private lastAutoAttack = 0;
  private hovered: string | null = null;
  private cursor = new THREE.Vector3();
  private hudTimer = 0;
  private running = true;
  private mode: InputMode;
  private readonly discovered: Set<string>;
  private readonly gateState = new Map<GateId, boolean>();

  constructor(
    private readonly room: GameRoom,
    private readonly assets: AssetLibrary,
    viewport: HTMLElement,
    overlayRoot: HTMLElement,
    uiRoot: HTMLElement,
  ) {
    const lowPower = isLowPowerDevice();
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowPower || devicePixelRatio < 2, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
    this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    viewport.append(this.renderer.domElement);
    this.post = new CelPost(this.renderer, { msaa: false });

    this.world = generateWorld(room.state.seed);
    this.iso = new IsoCamera(viewport.clientWidth / viewport.clientHeight);
    this.env = new Environment(this.world, this.scene, assets, { lowPower });
    this.landmarks = new Landmarks(this.world);
    this.scene.add(this.landmarks.group);
    this.questNodes = new QuestNodes(this.world);
    this.scene.add(this.questNodes.group);
    this.fx = new FxSystem(this.scene);
    this.overlay = new Overlay(overlayRoot, this.iso.camera);
    this.input = new Input(this.renderer.domElement);
    this.touch = new TouchControls(this.renderer.domElement);
    this.minimap = new Minimap(this.world);
    this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#ffd54a", transparent: true, opacity: 0.85, depthWrite: false }));
    this.reticle.visible = false;
    this.scene.add(this.reticle, this.lantern);

    try {
      this.discovered = new Set(JSON.parse(safeStorageGet(DISCOVERY_KEY) ?? "[]") as string[]);
    } catch {
      this.discovered = new Set();
    }

    this.hud = new Hud(
      uiRoot,
      {
        onUseItem: (slot) => room.send(C2S.useItem, { slot }),
        onChat: (text) => room.send(C2S.chat, { text }),
        onTypingChange: (typing) => {
          this.input.typing = typing;
          if (typing) this.input.keys.clear();
        },
        onAbility: (slot) => this.castAbility(slot, null),
        onInteract: () => room.send(C2S.interact),
        onAdvance: (classId) => room.send(C2S.advance, { classId }),
      },
      this.minimap.el,
      this.touch.el,
    );
    this.menuNav = new MenuNav(() => (this.hud.bagOpen ? this.hud.bag : this.hud.helpOpen ? this.hud.help : null));
    this.mode = matchMedia("(pointer: coarse)").matches ? "touch" : "kbm";
    this.hud.setInputMode(this.mode);

    const timeParam = Number(new URLSearchParams(location.search).get("time"));
    if (Number.isFinite(timeParam) && new URLSearchParams(location.search).has("time")) this.hour = timeParam;
    this.updateLighting();

    this.bindNetwork();
    // Debug handle for the browser console / automated tests: open with ?debug
    if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
      (window as unknown as { __rpg: unknown }).__rpg = { room, game: this };
    }
    window.addEventListener("resize", () => this.resize(viewport));
    window.addEventListener("gamepadconnected", () => this.hud.notice("Controller connected — Xbox layout. Press Menu for controls."));
    this.loop();
  }

  /** Re-apply time-of-day lighting when the hour changes. */
  private updateLighting(): void {
    if (this.hour === this.appliedHour) return;
    this.appliedHour = this.hour;
    this.lighting = lightingAt(this.hour);
    this.env.applyLighting(this.lighting, this.scene);
    this.post.setGrade(this.lighting);
    this.landmarks.setGlow(this.lighting.glow);
  }

  /** Set the hour of the day (0..24). Hook for the future day/night cycle. */
  setHour(hour: number): void {
    this.hour = ((hour % 24) + 24) % 24;
  }

  private bindNetwork(): void {
    this.room.onMessage(S2C.fx, (e: FxEvent) => this.fx.spawn(e));
    this.room.onMessage(S2C.hit, (e: HitEvent) => this.onHit(e));
    this.room.onMessage(S2C.chat, (e: ChatEvent) => this.hud.chatLine(e.from, e.text, e.system));
    this.room.onMessage(S2C.notice, (text: string) => this.hud.notice(text));
    this.room.onMessage(S2C.memory, (e: MemoryEvent) => this.hud.memory(e));
    this.room.onLeave.once((code: number) => {
      this.running = false;
      const msg = document.createElement("div");
      msg.className = "screen disconnected";
      msg.innerHTML = `<div class="panel"><h2>Disconnected</h2><p>Lost connection to the server (code ${Number(code)}).</p><button class="btn btn-primary" onclick="location.reload()">Reconnect</button></div>`;
      document.body.append(msg);
    });
  }

  private onHit(e: HitEvent): void {
    const ent = this.players.get(e.targetId) ?? this.enemies.get(e.targetId) ?? this.companionEnts.get(e.targetId);
    if (!ent) return;
    const at = ent.pos.clone().setY(ent.pos.y + ent.avatar.height);
    const isMe = e.targetId === this.room.sessionId;
    const cls = e.heal ? "heal" : isMe ? "hurt" : e.crit ? "crit" : "dmg";
    this.overlay.floatText(at, `${e.heal ? "+" : ""}${e.amount}${e.crit ? "!" : ""}`, cls);
    if (isMe && !e.heal && this.mode === "gamepad") this.pad.rumble(0.45, 140);
  }

  private resize(viewport: HTMLElement): void {
    const w = viewport.clientWidth;
    const hgt = viewport.clientHeight;
    this.renderer.setSize(w, hgt);
    this.iso.resize(w / hgt);
    this.post.resize();
  }

  private get me(): PlayerView | undefined {
    return this.room.state.players.get(this.room.sessionId);
  }

  private setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.hud.setInputMode(mode);
    if (mode !== "gamepad") this.menuNav.clear();
  }

  // -------------------------------------------------------------------------
  // Targeting helpers
  // -------------------------------------------------------------------------

  private updateCursor(): void {
    const ndc = new THREE.Vector2((this.input.mouseX / this.input.width) * 2 - 1, -(this.input.mouseY / this.input.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.iso.camera);
    this.raycaster.ray.intersectPlane(this.groundPlane, this.cursor);

    const hitboxes: THREE.Object3D[] = [];
    for (const e of this.enemies.values()) if (e.hitbox) hitboxes.push(e.hitbox);
    const hit = this.raycaster.intersectObjects(hitboxes, false)[0];
    this.hovered = (hit?.object.userData.enemyId as string | undefined) ?? null;
  }

  private facingDir(): { x: number; z: number } {
    const ent = this.players.get(this.room.sessionId);
    const f = ent?.facing ?? 0;
    return { x: Math.sin(f), z: Math.cos(f) };
  }

  /** Best enemy to auto-target: close, and roughly in the preferred direction. */
  private pickTarget(maxDist: number, prefer?: { x: number; z: number }): string | null {
    const dir = prefer && Math.hypot(prefer.x, prefer.z) > 0.1 ? prefer : this.facingDir();
    const dl = Math.hypot(dir.x, dir.z) || 1;
    let best: string | null = null;
    let bestScore = Infinity;
    this.room.state.enemies.forEach((e, id) => {
      if (e.hp <= 0) return;
      const dx = e.x - this.pred.x;
      const dz = e.z - this.pred.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) return;
      const cos = d > 0.01 ? (dx * dir.x + dz * dir.z) / (d * dl) : 1;
      const score = d + (1 - cos) * 4;
      if (score < bestScore) {
        bestScore = score;
        best = id;
      }
    });
    return best;
  }

  private attackNearest(silent: boolean, prefer?: { x: number; z: number }): void {
    const me = this.me;
    if (!me || me.anim === "dead") return;
    const atk = resolveKit(me.classId)?.basicAttack;
    const reach = atk?.kind === "ranged" ? atk.range + 3 : 9;
    const id = this.pickTarget(reach, prefer);
    if (id) {
      this.attackTarget = id;
      this.intent.target = null;
      this.room.send(C2S.attack, { targetId: id });
    } else if (!silent) {
      this.hud.notice("No enemy nearby.");
    }
  }

  private abilityDef(slot: number): AbilityDef | undefined {
    const me = this.me;
    return me ? resolveKit(me.classId)?.abilities[slot] : undefined;
  }

  /** World point an ability would be cast at for the given screen-space aim (or auto-aim when null). */
  private abilityPoint(slot: number, aim: ScreenAim | null): { x: number; z: number } {
    const ability = this.abilityDef(slot);
    const range = ability?.range ?? 0;
    const selfCentred = !ability || range === 0 || ["nova", "heal", "buff"].includes(ability.effect.type);
    if (selfCentred) return { x: this.pred.x, z: this.pred.z };
    if (aim && aim.mag > 0.05) {
      const d = this.iso.screenDirToWorld(aim.x, aim.y);
      const l = Math.hypot(d.x, d.z) || 1;
      const dist = Math.max(2, range * Math.min(1, aim.mag));
      return { x: this.pred.x + (d.x / l) * dist, z: this.pred.z + (d.z / l) * dist };
    }
    const id = this.pickTarget(range + 2);
    const e = id ? this.room.state.enemies.get(id) : undefined;
    if (e) return { x: e.x, z: e.z };
    const f = this.facingDir();
    const dist = Math.min(range, 6);
    return { x: this.pred.x + f.x * dist, z: this.pred.z + f.z * dist };
  }

  /** Cast at the mouse cursor (kbm) or with stick/touch aim / auto-aim. */
  private castAbility(slot: number, aim: ScreenAim | null): void {
    if (!this.abilityDef(slot)) {
      const level = [1, 10, 25, 50][slot];
      this.hud.notice(`You learn this ability when you advance at level ${level}.`);
      return;
    }
    const p = this.mode === "kbm" ? { x: this.cursor.x, z: this.cursor.z } : this.abilityPoint(slot, aim);
    this.room.send(C2S.ability, { slot, x: p.x, z: p.z });
  }

  private quickUse(kind: "heal" | "restoreResource"): void {
    const me = this.me;
    if (!me) return;
    for (let i = 0; i < me.inventory.length; i++) {
      const use = getItem(me.inventory[i]!.itemId)?.use;
      if (use?.type === kind) {
        this.room.send(C2S.useItem, { slot: i });
        return;
      }
    }
    this.hud.notice(kind === "heal" ? "You have no food left." : "You have nothing to drink. Fill your waterskin at the stream.");
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private handleInput(now: number): void {
    const inp = this.input;
    this.pad.poll();
    if (this.pad.active) this.setMode("gamepad");
    else if (inp.mouseActive) this.setMode("kbm");
    inp.mouseActive = false;

    // Touch: world taps behave like mouse clicks at that point.
    const taps = this.touch.consumeTaps();
    const touchActions = this.touch.consumeActions();
    const releases = this.touch.consumeAbilityReleases();
    const pinch = this.touch.consumePinch();
    if (taps.length || touchActions.length || releases.length || this.touch.move.x || this.touch.move.y || pinch) this.setMode("touch");
    const tap = taps.at(-1);
    if (tap) {
      inp.mouseX = tap.x;
      inp.mouseY = tap.y;
    }
    this.updateCursor();

    if (inp.wheel !== 0) {
      this.iso.zoom(inp.wheel, inp.width / inp.height);
      inp.wheel = 0;
    }
    if (pinch) this.iso.zoom(pinch, inp.width / inp.height);

    // --- Menus with a controller (bag / help) ----------------------------
    const menuOpen = this.hud.bagOpen || this.hud.helpOpen;
    if (this.mode === "gamepad" && menuOpen) {
      const dir = this.pad.navDirection(now);
      if (dir) this.menuNav.move(dir);
      else this.menuNav.ensure();
      if (this.pad.pressed(PAD.A)) this.menuNav.activate();
      if (this.pad.pressed(PAD.B)) {
        this.hud.closePanels();
        this.hud.hideTooltip();
        this.menuNav.clear();
      }
      if (this.pad.pressed(PAD.VIEW)) this.hud.toggleBag();
      if (this.pad.pressed(PAD.MENU)) this.hud.toggleHelp();
      this.sendMoveDir({ x: 0, z: 0 }, now);
      return;
    }

    // --- Keyboard actions --------------------------------------------------
    for (const k of inp.consumePressed()) {
      if (k === "enter") this.hud.focusChat();
      else if (k === "i" || k === "b" || k === "c") this.hud.toggleBag();
      else if (k === "h" || k === "?") this.hud.toggleHelp();
      else if (k === "m") this.minimap.toggle();
      else if (k === "escape") this.hud.closePanels();
      else if (k >= "1" && k <= "4" && k.length === 1) this.castAbility(Number(k) - 1, null);
      else if (k === "q") this.castAbility(0, null);
      else if (k === "e") this.castAbility(1, null);
      else if (k === "5") this.quickUse("heal");
      else if (k === "6") this.quickUse("restoreResource");
      else if (k === "f") this.room.send(C2S.interact);
    }

    // --- Gamepad actions (Xbox layout) -------------------------------------
    const pad = this.pad;
    const aim: ScreenAim | null = pad.right.mag > 0.25 ? { x: pad.right.x, y: pad.right.y, mag: pad.right.mag } : null;
    if (pad.connected) {
      const preferWorld = pad.left.mag > 0.2 ? this.iso.screenDirToWorld(pad.left.x, pad.left.y) : undefined;
      if (pad.pressed(PAD.A)) this.attackNearest(false, preferWorld);
      else if (pad.held(PAD.A) && !this.attackTarget && now - this.lastAutoAttack > AUTO_ATTACK_REACQUIRE_MS) {
        this.lastAutoAttack = now;
        this.attackNearest(true, preferWorld);
      }
      if (pad.pressed(PAD.X)) this.castAbility(0, aim);
      if (pad.pressed(PAD.Y)) this.castAbility(1, aim);
      if (pad.pressed(PAD.RB)) this.castAbility(2, aim);
      if (pad.pressed(PAD.RT)) this.castAbility(3, aim);
      if (pad.pressed(PAD.B)) this.room.send(C2S.interact);
      if (pad.pressed(PAD.UP)) this.quickUse("heal");
      if (pad.pressed(PAD.DOWN)) this.quickUse("restoreResource");
      if (pad.pressed(PAD.LEFT)) this.iso.zoom(120, inp.width / inp.height);
      if (pad.pressed(PAD.RIGHT)) this.iso.zoom(-120, inp.width / inp.height);
      if (pad.pressed(PAD.VIEW)) this.hud.toggleBag();
      if (pad.pressed(PAD.MENU)) this.hud.toggleHelp();
      if (pad.pressed(PAD.RS)) this.minimap.toggle();
    }

    // --- Touch actions -----------------------------------------------------
    for (const a of touchActions) {
      if (a === "attack") this.attackNearest(false);
      else if (a === "interact") this.room.send(C2S.interact);
      else if (a === "bag") this.hud.toggleBag();
      else if (a === "map") this.minimap.toggle();
      else if (a === "help") this.hud.toggleHelp();
      else if (a === "chat") this.hud.focusChat();
      else if (a === "fullscreen") void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
    }
    if (this.touch.attackHeld && !this.attackTarget && now - this.lastAutoAttack > AUTO_ATTACK_REACQUIRE_MS) {
      this.lastAutoAttack = now;
      this.attackNearest(true);
    }
    for (const r of releases) this.castAbility(r.slot, r.aim);

    // --- Aim reticle (stick or touch drag) ---------------------------------
    const touchAim = this.touch.aiming;
    const showAim = (this.mode === "gamepad" && aim) || (this.mode === "touch" && touchAim?.aim);
    if (showAim) {
      const slot = touchAim?.slot ?? 0;
      const p = this.abilityPoint(slot, touchAim?.aim ?? aim);
      this.reticle.position.set(p.x, groundHeight(p.x, p.z) + 0.08, p.z);
      const radius = (() => {
        const e = this.abilityDef(slot)?.effect;
        return e && "radius" in e && e.radius > 0 ? e.radius : 0.8;
      })();
      this.reticle.scale.setScalar(radius);
    }
    this.reticle.visible = !!showAim;

    // --- Movement: keyboard, left stick, or virtual joystick ---------------
    let sx = 0;
    let sy = 0;
    if (!inp.typing) {
      if (inp.keys.has("w") || inp.keys.has("arrowup")) sy += 1;
      if (inp.keys.has("s") || inp.keys.has("arrowdown")) sy -= 1;
      if (inp.keys.has("d") || inp.keys.has("arrowright")) sx += 1;
      if (inp.keys.has("a") || inp.keys.has("arrowleft")) sx -= 1;
    }
    if (sx === 0 && sy === 0 && pad.left.mag > 0) {
      sx = pad.left.x;
      sy = pad.left.y;
    }
    if (sx === 0 && sy === 0 && (this.touch.move.x || this.touch.move.y)) {
      sx = this.touch.move.x;
      sy = this.touch.move.y;
    }
    this.sendMoveDir(this.iso.screenDirToWorld(sx, sy), now);

    // --- Mouse / tap ---------------------------------------------------------
    if (inp.leftPressed || tap) {
      inp.leftPressed = false;
      if (this.hovered) {
        this.attackTarget = this.hovered;
        this.intent.target = null;
        this.room.send(C2S.attack, { targetId: this.hovered });
      } else {
        this.sendMoveTo(now);
      }
    } else if (inp.leftDown && !this.attackTarget && now - this.lastMoveSent > MOVE_RESEND_MS) {
      this.sendMoveTo(now);
    }
    if (inp.rightPressed) {
      inp.rightPressed = false;
      this.castAbility(0, null);
    }
  }

  /** Send analog movement, throttled, only when it changed meaningfully. */
  private sendMoveDir(dir: { x: number; z: number }, now: number): void {
    const changed = Math.hypot(dir.x - this.lastDir.x, dir.z - this.lastDir.z);
    const stopping = dir.x === 0 && dir.z === 0;
    const wasStopped = this.lastDir.x === 0 && this.lastDir.z === 0;
    if (stopping && wasStopped) return;
    if (!stopping && !wasStopped && (changed < 0.06 || now - this.lastDirSentAt < MOVE_DIR_MIN_INTERVAL)) return;
    if (stopping !== wasStopped || changed >= 0.06) {
      this.lastDir = dir;
      this.lastDirSentAt = now;
      this.room.send(C2S.moveDir, dir);
      this.intent.dirX = dir.x;
      this.intent.dirZ = dir.z;
      if (!stopping) {
        this.intent.target = null;
        this.attackTarget = null;
      }
    }
  }

  private sendMoveTo(now: number): void {
    this.lastMoveSent = now;
    this.attackTarget = null;
    this.intent.target = { x: this.cursor.x, z: this.cursor.z };
    this.room.send(C2S.moveTo, { x: this.cursor.x, z: this.cursor.z });
  }

  // -------------------------------------------------------------------------
  // Local prediction
  // -------------------------------------------------------------------------

  private predictLocal(me: PlayerView, dt: number, serverTime: number): void {
    if (!this.predInit) {
      this.pred.set(me.x, 0, me.z);
      this.predInit = true;
    }
    let moving = false;
    if (me.anim !== "dead") {
      let intent = this.intent;
      if (this.attackTarget) {
        const target = this.room.state.enemies.get(this.attackTarget);
        if (!target) {
          this.attackTarget = null;
        } else {
          const reach = (resolveKit(me.classId)?.basicAttack.range ?? 2) + (getEnemy(target.kind)?.radius ?? 0.5);
          const inReach = Math.hypot(target.x - this.pred.x, target.z - this.pred.z) <= reach;
          intent = { dirX: 0, dirZ: 0, target: inReach ? null : { x: target.x, z: target.z } };
        }
      }
      let speedBuff = 0;
      me.buffs.forEach((b) => {
        if (b.stat === "speed" && b.expiresAt > serverTime) speedBuff += b.amount;
      });
      // Mirror the server's speed rules (buffs, background) so prediction rarely needs correcting.
      const speed = BASE_MOVE_SPEED * (1 + speedBuff + passiveBonus(me.background, me.faith, me.classId, "moveSpeed", me.quests));
      const water = WATER_SPEED_MULTIPLIER + (1 - WATER_SPEED_MULTIPLIER) * passiveBonus(me.background, me.faith, me.classId, "waterSlow", me.quests);
      const r = stepMovement(this.world, this.pred.x, this.pred.z, intent, speed, dt, undefined, water);
      this.pred.x = r.x;
      this.pred.z = r.z;
      moving = r.moving;
      if (r.arrived && intent === this.intent) this.intent.target = null;
    }

    // Reconcile toward the authoritative position.
    const ex = me.x - this.pred.x;
    const ez = me.z - this.pred.z;
    const err = Math.hypot(ex, ez);
    let rate = moving ? (err > 1.2 ? 2 : 0) : 6;
    if (err > 4 || me.anim === "dead") rate = 14;
    const k = 1 - Math.exp(-dt * rate);
    this.pred.x += ex * k;
    this.pred.z += ez * k;
  }

  // -------------------------------------------------------------------------
  // World state: gates, discovery
  // -------------------------------------------------------------------------

  private syncGates(): void {
    this.room.state.gates?.forEach((open, id) => {
      const gate = id as GateId;
      if (this.gateState.get(gate) === open) return;
      this.gateState.set(gate, open);
      if (open) this.world.openGates.add(gate);
      else this.world.openGates.delete(gate);
      this.landmarks.setGateOpen(gate, open);
    });
  }

  /** Does the local player's current quest step want this pick-up? (Mirrors the server.) */
  private wantsNode(me: PlayerView, n: GatherNode): boolean {
    const o = getQuest(me.activeQuest)?.steps[me.questStep]?.objective;
    return o?.type === "gather" && o.node === n.kind && !me.gathered?.includes(n.id);
  }

  private interactHint(me: PlayerView, it: Interactable): string {
    if (it.kind === "node") return NODE_NAMES[it.node.kind].verb;
    if (it.kind === "water") {
      let hasEmptySkin = false;
      me.inventory.forEach((s) => {
        if (s.itemId === "waterskin_empty") hasEmptySkin = true;
      });
      return hasEmptySkin ? "Fill your waterskin" : "Drink from the stream";
    }
    const l = it.landmark;
    if (l.kind === "shrine") {
      if (l.faith !== me.faith) return `Inspect the ${l.name}`;
      return me.quests.includes(prayedFlag(me.faith)) ? `Pray to ${getFaith(me.faith)?.name ?? "your god"}` : "Pray to receive your blessing";
    }
    if (l.kind === "camp") {
      const o = getQuest(me.activeQuest)?.steps[me.questStep]?.objective;
      if (o?.type === "interact" && o.landmark === l.id) return this.room.state.campBuilt ? "Add your supplies to the camp" : "Build your camp";
      return this.room.state.campBuilt ? "Rest by the fire" : "Inspect the clearing";
    }
    return l.verb;
  }

  private checkDiscovery(): void {
    // Hunting grounds: a banner when you walk in (with a little slack so the edge doesn't flicker).
    const still = this.zone ? zoneAt(this.pred.x, this.pred.z, 4)?.id === this.zone : false;
    const here = still ? ZONES.find((z) => z.id === this.zone) : zoneAt(this.pred.x, this.pred.z);
    const id = here?.id ?? null;
    if (id !== this.zone) {
      this.zone = id;
      if (here) {
        this.hud.banner(here.name, `Level ${here.levels[0]}–${here.levels[1]}`);
        if (!this.discovered.has(here.id)) {
          this.discovered.add(here.id);
          safeStorageSet(DISCOVERY_KEY, JSON.stringify([...this.discovered]));
        }
      }
    }
    for (const l of this.world.landmarks) {
      if (l.discoverRadius === 0 || this.discovered.has(l.id)) continue;
      if (Math.hypot(this.pred.x - l.x, this.pred.z - l.z) < l.discoverRadius) {
        this.discovered.add(l.id);
        safeStorageSet(DISCOVERY_KEY, JSON.stringify([...this.discovered]));
        this.hud.banner(l.name, "Discovered");
      }
    }
  }

  // -------------------------------------------------------------------------
  // Entity sync
  // -------------------------------------------------------------------------

  private syncEntities(dt: number): void {
    const state = this.room.state;
    const smooth = 1 - Math.exp(-dt * 12);

    const seenP = new Set<string>();
    state.players.forEach((p, id) => {
      seenP.add(id);
      const a = p.appearance;
      const look = `${p.classId}.${p.weapon}.${a.build}${a.skin}${a.hair}${a.hairColor}${a.beard}${a.dye}`;
      let ent = this.players.get(id);
      if (ent && ent.look !== look) {
        this.removeEntity(ent);
        ent = undefined;
      }
      if (!ent) {
        ent = this.makeEntity(
          createPlayerAvatar(this.assets, p.classId, p.weapon, { build: a.build, skin: a.skin, hair: a.hair, hairColor: a.hairColor, beard: a.beard, dye: a.dye }),
          p.x,
          p.z,
          look,
        );
        if (id === this.room.sessionId) {
          ent.ring = new THREE.Mesh(this.ringGeo, this.selfRingMat);
          this.scene.add(ent.ring);
        }
        this.players.set(id, ent);
      }
      const isMe = id === this.room.sessionId;
      const tx = isMe ? this.pred.x : p.x;
      const tz = isMe ? this.pred.z : p.z;
      this.moveEntity(ent, tx, tz, isMe ? 1 : smooth, dt);
      // Face movement direction when moving, otherwise server facing (attacks/casts).
      if (!(isMe && ent.speed > 0.5) || p.anim === "attack" || p.anim === "cast") {
        ent.facing = lerpAngle(ent.facing, p.facing, smooth);
      }
      ent.avatar.setAnim(p.anim, p.actionSeq);
    });
    for (const [id, ent] of this.players) {
      if (!seenP.has(id)) {
        this.removeEntity(ent);
        this.players.delete(id);
      }
    }

    const seenE = new Set<string>();
    state.enemies.forEach((e: EnemyView, id) => {
      seenE.add(id);
      let ent = this.enemies.get(id);
      if (!ent) {
        ent = this.makeEntity(createEnemyAvatar(this.assets, e.kind), e.x, e.z, e.kind);
        const def = getEnemy(e.kind);
        const r = (def?.radius ?? 0.5) + 0.35;
        ent.hitbox = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1.8, 8), this.hitboxMat);
        ent.hitbox.position.y = 0.9;
        ent.hitbox.userData.enemyId = id;
        ent.avatar.root.add(ent.hitbox);
        ent.ring = new THREE.Mesh(this.ringGeo, this.enemyRingMat);
        ent.ring.scale.setScalar((def?.radius ?? 0.5) * 1.9);
        this.scene.add(ent.ring);
        this.enemies.set(id, ent);
      }
      this.moveEntity(ent, e.x, e.z, smooth, dt);
      ent.facing = lerpAngle(ent.facing, e.facing, smooth);
      ent.avatar.setAnim(e.anim, e.actionSeq);
      ent.ring!.visible = id === this.hovered || id === this.attackTarget;
    });
    for (const [id, ent] of this.enemies) {
      if (!seenE.has(id)) {
        this.removeEntity(ent);
        this.enemies.delete(id);
      }
    }

    // Pets and familiars.
    const seenC = new Set<string>();
    state.companions?.forEach((c, id) => {
      seenC.add(id);
      const look = `${c.kind}.${c.color}.${c.scale}`;
      let ent = this.companionEnts.get(id);
      if (ent && ent.look !== look) {
        this.removeEntity(ent);
        ent = undefined;
      }
      if (!ent) {
        ent = this.makeEntity(createCompanionAvatar(c.kind, c.color, c.scale), c.x, c.z, look);
        this.companionEnts.set(id, ent);
      }
      this.moveEntity(ent, c.x, c.z, smooth, dt);
      ent.facing = lerpAngle(ent.facing, c.facing, smooth);
      ent.avatar.setAnim(c.anim, c.actionSeq);
    });
    for (const [id, ent] of this.companionEnts) {
      if (!seenC.has(id)) {
        this.removeEntity(ent);
        this.companionEnts.delete(id);
      }
    }

    for (const ent of [...this.players.values(), ...this.enemies.values(), ...this.companionEnts.values()]) {
      ent.avatar.root.position.copy(ent.pos);
      ent.avatar.root.rotation.y = ent.facing;
      ent.avatar.update(dt, ent.speed);
      if (ent.ring) ent.ring.position.set(ent.pos.x, ent.pos.y + 0.04, ent.pos.z);
    }
  }

  private makeEntity(avatar: Avatar, x: number, z: number, look: string): Entity {
    this.scene.add(avatar.root);
    return { avatar, pos: new THREE.Vector3(x, groundHeight(x, z), z), facing: 0, speed: 0, look };
  }

  private moveEntity(ent: Entity, x: number, z: number, k: number, dt: number): void {
    const px = ent.pos.x;
    const pz = ent.pos.z;
    ent.pos.x += (x - ent.pos.x) * k;
    ent.pos.z += (z - ent.pos.z) * k;
    ent.pos.y = groundHeight(ent.pos.x, ent.pos.z);
    const v = Math.hypot(ent.pos.x - px, ent.pos.z - pz) / Math.max(dt, 1e-4);
    ent.speed += (v - ent.speed) * Math.min(1, dt * 10);
    if (v > 0.5) ent.facing = lerpAngle(ent.facing, Math.atan2(ent.pos.x - px, ent.pos.z - pz), Math.min(1, dt * 14));
  }

  private removeEntity(ent: Entity): void {
    this.scene.remove(ent.avatar.root);
    if (ent.ring) this.scene.remove(ent.ring);
    ent.hitbox?.geometry.dispose();
    ent.avatar.dispose();
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private loop = (): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    const time = this.timer.getElapsed();
    const now = performance.now();
    const state = this.room.state;
    const me = this.me;

    this.syncGates();
    this.handleInput(now);
    if (me) this.predictLocal(me, dt, state.serverTime);
    this.syncEntities(dt);

    const focus = me ? new THREE.Vector3(this.pred.x, groundHeight(this.pred.x, this.pred.z), this.pred.z) : new THREE.Vector3();
    this.iso.follow(focus.x, focus.y, focus.z, dt, time < 0.2);
    this.env.update(dt, time, focus);
    this.lantern.position.set(focus.x + 0.6, focus.y + 3.6, focus.z + 0.6);
    this.updateLighting();
    const flame = this.lighting.lantern;
    this.lantern.intensity = flame > 0 ? flame * (1 + Math.sin(time * 7.3) * 0.05 + Math.sin(time * 3.1) * 0.05) : 0;
    this.landmarks.update(time);
    this.landmarks.setCampBuilt(!!state.campBuilt);
    if (me) {
      this.landmarks.setCalling(me.faith, me.quests.includes(prayedFlag(me.faith)));
      this.questNodes.update(time, (n) => this.wantsNode(me, n));
    }
    this.fx.update(dt);
    updateOcclusion(this.iso.camera, this.renderer, me ? focus : null);

    // Nameplates.
    this.overlay.beginFrame();
    state.players.forEach((p, id) => {
      if (id === this.room.sessionId) return;
      const ent = this.players.get(id);
      if (ent) this.overlay.plate(id, ent.pos.clone().setY(ent.pos.y + ent.avatar.height + 0.2), `${p.name}`, p.hp / Math.max(1, p.maxHp), "player");
    });
    state.enemies.forEach((e, id) => {
      const ent = this.enemies.get(id);
      if (!ent) return;
      const show = e.hp < e.maxHp || id === this.hovered || id === this.attackTarget;
      if (show) this.overlay.plate(id, ent.pos.clone().setY(ent.pos.y + ent.avatar.height + 0.1), "", e.hp / Math.max(1, e.maxHp), "enemy");
    });
    state.companions?.forEach((c, id) => {
      const ent = this.companionEnts.get(id);
      if (!ent || c.anim === "dead") return;
      const mine = c.owner === this.room.sessionId;
      if (mine || c.hp < c.maxHp) this.overlay.plate(id, ent.pos.clone().setY(ent.pos.y + ent.avatar.height * Math.max(0.6, c.scale) * 0.9), mine ? c.name : "", c.hp / Math.max(1, c.maxHp), "pet");
    });
    this.overlay.endFrame();
    this.overlay.update(dt);

    // HUD, minimap, prompts at ~15 Hz.
    this.hudTimer -= dt;
    if (me && this.hudTimer <= 0) {
      this.hudTimer = 1 / 15;
      const others: PartyMember[] = [];
      const markers: MapMarker[] = [{ x: this.pred.x, z: this.pred.z, kind: "self", facing: this.players.get(this.room.sessionId)?.facing ?? 0 }];
      state.players.forEach((p, id) => {
        if (id === this.room.sessionId) return;
        others.push({ name: p.name, level: p.level, classId: p.classId, hp: p.hp, maxHp: p.maxHp });
        markers.push({ x: p.x, z: p.z, kind: "player" });
      });
      state.enemies.forEach((e) => {
        if (Math.hypot(e.x - this.pred.x, e.z - this.pred.z) < 30) markers.push({ x: e.x, z: e.z, kind: "enemy" });
      });
      // Quest markers: pick-ups you still need, or the place the step points to.
      const objective = getQuest(me.activeQuest)?.steps[me.questStep]?.objective;
      for (const n of this.world.nodes) if (this.wantsNode(me, n)) markers.push({ x: n.x, z: n.z, kind: "node" });
      if (objective?.type === "interact") {
        const l = this.world.landmarks.find((m) => m.id === objective.landmark);
        if (l) markers.push({ x: l.x, z: l.z, kind: "objective" });
      }
      const mapInfo: MapContext = { faith: me.faith };
      if (objective?.type === "kill") {
        // The first hunting ground with that creature.
        mapInfo.objectiveZone = ZONES.find((z) => z.enemies.some((e) => e.id === objective.enemy))?.id;
      }
      this.hud.update(me, state.serverTime, others);
      this.minimap.draw(markers, this.discovered, this.world.openGates, mapInfo);

      const targetId = this.hovered ?? this.attackTarget;
      const tgt = targetId ? state.enemies.get(targetId) : undefined;
      this.hud.setTarget(tgt ? `Lv ${tgt.level ?? 1} ${getEnemy(tgt.kind)?.name ?? tgt.kind}` : null, tgt?.hp, tgt?.maxHp);

      const interact = me.anim === "dead" ? null : findInteractable(this.world, this.pred.x, this.pred.z, (n) => this.wantsNode(me, n));
      const hint = interact ? this.interactHint(me, interact) : null;
      this.hud.setInteractHint(hint);
      this.touch.setInteract(!!hint);
      this.touch.setAbilityLabels(this.hud.abilityNames);
      for (let slot = 0; slot < ABILITY_SLOTS; slot++) {
        const st = this.hud.abilityState(me, state.serverTime, slot);
        this.touch.setCooldown(slot, st.frac, st.text, st.noRes);
      }
      this.checkDiscovery();
    }

    this.renderer.domElement.style.cursor = this.hovered ? "crosshair" : "default";
    this.post.render(this.scene, this.iso.camera);
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
