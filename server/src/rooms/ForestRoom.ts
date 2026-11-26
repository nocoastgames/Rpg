/**
 * One world instance as a Colyseus room: up to MAX_PLAYERS_PER_ROOM players
 * sharing a valley. Each world has a share code; friends join by code. An
 * empty world stays open for a while so people can come back to it. All the
 * rules live in RoomLogic (shared with the single-player browser build); this
 * class only connects it to the network.
 */
import { Room, type Client, type Delayed } from "@colyseus/core";
import { EMPTY_WORLD_TTL_MS, MAX_PLAYERS_PER_ROOM, S2C, TICK_MS, formatWorldCode, type JoinOptions } from "@rpg/shared";
import type { WorldState } from "../schema/WorldState.ts";
import { releaseWorldCode, reserveWorldCode } from "../worlds.ts";
import { RoomLogic } from "./RoomLogic.ts";

/** Dev-only chat commands (/open, /close, /tp, /level, /quest, /class...). Off in production unless DEV_COMMANDS=1. */
const DEV_COMMANDS = process.env.DEV_COMMANDS === "1" || process.env.NODE_ENV !== "production";

export class ForestRoom extends Room<{ state: WorldState }> {
  maxClients = MAX_PLAYERS_PER_ROOM;
  // Worlds outlive their last player for a while (see onLeave).
  autoDispose = false;
  private logic!: RoomLogic;
  private code = "";
  private emptyTimer: Delayed | null = null;

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
    this.code = reserveWorldCode(this.roomId);
    this.logic.state.code = this.code;
    void this.setMetadata({ code: this.code });
    this.onMessage("*", (client, type, message) => this.logic.message(client.sessionId, String(type), message));

    let last = Date.now();
    this.setTimestep(() => {
      const now = Date.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      this.logic.tick(dt, now);
    }, TICK_MS);
    // Nobody ever arrives (a failed create): close after the grace period.
    this.scheduleClose();
  }

  onJoin(client: Client, options: JoinOptions): void {
    this.logic.join(client.sessionId, options);
    this.emptyTimer?.clear();
    this.emptyTimer = null;
    client.send(S2C.notice, `You're in world ${formatWorldCode(this.code)}. Share the code (Character panel) to invite friends.`);
  }

  onLeave(client: Client): void {
    this.logic.leave(client.sessionId);
    if (this.clients.length === 0) this.scheduleClose();
  }

  onDispose(): void {
    releaseWorldCode(this.code);
  }

  private scheduleClose(): void {
    this.emptyTimer?.clear();
    this.emptyTimer = this.clock.setTimeout(() => {
      if (this.clients.length === 0) void this.disconnect();
    }, EMPTY_WORLD_TTL_MS);
  }
}
