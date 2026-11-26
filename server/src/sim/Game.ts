/**
 * Authoritative game simulation for one world instance.
 *
 * Deliberately independent of Colyseus networking: the room feeds it player
 * intent and calls `update()` every tick; the game mutates the synced
 * `WorldState` and reports one-off events through the `events` callbacks.
 * That keeps the rules testable without sockets.
 */
import {
  CAMP,
  FIRST_QUEST,
  REST,
  ZONES,
  enemyStats,
  getQuest,
  getStatus,
  prayedFlag,
  RESOURCES,
  RESPAWN_SECONDS,
  STARTING_ARMOR,
  STARTING_INVENTORY,
  ABILITY_SLOTS,
  advancementOptions,
  companionFor,
  getClassNode,
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
  randRange,
  STAT_IDS,
  FAITHS,
  blessingInfo,
  favorQuestOutcome,
  getFaith,
  getBackground,
  memoriesAt,
  backgroundRevealed,
  stepMovement,
  xpForNextLevel,
  type AbilityDef,
  type CompanionPower,
  type EnemyDef,
  type GatherNode,
  type LandmarkDef,
  type QuestObjective,
  type StatusId,
  type ZoneDef,
  type FxEvent,
  type GateId,
  type HitEvent,
  type CreationChoices,
  type MemoryEvent,
  type MoveIntent,
  type World,
} from "@rpg/shared";
import { Buff, Companion, Enemy, InventorySlot, Player, StatusEffect, WorldState } from "../schema/WorldState.ts";
import {
  applyDerived,
  armorFraction,
  averageHit,
  bonus,
  critChance,
  damageMultiplier,
  moveSpeed,
  resolveCharacter,
  waterMultiplier,
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
  /** A recovered memory, sent only to that player. */
  memory(playerId: string, e: MemoryEvent): void;
}

interface PlayerRuntime {
  ch: ResolvedCharacter;
  intent: MoveIntent;
  attackTargetId: string | null;
  nextAttackAt: number;
  respawnAt: number;
  nextDrinkAt: number;
  /** Next whole-second tick of damage-over-time statuses. */
  nextDotAt: number;
  /** Shrines answer again after a short while. */
  nextPrayAt: number;
  /** Timed action in progress (gathering, building); finishes unless interrupted. */
  channel: (() => void) | null;
}

interface EnemyRuntime {
  def: EnemyDef;
  zone: ZoneDef;
  level: number;
  damage: [number, number];
  xp: number;
  homeX: number;
  homeZ: number;
  targetId: string | null;
  nextAttackAt: number;
  wander: { x: number; z: number } | null;
  nextWanderAt: number;
  returning: boolean;
}

interface CompanionRuntime {
  ownerId: string;
  power: CompanionPower;
  ranged: boolean;
  nextAttackAt: number;
  targetId: string | null;
  respawnAt: number;
}

/** Companion strength relative to its owner, by power. Pet classes' companions are far stronger at 50. */
const COMPANION_POWER: Record<CompanionPower, { hp: number; damage: number; cooldown: number }> = {
  familiar: { hp: 0.3, damage: 0.3, cooldown: 1.4 },
  // Young pets (level 25 on a pet line): a little above a familiar, so the line's non-pet end class doesn't feel a big drop.
  pet: { hp: 0.4, damage: 0.4, cooldown: 1.25 },
  empowered: { hp: 1.3, damage: 1.15, cooldown: 0.85 },
};
const FLYING_KINDS = new Set(["hawk", "raven", "owl", "dove", "crane", "parrot", "songbird", "phoenix", "wisp"]);
const COMPANION_SPEED = 6.5;
const COMPANION_RESPAWN_MS = 12_000;

/** Creatures don't spawn this close to where players wake or to the campsite. */
const SPAWN_SAFE_RADIUS = 16;
const PRAY_COOLDOWN_MS = 30_000;
/** Nothing spawns this close to a shrine. */
const SHRINE_SANCTUARY = 12;
/** Enemies this close and chasing you stop you from resting. */
const REST_DANGER_RADIUS = 16;

const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
const capitalize = (w: string) => w[0]!.toUpperCase() + w.slice(1);
const ENEMY_RESPAWN_MS = 20_000;
const XP_SHARE_RADIUS = 20;
const ANIM_HOLD_MS = 350;

