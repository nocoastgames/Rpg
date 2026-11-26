/**
 * The starting forest. One room instance = one shared world of up to
 * MAX_PLAYERS_PER_ROOM players. This class only handles networking:
 * validate input, forward it to the Game simulation, and relay events.
 */
import { Room, type Client } from "@colyseus/core";
import {
  C2S,
  CHAT_MAX_LENGTH,
  DEFAULT_WORLD_SEED,
  MAX_PLAYERS_PER_ROOM,
  S2C,
  TICK_MS,
  ABILITY_SLOTS,
  GATE_QUESTS,
  getClassNode,
  validateCreation,
  getBackground,
  getFaith,
  getQuest,
  type MemoryEvent,
  type AbilityMsg,
  type AdvanceMsg,
  type AttackMsg,
  type ChatEvent,
  type ChatMsg,
  type GateId,
  type JoinOptions,
  type MoveDirMsg,
  type MoveToMsg,
  type UseItemMsg,
  type BuyMsg,
  type SellMsg,
  type QuestMsg,
  type UnequipMsg,
  type QuickUseMsg,
} from "@rpg/shared";
import { WorldState } from "../schema/WorldState.ts";
import { Game } from "../sim/Game.ts";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Dev-only chat commands (/open, /close, /tp, /level, /quest, /class). Disabled when NODE_ENV=production. */
const DEV_COMMANDS = process.env.NODE_ENV !== "production";


