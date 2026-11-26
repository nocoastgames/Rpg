/**
 * Authoritative game simulation for one world instance.
 *
 * Deliberately independent of Colyseus networking: the room feeds it player
 * intent and calls `update()` every tick; the game mutates the synced
 * `WorldState` and reports one-off events through the `events` callbacks.
 * That keeps the rules testable without sockets.
 */
import {
  ENEMIES,
  RESOURCES,
  RESPAWN_SECONDS,
  STARTING_ARMOR,
  STARTING_INVENTORY,
  SUBCLASS_UNLOCK_LEVEL,
  INVENTORY_SLOTS,
  MAX_LEVEL,
  MOVE_DEADZONE,
  POOL_RADIUS,
  fromUV,
  poolCenter,
  findInteractable,
  generateWorld,
  getEnemy,
  getItem,
  isFree,
  isInWater,
  mulberry32,
  randomValleyPoint,
  toUV,
  randRange,
  stepMovement,
  xpForNextLevel,
  type AbilityDef,
  type EnemyDef,
  type FxEvent,
  type GateId,
  type HitEvent,
  type JoinOptions,
  type MoveIntent,
  type World,
} from "@rpg/shared";
import { Buff, Enemy, InventorySlot, Player, WorldState } from "../schema/WorldState.ts";
import {
  applyDerived,
  armorFraction,
  critChance,
  damageMultiplier,
  moveSpeed,
  resolveCharacter,
  weaponBonus,
  type ResolvedCharacter,
} from "./stats.ts";

export interface GameEvents {
  hit(e: HitEvent): void;
  fx(e: FxEvent): void;
  /** Private message to one player. */
  notice(playerId: string, text: string): void;
  /** System chat line to everyone. */
  announce(text: string): void;
}

interface PlayerRuntime {
  ch: ResolvedCharacter;
  intent: MoveIntent;
  attackTargetId: string | null;
  nextAttackAt: number;
  respawnAt: number;
  nextDrinkAt: number;
}

interface EnemyRuntime {
  def: EnemyDef;
  homeX: number;
  homeZ: number;
  targetId: string | null;
  nextAttackAt: number;
  wander: { x: number; z: number } | null;
  nextWanderAt: number;
  returning: boolean;
}

const ENEMY_POPULATION = 18;
const ENEMY_RESPAWN_MS = 20_000;
const SAFE_RADIUS = 24;
const XP_SHARE_RADIUS = 20;
const ANIM_HOLD_MS = 350;

export class Game {
  readonly world: World;
  private readonly players = new Map<string, PlayerRuntime>();
  private readonly enemies = new Map<string, EnemyRuntime>();
  private readonly rng: () => number;
  private nextEnemyId = 1;
  private pendingSpawns: number[] = [];
  private now = 0;