export class Game {
  readonly world: World;
  private readonly players = new Map<string, PlayerRuntime>();
  private readonly enemies = new Map<string, EnemyRuntime>();
  private readonly companions = new Map<string, CompanionRuntime>();
  private readonly rng: () => number;
  private nextEnemyId = 1;
  private pendingSpawns: Array<{ at: number; zone: ZoneDef }> = [];
  private readonly campPos: { x: number; z: number };
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
    this.campPos = fromUV(CAMP.u, CAMP.v);
    this.repopulate();
  }

  // -------------------------------------------------------------------------
  // Players
  // -------------------------------------------------------------------------

  addPlayer(id: string, opts: CreationChoices): Player {
    const p = new Player();
    p.name = opts.name;
    p.classId = opts.classId;
    p.background = opts.backgroundId;
    p.faith = opts.faithId;
    for (const s of STAT_IDS) p.alloc.push(opts.alloc[s]);
    Object.assign(p.appearance, opts.appearance);
    p.level = 1;
    p.xpNext = xpForNextLevel(1);
    for (let i = 0; i < ABILITY_SLOTS; i++) p.cooldowns.push(0);

    const ch = resolveCharacter(p);
    p.weapon = ch.kit.base.starterWeapon;
    p.armor = STARTING_ARMOR;
    for (const s of STARTING_INVENTORY) this.giveItem(p, s.id, s.qty);
    const bg = getBackground(opts.backgroundId);
    if (bg) this.giveItem(p, bg.item, 1);

    applyDerived(p, ch);
    p.hp = p.maxHp;
    p.resource = RESOURCES[ch.kit.base.resource].startsFull ? p.maxResource : 0;

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
      nextDotAt: 0,
      nextPrayAt: 0,
      channel: null,
    });
    p.activeQuest = FIRST_QUEST;
    return p;
  }

  removePlayer(id: string): void {
    this.removeCompanion(id);
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
      this.cancelChannel(id);
    }
  }

  setMoveTo(id: string, x: number, z: number): void {
    const rt = this.players.get(id);
    if (!rt) return;
    rt.intent.target = { x, z };
    rt.attackTargetId = null;
    this.cancelChannel(id);
  }

  setAttackTarget(id: string, enemyId: string): void {
    const rt = this.players.get(id);
    if (!rt || !this.state.enemies.has(enemyId)) return;
    rt.attackTargetId = enemyId;
    rt.intent.target = null;
    this.cancelChannel(id);
  }

  castAbility(id: string, slot: number, x: number, z: number): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || p.anim === "dead") return;
    const ability = rt.ch.kit.abilities[slot];
    if (!ability) {
      this.events.notice(id, "You haven't learned that ability yet.");
      return;
    }
    if ((p.cooldowns[slot] ?? 0) > this.now) return;
    if (p.resource < ability.cost) {
      this.events.notice(id, `Not enough ${RESOURCES[rt.ch.kit.base.resource].label.toLowerCase()}.`);
      return;
    }
    if (!this.executeAbility(id, p, rt, ability, x, z)) return;
    this.cancelChannel(id);

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
      const amount = Math.round(p.maxHp * def.use.fraction * (1 + bonus(p, "foodHealing")));
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
    if (!p || !rt || p.anim === "dead" || rt.channel) return;
    const target = findInteractable(this.world, p.x, p.z, (n) => this.wantsNode(p, n));
    if (!target) {
      this.events.notice(id, "There is nothing here to interact with.");
      return;
    }
    if (target.kind === "node") {
      this.gather(id, p, rt, target.node);
      return;
    }
    if (target.kind === "landmark") {
      const l = target.landmark;
      if (l.kind === "shrine") this.pray(id, p, rt, l);
      else if (l.kind === "camp") this.useCamp(id, p, rt, l);
      else {
        const open = l.gate ? this.state.gates.get(l.gate) === true : false;
        this.events.notice(id, open && l.openText ? l.openText : l.lockedText);
      }
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

  // -------------------------------------------------------------------------
  // Shrines
  // -------------------------------------------------------------------------

  /**
   * A shrine calls to its god's followers. The first prayer there receives
   * the god's blessing; after that it cures every status effect and heals.
   */
  private pray(id: string, p: Player, rt: PlayerRuntime, l: LandmarkDef): void {
    const god = getFaith(l.faith ?? "");
    if (!god) return;
    if (p.faith !== god.id) {
      const quest = god.favorQuest ? ` Completing ${god.favorQuest.name} would make ${god.name} your god.` : "";
      this.events.notice(id, `${l.lockedText} It is a shrine to ${god.name}, ${god.title}. It does not answer you.${quest}`);
      return;
    }
    const first = !p.quests.includes(prayedFlag(god.id));
    if (!first && this.now < rt.nextPrayAt) {
      this.events.notice(id, `The shrine's light is dim. ${god.name} will answer again soon.`);
      return;
    }
    rt.nextPrayAt = this.now + PRAY_COOLDOWN_MS;
    if (first) p.quests.push(prayedFlag(god.id));
    applyDerived(p, rt.ch); // a blessing can change max resource
    const cured = p.statuses.length > 0;
    p.statuses.clear();
    const before = p.hp;
    p.hp = p.maxHp;
    p.resource = Math.max(p.resource, RESOURCES[rt.ch.kit.base.resource].startsFull ? p.maxResource : p.resource);
    this.events.fx({ kind: "heal", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: 2.5, color: god.color });
    if (p.hp > before) this.events.hit({ targetId: id, sourceId: id, amount: Math.round(p.hp - before), heal: true });
    if (first) {
      const info = blessingInfo(p.faith, p.classId, p.quests);
      this.events.notice(
        id,
        info.status === "active"
          ? `You kneel and pray. ${god.name} answers: their blessing settles on you. ${god.blessingText}.`
          : info.status === "needsQuest"
            ? `You kneel and pray. ${god.name} hears you, but your path is not yet theirs. Complete ${god.favorQuest?.name ?? "their epic quest"} and the blessing will follow.`
            : `You kneel and pray. ${god.name} hears you, but will never bless a path like yours.`,
      );
    } else {
      this.events.notice(id, cured ? `${god.name} answers. Your wounds close and the sickness leaves you.` : `${god.name} answers. Your wounds close.`);
    }
  }

  // -------------------------------------------------------------------------
  // Campsite
  // -------------------------------------------------------------------------

  private useCamp(id: string, p: Player, rt: PlayerRuntime, l: LandmarkDef): void {
    const step = this.currentStep(p);
    if (step?.objective.type === "interact" && step.objective.landmark === l.id) {
      const o = step.objective;
      this.startChannel(id, p, rt, o.seconds ?? 0, this.state.campBuilt ? "Adding to the camp" : "Building your camp", () => this.buildCamp(id, p, l, o));
      return;
    }
    if (!this.state.campBuilt) {
      this.events.notice(id, p.activeQuest === "make_camp" ? `${l.lockedText} You'll need firewood, stones and hides first.` : l.lockedText);
      return;
    }
    this.rest(id, p, rt);
  }

  private buildCamp(id: string, p: Player, l: LandmarkDef, o: QuestObjective): void {
    const already = this.state.campBuilt;
    this.state.campBuilt = true;
    this.events.fx({ kind: "levelup", sourceId: id, fromX: l.x, fromZ: l.z, toX: l.x, toZ: l.z, color: "#ff9a3a" });
    if (already) this.events.notice(id, "You add your wood, stones and hides to the camp. It's sturdier for it.");
    else this.events.announce(`${p.name} has made camp in the clearing.`);
    this.progressQuest(id, p, o, 1);
    if (!p.activeQuest) this.events.notice(id, "Rest by the fire (interact) to recover and become Well Rested. Resting stirs the valley's creatures back to life.");
  }

  /** Rest at the camp: heal, cure, Well Rested, and every creature in the valley returns. */
  private rest(id: string, p: Player, rt: PlayerRuntime): void {
    for (const [eid, ert] of this.enemies) {
      const e = this.state.enemies.get(eid);
      if (ert.targetId === id && e && Math.hypot(e.x - p.x, e.z - p.z) < REST_DANGER_RADIUS) {
        this.events.notice(id, "You can't rest with enemies nearby.");
        return;
      }
    }
    p.hp = p.maxHp;
    p.resource = RESOURCES[rt.ch.kit.base.resource].startsFull ? p.maxResource : p.resource;
    p.statuses.clear();
    for (let i = p.buffs.length - 1; i >= 0; i--) if (p.buffs[i]!.stat === REST.buffStat) p.buffs.splice(i, 1);
    const b = new Buff();
    b.stat = REST.buffStat;
    b.amount = REST.xpBonus;
    b.expiresAt = this.now + REST.durationSec * 1000;
    p.buffs.push(b);
    this.events.fx({ kind: "buff", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: 2, variant: REST.buffStat, color: "#ffb35a" });
    const returned = this.repopulate();
    this.events.notice(
      id,
      `You rest by the fire and wake Well Rested: +${Math.round(REST.xpBonus * 100)}% experience and faster healing for ${REST.durationSec / 60} minutes.` +
        (returned > 0 ? " Out in the valley, creatures stir." : ""),
    );
  }

  // -------------------------------------------------------------------------
  // Quests
  // -------------------------------------------------------------------------

  private currentStep(p: Player) {
    return getQuest(p.activeQuest)?.steps[p.questStep];
  }

  /** Can this player pick up this node right now? (Their current step wants it and they haven't taken it.) */
  private wantsNode(p: Player, n: GatherNode): boolean {
    const o = this.currentStep(p)?.objective;
    return o?.type === "gather" && o.node === n.kind && !p.gathered.includes(n.id);
  }

  private gather(id: string, p: Player, rt: PlayerRuntime, n: GatherNode): void {
    const o = this.currentStep(p)?.objective;
    if (!o || o.type !== "gather" || !this.wantsNode(p, n)) return;
    p.facing = Math.atan2(n.x - p.x, n.z - p.z);
    this.startChannel(id, p, rt, o.seconds ?? 0, n.kind === "deadfall" ? "Gathering branches" : "Prying the stone loose", () => {
      if (!this.wantsNode(p, n)) return;
      p.gathered.push(n.id);
      this.events.fx({ kind: "buff", sourceId: id, fromX: n.x, fromZ: n.z, toX: n.x, toZ: n.z, radius: 0.8, variant: "gather", color: "#e8d28a" });
      this.progressQuest(id, p, o, 1);
    });
  }

  // -------------------------------------------------------------------------
  // Timed actions
  // -------------------------------------------------------------------------

  /** Work for a few seconds (gathering, building). Moving, attacking or being hit interrupts it. */
  private startChannel(id: string, p: Player, rt: PlayerRuntime, seconds: number, label: string, done: () => void): void {
    if (seconds <= 0) {
      done();
      return;
    }
    rt.channel = done;
    rt.intent = { dirX: 0, dirZ: 0, target: null };
    rt.attackTargetId = null;
    p.channelLabel = label;
    p.channelStart = this.now;
    p.channelEnd = this.now + seconds * 1000;
    p.anim = "cast";
    p.actionSeq = (p.actionSeq + 1) % 65535;
  }

  private cancelChannel(id: string, reason?: string): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt?.channel) return;
    rt.channel = null;
    p.channelLabel = "";
    p.channelEnd = 0;
    if (p.anim === "cast") p.anim = "idle";
    if (reason) this.events.notice(id, reason);
  }

  private updateChannel(p: Player, rt: PlayerRuntime): void {
    if (!rt.channel || this.now < p.channelEnd) return;
    const done = rt.channel;
    rt.channel = null;
    p.channelLabel = "";
    p.channelEnd = 0;
    p.anim = "idle";
    done();
  }

  /** Count progress toward the current step if `o` matches it; finish steps and quests. */
  private progressQuest(id: string, p: Player, o: QuestObjective, amount: number): void {
    const quest = getQuest(p.activeQuest);
    const step = quest?.steps[p.questStep];
    if (!quest || !step || !sameObjective(step.objective, o)) return;
    const so = step.objective;
    if (so.type === "kill" && so.chance !== undefined && amount < 255 && this.rng() >= so.chance) {
      if (so.failText) this.events.notice(id, so.failText);
      return;
    }
    const need = step.objective.type === "interact" ? 1 : step.objective.count;
    p.questCount = Math.min(need, p.questCount + amount);
    if (p.questCount < need) return;
    this.events.notice(id, `${step.title}: ${step.doneText}`);
    p.questStep += 1;
    p.questCount = 0;
    this.grantXp(id, p, step.xp, false);
    if (p.questStep >= quest.steps.length) {
      p.activeQuest = "";
      p.questStep = 0;
      p.gathered.clear();
      if (!p.quests.includes(quest.id)) p.quests.push(quest.id);
      this.events.fx({ kind: "levelup", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, color: "#ffd54a" });
      this.events.notice(id, `Quest complete: ${quest.name}.`);
    } else {
      this.events.notice(id, `Next: ${quest.steps[p.questStep]!.text}`);
    }
  }

  /** Dev helper: finish the current quest step (or the whole quest). */
  devFinishQuestStep(id: string, all = false): boolean {
    const p = this.state.players.get(id);
    if (!p || !p.activeQuest) return false;
    do {
      const step = this.currentStep(p);
      if (!step) break;
      if (step.objective.type === "interact" && step.objective.landmark === "campsite") this.state.campBuilt = true;
      this.progressQuest(id, p, step.objective, 255);
    } while (all && p.activeQuest);
    return true;
  }

  // -------------------------------------------------------------------------
  // Status effects
  // -------------------------------------------------------------------------

  private inflict(p: Player, status: StatusId): void {
    const def = getStatus(status);
    if (!def) return;
    const existing = p.statuses.find((s) => s.id === status);
    const until = this.now + def.duration * 1000;
    if (existing) existing.expiresAt = until;
    else {
      const s = new StatusEffect();
      s.id = status;
      s.expiresAt = until;
      p.statuses.push(s);
    }
  }

  private updateStatuses(id: string, p: Player, rt: PlayerRuntime): void {
    for (let i = p.statuses.length - 1; i >= 0; i--) if (p.statuses[i]!.expiresAt <= this.now) p.statuses.splice(i, 1);
    if (p.statuses.length === 0) {
      rt.nextDotAt = this.now + 1000;
      return;
    }
    if (this.now < rt.nextDotAt) return;
    rt.nextDotAt = this.now + 1000;
    let dot = 0;
    for (const s of p.statuses) dot += getStatus(s.id)?.dps ?? 0;
    if (dot > 0) this.damagePlayer(id, p, dot, "status", true);
  }

  // -------------------------------------------------------------------------
  // Class advancement
  // -------------------------------------------------------------------------

  /** Advance to a child class. Permanent; checks level and gate quests. */
  advance(id: string, classId: string): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt) return;
    const next = advancementOptions(p.classId);
    const choice = getClassNode(classId);
    if (!next || !choice || !next.options.some((o) => o.id === classId)) {
      this.events.notice(id, "That path isn't open to you.");
      return;
    }
    if (p.level < next.level) {
      this.events.notice(id, `You must reach level ${next.level} to become ${article(choice.name)} ${choice.name}.`);
      return;
    }
    if (next.quest && !p.quests.includes(next.quest.id)) {
      this.events.notice(id, `Complete the ${next.quest.name} to advance.`);
      return;
    }
    const blessingBefore = blessingInfo(p.faith, p.classId, p.quests).status;
    p.classId = classId;
    rt.ch = resolveCharacter(p);
    applyDerived(p, rt.ch);
    p.hp = p.maxHp;
    this.events.fx({ kind: "levelup", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, color: choice.color });
    this.events.announce(`${p.name} has become ${article(choice.name)} ${choice.name}!`);
    this.events.notice(id, `You learned ${choice.ability.name}.`);
    const info = blessingInfo(p.faith, classId, p.quests);
    const faith = getFaith(p.faith);
    if (faith && info.status !== blessingBefore) {
      if (info.status === "active") this.events.notice(id, `${faith.name}'s blessing settles on you: ${faith.blessingText}.`);
      else if (info.status === "awaitsPrayer") this.events.notice(id, `${faith.name} now favours your path. Pray at their shrine to receive the blessing.`);
      else if (info.status === "needsQuest") this.events.notice(id, `${faith.name}'s favour fades from your new path. Complete ${faith.favorQuest?.name ?? "an epic quest"} to win it back.`);
      else if (info.status === "opposed") this.events.notice(id, `${faith.name} will never bless a path like yours. Another god's epic quest could make them your god.`);
    }
    this.syncCompanion(id);
    const c = companionFor(classId);
    if (c) this.events.notice(id, c.power === "familiar" ? `${capitalize(article(c.def.name))} ${c.def.name} has chosen you as its companion.` : `Your ${c.def.name} answers your call.`);
  }

  /** Send any memory fragments unlocked by the player's level. */
  private recallMemories(id: string, p: Player): void {
    const memories = memoriesAt(p.background, p.level);
    const bg = getBackground(p.background);
    while (p.memories < memories.length && bg) {
      const m = memories[p.memories]!;
      p.memories += 1;
      const done = p.memories === bg.memories.length && backgroundRevealed(p.background, p.level);
      this.events.memory(id, { text: m.text, revealed: done ? bg.name : undefined, passive: done ? bg.passiveText : undefined });
    }
  }

  completeQuest(id: string, questId: string): boolean {
    const p = this.state.players.get(id);
    if (!p) return false;
    // Epic quests of the gods: completing one makes that god your god.
    if (FAITHS.some((f) => f.favorQuest?.id === questId)) {
      const outcome = favorQuestOutcome(p.faith, p.classId, questId, p.quests, p.abandoned);
      if (!outcome.ok) {
        this.events.notice(id, outcome.reason);
        return false;
      }
      const previous = getFaith(p.faith);
      if (previous?.blessing && previous.id !== outcome.newFaith.id) p.abandoned.push(previous.id);
      p.faith = outcome.newFaith.id;
      if (!p.quests.includes(questId)) p.quests.push(questId);
      const god = outcome.newFaith;
      this.events.notice(
        id,
        previous && previous.id !== god.id
          ? `You turn from ${previous.name} to ${god.name}. Pray at their shrine to receive their blessing (${god.blessingText}).`
          : `${god.name} accepts your devotion.${p.quests.includes(prayedFlag(god.id)) ? ` Blessing: ${god.blessingText}.` : " Pray at their shrine to receive their blessing."}`,
      );
      if (previous && previous.id !== god.id) this.events.announce(`${p.name} now follows ${god.name}.`);
    } else if (!p.quests.includes(questId)) {
      p.quests.push(questId);
    }
    const rt = this.players.get(id);
    if (rt) applyDerived(p, rt.ch); // max resource etc. may change with a blessing
    return true;
  }

  /** Dev helper: jump to a level. */
  setLevel(id: string, level: number): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt) return;
    p.level = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
    p.xp = 0;
    p.xpNext = xpForNextLevel(p.level);
    rt.ch = resolveCharacter(p);
    applyDerived(p, rt.ch);
    p.hp = p.maxHp;
    this.recallMemories(id, p);
    this.syncCompanion(id);
  }

  // -------------------------------------------------------------------------
  // Companions (pets and familiars)
  // -------------------------------------------------------------------------

  /** Make the player's companion match their class: spawn, upgrade or remove it. */
  private syncCompanion(ownerId: string): void {
    const p = this.state.players.get(ownerId);
    if (!p) return;
    const want = companionFor(p.classId);
    const cid = `c:${ownerId}`;
    const existing = this.state.companions.get(cid);
    if (!want) {
      this.removeCompanion(ownerId);
      return;
    }
    if (existing && existing.kind === want.def.kind && existing.power === want.power && existing.name === want.def.name) return;
    const c = existing ?? new Companion();
    c.owner = ownerId;
    c.kind = want.def.kind;
    c.name = want.def.name;
    c.color = want.def.color;
    c.scale = want.def.scale ?? 1;
    c.power = want.power;
    c.maxHp = Math.round(p.maxHp * COMPANION_POWER[want.power].hp);
    c.hp = c.maxHp;
    c.anim = "idle";
    if (!existing) {
      const spot = this.findFreeSpotNear(p.x, p.z, 1.5);
      c.x = spot.x;
      c.z = spot.z;
      this.state.companions.set(cid, c);
    }
    this.companions.set(cid, {
      ownerId,
      power: want.power,
      ranged: FLYING_KINDS.has(want.def.kind),
      nextAttackAt: 0,
      targetId: null,
      respawnAt: 0,
    });
    this.events.fx({ kind: "heal", sourceId: cid, fromX: c.x, fromZ: c.z, toX: c.x, toZ: c.z, radius: 1.2, color: c.color });
  }

  private removeCompanion(ownerId: string): void {
    const cid = `c:${ownerId}`;
    this.state.companions.delete(cid);
    this.companions.delete(cid);
    for (const e of this.enemies.values()) if (e.targetId === cid) e.targetId = null;
  }

  private updateCompanion(cid: string, c: Companion, dt: number): void {
    const rt = this.companions.get(cid);
    const owner = rt ? this.state.players.get(rt.ownerId) : undefined;
    const ort = rt ? this.players.get(rt.ownerId) : undefined;
    if (!rt || !owner || !ort) return;
    const power = COMPANION_POWER[rt.power];
    c.maxHp = Math.round(owner.maxHp * power.hp);

    if (c.anim === "dead") {
      if (this.now >= rt.respawnAt) {
        const spot = this.findFreeSpotNear(owner.x, owner.z, 1.5);
        c.x = spot.x;
        c.z = spot.z;
        c.hp = c.maxHp;
        c.anim = "idle";
      }
      return;
    }
    c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.02 * dt);

    // Too far behind (teleport, respawn, dash): catch up instantly.
    const ownerDist = Math.hypot(owner.x - c.x, owner.z - c.z);
    if (ownerDist > 24) {
      const spot = this.findFreeSpotNear(owner.x, owner.z, 1.5);
      c.x = spot.x;
      c.z = spot.z;
      rt.targetId = null;
      return;
    }

    // Pick a target: whatever the owner is attacking, else whatever is attacking the owner or us.
    if (owner.anim === "dead") rt.targetId = null;
    let target = rt.targetId ? this.state.enemies.get(rt.targetId) : undefined;
    if (!target) rt.targetId = null;
    if (ort.attackTargetId && this.state.enemies.has(ort.attackTargetId)) rt.targetId = ort.attackTargetId;
    if (!rt.targetId && owner.anim !== "dead") {
      for (const [eid, ert] of this.enemies) {
        if (ert.targetId === rt.ownerId || ert.targetId === cid) {
          const e = this.state.enemies.get(eid);
          if (e && Math.hypot(e.x - owner.x, e.z - owner.z) < 14) {
            rt.targetId = eid;
            break;
          }
        }
      }
    }
    target = rt.targetId ? this.state.enemies.get(rt.targetId) : undefined;

    if (target && Math.hypot(target.x - owner.x, target.z - owner.z) < 20) {
      const reach = (rt.ranged ? 7 : 1.4) + (getEnemy(target.kind)?.radius ?? 0.5);
      const dist = Math.hypot(target.x - c.x, target.z - c.z);
      if (dist > reach) {
        this.moveCompanion(c, { x: target.x, z: target.z }, dt);
      } else {
        c.facing = Math.atan2(target.x - c.x, target.z - c.z);
        if (this.now >= rt.nextAttackAt) {
          rt.nextAttackAt = this.now + power.cooldown * 1000;
          c.anim = "attack";
          c.actionSeq = (c.actionSeq + 1) % 65535;
          const amount = Math.max(1, Math.round(averageHit(owner, ort.ch, this.now) * power.damage * randRange(this.rng, 0.85, 1.15)));
          this.events.fx({
            kind: rt.ranged ? "projectile" : "swing",
            sourceId: cid,
            fromX: c.x,
            fromZ: c.z,
            toX: target.x,
            toZ: target.z,
            variant: rt.ranged ? "orb" : undefined,
            color: c.color,
          });
          this.damageEnemy(rt.targetId!, target, amount, cid);
        } else if (this.now > rt.nextAttackAt - power.cooldown * 1000 + ANIM_HOLD_MS) {
          c.anim = "idle";
        }
      }
      return;
    }
    rt.targetId = null;

    // Follow: keep a spot just behind and beside the owner.
    const behind = { x: owner.x - Math.sin(owner.facing) * 1.6 + Math.cos(owner.facing) * 1.1, z: owner.z - Math.cos(owner.facing) * 1.6 - Math.sin(owner.facing) * 1.1 };
    if (Math.hypot(behind.x - c.x, behind.z - c.z) > 1.2) this.moveCompanion(c, behind, dt);
    else c.anim = "idle";
  }

  private moveCompanion(c: Companion, to: { x: number; z: number }, dt: number): void {
    const m = stepMovement(this.world, c.x, c.z, { dirX: 0, dirZ: 0, target: to }, COMPANION_SPEED, dt, 0.35);
    c.x = m.x;
    c.z = m.z;
    if (m.facing !== null) c.facing = m.facing;
    c.anim = m.moving ? "walk" : "idle";
  }

  private damageCompanion(cid: string, c: Companion, raw: number, sourceId: string): void {
    if (c.anim === "dead") return;
    const amount = Math.max(1, Math.round(raw));
    c.hp = Math.max(0, c.hp - amount);
    this.events.hit({ targetId: cid, sourceId, amount });
    if (c.hp <= 0) {
      c.anim = "dead";
      const rt = this.companions.get(cid);
      if (rt) {
        rt.respawnAt = this.now + COMPANION_RESPAWN_MS;
        rt.targetId = null;
        this.events.notice(rt.ownerId, `Your ${c.name} is hurt and retreats. It will return shortly.`);
      }
      this.events.fx({ kind: "death", sourceId: cid, fromX: c.x, fromZ: c.z, toX: c.x, toZ: c.z });
      for (const e of this.enemies.values()) if (e.targetId === cid) e.targetId = null;
    }
  }

  /** Dev helper: move a player next to a landmark (or "spawn"). */
  teleportToLandmark(id: string, landmarkId: string): boolean {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    const pool = poolCenter();
    const named: Record<string, { x: number; z: number }> = { spawn: this.world.spawn, pool: fromUV(pool.u, pool.v + POOL_RADIUS + 2), camp: this.campPos };
    for (const z of ZONES) named[z.id] = fromUV(z.u, z.v);
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
    for (const [id, c] of this.state.companions) this.updateCompanion(id, c, dtSec);
    for (const [id, e] of this.state.enemies) this.updateEnemy(id, e, dtSec);
    while (this.pendingSpawns.length && this.pendingSpawns[0]!.at <= nowMs) {
      this.spawnEnemy(this.pendingSpawns.shift()!.zone);
    }
  }

  private updatePlayer(id: string, p: Player, dt: number): void {
    const rt = this.players.get(id)!;

    if (p.anim === "dead") {
      if (this.now >= rt.respawnAt) this.respawn(p, rt);
      return;
    }

    // Expire buffs; tick status effects.
    for (let i = p.buffs.length - 1; i >= 0; i--) if (p.buffs[i]!.expiresAt <= this.now) p.buffs.splice(i, 1);
    this.updateStatuses(id, p, rt);
    if (p.anim === "dead") return;
    this.updateChannel(p, rt);

    // Resource regen/decay, slow natural HP regen (faster when Well Rested).
    const res = RESOURCES[rt.ch.kit.base.resource];
    p.resource = Math.max(0, Math.min(p.maxResource, p.resource + res.regenPerSecond * dt));
    const rested = p.buffs.some((b) => b.stat === REST.buffStat) ? REST.regenMultiplier : 1;
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.005 * (1 + bonus(p, "hpRegen")) * rested * dt);

    // Chase-and-attack takes priority over plain movement.
    let intent = rt.intent;
    if (rt.attackTargetId) {
      const target = this.state.enemies.get(rt.attackTargetId);
      if (!target) {
        rt.attackTargetId = null;
      } else {
        const dist = Math.hypot(target.x - p.x, target.z - p.z);
        const reach = rt.ch.kit.basicAttack.range + (getEnemy(target.kind)?.radius ?? 0.5);
        if (dist > reach) {
          intent = { dirX: 0, dirZ: 0, target: { x: target.x, z: target.z } };
        } else {
          intent = { dirX: 0, dirZ: 0, target: null };
          p.facing = Math.atan2(target.x - p.x, target.z - p.z);
          if (this.now >= rt.nextAttackAt) this.basicAttack(id, p, rt, rt.attackTargetId, target);
        }
      }
    }

    const moved = stepMovement(this.world, p.x, p.z, intent, moveSpeed(p, this.now), dt, undefined, waterMultiplier(p));
    p.x = moved.x;
    p.z = moved.z;
    if (moved.facing !== null) p.facing = moved.facing;
    if (moved.arrived && intent === rt.intent) rt.intent.target = null;

    const busy = this.now < rt.nextAttackAt - rt.ch.kit.basicAttack.cooldown * 1000 + ANIM_HOLD_MS;
    if (moved.moving) p.anim = "walk";
    else if (!busy && !rt.channel && p.anim !== "idle") p.anim = "idle";
  }

  private basicAttack(id: string, p: Player, rt: PlayerRuntime, enemyId: string, target: Enemy): void {
    const atk = rt.ch.kit.basicAttack;
    rt.nextAttackAt = this.now + atk.cooldown * 1000;
    p.anim = "attack";
    p.actionSeq = (p.actionSeq + 1) % 65535;

    const base = randRange(this.rng, atk.damage[0], atk.damage[1]) + weaponBonus(p);
    const crit = this.rng() < critChance(p, rt.ch);
    const amount = Math.round(base * damageMultiplier(p, rt.ch, this.now) * (crit ? 1.5 : 1));

    this.events.fx({
      kind: atk.kind === "ranged" ? "projectile" : "swing",
      sourceId: id,
      fromX: p.x,
      fromZ: p.z,
      toX: target.x,
      toZ: target.z,
      variant: atk.projectile,
      color: rt.ch.kit.color,
    });

    const res = RESOURCES[rt.ch.kit.base.resource];
    if (res.gainOnHit) p.resource = Math.min(p.maxResource, p.resource + res.gainOnHit);
    this.damageEnemy(enemyId, target, amount, id, crit);
  }

  // -------------------------------------------------------------------------
  // Abilities
  // -------------------------------------------------------------------------

  /** Returns false if the ability could not be used (no valid target etc.); nothing is spent then. */
  private executeAbility(id: string, p: Player, rt: PlayerRuntime, ability: AbilityDef, x: number, z: number): boolean {
    const eff = ability.effect;
    const color = rt.ch.kit.color;
    // Clamp the aim point to the ability's range.
    let ax = x;
    let az = z;
    const d = Math.hypot(ax - p.x, az - p.z);
    if (ability.range > 0 && d > ability.range) {
      ax = p.x + ((ax - p.x) / d) * ability.range;
      az = p.z + ((az - p.z) / d) * ability.range;
    }
    if (d > 0.01) p.facing = Math.atan2(x - p.x, z - p.z);

    const baseDamage = averageHit(p, rt.ch, this.now);
    const roll = () => {
      const crit = this.rng() < critChance(p, rt.ch);
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
          const area = eff.radius > 0 ? 1 + bonus(p, "areaDamage") : 1;
          const amount = Math.round(baseDamage * eff.multiplier * r.mult * area);
          dealt += amount;
          this.damageEnemy(eid, e, amount, id, r.crit);
        }
        if (eff.lifesteal) this.healPlayer(id, p, dealt * eff.lifesteal, id);
        return true;
      }
      case "nova": {
        this.events.fx({ kind: "nova", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: eff.radius, variant: ability.id, color });
        const area = 1 + bonus(p, "areaDamage");
        for (const [eid, e] of this.enemiesInRadius(p.x, p.z, eff.radius)) {
          const r = roll();
          this.damageEnemy(eid, e, Math.round(baseDamage * eff.multiplier * r.mult * area), id, r.crit);
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
    // Trappers know where beasts are soft.
    const src = this.state.players.get(sourceId);
    if (src && this.enemies.get(enemyId)?.def.beast) amount = Math.round(amount * (1 + bonus(src, "beastDamage")));
    // Kaelthar's blessing: a little of every wound flows back to you.
    const leech = src ? bonus(src, "lifesteal") : 0;
    if (src && leech > 0 && src.anim !== "dead") src.hp = Math.min(src.maxHp, src.hp + amount * leech);
    e.hp = Math.max(0, e.hp - amount);
    this.events.hit({ targetId: enemyId, sourceId, amount, crit });
    const ert = this.enemies.get(enemyId);
    if (ert && !ert.returning) ert.targetId = sourceId;
    if (e.hp <= 0) this.killEnemy(enemyId, e);
  }

  private killEnemy(enemyId: string, e: Enemy): void {
    const ert = this.enemies.get(enemyId);
    this.events.fx({ kind: "death", sourceId: enemyId, fromX: e.x, fromZ: e.z, toX: e.x, toZ: e.z });
    this.state.enemies.delete(enemyId);
    this.enemies.delete(enemyId);
    if (!ert) return;
    this.pendingSpawns.push({ at: this.now + ENEMY_RESPAWN_MS, zone: ert.zone });
    this.pendingSpawns.sort((a, b) => a.at - b.at);
    for (const [pid, p] of this.playersInRadius(e.x, e.z, XP_SHARE_RADIUS)) {
      this.grantXp(pid, p, ert.xp);
      this.progressQuest(pid, p, { type: "kill", enemy: e.kind, count: 0 }, 1);
    }
    for (const rt of this.players.values()) if (rt.attackTargetId === enemyId) rt.attackTargetId = null;
  }

  /** `pierce`: ignores armour (damage over time from statuses). */
  private damagePlayer(id: string, p: Player, raw: number, sourceId: string, pierce = false): void {
    if (p.anim === "dead") return;
    const amount = Math.max(1, Math.round(raw * (pierce ? 1 : 1 - armorFraction(p, this.now))));
    p.hp = Math.max(0, p.hp - amount);
    if (!pierce) this.cancelChannel(id, "Interrupted!");
    this.events.hit({ targetId: id, sourceId, amount });
    const rt = this.players.get(id)!;
    const res = RESOURCES[rt.ch.kit.base.resource];
    if (res.gainOnHurt) p.resource = Math.min(p.maxResource, p.resource + res.gainOnHurt);
    if (p.hp <= 0) {
      p.anim = "dead";
      rt.respawnAt = this.now + Math.max(1, RESPAWN_SECONDS - bonus(p, "respawnFaster")) * 1000;
      rt.attackTargetId = null;
      rt.intent = { dirX: 0, dirZ: 0, target: null };
      p.statuses.clear();
      this.cancelChannel(id);
      p.anim = "dead";
      this.events.fx({ kind: "death", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z });
      this.events.announce(`${p.name} has fallen.`);
      for (const e of this.enemies.values()) if (e.targetId === id) e.targetId = null;
    }
  }

  private healPlayer(id: string, p: Player, amount: number, sourceId: string): void {
    if (p.anim === "dead") return;
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + amount * (1 + bonus(p, "healingReceived")));
    const healed = Math.round(p.hp - before);
    if (healed > 0) this.events.hit({ targetId: id, sourceId, amount: healed, heal: true });
  }

  /** `boosted`: background, blessing and Well Rested bonuses apply (kills, not quest rewards). */
  private grantXp(id: string, p: Player, amount: number, boosted = true): void {
    if (p.level >= MAX_LEVEL || (boosted && p.anim === "dead")) return;
    const rested = p.buffs.some((b) => b.stat === REST.buffStat) ? REST.xpBonus : 0;
    p.xp += Math.round(amount * (boosted ? 1 + bonus(p, "xp") + rested : 1));
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
      this.recallMemories(id, p);
      const next = advancementOptions(p.classId);
      if (next && p.level === next.level) {
        this.events.notice(
          id,
          next.quest
            ? `A new path awaits, but first you must complete the ${next.quest.name}.`
            : "A new path awaits. Open your character panel to choose it.",
        );
      }
    }
  }

  /** You come back by the stream, or at the camp fire once it is built. */
  private respawn(p: Player, rt: PlayerRuntime): void {
    const home = this.state.campBuilt ? this.campPos : this.world.spawn;
    const spot = this.findFreeSpotNear(home.x, home.z, 3);
    p.x = spot.x;
    p.z = spot.z;
    p.hp = p.maxHp;
    p.resource = RESOURCES[rt.ch.kit.base.resource].startsFull ? p.maxResource : 0;
    p.anim = "idle";
    // Death takes your ability buffs but not a good night's sleep.
    for (let i = p.buffs.length - 1; i >= 0; i--) if (p.buffs[i]!.stat !== REST.buffStat) p.buffs.splice(i, 1);
    p.statuses.clear();
    rt.intent = { dirX: 0, dirZ: 0, target: null };
  }

  // -------------------------------------------------------------------------
  // Enemies
  // -------------------------------------------------------------------------

  /** Bring every hunting ground back to full strength. Returns how many creatures returned. */
  private repopulate(): number {
    this.pendingSpawns = [];
    let n = 0;
    for (const zone of ZONES) {
      let living = 0;
      for (const rt of this.enemies.values()) if (rt.zone === zone) living++;
      for (let i = living; i < zone.population; i++) if (this.spawnEnemy(zone)) n++;
    }
    return n;
  }

  /** Spawn one creature somewhere in a hunting ground, at a level within the zone's range. */
  private spawnEnemy(zone: ZoneDef): boolean {
    const totalWeight = zone.enemies.reduce((t, e) => t + e.weight, 0);
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = randRange(this.rng, 0, Math.PI * 2);
      const r = Math.sqrt(this.rng()) * zone.radius;
      const pos = fromUV(zone.u + Math.cos(a) * r, zone.v + Math.sin(a) * r);
      if (Math.hypot(pos.x - this.world.spawn.x, pos.z - this.world.spawn.z) < SPAWN_SAFE_RADIUS) continue;
      if (Math.hypot(pos.x - this.campPos.x, pos.z - this.campPos.z) < SPAWN_SAFE_RADIUS) continue;
      if (this.world.landmarks.some((l) => l.kind === "shrine" && Math.hypot(pos.x - l.x, pos.z - l.z) < SHRINE_SANCTUARY)) continue;
      let roll = this.rng() * totalWeight;
      const pick = zone.enemies.find((e) => (roll -= e.weight) <= 0) ?? zone.enemies[0]!;
      const def = getEnemy(pick.id);
      if (!def) return false;
      if (isInWater(pos.x, pos.z) || !isFree(this.world, pos.x, pos.z, Math.max(0.8, def.radius))) continue;
      const level = zone.levels[0] + Math.floor(this.rng() * (zone.levels[1] - zone.levels[0] + 1));
      const st = enemyStats(def, level);
      const id = `e${this.nextEnemyId++}`;
      const e = new Enemy();
      e.kind = def.id;
      e.level = level;
      e.x = pos.x;
      e.z = pos.z;
      e.facing = randRange(this.rng, 0, Math.PI * 2);
      e.hp = st.maxHp;
      e.maxHp = st.maxHp;
      this.state.enemies.set(id, e);
      this.enemies.set(id, {
        def,
        zone,
        level,
        damage: st.damage,
        xp: st.xp,
        homeX: pos.x,
        homeZ: pos.z,
        targetId: null,
        nextAttackAt: 0,
        wander: null,
        nextWanderAt: 0,
        returning: false,
      });
      return true;
    }
    return false;
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

    const target = rt.targetId ? (rt.targetId.startsWith("c:") ? this.state.companions.get(rt.targetId) : this.state.players.get(rt.targetId)) : undefined;
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
          const dmg = randRange(this.rng, rt.damage[0], rt.damage[1]);
          if (rt.targetId!.startsWith("c:")) this.damageCompanion(rt.targetId!, target as Companion, dmg, id);
          else {
            const victim = target as Player;
            this.damagePlayer(rt.targetId!, victim, dmg, id);
            if (def.inflicts && victim.anim !== "dead" && this.rng() < def.inflicts.chance) this.inflict(victim, def.inflicts.status);
          }
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

function sameObjective(a: QuestObjective, b: QuestObjective): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "gather") return a.node === (b as typeof a).node;
  if (a.type === "kill") return a.enemy === (b as typeof a).enemy;
  return a.landmark === (b as typeof a).landmark;
}
