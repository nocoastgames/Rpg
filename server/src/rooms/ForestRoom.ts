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
  isValidClassChoice,
  type AbilityMsg,
  type AttackMsg,
  type ChatEvent,
  type ChatMsg,
  type JoinOptions,
  type MoveDirMsg,
  type MoveToMsg,
  type UseItemMsg,
} from "@rpg/shared";
import { WorldState } from "../schema/WorldState.ts";
import { Game } from "../sim/Game.ts";

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

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
      if ((m?.slot === 0 || m?.slot === 1) && finite(m.x) && finite(m.z)) {
        this.game.castAbility(client.sessionId, m.slot, m.x, m.z);
      }
    });
    this.onMessage(C2S.useItem, (client, m: UseItemMsg) => {
      if (Number.isInteger(m?.slot)) this.game.useItem(client.sessionId, m.slot);
    });
    this.onMessage(C2S.interact, (client) => this.game.interact(client.sessionId));
    this.onMessage(C2S.chat, (client, m: ChatMsg) => {
      const text = typeof m?.text === "string" ? m.text.trim().slice(0, CHAT_MAX_LENGTH) : "";
      const player = this.state.players.get(client.sessionId);
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

  onJoin(client: Client, options: JoinOptions): void {
    if (!isValidClassChoice(options?.classId, options?.subclassId)) {
      throw new Error("Invalid class or subclass.");
    }
    const player = this.game.addPlayer(client.sessionId, {
      name: sanitizeName(options.name),
      classId: options.classId,
      subclassId: options.subclassId,
    });
    this.broadcast(S2C.chat, { from: "", text: `${player.name} wakes up by the stream.`, system: true } satisfies ChatEvent);
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) this.broadcast(S2C.chat, { from: "", text: `${player.name} has left.`, system: true } satisfies ChatEvent);
    this.game.removePlayer(client.sessionId);
  }
}
