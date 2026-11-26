import * as THREE from "three";
import {
  BASE_MOVE_SPEED,
  C2S,
  S2C,
  generateWorld,
  getClass,
  getEnemy,
  isNearWater,
  stepMovement,
  type ChatEvent,
  type FxEvent,
  type HitEvent,
  type MoveIntent,
  type World,
} from "@rpg/shared";
import type { GameRoom } from "../net.ts";
import type { AssetLibrary } from "../scene/Assets.ts";
import { createEnemyAvatar, createPlayerAvatar, type Avatar } from "../scene/Avatars.ts";
import { Environment, groundHeight } from "../scene/Environment.ts";
import { FxSystem } from "../scene/Fx.ts";
import { IsoCamera } from "../scene/IsoCamera.ts";
import { updateOcclusion } from "../scene/occlusion.ts";
import type { EnemyView, PlayerView } from "../types.ts";
import { Hud } from "../ui/Hud.ts";
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

const MOVE_RESEND_MS = 120;

/**
 * Owns the 3D scene and the per-frame loop: reads input, predicts the local
 * player, mirrors the server state into avatars, and drives HUD/overlay.
 */
export class GameClient {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly iso: IsoCamera;
  private readonly env: Environment;
  private readonly fx: FxSystem;
  private readonly overlay: Overlay;
  private readonly hud: Hud;
  private readonly input: Input;
  private readonly world: World;
  private readonly timer = new THREE.Timer();
  private readonly raycaster = new THREE.Raycaster();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly players = new Map<string, Entity>();
  private readonly enemies = new Map<string, Entity>();
  private readonly selfRingMat = new THREE.MeshBasicMaterial({ color: "#ffd54a", transparent: true, opacity: 0.8, depthWrite: false });
  private readonly enemyRingMat = new THREE.MeshBasicMaterial({ color: "#ff4a3a", transparent: true, opacity: 0.9, depthWrite: false });
  private readonly ringGeo = new THREE.RingGeometry(0.55, 0.68, 32).rotateX(-Math.PI / 2);
  private readonly hitboxMat = new THREE.MeshBasicMaterial({ visible: false });

  // Local player prediction
  private readonly pred = new THREE.Vector3();
  private predInit = false;
  private readonly intent: MoveIntent = { dirX: 0, dirZ: 0, target: null };
  private attackTarget: string | null = null;
  private lastDir = { x: 0, z: 0 };
  private lastMoveSent = 0;
  private hovered: string | null = null;
  private cursor = new THREE.Vector3();
  private hudTimer = 0;
  private running = true;

  constructor(
    private readonly room: GameRoom,
    private readonly assets: AssetLibrary,
    viewport: HTMLElement,
    overlayRoot: HTMLElement,
    uiRoot: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(viewport.clientWidth, viewport.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    viewport.append(this.renderer.domElement);

    this.world = generateWorld(room.state.seed);
    this.iso = new IsoCamera(viewport.clientWidth / viewport.clientHeight);
    this.env = new Environment(this.world, this.scene, assets);
    this.fx = new FxSystem(this.scene);
    this.overlay = new Overlay(overlayRoot, this.iso.camera);
    this.input = new Input(this.renderer.domElement);

    this.hud = new Hud(uiRoot, {
      onUseItem: (slot) => room.send(C2S.useItem, { slot }),
      onChat: (text) => room.send(C2S.chat, { text }),
      onTypingChange: (typing) => {
        this.input.typing = typing;
        if (typing) this.input.keys.clear();
      },
      onAbility: (slot) => this.castAbility(slot),
      onInteract: () => room.send(C2S.interact),
    });

    this.bindNetwork();
    // Debug handle for the browser console / automated tests: open with ?debug
    if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
      (window as unknown as { __rpg: unknown }).__rpg = { room, game: this };
    }
    window.addEventListener("resize", () => this.resize(viewport));
    this.loop();
  }

  private bindNetwork(): void {
    this.room.onMessage(S2C.fx, (e: FxEvent) => this.fx.spawn(e));
    this.room.onMessage(S2C.hit, (e: HitEvent) => this.onHit(e));
    this.room.onMessage(S2C.chat, (e: ChatEvent) => this.hud.chat(e.from, e.text, e.system));
    this.room.onMessage(S2C.notice, (text: string) => this.hud.notice(text));
    this.room.onLeave.once((code: number) => {
      this.running = false;
      const msg = document.createElement("div");
      msg.className = "screen disconnected";
      msg.innerHTML = `<div class="panel"><h2>Disconnected</h2><p>Lost connection to the server (code ${code}).</p><button class="btn btn-primary" onclick="location.reload()">Reconnect</button></div>`;
      document.body.append(msg);
    });
  }

  private onHit(e: HitEvent): void {
    const ent = this.players.get(e.targetId) ?? this.enemies.get(e.targetId);
    if (!ent) return;
    const at = ent.pos.clone().setY(ent.pos.y + ent.avatar.height);
    const isMe = e.targetId === this.room.sessionId;
    const cls = e.heal ? "heal" : isMe ? "hurt" : e.crit ? "crit" : "dmg";
    this.overlay.floatText(at, `${e.heal ? "+" : ""}${e.amount}${e.crit ? "!" : ""}`, cls);
  }

  private resize(viewport: HTMLElement): void {
    const w = viewport.clientWidth;
    const hgt = viewport.clientHeight;
    this.renderer.setSize(w, hgt);
    this.iso.resize(w / hgt);
  }

