/**
 * Everything a world instance does, independent of how players connect: the
 * Colyseus room (multiplayer) and the in-browser single-player build both
 * drive one of these. Validates input, forwards it to the Game simulation and
 * relays its events.
 */
import {
  C2S,
  CHAT_MAX_LENGTH,
  DEFAULT_WORLD_SEED,
  S2C,
  ABILITY_SLOTS,
  GATE_QUESTS,
  getClassNode,
  validateCreation,
  getBackground,
  getFaith,
  getQuest,
  type MemoryEvent,
  type ChatEvent,
  type GateId,
  type JoinOptions,
} from "@rpg/shared";
import { WorldState, type Player } from "../schema/WorldState.ts";
import { Game } from "../sim/Game.ts";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** How the logic reaches players. */
export interface Transport {
  send(playerId: string, type: string, message: unknown): void;
  broadcast(type: string, message: unknown): void;
  /** Run something later (the room's clock). */
  later(fn: () => void, ms: number): void;
}

export class RoomLogic {
  readonly state = new WorldState();
  readonly game: Game;

  constructor(
    private readonly t: Transport,
    private readonly opts: { devCommands: boolean },
  ) {
    this.game = new Game(this.state, DEFAULT_WORLD_SEED, {
      hit: (e) => t.broadcast(S2C.hit, e),
      fx: (e) => t.broadcast(S2C.fx, e),
      notice: (id, text) => t.send(id, S2C.notice, text),
      memory: (id, e) => t.send(id, S2C.memory, e),
      announce: (text) => t.broadcast(S2C.chat, { from: "", text, system: true } satisfies ChatEvent),
      read: (id, e) => t.send(id, S2C.read, e),
      dialog: (id, e) => t.send(id, S2C.dialog, e),
      cutscene: (id, e) => t.send(id, S2C.cutscene, e),
    });
  }

  tick(dt: number, now: number): void {
    this.game.update(dt, now);
  }

  /** A player arrives with their character-creation choices. Throws if they're invalid. */
  join(id: string, options: JoinOptions): Player {
    const result = validateCreation(options);
    if (!result.ok) throw new Error(result.error);
    const player = this.game.addPlayer(id, result.value);
    // The one thing you remember as you open your eyes.
    const bg = getBackground(result.value.backgroundId);
    if (bg) this.t.send(id, S2C.memory, { text: bg.impression } satisfies MemoryEvent);
    // Once the first memory has faded: the first task is shelter, and your god's shrine calls to you.
    const quest = getQuest(player.active[0]?.id ?? "");
    if (quest) this.t.later(() => this.t.send(id, S2C.notice, `${quest.intro} Quest: ${quest.name}. ${quest.steps[0]!.text}`), 10_000);
    const faith = getFaith(result.value.faithId);
    const shrine = this.game.world.landmarks.find((l) => l.kind === "shrine" && l.faith === faith?.id);
    if (faith && shrine) {
      this.t.later(
        () => this.t.send(id, S2C.notice, `You feel ${faith.name}'s call. Somewhere in this valley stands the ${shrine.name} (marked on your map). Pray there to receive their blessing.`),
        17_000,
      );
    }
    this.t.broadcast(S2C.chat, { from: "", text: `${player.name} wakes up by the stream.`, system: true } satisfies ChatEvent);
    return player;
  }

  leave(id: string): void {
    const player = this.state.players.get(id);
    if (player) this.t.broadcast(S2C.chat, { from: "", text: `${player.name} has left.`, system: true } satisfies ChatEvent);
    this.game.removePlayer(id);
  }