  constructor(
    readonly state: WorldState,
    seed: number,
    private readonly events: GameEvents,
  ) {
    state.seed = seed;
    this.world = generateWorld(seed);
    this.rng = mulberry32(seed ^ 0x9e3779b9);
    for (const l of this.world.landmarks) if (l.gate) state.gates.set(l.gate, false);
    for (let i = 0; i < ENEMY_POPULATION; i++) this.spawnEnemy();
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  addPlayer(id: string, opts: JoinOptions): Player {
    const p = new Player();
    p.name = opts.name;
    p.classId = opts.classId;
    p.subclassId = opts.subclassId;
    p.level = 1;
    p.xpNext = xpForNextLevel(1);
    p.cooldowns.push(0, 0);

    const ch = resolveCharacter(p);
    p.weapon = ch.cls.starterWeapon;
    p.armor = STARTING_ARMOR;
    for (const s of STARTING_INVENTORY) this.giveItem(p, s.id, s.qty);

    applyDerived(p, ch);
    p.hp = p.maxHp;
    p.resource = RESOURCES[ch.cls.resource].startsFull ? p.maxResource : 0;

    // Wake up somewhere on the bank near the spawn point, facing the water.
    const spot = this.findFreeSpotNear(this.world.spawn.x, this.world.spawn.z, 3);
    p.x = spot.x;
    p.z = spot.z;
    p.facing = -Math.PI / 2;

    this.state.players.set(id, p);
    this.players.set(id, {
      ch,
      intent: { dirX: 0, dirZ: 0, target: null },
      attackTargetId: null,
      nextAttackAt: 0,
      respawnAt: 0,
      nextDrinkAt: 0,
    });
    return p;
  }

  removePlayer(id: string): void {
    this.state.players.delete(id);
    this.players.delete(id);
    for (const e of this.enemies.values()) if (e.targetId === id) e.targetId = null;
  }

  setMoveDir(id: string, x: number, z: number): void {
    const rt = this.players.get(id);
    if (!rt) return;
    // Keep analog magnitude (0..1) so a half-pushed stick walks slower.
    let len = Math.hypot(x, z);
    if (len < MOVE_DEADZONE) len = 0;
    const scale = len > 1 ? 1 / len : 1;
    rt.intent.dirX = len > 0 ? x * scale : 0;
    rt.intent.dirZ = len > 0 ? z * scale : 0;
    if (len > 0) {
      rt.intent.target = null;
      rt.attackTargetId = null;
    }
  }

  setMoveTo(id: string, x: number, z: number): void {
    const rt = this.players.get(id);
    if (!rt) return;
    rt.intent.target = { x, z };
    rt.attackTargetId = null;
  }

  setAttackTarget(id: string, enemyId: string): void {
    const rt = this.players.get(id);
    if (!rt || !this.state.enemies.has(enemyId)) return;
    rt.attackTargetId = enemyId;
    rt.intent.target = null;
  }

  castAbility(id: string, slot: 0 | 1, x: number, z: number): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || p.anim === "dead") return;
    if (slot === 1 && p.level < SUBCLASS_UNLOCK_LEVEL) {
      this.events.notice(id, `Subclass abilities unlock at level ${SUBCLASS_UNLOCK_LEVEL}.`);
      return;
    }
    const ability = slot === 0 ? rt.ch.cls.ability : rt.ch.sub.ability;
    if ((p.cooldowns[slot] ?? 0) > this.now) return;
    if (p.resource < ability.cost) {
      this.events.notice(id, `Not enough ${RESOURCES[rt.ch.cls.resource].label.toLowerCase()}.`);
      return;
    }
    if (!this.executeAbility(id, p, rt, ability, x, z)) return;