  private get me(): PlayerView | undefined {
    return this.room.state.players.get(this.room.sessionId);
  }

  // -------------------------------------------------------------------------
  // Input
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

  private castAbility(slot: 0 | 1): void {
    this.room.send(C2S.ability, { slot, x: this.cursor.x, z: this.cursor.z });
  }

  private handleInput(now: number): void {
    const inp = this.input;
    this.updateCursor();

    if (inp.wheel !== 0) {
      this.iso.zoom(inp.wheel, inp.width / inp.height);
      inp.wheel = 0;
    }

    for (const k of inp.consumePressed()) {
      if (k === "enter") this.hud.focusChat();
      else if (k === "i" || k === "b" || k === "c") this.hud.toggleBag();
      else if (k === "h" || k === "?") this.hud.toggleHelp();
      else if (k === "1" || k === "q") this.castAbility(0);
      else if (k === "2" || k === "e") this.castAbility(1);
      else if (k === "f") this.room.send(C2S.interact);
    }

    // Keyboard movement in screen space.
    let sx = 0;
    let sy = 0;
    if (!inp.typing) {
      if (inp.keys.has("w") || inp.keys.has("arrowup")) sy += 1;
      if (inp.keys.has("s") || inp.keys.has("arrowdown")) sy -= 1;
      if (inp.keys.has("d") || inp.keys.has("arrowright")) sx += 1;
      if (inp.keys.has("a") || inp.keys.has("arrowleft")) sx -= 1;
    }
    const dir = this.iso.screenDirToWorld(sx, sy);
    if (dir.x !== this.lastDir.x || dir.z !== this.lastDir.z) {
      this.lastDir = dir;
      this.room.send(C2S.moveDir, dir);
      this.intent.dirX = dir.x;
      this.intent.dirZ = dir.z;
      if (dir.x !== 0 || dir.z !== 0) {
        this.intent.target = null;
        this.attackTarget = null;
      }
    }

    if (inp.leftPressed) {
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
      this.castAbility(0);
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
          const reach = (getClass(me.classId)?.basicAttack.range ?? 2) + (getEnemy(target.kind)?.radius ?? 0.5);
          const inReach = Math.hypot(target.x - this.pred.x, target.z - this.pred.z) <= reach;
          intent = { dirX: 0, dirZ: 0, target: inReach ? null : { x: target.x, z: target.z } };
        }
      }
      let speedBuff = 0;
      me.buffs.forEach((b) => {
        if (b.stat === "speed" && b.expiresAt > serverTime) speedBuff += b.amount;
      });
      const r = stepMovement(this.world, this.pred.x, this.pred.z, intent, BASE_MOVE_SPEED * (1 + speedBuff), dt);
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
  // Entity sync
  // -------------------------------------------------------------------------

  private syncEntities(dt: number, me: PlayerView | undefined): void {
    const state = this.room.state;
    const smooth = 1 - Math.exp(-dt * 12);

    const seenP = new Set<string>();
    state.players.forEach((p, id) => {
      seenP.add(id);
      const look = `${p.classId}.${p.subclassId}.${p.weapon}`;
      let ent = this.players.get(id);
      if (ent && ent.look !== look) {
        this.removeEntity(ent);
        ent = undefined;
      }
      if (!ent) {
        ent = this.makeEntity(createPlayerAvatar(this.assets, p.classId, p.subclassId, p.weapon), p.x, p.z, look);
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

    // Finalise transforms + animation.
    for (const ent of [...this.players.values(), ...this.enemies.values()]) {
      ent.avatar.root.position.copy(ent.pos);
      ent.avatar.root.rotation.y = ent.facing;
      ent.avatar.update(dt, ent.speed);
      if (ent.ring) ent.ring.position.set(ent.pos.x, ent.pos.y + 0.04, ent.pos.z);
    }
    void me;
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

    this.handleInput(now);
    if (me) this.predictLocal(me, dt, state.serverTime);
    this.syncEntities(dt, me);

    const focus = me ? new THREE.Vector3(this.pred.x, groundHeight(this.pred.x, this.pred.z), this.pred.z) : new THREE.Vector3();
    this.iso.follow(focus.x, focus.y, focus.z, dt, time < 0.2);
    this.env.update(dt, time, focus);
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
    this.overlay.endFrame();
    this.overlay.update(dt);

    // HUD at ~15 Hz.
    this.hudTimer -= dt;
    if (me && this.hudTimer <= 0) {
      this.hudTimer = 1 / 15;
      const others: Array<{ name: string; level: number; classId: string; hp: number; maxHp: number }> = [];
      state.players.forEach((p, id) => {
        if (id !== this.room.sessionId) others.push({ name: p.name, level: p.level, classId: p.classId, hp: p.hp, maxHp: p.maxHp });
      });
      this.hud.update(me, state.serverTime, others);
      const hov = this.hovered ? state.enemies.get(this.hovered) : undefined;
      this.hud.setTarget(hov ? (getEnemy(hov.kind)?.name ?? hov.kind) : null, hov?.hp, hov?.maxHp);
      this.hud.setNearWater(isNearWater(this.pred.x, this.pred.z) && me.anim !== "dead");
    }

    this.renderer.domElement.style.cursor = this.hovered ? "crosshair" : "default";
    this.renderer.render(this.scene, this.iso.camera);
  };
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