  /** One message from a player. Anything malformed is ignored. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message(id: string, type: string, m: any): void {
    const g = this.game;
    switch (type) {
      case C2S.moveDir:
        if (finite(m?.x) && finite(m?.z)) g.setMoveDir(id, m.x, m.z);
        return;
      case C2S.moveTo:
        if (finite(m?.x) && finite(m?.z)) g.setMoveTo(id, m.x, m.z);
        return;
      case C2S.attack:
        if (typeof m?.targetId === "string") g.setAttackTarget(id, m.targetId);
        return;
      case C2S.ability:
        if (Number.isInteger(m?.slot) && m.slot >= 0 && m.slot < ABILITY_SLOTS && finite(m.x) && finite(m.z)) g.castAbility(id, m.slot, m.x, m.z);
        return;
      case C2S.useItem:
        if (Number.isInteger(m?.slot)) g.useItem(id, m.slot);
        return;
      case C2S.interact:
        g.interact(id);
        return;
      case C2S.buy:
        if (Number.isInteger(m?.index)) g.buy(id, m.index);
        return;
      case C2S.sell:
        if (Number.isInteger(m?.slot)) g.sell(id, m.slot, m.all === true);
        return;
      case C2S.sellJunk:
        g.sellJunk(id);
        return;
      case C2S.acceptQuest:
        if (typeof m?.questId === "string") g.acceptQuest(id, m.questId);
        return;
      case C2S.turnIn:
        if (typeof m?.questId === "string") g.turnIn(id, m.questId);
        return;
      case C2S.requestWeapon:
        g.requestWeapon(id);
        return;
      case C2S.unequip:
        if (m?.slot === "weapon" || m?.slot === "armor") g.unequip(id, m.slot);
        return;
      case C2S.quickUse:
        if (m?.kind === "heal" || m?.kind === "drink") g.quickUse(id, m.kind);
        return;
      case C2S.hire:
        if (typeof m?.adventurerId === "string") g.hire(id, m.adventurerId);
        return;
      case C2S.dismiss:
        g.dismissAdventurer(id);
        return;
      case C2S.advance:
        if (typeof m?.classId === "string") g.advance(id, m.classId);
        return;
      case C2S.chat: {
        const text = typeof m?.text === "string" ? m.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
        const player = this.state.players.get(id);
        if (text.startsWith("/") && this.opts.devCommands) {
          this.devCommand(id, text);
          return;
        }
        if (text && player) this.t.broadcast(S2C.chat, { from: player.name, text } satisfies ChatEvent);
        return;
      }
    }
  }

  private devCommand(id: string, text: string): void {
    const reply = (msg: string) => this.t.send(id, S2C.notice, msg);
    const [cmd, arg] = text.slice(1).split(/\s+/);
    if ((cmd === "open" || cmd === "close") && arg) {
      const ok = this.game.setGate(arg as GateId, cmd === "open");
      reply(ok ? `[dev] ${arg} ${cmd === "open" ? "opened" : "sealed"}.` : `[dev] unknown gate "${arg}" (valley_exit, ruins_seal, cave_thorns)`);
    } else if (cmd === "level" && arg && Number.isFinite(Number(arg))) {
      this.game.setLevel(id, Number(arg));
      reply(`[dev] level set to ${arg}`);
    } else if (cmd === "step" || (cmd === "quest" && arg && getQuest(arg))) {
      // /step [quest]: finish the current step; /quest <id>: start (if needed) and finish a whole quest.
      const ok = this.game.devQuest(id, arg ?? null, cmd === "quest");
      reply(ok ? "[dev] quest progressed" : "[dev] no such active quest");
    } else if (cmd === "coins" && arg && Number.isFinite(Number(arg))) {
      const p = this.state.players.get(id);
      if (p) p.coins = Math.max(0, Math.round(Number(arg)));
    } else if (cmd === "quest" && arg) {
      // "favor" = your own god's epic quest.
      const own = getFaith(this.state.players.get(id)?.faith ?? "")?.favorQuest?.id;
      const ids = arg === "all" ? Object.values(GATE_QUESTS).map((q) => q!.id) : arg === "favor" && own ? [own] : [arg];
      const done = ids.filter((q) => this.game.completeQuest(id, q));
      if (done.length) reply(`[dev] completed ${done.join(", ")}`);
    } else if (cmd === "class" && arg && getClassNode(arg)) {
      // Walk straight to a class for testing: max level, all quests, every step of the path.
      this.game.setLevel(id, 50);
      for (const q of Object.values(GATE_QUESTS)) this.game.completeQuest(id, q!.id);
      const path: string[] = [];
      for (let n = getClassNode(arg); n; n = n.parent ? getClassNode(n.parent) : undefined) path.unshift(n.id);
      const current = this.state.players.get(id)?.classId ?? "";
      const start = path.indexOf(current);
      if (start === -1) {
        reply(`[dev] ${arg} isn't on your current path; start a new ${path[0]} character.`);
        return;
      }
      for (const id of path.slice(start + 1)) this.game.advance(id, id);
    } else if (cmd === "near" && arg) {
      // Next to the nearest creature of a kind (looking at models).
      const p = this.state.players.get(id);
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      this.state.enemies.forEach((e) => {
        if (e.kind !== arg || !p) return;
        const d = Math.hypot(e.x - p.x, e.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = { x: e.x, z: e.z };
        }
      });
      const ok = !!best && this.game.teleportTo(id, (best as { x: number; z: number }).x + 6, (best as { x: number; z: number }).z + 6);
      reply(ok ? `[dev] next to a ${arg}` : `[dev] no ${arg} around`);
    } else if (cmd === "tp" && arg) {
      const ok = this.game.teleportToLandmark(id, arg);
      reply(ok ? `[dev] teleported to ${arg}` : `[dev] unknown landmark "${arg}"`);
    } else {
      reply("[dev] commands: /open|/close <gate>, /tp <place|shrine_<god>|camp|vendor|village|crypt|cell|zone>, /level <n>, /quest <id|all|favor>, /step [quest], /coins <n>, /class <id>, /near <creature>");
    }
  }
}
