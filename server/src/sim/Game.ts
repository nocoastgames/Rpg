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
  FETCH_QUESTS,
  FIRST_QUEST,
  MAP_FLAG,
  TRADE_RANGE,
  VENDOR,
  VENDOR_NPC,
  VILLAGE_CRYPT,
  VILLAGE_GRAVEYARD,
  canEquip,
  villagePoint,
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
  epicQuestName,
  loreFlag,
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
  type ItemDef,
  type QuestDef,
  type QuestEffect,
  type ReadEvent,
  type DialogEvent,
  type CutsceneEvent,
  DUNGEON_CELL,
  GUARD_TRIGGER_U,
  inDungeon,
  toUV,
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
import { Buff, Companion, Enemy, InventorySlot, Player, QuestState, StatusEffect, WorldState } from "../schema/WorldState.ts";
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
  /** A book's text, for the player reading it. */
  read(playerId: string, e: ReadEvent): void;
  /** Open a conversation (and shop) with someone. */
  dialog(playerId: string, e: DialogEvent): void;
  /** Play a short scripted scene for one player. */
  cutscene(playerId: string, e: CutsceneEvent): void;
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
  nextPotionAt: number;
  /** In a scripted scene: controls ignored until then. */
  lockedUntil: number;
  /** Being arrested at the road out: when you're taken to the cell. */
  arrestAt: number;
  /** Fighting until this time (food can't be eaten, meals are interrupted). */
  combatUntil: number;
  nextReachCheck: number;
}

