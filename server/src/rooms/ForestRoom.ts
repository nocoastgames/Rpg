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
  NAME_MAX_LENGTH,
  S2C,
  TICK_MS,
  ABILITY_SLOTS,
  GATE_QUESTS,
  getClassNode,
  isBaseClass,
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
} from "@rpg/shared";
import { WorldState } from "../schema/WorldState.ts";
import { Game } from "../sim/Game.ts";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Dev-only chat commands (/open, /close, /tp, /level, /quest, /class). Disabled when NODE_ENV=production. */
const DEV_COMMANDS = process.env.NODE_ENV !== "production";

function sanitizeName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.replace(/[^\p{L}\p{N} _'-]/gu, "").trim().slice(0, NAME_MAX_LENGTH) : "";
  return name || "Wanderer";
}

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
      announce: (text) => this.broadcast(S2C.chat, { from: "", text, system: true } satisfies ChatEvent),
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
    } else if (cmd === "quest" && arg) {
      const ids = arg === "all" ? Object.values(GATE_QUESTS).map((q) => q!.id) : [arg];
      for (const q of ids) this.game.completeQuest(client.sessionId, q);
      client.send(S2C.notice, `[dev] completed ${ids.join(", ")}`);
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
      client.send(S2C.notice, "[dev] commands: /open|/close <gate>, /tp <place>, /level <n>, /quest <id|all>, /class <id>");
    }
  }

  onJoin(client: Client, options: JoinOptions): void {
    if (!isBaseClass(options?.classId)) {
      throw new Error("Choose one of the four base classes.");
    }
    const player = this.game.addPlayer(client.sessionId, {
      name: sanitizeName(options.name),
      classId: options.classId,
    });
    this.broadcast(S2C.chat, { from: "", text: `${player.name} wakes up by the stream.`, system: true } satisfies ChatEvent);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.broadcast(S2C.chat, { from: "", text: `${player.name} has left.`, system: true } satisfies ChatEvent);
    this.game.removePlayer(client.sessionId);
  }
}
