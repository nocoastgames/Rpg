/**
 * The starting forest as a Colyseus room. One room instance = one shared
 * world of up to MAX_PLAYERS_PER_ROOM players. All the rules live in
 * RoomLogic (shared with the single-player browser build); this class only
 * connects it to the network.
 */
import { Room, type Client } from "@colyseus/core";
import { MAX_PLAYERS_PER_ROOM, TICK_MS, type JoinOptions } from "@rpg/shared";
import type { WorldState } from "../schema/WorldState.ts";
import { RoomLogic } from "./RoomLogic.ts";

/** Dev-only chat commands (/open, /close, /tp, /level, /quest, /class...). Disabled when NODE_ENV=production. */
const DEV_COMMANDS = process.env.NODE_ENV !== "production";

export class ForestRoom extends Room<{ state: WorldState }> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  private logic!: RoomLogic;

  onCreate(): void {
    this.logic = new RoomLogic(
      {
        send: (id, type, message) => this.clients.getById(id)?.send(type, message),
        broadcast: (type, message) => this.broadcast(type, message),
        later: (fn, ms) => void this.clock.setTimeout(fn, ms),
      },
      { devCommands: DEV_COMMANDS },
    );
    this.setState(this.logic.state);
    this.onMessage("*", (client, type, message) => this.logic.message(client.sessionId, String(type), message));

    let last = Date.now();
    this.setTimestep(() => {
      const now = Date.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      this.logic.tick(dt, now);
    }, TICK_MS);
  }

  onJoin(client: Client, options: JoinOptions): void {
    this.logic.join(client.sessionId, options);
  }

  onLeave(client: Client): void {
    this.logic.leave(client.sessionId);
  }
}