interface EnemyRuntime {
  def: EnemyDef;
  /** Hunting ground it belongs to (missing for named creatures and summons). */
  zone?: ZoneDef;
  /** Named creature id (gravedigger, hollow_priest). */
  special?: string;
  /** Boss timers. */
  nextNovaAt: number;
  summoned: boolean;
  /** Passive creatures run from whoever hurt them until this time. */
  fleeUntil: number;
  fleeFrom: { x: number; z: number } | null;
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
const POTION_COOLDOWN_MS = 15_000;
/** How long after a blow you still count as fighting. */
const COMBAT_LINGER_MS = 5_000;
/** From Haskel's signal fire to the road being dug out. */
const ROAD_CLEARING_MS = 20_000;
/** The arrest scene: total length, and when (screen black) you're taken to the cell. */
const ARREST_MS = 16_000;
const ARREST_TAKEN_MS = 11_000;
const ARREST_LINES = [
  "Beyond the rockslide, a line of soldiers in the King's blue and silver blocks the road.",
  "\"Halt! You came out of that valley? Out of Ashford?\"",
  "\"The dead walk down there, and you're the only living soul to walk out. Nobody can explain that. On your knees. By order of the Crown, you're under arrest.\"",
  "Rough hands. A sack over your head. Days in a jolting cart, then stone, and cold, and dark.",
  "You wake on wet straw in a cell. Wherever this is, it's a long way from the valley.",
];

/** Named creatures: where they appear and whether they come back. */
const SPECIALS: Record<string, { level: number; at: () => { x: number; z: number }; respawnMs: number | null; leash: number }> = {
  gravedigger: { level: 3, at: () => villagePoint(VILLAGE_GRAVEYARD.du, VILLAGE_GRAVEYARD.dv), respawnMs: 45_000, leash: 16 },
  hollow_priest: { level: 4, at: () => villagePoint(VILLAGE_CRYPT.du + 1.5, VILLAGE_CRYPT.dv + 2), respawnMs: null, leash: 22 },
};
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
  private pendingSpecials: Array<{ at: number; kind: string }> = [];
  private readonly campPos: { x: number; z: number };
  private readonly vendorPos: { x: number; z: number };
  private roadClearingAt = 0;
  private roadGate: GateId | null = null;
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
    this.vendorPos = fromUV(VENDOR.u, VENDOR.v);
    this.repopulate();
    this.spawnSpecial("gravedigger");
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
      nextPotionAt: 0,
      lockedUntil: 0,
      arrestAt: 0,
      combatUntil: 0,
      nextReachCheck: 0,
    });
    this.startQuest(id, p, FIRST_QUEST, false);
    p.fetchOffer = this.randomFetch("");
    return p;
  }

  removePlayer(id: string): void {
    this.removeCompanion(id);
    this.state.players.delete(id);
    this.players.delete(id);
    for (const e of this.enemies.values()) if (e.targetId === id) e.targetId = null;
  }

  /** Controls are locked during scripted scenes. */
  private locked(id: string): boolean {
    const rt = this.players.get(id);
    return !!rt && this.now < rt.lockedUntil;
  }

  setMoveDir(id: string, x: number, z: number): void {
    const rt = this.players.get(id);
    if (!rt || this.locked(id)) return;
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
    if (!rt || this.locked(id)) return;
    rt.intent.target = { x, z };
    rt.attackTargetId = null;
    this.cancelChannel(id);
  }

  setAttackTarget(id: string, enemyId: string): void {
    const rt = this.players.get(id);
    if (!rt || !this.state.enemies.has(enemyId) || this.locked(id)) return;
    rt.attackTargetId = enemyId;
    rt.intent.target = null;
    this.cancelChannel(id);
  }

  castAbility(id: string, slot: number, x: number, z: number): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || p.anim === "dead" || this.locked(id)) return;
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

  // -------------------------------------------------------------------------
  // Items and equipment
  // -------------------------------------------------------------------------

  useItem(id: string, slot: number): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || p.anim === "dead") return;
    const inv = p.inventory[slot];
    if (!inv) return;
    const def = getItem(inv.itemId);
    if (!def) return;
    if (def.kind === "weapon" || def.kind === "armor") {
      this.equip(id, p, rt, slot, def);
      return;
    }
    if (def.cooksInto) {
      this.cook(id, p, slot, def);
      return;
    }
    const use = def.use;
    if (!use) {
      this.events.notice(id, def.kind === "ammo" ? `${def.name} are used automatically.` : `${def.name} can't be used.`);
      return;
    }
    switch (use.type) {
      case "food": {
        if (this.inCombat(id, rt)) {
          this.events.notice(id, "You can't eat in the middle of a fight. A healing draught works in combat.");
          return;
        }
        for (let i = p.buffs.length - 1; i >= 0; i--) if (p.buffs[i]!.stat === "food") p.buffs.splice(i, 1);
        const b = new Buff();
        b.stat = "food";
        b.amount = (p.maxHp * use.fraction * (1 + bonus(p, "foodHealing"))) / use.seconds;
        b.expiresAt = this.now + use.seconds * 1000;
        p.buffs.push(b);
        this.takeFromSlot(p, slot, 1);
        this.events.notice(id, `You eat the ${def.name}.`);
        return;
      }
      case "potion": {
        if (this.now < rt.nextPotionAt) {
          this.events.notice(id, `You can drink another draught in ${Math.ceil((rt.nextPotionAt - this.now) / 1000)}s.`);
          return;
        }
        rt.nextPotionAt = this.now + POTION_COOLDOWN_MS;
        this.takeFromSlot(p, slot, 1);
        this.healPlayer(id, p, p.maxHp * use.fraction, id);
        this.events.fx({ kind: "heal", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, radius: 1.2, color: "#e8453a" });
        return;
      }
      case "restoreResource":
        p.resource = Math.min(p.maxResource, p.resource + use.amount);
        if (use.becomes) inv.itemId = use.becomes;
        else this.takeFromSlot(p, slot, 1);
        this.events.notice(id, `You use the ${def.name}.`);
        return;
      case "throw": {
        const target = this.nearestEnemy(p.x, p.z, use.range, p.x, p.z, use.range)[0];
        if (!target) {
          this.events.notice(id, "Nothing in range to throw at.");
          return;
        }
        const [eid, e] = target;
        p.facing = Math.atan2(e.x - p.x, e.z - p.z);
        p.anim = "attack";
        p.actionSeq = (p.actionSeq + 1) % 65535;
        this.takeFromSlot(p, slot, 1);
        this.events.fx({ kind: "projectile", sourceId: id, fromX: p.x, fromZ: p.z, toX: e.x, toZ: e.z, variant: "dagger", color: "#c8ccd4" });
        this.damageEnemy(eid, e, Math.round(randRange(this.rng, use.damage[0], use.damage[1])), id);
        return;
      }
      case "read": {
        this.events.read(id, { title: use.title, text: use.text });
        for (const faith of use.reveals ?? []) {
          if (p.quests.includes(loreFlag(faith))) continue;
          p.quests.push(loreFlag(faith));
          const god = getFaith(faith);
          if (god?.favorQuest) this.events.notice(id, `You have learned of ${god.favorQuest.name}, an epic quest of ${god.name}.`);
        }
        const flag = `read_${def.id}`;
        if (!p.quests.includes(flag)) {
          p.quests.push(flag);
          this.grantXp(id, p, use.xp, false);
          this.events.notice(id, `You learn something from ${use.title}. (+${use.xp} experience)`);
        }
        return;
      }
      case "map":
        if (!p.quests.includes(MAP_FLAG)) p.quests.push(MAP_FLAG);
        this.events.notice(id, "You study the map. The whole valley is on yours now.");
        return;
    }
  }

  /** Quick-use: "heal" eats out of combat and drinks a draught in it; "drink" uses the waterskin. */
  quickUse(id: string, kind: "heal" | "drink"): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt) return;
    const find = (type: string) => p.inventory.findIndex((s) => getItem(s.itemId)?.use?.type === type);
    let slot = -1;
    if (kind === "drink") slot = find("restoreResource");
    else if (this.inCombat(id, rt)) slot = find("potion");
    else slot = find("food") >= 0 ? find("food") : find("potion");
    if (slot >= 0) this.useItem(id, slot);
    else this.events.notice(id, kind === "drink" ? "You have nothing to drink. Fill your waterskin at the stream." : this.inCombat(id, rt) ? "No healing draughts left." : "You have no food left.");
  }

  /** Equip a weapon or armour from the bag; whatever you wore goes back in its place. */
  private equip(id: string, p: Player, rt: PlayerRuntime, slot: number, def: ItemDef): void {
    if (!canEquip(def, rt.ch.kit.base.id)) {
      this.events.notice(id, `Your calling can't make use of the ${def.name}.`);
      return;
    }
    const field = def.kind === "weapon" ? "weapon" : "armor";
    const old = p[field];
    p[field] = def.id;
    if (old) {
      p.inventory[slot]!.itemId = old;
      p.inventory[slot]!.qty = 1;
    } else this.takeFromSlot(p, slot, 1);
    this.refreshCharacter(p, rt);
    this.events.notice(id, `You equip the ${def.name}.`);
  }

  unequip(id: string, field: "weapon" | "armor"): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || !p[field]) return;
    if (!this.giveItem(p, p[field], 1)) {
      this.events.notice(id, "Your pack is full.");
      return;
    }
    p[field] = "";
    this.refreshCharacter(p, rt);
  }

  /** Equipment can change stats: rebuild the character sheet. */
  private refreshCharacter(p: Player, rt: PlayerRuntime): void {
    rt.ch = resolveCharacter(p);
    applyDerived(p, rt.ch);
  }

  private cook(id: string, p: Player, slot: number, def: ItemDef): void {
    const atFire = this.state.campBuilt && Math.hypot(p.x - this.campPos.x, p.z - this.campPos.z) < 6;
    if (!atFire) {
      this.events.notice(id, `You need a campfire to cook the ${def.name.toLowerCase()}.`);
      return;
    }
    const s = p.inventory[slot]!;
    const qty = s.qty;
    const cooked = getItem(def.cooksInto!)!;
    this.takeFromSlot(p, slot, qty);
    this.giveItem(p, cooked.id, qty);
    this.events.notice(id, `You cook ${qty} ${cooked.name} over the fire.`);
  }

  /** In combat: hit or been hit recently, or something is chasing you. */
  private inCombat(id: string, rt: PlayerRuntime): boolean {
    if (this.now < rt.combatUntil) return true;
    for (const e of this.enemies.values()) if (e.targetId === id) return true;
    return false;
  }

  private enterCombat(p: Player, rt: PlayerRuntime): void {
    rt.combatUntil = this.now + COMBAT_LINGER_MS;
    // Fighting interrupts a meal.
    for (let i = p.buffs.length - 1; i >= 0; i--) if (p.buffs[i]!.stat === "food") p.buffs.splice(i, 1);
  }

  // -------------------------------------------------------------------------
  // Interacting with the world
  // -------------------------------------------------------------------------

  interact(id: string): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || p.anim === "dead" || rt.channel || this.locked(id)) return;
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
      // A quest step that wants this place comes first.
      const work = this.interactStep(p, l.id);
      if (work) {
        const { qs, objective } = work;
        this.startChannel(id, p, rt, objective.seconds ?? 0, objective.verb ?? l.verb, () => {
          if (objective.effect) this.applyEffect(id, p, objective.effect, l);
          this.advanceQuest(id, p, qs, 1);
          if (l.kind === "npc") this.events.dialog(id, { npc: l.id });
        });
        return;
      }
      if (l.kind === "shrine") this.pray(id, p, rt, l);
      else if (l.kind === "camp") this.useCamp(id, p, rt, l);
      else if (l.kind === "npc") this.events.dialog(id, { npc: l.id });
      else if (l.id === "crypt") this.inspectCrypt(id, p, l);
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

  /** The active quest step (if any) that wants you to use this landmark. */
  private interactStep(p: Player, landmark: string): { qs: QuestState; objective: Extract<QuestObjective, { type: "interact" }> } | null {
    for (const qs of p.active) {
      const o = getQuest(qs.id)?.steps[qs.step]?.objective;
      if (o?.type === "interact" && o.landmark === landmark) return { qs, objective: o };
    }
    return null;
  }

  private inspectCrypt(id: string, p: Player, l: LandmarkDef): void {
    // Waiting to fight the Hollow Priest, but it's gone (someone else killed it): it rises again.
    const waiting = p.active.some((qs) => {
      const o = getQuest(qs.id)?.steps[qs.step]?.objective;
      return o?.type === "kill" && o.enemies.includes("hollow_priest");
    });
    if (waiting && !this.specialAlive("hollow_priest")) {
      this.spawnSpecial("hollow_priest");
      this.events.notice(id, "Something stirs again in the crypt below, and climbs toward you.");
      return;
    }
    if (this.state.cryptBurned) this.events.notice(id, "The crypt door stands open. Ash covers the steps where the thorns burned.");
    else if (this.state.cryptOpen) this.events.notice(id, "The crypt door stands open. Black thorns writhe on the steps below.");
    else this.events.notice(id, l.lockedText);
  }

  /** What finishing certain quest steps does to the world. */
  private applyEffect(id: string, p: Player, effect: QuestEffect, l: LandmarkDef): void {
    switch (effect) {
      case "build_camp": {
        const already = this.state.campBuilt;
        this.state.campBuilt = true;
        this.events.fx({ kind: "levelup", sourceId: id, fromX: l.x, fromZ: l.z, toX: l.x, toZ: l.z, color: "#ff9a3a" });
        if (already) this.events.notice(id, "You add your wood, stones and hides to the camp. It's sturdier for it.");
        else this.events.announce(`${p.name} has made camp in the clearing.`);
        return;
      }
      case "unseal_crypt":
        this.state.cryptOpen = true;
        if (!this.specialAlive("hollow_priest")) this.spawnSpecial("hollow_priest");
        return;
      case "burn_thorns":
        this.state.cryptBurned = true;
        this.events.fx({ kind: "nova", sourceId: id, fromX: l.x, fromZ: l.z, toX: l.x, toZ: l.z, radius: 3, color: "#ff7a2a" });
        return;
    }
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
      this.events.notice(id, `${l.lockedText} It is a shrine to ${god.name}, ${god.title}. It does not answer you.`);
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
            ? `You kneel and pray. ${god.name} hears you, but your path is not yet theirs. Win their favour with ${epicQuestName(god.id, p.quests)} and the blessing will follow.`
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
    if (!this.state.campBuilt) {
      this.events.notice(id, p.active.some((q) => q.id === "make_camp") ? `${l.lockedText} You'll need firewood, stones and hides first.` : l.lockedText);
      return;
    }
    this.rest(id, p, rt);
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
    const cookable = p.inventory.some((s) => getItem(s.itemId)?.cooksInto);
    this.events.notice(
      id,
      `You rest by the fire and wake Well Rested: +${Math.round(REST.xpBonus * 100)}% experience and faster healing for ${REST.durationSec / 60} minutes.` +
        (returned > 0 ? " Out in the valley, creatures stir." : "") +
        (cookable ? " (Use raw meat here to cook it.)" : ""),
    );
  }

  // -------------------------------------------------------------------------
  // Quests
  // -------------------------------------------------------------------------

  /** Start a quest (no checks: the caller decides who may). */
  startQuest(id: string, p: Player, questId: string, announce = true): boolean {
    const q = getQuest(questId);
    if (!q || p.active.some((a) => a.id === questId)) return false;
    const qs = new QuestState();
    qs.id = questId;
    p.active.push(qs);
    if (announce) this.events.notice(id, `New quest: ${q.name}. ${q.steps[0]!.text}`);
    return true;
  }

  private stepOf(qs: QuestState) {
    return getQuest(qs.id)?.steps[qs.step];
  }

  /** Can this player pick up this node right now? (An active step wants it and they haven't taken it.) */
  private wantsNode(p: Player, n: GatherNode): boolean {
    if (p.gathered.includes(n.id)) return false;
    return p.active.some((qs) => {
      const o = this.stepOf(qs)?.objective;
      return o?.type === "gather" && o.node === n.kind;
    });
  }

  private gather(id: string, p: Player, rt: PlayerRuntime, n: GatherNode): void {
    const qs = p.active.find((q) => {
      const o = this.stepOf(q)?.objective;
      return o?.type === "gather" && o.node === n.kind;
    });
    const o = qs ? this.stepOf(qs)?.objective : undefined;
    if (!qs || o?.type !== "gather" || !this.wantsNode(p, n)) return;
    p.facing = Math.atan2(n.x - p.x, n.z - p.z);
    const label = n.kind === "deadfall" ? "Gathering branches" : n.kind === "river_stone" ? "Prying the stone loose" : "Searching";
    this.startChannel(id, p, rt, o.seconds ?? 0, label, () => {
      if (!this.wantsNode(p, n)) return;
      p.gathered.push(n.id);
      this.events.fx({ kind: "buff", sourceId: id, fromX: n.x, fromZ: n.z, toX: n.x, toZ: n.z, radius: 0.8, variant: "gather", color: "#e8d28a" });
      if (n.text) this.events.notice(id, n.text);
      this.advanceQuest(id, p, qs, 1);
    });
  }

  /** A creature died near this player: count it toward any kill step that wants it. */
  private creditKill(id: string, p: Player, kind: string): void {
    for (const qs of [...p.active]) {
      const o = this.stepOf(qs)?.objective;
      if (o?.type !== "kill" || !o.enemies.includes(kind)) continue;
      if (o.chance !== undefined && this.rng() >= o.chance) {
        if (o.failText) this.events.notice(id, o.failText);
        continue;
      }
      this.advanceQuest(id, p, qs, 1);
    }
  }

  /** Arrived somewhere a quest sent you? (Checked a few times a second.) */
  private checkReach(id: string, p: Player): void {
    for (const qs of [...p.active]) {
      const o = this.stepOf(qs)?.objective;
      if (o?.type !== "reach") continue;
      const l = this.world.landmarks.find((m) => m.id === o.landmark);
      if (l && Math.hypot(p.x - l.x, p.z - l.z) < o.radius) this.advanceQuest(id, p, qs, 1);
    }
  }

  /** Add progress to a quest's current step; finish steps and the quest. */
  private advanceQuest(id: string, p: Player, qs: QuestState, amount: number): void {
    const quest = getQuest(qs.id);
    const step = quest?.steps[qs.step];
    if (!quest || !step) return;
    const o = step.objective;
    const need = o.type === "gather" || o.type === "kill" || o.type === "deliver" ? o.count : 1;
    qs.count = Math.min(need, qs.count + amount);
    if (qs.count < need) return;
    this.events.notice(id, `${step.title}: ${step.doneText}`);
    // Pick-ups of this kind are done with: forget which ones were taken.
    if (o.type === "gather") {
      for (let i = p.gathered.length - 1; i >= 0; i--) {
        if (this.world.nodes.find((n) => n.id === p.gathered[i])?.kind === o.node) p.gathered.splice(i, 1);
      }
    }
    qs.step += 1;
    qs.count = 0;
    this.grantXp(id, p, step.xp, false);
    if (qs.step < quest.steps.length) {
      this.events.notice(id, `Next: ${quest.steps[qs.step]!.text}`);
      return;
    }
    this.finishQuest(id, p, qs, quest);
  }

  private finishQuest(id: string, p: Player, qs: QuestState, quest: QuestDef): void {
    const i = p.active.indexOf(qs);
    if (i >= 0) p.active.splice(i, 1);
    if (!quest.repeatable && !p.quests.includes(quest.id)) p.quests.push(quest.id);
    this.events.fx({ kind: "levelup", sourceId: id, fromX: p.x, fromZ: p.z, toX: p.x, toZ: p.z, color: "#ffd54a" });
    const got: string[] = [];
    const r = quest.reward;
    if (r?.coins) {
      p.coins += r.coins;
      got.push(`${r.coins} coins`);
    }
    if (r?.xp) this.grantXp(id, p, r.xp, false);
    const rt = this.players.get(id);
    const itemId = r?.classItem && rt ? r.classItem[rt.ch.kit.base.id] : undefined;
    if (itemId) {
      const item = getItem(itemId)!;
      if (this.giveItem(p, itemId, 1)) got.push(item.name);
      else this.events.notice(id, `Your pack is full: the ${item.name} is waiting with ${quest.giver ? "Haskel" : "you"}. Make room and talk again.`);
    }
    this.events.notice(id, `Quest complete: ${quest.name}.${got.length ? ` You receive ${got.join(" and ")}.` : ""}`);
    if (quest.repeatable && quest.giver === "vendor") p.fetchOffer = this.randomFetch(p.fetchOffer);
    if (r?.opensGate && !this.state.gates.get(r.opensGate)) this.scheduleRoadClearing(r.opensGate);
  }

  private randomFetch(except: string): string {
    const pool = FETCH_QUESTS.filter((q) => q.id !== except);
    return pool[Math.floor(this.rng() * pool.length)]!.id;
  }

  /** The kingdom's men answer Haskel's signal fire and dig the road out. */
  private scheduleRoadClearing(gate: GateId): void {
    if (this.roadClearingAt) return;
    this.roadClearingAt = this.now + ROAD_CLEARING_MS;
    this.roadGate = gate;
    this.events.announce("Haskel's signal fire burns on the rockslide. Faint shouts answer from beyond the pass.");
  }

  /** Dev helper: finish the current step of a quest (starting it if needed), or the whole quest. */
  devQuest(id: string, questId: string | null, all: boolean): boolean {
    const p = this.state.players.get(id);
    if (!p) return false;
    if (questId && !p.active.some((q) => q.id === questId) && !this.startQuest(id, p, questId)) return false;
    const qs = questId ? p.active.find((q) => q.id === questId) : p.active[0];
    if (!qs) return false;
    do {
      const step = this.stepOf(qs);
      if (!step) break;
      const o = step.objective;
      if (o.type === "interact" && o.effect) {
        const l = this.world.landmarks.find((m) => m.id === o.landmark)!;
        this.applyEffect(id, p, o.effect, l);
      }
      this.advanceQuest(id, p, qs, 255);
    } while (all && p.active.includes(qs));
    return true;
  }

  // -------------------------------------------------------------------------
  // Trading with Haskel
  // -------------------------------------------------------------------------

  private nearNpc(p: Player, npc: string): boolean {
    const l = this.world.landmarks.find((m) => m.id === npc);
    return !!l && Math.hypot(p.x - l.x, p.z - l.z) <= TRADE_RANGE;
  }

  buy(id: string, index: number): void {
    const p = this.state.players.get(id);
    const entry = VENDOR_NPC.shop[index];
    if (!p || !entry || !this.nearNpc(p, VENDOR_NPC.id)) return;
    const item = getItem(entry.item)!;
    if (p.coins < entry.price) {
      this.events.notice(id, `"That's ${entry.price} coins, friend. You're short."`);
      return;
    }
    if (!this.giveItem(p, entry.item, entry.qty)) {
      this.events.notice(id, "Your pack is full.");
      return;
    }
    p.coins -= entry.price;
    this.events.notice(id, `You buy ${entry.qty > 1 ? `${entry.qty} ` : ""}${item.name} for ${entry.price} coins.`);
  }

  sell(id: string, slot: number, all: boolean): void {
    const p = this.state.players.get(id);
    const s = p?.inventory[slot];
    const item = s ? getItem(s.itemId) : undefined;
    if (!p || !s || !item || !this.nearNpc(p, VENDOR_NPC.id)) return;
    if (!item.value) {
      this.events.notice(id, `"I've no use for that, friend."`);
      return;
    }
    const qty = all ? s.qty : 1;
    this.takeFromSlot(p, slot, qty);
    p.coins += item.value * qty;
    this.events.notice(id, `You sell ${qty > 1 ? `${qty} ` : ""}${item.name} for ${item.value * qty} coins.`);
  }

  /** Sell every piece of loot (materials) in the bag. */
  sellJunk(id: string): void {
    const p = this.state.players.get(id);
    if (!p || !this.nearNpc(p, VENDOR_NPC.id)) return;
    let total = 0;
    for (let i = p.inventory.length - 1; i >= 0; i--) {
      const s = p.inventory[i]!;
      const item = getItem(s.itemId);
      if (item?.kind === "material" && item.value) {
        total += item.value * s.qty;
        p.inventory.splice(i, 1);
      }
    }
    this.events.notice(id, total ? `Haskel buys your loot for ${total} coins.` : "You have nothing Haskel wants to buy.");
    p.coins += total;
  }

  acceptQuest(id: string, questId: string): void {
    const p = this.state.players.get(id);
    const q = getQuest(questId);
    if (!p || !q?.giver || !this.nearNpc(p, q.giver) || p.active.some((a) => a.id === questId)) return;
    if (q.repeatable) {
      if (p.fetchOffer !== questId || p.active.some((a) => getQuest(a.id)?.repeatable)) return;
    } else if (p.quests.includes(questId)) return;
    this.startQuest(id, p, questId);
  }

  /** Hand over the items a delivery step asks for. */
  turnIn(id: string, questId: string): void {
    const p = this.state.players.get(id);
    const qs = p?.active.find((a) => a.id === questId);
    const quest = getQuest(questId);
    const o = qs ? this.stepOf(qs)?.objective : undefined;
    if (!p || !qs || !quest?.giver || o?.type !== "deliver" || !this.nearNpc(p, quest.giver)) return;
    if (this.countItem(p, o.item) < o.count) {
      this.events.notice(id, `You need ${o.count} ${getItem(o.item)?.name ?? o.item}.`);
      return;
    }
    this.removeItem(p, o.item, o.count);
    this.advanceQuest(id, p, qs, o.count);
  }

  /** Lost your weapon? Haskel gives you a plain one for your calling. */
  requestWeapon(id: string): void {
    const p = this.state.players.get(id);
    const rt = this.players.get(id);
    if (!p || !rt || !this.nearNpc(p, VENDOR_NPC.id) || !this.needsWeapon(p, rt)) return;
    p.weapon = rt.ch.kit.base.starterWeapon;
    this.refreshCharacter(p, rt);
    this.events.notice(id, `Haskel hands you a ${getItem(p.weapon)?.name ?? "weapon"}.`);
  }

  private needsWeapon(p: Player, rt: PlayerRuntime): boolean {
    if (p.weapon) return false;
    const base = rt.ch.kit.base.id;
    return !p.inventory.some((s) => {
      const d = getItem(s.itemId);
      return d?.kind === "weapon" && canEquip(d, base);
    });
  }

  private countItem(p: Player, itemId: string): number {
    let n = 0;
    p.inventory.forEach((s) => {
      if (s.itemId === itemId) n += s.qty;
    });
    return n;
  }

  private removeItem(p: Player, itemId: string, qty: number): void {
    for (let i = p.inventory.length - 1; i >= 0 && qty > 0; i--) {
      const s = p.inventory[i]!;
      if (s.itemId !== itemId) continue;
      const take = Math.min(qty, s.qty);
      this.takeFromSlot(p, i, take);
      qty -= take;
    }
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
      else if (info.status === "needsQuest") this.events.notice(id, `${faith.name}'s favour fades from your new path. Win it back with ${epicQuestName(faith.id, p.quests)}.`);
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
    const named: Record<string, { x: number; z: number }> = { spawn: this.world.spawn, pool: fromUV(pool.u, pool.v + POOL_RADIUS + 2), camp: this.campPos, cell: DUNGEON_CELL };
    for (const z of ZONES) named[z.id] = fromUV(z.u, z.v);
    const l = named[landmarkId] ?? this.world.landmarks.find((m) => m.id === landmarkId);
    if (!p || !rt || !l) return false;
    const spot = this.findFreeSpotNear(l.x, l.z, 1);
    p.x = spot.x;
    p.z = spot.z;
    p.region = inDungeon(spot.x, spot.z) ? "dungeon" : "valley";
    rt.intent = { dirX: 0, dirZ: 0, target: null };
    rt.attackTargetId = null;
    return true;
  }

  // -------------------------------------------------------------------------
  // The road out: the King's soldiers are waiting
  // -------------------------------------------------------------------------

  /** Once the road is cleared, walking out through the pass gets you arrested. */
  private checkRoadOut(id: string, p: Player, rt: PlayerRuntime): void {
    if (p.region !== "valley" || rt.arrestAt || !this.state.gates.get("valley_exit")) return;
    if (toUV(p.x, p.z).u < GUARD_TRIGGER_U) return;
    rt.arrestAt = this.now + ARREST_TAKEN_MS;
    rt.lockedUntil = this.now + ARREST_MS;
    rt.intent = { dirX: 0, dirZ: 0, target: null };
    rt.attackTargetId = null;
    this.cancelChannel(id);
    p.anim = "idle";
    this.events.cutscene(id, { id: "arrest", lines: ARREST_LINES, ms: ARREST_MS, blackAt: 9_000 });
    this.events.announce(`The King's soldiers have seized ${p.name} at the pass.`);
  }

  private takeToCell(id: string, p: Player, rt: PlayerRuntime): void {
    rt.arrestAt = 0;
    p.region = "dungeon";
    p.x = DUNGEON_CELL.x - 0.5;
    p.z = DUNGEON_CELL.z + 0.4;
    p.facing = Math.PI;
    p.hp = p.maxHp;
    p.statuses.clear();
    for (const e of this.enemies.values()) if (e.targetId === id || e.targetId === `c:${id}`) e.targetId = null;
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
    for (let i = this.pendingSpecials.length - 1; i >= 0; i--) {
      const ps = this.pendingSpecials[i]!;
      if (ps.at > nowMs) continue;
      this.pendingSpecials.splice(i, 1);
      if (!this.specialAlive(ps.kind)) this.spawnSpecial(ps.kind);
    }
    if (this.roadClearingAt && nowMs >= this.roadClearingAt && this.roadGate) {
      this.roadClearingAt = 0;
      this.setGate(this.roadGate, true);
      this.events.announce("The ring of picks, a horn, and cheering from beyond the pass: the kingdom's men have cleared the road!");
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
    let meal = 0;
    for (const b of p.buffs) if (b.stat === "food") meal += b.amount;
    p.hp = Math.min(p.maxHp, p.hp + (p.maxHp * 0.005 * (1 + bonus(p, "hpRegen")) * rested + meal) * dt);
    if (this.now >= rt.nextReachCheck) {
      rt.nextReachCheck = this.now + 400;
      this.checkReach(id, p);
      this.checkRoadOut(id, p, rt);
    }
    if (rt.arrestAt && this.now >= rt.arrestAt) this.takeToCell(id, p, rt);

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

    let arrowBonus = 0;
    if (atk.projectile === "arrow") {
      const quiver = p.inventory.findIndex((s) => s.itemId === "arrows");
      if (quiver >= 0) {
        this.takeFromSlot(p, quiver, 1);
        arrowBonus = 2;
      }
    }
    const base = randRange(this.rng, atk.damage[0], atk.damage[1]) + weaponBonus(p) + arrowBonus;
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
    // Whoever (or whose companion) struck the blow is now fighting.
    const killerId = sourceId.startsWith("c:") ? sourceId.slice(2) : sourceId;
    const kp = this.state.players.get(killerId);
    const krt = this.players.get(killerId);
    if (kp && krt) this.enterCombat(kp, krt);
    const ert = this.enemies.get(enemyId);
    if (ert?.def.passive) {
      ert.fleeUntil = this.now + 4000;
      ert.fleeFrom = { x: kp?.x ?? e.x, z: kp?.z ?? e.z };
    } else if (ert && !ert.returning) ert.targetId = sourceId;
    if (e.hp <= 0) this.killEnemy(enemyId, e, kp ? killerId : null);
  }

  private killEnemy(enemyId: string, e: Enemy, killerId: string | null = null): void {
    const ert = this.enemies.get(enemyId);
    this.events.fx({ kind: "death", sourceId: enemyId, fromX: e.x, fromZ: e.z, toX: e.x, toZ: e.z });
    this.state.enemies.delete(enemyId);
    this.enemies.delete(enemyId);
    for (const rt of this.players.values()) if (rt.attackTargetId === enemyId) rt.attackTargetId = null;
    if (!ert) return;
    if (ert.zone) {
      this.pendingSpawns.push({ at: this.now + ENEMY_RESPAWN_MS, zone: ert.zone });
      this.pendingSpawns.sort((a, b) => a.at - b.at);
    } else if (ert.special && SPECIALS[ert.special]?.respawnMs) {
      this.pendingSpecials.push({ at: this.now + SPECIALS[ert.special]!.respawnMs!, kind: ert.special });
    }
    for (const [pid, p] of this.playersInRadius(e.x, e.z, XP_SHARE_RADIUS)) {
      this.grantXp(pid, p, ert.xp);
      this.creditKill(pid, p, e.kind);
    }
    const killer = killerId ? this.state.players.get(killerId) : undefined;
    if (killer && killerId) this.dropLoot(killerId, killer, ert.def);
  }

  /** Loot goes straight into the killer's pack. */
  private dropLoot(id: string, p: Player, def: EnemyDef): void {
    const got: string[] = [];
    const lost: string[] = [];
    for (const drop of def.loot ?? []) {
      if (this.rng() >= drop.chance) continue;
      const qty = drop.qty ? drop.qty[0] + Math.floor(this.rng() * (drop.qty[1] - drop.qty[0] + 1)) : 1;
      const item = getItem(drop.item);
      if (!item) continue;
      if (this.giveItem(p, drop.item, qty)) got.push(qty > 1 ? `${qty} ${item.name}` : item.name);
      else lost.push(item.name);
    }
    if (def.coins && this.rng() < def.coins.chance) {
      const n = def.coins.range[0] + Math.floor(this.rng() * (def.coins.range[1] - def.coins.range[0] + 1));
      p.coins += n;
      got.push(`${n} coin${n === 1 ? "" : "s"}`);
    }
    if (got.length) this.events.notice(id, `Looted: ${got.join(", ")}.`);
    if (lost.length) this.events.notice(id, `Your pack is full. Left behind: ${lost.join(", ")}.`);
  }

  /** `pierce`: ignores armour (damage over time from statuses). */
  private damagePlayer(id: string, p: Player, raw: number, sourceId: string, pierce = false): void {
    if (p.anim === "dead") return;
    const amount = Math.max(1, Math.round(raw * (pierce ? 1 : 1 - armorFraction(p, this.now))));
    p.hp = Math.max(0, p.hp - amount);
    if (!pierce) {
      this.cancelChannel(id, "Interrupted!");
      const prt = this.players.get(id);
      if (prt) this.enterCombat(p, prt);
    }
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
    const home = p.region === "dungeon" ? DUNGEON_CELL : this.state.campBuilt ? this.campPos : this.world.spawn;
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
      if (Math.hypot(pos.x - this.vendorPos.x, pos.z - this.vendorPos.z) < SPAWN_SAFE_RADIUS) continue;
      if (this.world.landmarks.some((l) => l.kind === "shrine" && Math.hypot(pos.x - l.x, pos.z - l.z) < SHRINE_SANCTUARY)) continue;
      let roll = this.rng() * totalWeight;
      const pick = zone.enemies.find((e) => (roll -= e.weight) <= 0) ?? zone.enemies[0]!;
      const def = getEnemy(pick.id);
      if (!def) return false;
      if (isInWater(pos.x, pos.z) || !isFree(this.world, pos.x, pos.z, Math.max(0.8, def.radius))) continue;
      const level = zone.levels[0] + Math.floor(this.rng() * (zone.levels[1] - zone.levels[0] + 1));
      this.createEnemy(def, level, pos, { zone });
      return true;
    }
    return false;
  }

  private createEnemy(def: EnemyDef, level: number, pos: { x: number; z: number }, opts: { zone?: ZoneDef; special?: string; leash?: number } = {}): string {
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
      def: opts.leash ? { ...def, leashRange: opts.leash } : def,
      zone: opts.zone,
      special: opts.special,
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
      nextNovaAt: 0,
      summoned: false,
      fleeUntil: 0,
      fleeFrom: null,
    });
    return id;
  }

  private specialAlive(kind: string): boolean {
    for (const rt of this.enemies.values()) if (rt.special === kind) return true;
    return false;
  }

  /** Bring out a named creature (Old Corwin, the Hollow Priest) at its spot. */
  private spawnSpecial(kind: string): void {
    const sp = SPECIALS[kind];
    const def = getEnemy(kind);
    if (!sp || !def) return;
    const at = sp.at();
    this.createEnemy(def, sp.level, this.findFreeSpotNear(at.x, at.z, 1), { special: kind, leash: sp.leash });
  }

  /** Bosses: a blast around them every few seconds, and minions once badly hurt. */
  private bossMoves(id: string, e: Enemy, rt: EnemyRuntime): void {
    const sp = rt.def.special;
    if (!sp) return;
    if (sp.nova) {
      if (!rt.nextNovaAt) rt.nextNovaAt = this.now + sp.nova.every * 1000;
      if (this.now >= rt.nextNovaAt) {
        rt.nextNovaAt = this.now + sp.nova.every * 1000;
        this.events.fx({ kind: "nova", sourceId: id, fromX: e.x, fromZ: e.z, toX: e.x, toZ: e.z, radius: sp.nova.radius, color: "#7a4fa0" });
        const avg = (rt.damage[0] + rt.damage[1]) / 2;
        for (const [pid, p] of this.playersInRadius(e.x, e.z, sp.nova.radius)) {
          this.damagePlayer(pid, p, avg * sp.nova.multiplier, id);
          if (sp.nova.status && p.anim !== "dead") this.inflict(p, sp.nova.status);
        }
      }
    }
    if (sp.summon && !rt.summoned && e.hp <= e.maxHp * sp.summon.atHpFraction) {
      rt.summoned = true;
      const minion = getEnemy(sp.summon.kind);
      if (minion) {
        for (let i = 0; i < sp.summon.count; i++) this.createEnemy(minion, Math.max(1, rt.level - 2), this.findFreeSpotNear(e.x, e.z, 2.5));
        this.events.fx({ kind: "nova", sourceId: id, fromX: e.x, fromZ: e.z, toX: e.x, toZ: e.z, radius: 2.5, color: "#c8c0a8" });
      }
    }
  }

  private updateEnemy(id: string, e: Enemy, dt: number): void {
    const rt = this.enemies.get(id);
    if (!rt) return;
    const def = rt.def;
    const homeDist = Math.hypot(e.x - rt.homeX, e.z - rt.homeZ);

    // Passive creatures (hares) never fight: they bolt from whatever hurt them.
    if (def.passive) {
      if (this.now < rt.fleeUntil && rt.fleeFrom) {
        const dx = e.x - rt.fleeFrom.x;
        const dz = e.z - rt.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        this.moveEnemy(e, def, { x: e.x + (dx / d) * 3, z: e.z + (dz / d) * 3 }, def.moveSpeed, dt);
        return;
      }
      rt.targetId = null;
    }

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
    if (!rt.targetId && !def.passive) {
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
      this.bossMoves(id, e, rt);
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
      const r = rt.special ? randRange(this.rng, 0.5, 2.5) : randRange(this.rng, 2, 7);
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
    if (def.use?.type === "map" && !p.quests.includes(MAP_FLAG)) p.quests.push(MAP_FLAG);
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