export class ForestRoom extends Room<{ state: WorldState }> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private game!: Game;

  onCreate(): void {
    this.setState(new WorldState());
    this.game = new Game(this.state, DEFAULT_WORLD_SEED, {
      hit: (e) => this.broadcast(S2C.hit, e),
      fx: (e) => this.broadcast(S2C.fx, e),
      notice: (playerId, text) => {
        const client = this.clients.getById(playerId);
        if (client) client.send(S2C.notice, text);
      },
      memory: (playerId, e) => {
        const client = this.clients.getById(playerId);
        if (client) client.send(S2C.memory, e);
      },
      announce: (text) => this.broadcast(S2C.chat, { from: "", text, system: true } satisfies ChatEvent),
      read: (playerId, e) => this.clients.getById(playerId)?.send(S2C.read, e),
      dialog: (playerId, e) => this.clients.getById(playerId)?.send(S2C.dialog, e),
    });

    this.onMessage(C2S.moveDir, (client, m: MoveDirMsg) => {
      if (finite(m?.x) && finite(m?.z)) this.game.setMoveDir(client.sessionId, m.x, m.z);
    });
    this.onMessage(C2S.moveTo, (client, m: MoveToMsg) => {
      if (finite(m?.x) && finite(m?.z)) this.game.setMoveTo(client.sessionId, m.x, m.z);
    });
    this.onMessage(C2S.attack, (client, m: AttackMsg) => {
      if (typeof m?.targetId === "string") this.game.setAttackTarget(client.sessionId, m.targetId);
    });
    this.onMessage(C2S.ability, (client, m: AbilityMsg) => {
      if (Number.isInteger(m?.slot) && m.slot >= 0 && m.slot < ABILITY_SLOTS && finite(m.x) && finite(m.z)) {
        this.game.castAbility(client.sessionId, m.slot, m.x, m.z);
      }
    });
    this.onMessage(C2S.useItem, (client, m: UseItemMsg) => {
      if (Number.isInteger(m?.slot)) this.game.useItem(client.sessionId, m.slot);
    });
    this.onMessage(C2S.interact, (client) => this.game.interact(client.sessionId));
    this.onMessage(C2S.buy, (client, m: BuyMsg) => {
      if (Number.isInteger(m?.index)) this.game.buy(client.sessionId, m.index);
    });
    this.onMessage(C2S.sell, (client, m: SellMsg) => {
      if (Number.isInteger(m?.slot)) this.game.sell(client.sessionId, m.slot, m.all === true);
    });
    this.onMessage(C2S.sellJunk, (client) => this.game.sellJunk(client.sessionId));
    this.onMessage(C2S.acceptQuest, (client, m: QuestMsg) => {
      if (typeof m?.questId === "string") this.game.acceptQuest(client.sessionId, m.questId);
    });
    this.onMessage(C2S.turnIn, (client, m: QuestMsg) => {
      if (typeof m?.questId === "string") this.game.turnIn(client.sessionId, m.questId);
    });
    this.onMessage(C2S.requestWeapon, (client) => this.game.requestWeapon(client.sessionId));
    this.onMessage(C2S.unequip, (client, m: UnequipMsg) => {
      if (m?.slot === "weapon" || m?.slot === "armor") this.game.unequip(client.sessionId, m.slot);
    });
    this.onMessage(C2S.quickUse, (client, m: QuickUseMsg) => {
      if (m?.kind === "heal" || m?.kind === "drink") this.game.quickUse(client.sessionId, m.kind);
    });
    this.onMessage(C2S.advance, (client, m: AdvanceMsg) => {
      if (typeof m?.classId === "string") this.game.advance(client.sessionId, m.classId);
    });
    this.onMessage(C2S.chat, (client, m: ChatMsg) => {
      const text = typeof m?.text === "string" ? m.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
      const player = this.state.players.get(client.sessionId);
      if (text.startsWith("/") && DEV_COMMANDS) {
        this.devCommand(client, text);
        return;
      }
      if (text && player) this.broadcast(S2C.chat, { from: player.name, text } satisfies ChatEvent);
    });

    let last = Date.now();
    this.setTimestep(() => {
      const now = Date.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      this.game.update(dt, now);
    }, TICK_MS);
  }

  private devCommand(client: Client, text: string): void {
    const [cmd, arg] = text.slice(1).split(/\s+/);
    if ((cmd === "open" || cmd === "close") && arg) {
      const ok = this.game.setGate(arg as GateId, cmd === "open");
      client.send(S2C.notice, ok ? `[dev] ${arg} ${cmd === "open" ? "opened" : "sealed"}.` : `[dev] unknown gate "${arg}" (valley_exit, ruins_seal, cave_thorns)`);
    } else if (cmd === "level" && arg && Number.isFinite(Number(arg))) {
      this.game.setLevel(client.sessionId, Number(arg));
      client.send(S2C.notice, `[dev] level set to ${arg}`);
    } else if (cmd === "step" || (cmd === "quest" && arg && getQuest(arg))) {
      // /step [quest]: finish the current step; /quest <id>: start (if needed) and finish a whole quest.
      const ok = this.game.devQuest(client.sessionId, arg ?? null, cmd === "quest");
      client.send(S2C.notice, ok ? "[dev] quest progressed" : "[dev] no such active quest");
    } else if (cmd === "coins" && arg && Number.isFinite(Number(arg))) {
      const p = this.state.players.get(client.sessionId);
      if (p) p.coins = Math.max(0, Math.round(Number(arg)));
    } else if (cmd === "quest" && arg) {
      // "favor" = your own god's epic quest.
      const own = getFaith(this.state.players.get(client.sessionId)?.faith ?? "")?.favorQuest?.id;
      const ids = arg === "all" ? Object.values(GATE_QUESTS).map((q) => q!.id) : arg === "favor" && own ? [own] : [arg];
      const done = ids.filter((q) => this.game.completeQuest(client.sessionId, q));
      if (done.length) client.send(S2C.notice, `[dev] completed ${done.join(", ")}`);
    } else if (cmd === "class" && arg && getClassNode(arg)) {
      // Walk straight to a class for testing: max level, all quests, every step of the path.
      this.game.setLevel(client.sessionId, 50);
      for (const q of Object.values(GATE_QUESTS)) this.game.completeQuest(client.sessionId, q!.id);
      const path: string[] = [];
      for (let n = getClassNode(arg); n; n = n.parent ? getClassNode(n.parent) : undefined) path.unshift(n.id);
      const current = this.state.players.get(client.sessionId)?.classId ?? "";
      const start = path.indexOf(current);
      if (start === -1) {
        client.send(S2C.notice, `[dev] ${arg} isn't on your current path; start a new ${path[0]} character.`);
        return;
      }
      for (const id of path.slice(start + 1)) this.game.advance(client.sessionId, id);
    } else if (cmd === "tp" && arg) {
      const ok = this.game.teleportToLandmark(client.sessionId, arg);
      client.send(S2C.notice, ok ? `[dev] teleported to ${arg}` : `[dev] unknown landmark "${arg}"`);
    } else {
      client.send(S2C.notice, "[dev] commands: /open|/close <gate>, /tp <place|shrine_<god>|camp|zone>, /level <n>, /quest <id|all|favor>, /step [quest], /coins <n>, /class <id>");
    }
  }

  onJoin(client: Client, options: JoinOptions): void {
    const result = validateCreation(options);
    if (!result.ok) throw new Error(result.error);
    const player = this.game.addPlayer(client.sessionId, result.value);
    // The one thing you remember as you open your eyes.
    const bg = getBackground(result.value.backgroundId);
    if (bg) client.send(S2C.memory, { text: bg.impression } satisfies MemoryEvent);
    // Once the first memory has faded: the first task is shelter, and your god's shrine calls to you.
    const quest = getQuest(player.active[0]?.id ?? "");
    if (quest) this.clock.setTimeout(() => client.send(S2C.notice, `${quest.intro} Quest: ${quest.name}. ${quest.steps[0]!.text}`), 10_000);
    const faith = getFaith(result.value.faithId);
    const shrine = this.game.world.landmarks.find((l) => l.kind === "shrine" && l.faith === faith?.id);
    if (faith && shrine) {
      this.clock.setTimeout(
        () => client.send(S2C.notice, `You feel ${faith.name}'s call. Somewhere in this valley stands the ${shrine.name} (marked on your map). Pray there to receive their blessing.`),
        17_000,
      );
    }
    this.broadcast(S2C.chat, { from: "", text: `${player.name} wakes up by the stream.`, system: true } satisfies ChatEvent);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.broadcast(S2C.chat, { from: "", text: `${player.name} has left.`, system: true } satisfies ChatEvent);
    this.game.removePlayer(client.sessionId);
  }
}