    p.resource -= ability.cost;
    p.cooldowns[slot] = this.now + ability.cooldown * 1000;
    p.anim = "cast";
    p.actionSeq = (p.actionSeq + 1) % 65535;
  }

  useItem(id: string, slot: number): void {
    const p = this.state.players.get(id);
    if (!p || p.anim === "dead") return;
    const inv = p.inventory[slot];
    if (!inv) return;
    const def = getItem(inv.itemId);
    if (!def?.use) {
      this.events.notice(id, def ? `${def.name} can't be used.` : "Nothing there.");
      return;
    }
    if (def.use.type === "heal") {
      const amount = Math.round(p.maxHp * def.use.fraction);
      p.hp = Math.min(p.maxHp, p.hp + amount);
      this.events.hit({ targetId: id, sourceId: id, amount, heal: true });
    } else if (def.use.type === "restoreResource") {
      p.resource = Math.min(p.maxResource, p.resource + def.use.amount);
    }
    if (def.use.type === "restoreResource" && def.use.becomes) {
      inv.itemId = def.use.becomes;
    } else {
      this.takeFromSlot(p, slot, 1);
    }
    this.events.notice(id, `You use the ${def.name}.`);
  }

  interact(id: string): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || p.anim === "dead") return;
    const target = findInteractable(this.world, p.x, p.z);
    if (!target) {
      this.events.notice(id, "There is nothing here to interact with.");
      return;
    }
    if (target.kind === "landmark") {
      const l = target.landmark;
      const open = l.gate ? this.state.gates.get(l.gate) === true : false;
      this.events.notice(id, open && l.openText ? l.openText : l.lockedText);
      return;
    }
    const empty = p.inventory.find((s) => s.itemId === "waterskin_empty");
    if (empty) {
      empty.itemId = "waterskin_full";
      this.events.notice(id, "You fill your waterskin with cold stream water.");
      return;
    }
    if (this.now < rt.nextDrinkAt) return;
    rt.nextDrinkAt = this.now + 5000;
    p.resource = Math.min(p.maxResource, p.resource + 10);
    this.events.notice(id, "You cup your hands and drink from the stream. Refreshing.");
  }

  /** Dev helper: move a player next to a landmark (or "spawn"). */
  teleportToLandmark(id: string, landmarkId: string): boolean {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    const pool = poolCenter();
    const named: Record<string, { x: number; z: number }> = { spawn: this.world.spawn, pool: fromUV(pool.u, pool.v + POOL_RADIUS + 2) };
    const l = named[landmarkId] ?? this.world.landmarks.find((m) => m.id === landmarkId);
    if (!p || !rt || !l) return false;
    const spot = this.findFreeSpotNear(l.x, l.z, 1);
    p.x = spot.x;
    p.z = spot.z;
    rt.intent = { dirX: 0, dirZ: 0, target: null };
    rt.attackTargetId = null;
    return true;
  }

  /** Open or seal a gate (story hook; also exposed as a dev chat command). */
  setGate(gate: GateId, open: boolean): boolean {
    if (!this.state.gates.has(gate)) return false;
    this.state.gates.set(gate, open);
    if (open) this.world.openGates.add(gate);
    else this.world.openGates.delete(gate);
    return true;
  }

  // -------------------------------------------------------------------------
  // Tick
  // -------------------------------------------------------------------------

  update(dtSec: number, nowMs: number): void {
    this.now = nowMs;
    this.state.serverTime = nowMs;
    for (const [id, p] of this.state.players) this.updatePlayer(id, p, dtSec);
    for (const [id, e] of this.state.enemies) this.updateEnemy(id, e, dtSec);
    while (this.pendingSpawns.length && this.pendingSpawns[0]! <= nowMs) {
      this.pendingSpawns.shift();
      this.spawnEnemy();
    }
  }

  private updatePlayer(id: string, p: Player, dt: number): void {
    const rt = this.players.get(id)!;

    if (p.anim === "dead") {
      if (this.now >= rt.respawnAt) this.respawn(p, rt);
      return;
    }

    // Expire buffs.
    for (let i = p.buffs.length - 1; i >= 0; i--) if (p.buffs[i]!.expiresAt <= this.now) p.buffs.splice(i, 1);

    // Resource regen/decay, slow natural HP regen.
    const res = RESOURCES[rt.ch.cls.resource];
    p.resource = Math.max(0, Math.min(p.maxResource, p.resource + res.regenPerSecond * dt));
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.005 * dt);

    // Chase-and-attack takes priority over plain movement.
    let intent = rt.intent;
    if (rt.attackTargetId) {
      const target = this.state.enemies.get(rt.attackTargetId);
      if (!target) {
        rt.attackTargetId = null;
      } else {
        const dist = Math.hypot(target.x - p.x, target.z - p.z);
        const reach = rt.ch.cls.basicAttack.range + (getEnemy(target.kind)?.radius ?? 0.5);
        if (dist > reach) {
          intent = { dirX: 0, dirZ: 0, target: { x: target.x, z: target.z } };
        } else {
          intent = { dirX: 0, dirZ: 0, target: null };
          p.facing = Math.atan2(target.x - p.x, target.z - p.z);
          if (this.now >= rt.nextAttackAt) this.basicAttack(id, p, rt, rt.attackTargetId, target);
        }
      }
    }

    const moved = stepMovement(this.world, p.x, p.z, intent, moveSpeed(p, this.now), dt);
    p.x = moved.x;
    p.z = moved.z;
    if (moved.facing !== null) p.facing = moved.facing;
    if (moved.arrived && intent === rt.intent) rt.intent.target = null;

    const busy = this.now < rt.nextAttackAt - rt.ch.cls.basicAttack.cooldown * 1000 + ANIM_HOLD_MS;
    if (moved.moving) p.anim = "walk";
    else if (!busy && p.anim !== "idle") p.anim = "idle";
  }

  private basicAttack(id: string, p: Player, rt: PlayerRuntime, enemyId: string, target: Enemy): void {
    const atk = rt.ch.cls.basicAttack;
    rt.nextAttackAt = this.now + atk.cooldown * 1000;
    p.anim = "attack";
    p.actionSeq = (p.actionSeq + 1) % 65535;

    const base = randRange(this.rng, atk.damage[0], atk.damage[1]) + weaponBonus(p);
    const crit = this.rng() < critChance(rt.ch);
    const amount = Math.round(base * damageMultiplier(p, rt.ch, this.now) * (crit ? 1.5 : 1));

    this.events.fx({
      kind: atk.kind === "ranged" ? "projectile" : "swing",
      sourceId: id,
      fromX: p.x,
      fromZ: p.z,
      toX: target.x,
      toZ: target.z,
      variant: atk.projectile,
      color: rt.ch.cls.color,
    });

    const res = RESOURCES[rt.ch.cls.resource];
    if (res.gainOnHit) p.resource = Math.min(p.maxResource, p.resource + res.gainOnHit);
    this.damageEnemy(enemyId, target, amount, id, crit);
  }

  // -------------------------------------------------------------------------
  // Abilities
  // -------------------------------------------------------------------------

  /** Returns false if the ability could not be used (no valid target etc.); nothing is spent then. */
  private executeAbility(id: string, p: Player, rt: PlayerRuntime, ability: AbilityDef, x: number, z: number): boolean {
    const eff = ability.effect;
    const color = rt.ch.cls.color;
    // Clamp the aim point to the ability's range.
    let ax = x;
    let az = z;
    const d = Math.hypot(ax - p.x, az - p.z);
    if (ability.range > 0 && d > ability.range) {
      ax = p.x + ((ax - p.x) / d) * ability.range;
      az = p.z + ((az - p.z) / d) * ability.range;
    }
    if (d > 0.01) p.facing = Math.atan2(x - p.x, z - p.z);

    const atk = rt.ch.cls.basicAttack;
    const baseDamage = ((atk.damage[0] + atk.damage[1]) / 2 + weaponBonus(p)) * damageMultiplier(p, rt.ch, this.now);
    const roll = () => {
      const crit = this.rng() < critChance(rt.ch);
      return { crit, mult: crit ? 1.5 : 1 };
    };

    switch (eff.type) {
      case "strike": {
        const targets =
          eff.radius > 0
            ? this.enemiesInRadius(ax, az, eff.radius)
            : this.nearestEnemy(ax, az, 3, p.x, p.z, ability.range + 1);
        if (targets.length === 0) {
          this.events.notice(id, "No target.");
          return false;
        }
        const to = eff.radius > 0 ? { x: ax, z: az } : { x: targets[0]![1].x, z: targets[0]![1].z };
        this.events.fx({ kind: "strike", sourceId: id, fromX: p.x, fromZ: p.z, toX: to.x, toZ: to.z, radius: eff.radius, variant: ability.id, color });
        let dealt = 0;
        for (const [eid, e] of targets) {
          const r = roll();
          const amount = Math.round(baseDamage * eff.multiplier * r.mult);
          dealt += amount;
          this.damageEnemy(eid, e, amount, id, r.crit);
        }
        if (eff.lifesteal) this.healPlayer(id, p, dealt * eff.lifesteal, id);
        return true;
      }
      case "nova": {
        this.events.fx({ kind: "nova", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: eff.radius, variant: ability.id, color });
        for (const [eid, e] of this.enemiesInRadius(p.x, p.z, eff.radius)) {
          const r = roll();
          this.damageEnemy(eid, e, Math.round(baseDamage * eff.multiplier * r.mult), id, r.crit);
        }
        return true;
      }
      case "heal": {
        this.events.fx({ kind: "heal", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: eff.radius, variant: ability.id, color });
        for (const [pid, other] of this.playersInRadius(p.x, p.z, eff.radius, id)) {
          this.healPlayer(pid, other, other.maxHp * eff.fraction, id);
        }
        return true;
      }
      case "dash": {
        const len = Math.hypot(ax - p.x, az - p.z);
        const dist = Math.min(eff.distance, len);
        if (dist < 0.5) return false;
        const fromX = p.x;
        const fromZ = p.z;
        // Walk the dash in small steps so we can't tunnel through trees.
        const steps = Math.ceil(dist / 0.25);
        let cx = p.x;
        let cz = p.z;
        for (let i = 0; i < steps; i++) {
          const m = stepMovement(this.world, cx, cz, { dirX: ax - p.x, dirZ: az - p.z, target: null }, dist / steps, 1);
          cx = m.x;
          cz = m.z;
        }
        p.x = cx;
        p.z = cz;
        rt.intent.target = null;
        this.events.fx({ kind: "dash", sourceId: id, fromX, fromZ, toX: cx, toZ: cz, radius: eff.radius, variant: ability.id, color });
        if (eff.multiplier > 0) {
          for (const [eid, e] of this.enemiesInRadius(cx, cz, eff.radius)) {
            const r = roll();
            this.damageEnemy(eid, e, Math.round(baseDamage * eff.multiplier * r.mult), id, r.crit);
          }
        }
        return true;
      }
      case "buff": {
        this.events.fx({ kind: "buff", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: eff.radius, variant: eff.stat, color });
        for (const [, other] of this.playersInRadius(p.x, p.z, eff.radius, id)) {
          const b = new Buff();
          b.stat = eff.stat;
          b.amount = eff.amount;
          b.expiresAt = this.now + eff.duration * 1000;
          other.buffs.push(b);
        }
        return true;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Damage, healing, death, XP
  // -------------------------------------------------------------------------

  private damageEnemy(enemyId: string, e: Enemy, amount: number, sourceId: string, crit = false): void {
    if (e.hp <= 0) return;
    e.hp = Math.max(0, e.hp - amount);
    this.events.hit({ targetId: enemyId, sourceId, amount, crit });
    const ert = this.enemies.get(enemyId);
    if (ert && !ert.returning) ert.targetId = sourceId;
    if (e.hp <= 0) this.killEnemy(enemyId, e);
  }

  private killEnemy(enemyId: string, e: Enemy): void {
    const def = getEnemy(e.kind);
    this.events.fx({ kind: "death", sourceId: enemyId, fromX: e.x, fromZ: e.z, toX: e.x, toZ: e.z });
    this.state.enemies.delete(enemyId);
    this.enemies.delete(enemyId);
    this.pendingSpawns.push(this.now + ENEMY_RESPAWN_MS);
    if (!def) return;
    for (const [pid, p] of this.playersInRadius(e.x, e.z, XP_SHARE_RADIUS)) this.grantXp(pid, p, def.xp);
    for (const rt of this.players.values()) if (rt.attackTargetId === enemyId) rt.attackTargetId = null;
  }

  private damagePlayer(id: string, p: Player, raw: number, sourceId: string): void {
    if (p.anim === "dead") return;
    const amount = Math.max(1, Math.round(raw * (1 - armorFraction(p, this.now))));
    p.hp = Math.max(0, p.hp - amount);
    this.events.hit({ targetId: id, sourceId, amount });
    const rt = this.players.get(id)!;
    const res = RESOURCES[rt.ch.cls.resource];
    if (res.gainOnHurt) p.resource = Math.min(p.maxResource, p.resource + res.gainOnHurt);
    if (p.hp <= 0) {
      p.anim = "dead";
      rt.respawnAt = this.now + RESPAWN_SECONDS * 1000;
      rt.attackTargetId = null;
      rt.intent = { dirX: 0, dirZ: 0, target: null };
      this.events.fx({ kind: "death", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z });
      this.events.announce(`${p.name} has fallen.`);
      for (const e of this.enemies.values()) if (e.targetId === id) e.targetId = null;
    }
  }

  private healPlayer(id: string, p: Player, amount: number, sourceId: string): void {
    if (p.anim === "dead") return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount);
    const healed = Math.round(p.hp - before);
    if (healed > 0) this.events.hit({ targetId: id, sourceId, amount: healed, heal: true });
  }

  private grantXp(id: string, p: Player, amount: number): void {
    if (p.anim === "dead" || p.level >= MAX_LEVEL) return;
    p.xp += amount;
    while (p.xp >= p.xpNext && p.level < MAX_LEVEL) {
      p.xp -= p.xpNext;
      p.level += 1;
      p.xpNext = xpForNextLevel(p.level);
      const rt = this.players.get(id)!;
      rt.ch = resolveCharacter(p);
      applyDerived(p, rt.ch);
      p.hp = p.maxHp;
      this.events.fx({ kind: "levelup", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z });
      this.events.announce(`${p.name} reached level ${p.level}!`);
    }
  }

  private respawn(p: Player, rt: PlayerRuntime): void {
    const spot = this.findFreeSpotNear(this.world.spawn.x, this.world.spawn.z, 3);
    p.x = spot.x;
    p.z = spot.z;
    p.hp = p.maxHp;
    p.resource = RESOURCES[rt.ch.cls.resource].startsFull ? p.maxResource : 0;
    p.anim = "idle";
    p.buffs.clear();
    rt.intent = { dirX: 0, dirZ: 0, target: null };
  }

  // -------------------------------------------------------------------------
  // Enemies
  // -------------------------------------------------------------------------

  private spawnEnemy(): void {
    for (let attempt = 0; attempt < 40; attempt++) {
      const pos = randomValleyPoint(this.world, this.rng);
      if (Math.hypot(pos.x - this.world.spawn.x, pos.z - this.world.spawn.z) < SAFE_RADIUS) continue;
      const def = this.pickEnemyFor(pos.x, pos.z);
      if (!isFree(this.world, pos.x, pos.z, def.radius)) continue;
      const id = `e${this.nextEnemyId++}`;
      const e = new Enemy();
      e.kind = def.id;
      e.x = pos.x;
      e.z = pos.z;
      e.facing = randRange(this.rng, 0, Math.PI * 2);
      e.hp = def.maxHp;
      e.maxHp = def.maxHp;
      this.state.enemies.set(id, e);
      this.enemies.set(id, {
        def,
        homeX: pos.x,
        homeZ: pos.z,
        targetId: null,
        nextAttackAt: 0,
        wander: null,
        nextWanderAt: 0,
        returning: false,
      });
      return;
    }
  }

  /** Regional spawns: thornlings near the ruins and cave (west), wolves in the north, boars in the east and south. */
  private pickEnemyFor(x: number, z: number): EnemyDef {
    const { u, v } = toUV(x, z);
    const byId = (id: string) => ENEMIES.find((e) => e.id === id) ?? ENEMIES[0]!;
    const r = this.rng();
    if (u < -15) return byId(r < 0.7 ? "thornling" : "wolf");
    if (v < -25) return byId(r < 0.7 ? "wolf" : "boar");
    return byId(r < 0.6 ? "boar" : "wolf");
  }

  private updateEnemy(id: string, e: Enemy, dt: number): void {
    const rt = this.enemies.get(id);
    if (!rt) return;
    const def = rt.def;
    const homeDist = Math.hypot(e.x - rt.homeX, e.z - rt.homeZ);

    // Leash: give up and walk home, healing on the way.
    if (homeDist > def.leashRange) {
      rt.returning = true;
      rt.targetId = null;
    }
    if (rt.returning) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt);
      if (homeDist < 1.5) rt.returning = false;
      this.moveEnemy(e, def, { x: rt.homeX, z: rt.homeZ }, def.moveSpeed, dt);
      return;
    }

    // Acquire a target.
    if (!rt.targetId) {
      let best: string | null = null;
      let bestDist = def.aggroRange;
      for (const [pid, p] of this.state.players) {
        if (p.anim === "dead") continue;
        const dist = Math.hypot(p.x - e.x, p.z - e.z);
        if (dist < bestDist) {
          bestDist = dist;
          best = pid;
        }
      }
      rt.targetId = best;
    }

    const target = rt.targetId ? this.state.players.get(rt.targetId) : undefined;
    if (rt.targetId && (!target || target.anim === "dead")) rt.targetId = null;

    if (target && target.anim !== "dead") {
      const dist = Math.hypot(target.x - e.x, target.z - e.z);
      if (dist > def.attackRange) {
        this.moveEnemy(e, def, { x: target.x, z: target.z }, def.moveSpeed, dt);
      } else {
        e.facing = Math.atan2(target.x - e.x, target.z - e.z);
        if (this.now >= rt.nextAttackAt) {
          rt.nextAttackAt = this.now + def.attackCooldown * 1000;
          e.anim = "attack";
          e.actionSeq = (e.actionSeq + 1) % 65535;
          this.events.fx({ kind: "swing", sourceId: id, fromX: e.x, fromZ: e.z, toX: target.x, toZ: target.z });
          this.damagePlayer(rt.targetId!, target, randRange(this.rng, def.damage[0], def.damage[1]), id);
        } else if (this.now > rt.nextAttackAt - def.attackCooldown * 1000 + ANIM_HOLD_MS) {
          e.anim = "idle";
        }
      }
      return;
    }

    // Idle wandering around home.
    if (!rt.wander && this.now >= rt.nextWanderAt) {
      const a = randRange(this.rng, 0, Math.PI * 2);
      const r = randRange(this.rng, 2, 7);
      rt.wander = { x: rt.homeX + Math.cos(a) * r, z: rt.homeZ + Math.sin(a) * r };
    }
    if (rt.wander) {
      const arrived = this.moveEnemy(e, def, rt.wander, def.moveSpeed * 0.35, dt);
      if (arrived) {
        rt.wander = null;
        rt.nextWanderAt = this.now + randRange(this.rng, 2000, 7000);
      }
    } else {
      e.anim = "idle";
    }
  }

  /** Returns true when the destination was reached (or movement is blocked). */
  private moveEnemy(e: Enemy, def: EnemyDef, to: { x: number; z: number }, speed: number, dt: number): boolean {
    const m = stepMovement(this.world, e.x, e.z, { dirX: 0, dirZ: 0, target: to }, speed, dt, def.radius);
    const progressed = Math.hypot(m.x - e.x, m.z - e.z);
    e.x = m.x;
    e.z = m.z;
    if (m.facing !== null) e.facing = m.facing;
    e.anim = m.moving ? "walk" : "idle";
    return m.arrived || (m.moving && progressed < speed * dt * 0.1);
  }

  // -------------------------------------------------------------------------
  // Queries & helpers
  // -------------------------------------------------------------------------

  private enemiesInRadius(x: number, z: number, radius: number): Array<[string, Enemy]> {
    const out: Array<[string, Enemy]> = [];
    for (const [id, e] of this.state.enemies) {
      const r = radius + (getEnemy(e.kind)?.radius ?? 0.5);
      if (Math.hypot(e.x - x, e.z - z) <= r) out.push([id, e]);
    }
    return out;
  }

  /** Nearest enemy to (x,z) within `pickRadius`, that is also within `maxRange` of the caster. */
  private nearestEnemy(x: number, z: number, pickRadius: number, cx: number, cz: number, maxRange: number): Array<[string, Enemy]> {
    let best: [string, Enemy] | null = null;
    let bestDist = pickRadius;
    for (const [id, e] of this.state.enemies) {
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < bestDist && Math.hypot(e.x - cx, e.z - cz) <= maxRange) {
        bestDist = d;
        best = [id, e];
      }
    }
    return best ? [best] : [];
  }

  private playersInRadius(x: number, z: number, radius: number, alwaysInclude?: string): Array<[string, Player]> {
    const out: Array<[string, Player]> = [];
    for (const [id, p] of this.state.players) {
      if (p.anim === "dead") continue;
      if (id === alwaysInclude || Math.hypot(p.x - x, p.z - z) <= radius) out.push([id, p]);
    }
    return out;
  }

  private findFreeSpotNear(x: number, z: number, spread: number): { x: number; z: number } {
    for (let i = 0; i < 30; i++) {
      const cx = x + randRange(this.rng, -spread, spread);
      const cz = z + randRange(this.rng, -spread, spread);
      if (!isInWater(cx, cz) && isFree(this.world, cx, cz)) return { x: cx, z: cz };
    }
    return { x, z };
  }

  private giveItem(p: Player, itemId: string, qty: number): boolean {
    const def = getItem(itemId);
    if (!def) return false;
    if (def.stackable) {
      const existing = p.inventory.find((s) => s.itemId === itemId);
      if (existing) {
        existing.qty += qty;
        return true;
      }
    }
    if (p.inventory.length >= INVENTORY_SLOTS) return false;
    const slot = new InventorySlot();
    slot.itemId = itemId;
    slot.qty = qty;
    p.inventory.push(slot);
    return true;
  }

  private takeFromSlot(p: Player, slot: number, qty: number): void {
    const s = p.inventory[slot];
    if (!s) return;
    s.qty -= qty;
    if (s.qty <= 0) p.inventory.splice(slot, 1);
  }
}
