/**
 * Single-player mode: runs the real game rules (server/src/rooms/RoomLogic)
 * inside the page and hands the client an object that behaves like a
 * Colyseus room. Used by the offline build (`npm run build:offline`), which
 * can be hosted as static files anywhere, no game server needed.
 */
import { TICK_MS, type JoinOptions } from "@rpg/shared";
import { RoomLogic } from "../../../server/src/rooms/RoomLogic.ts";
import type { GameRoom } from "../net.ts";

const PLAYER_ID = "you";

export function joinLocal(options: JoinOptions): GameRoom {
  const handlers = new Map<string, Array<(message: unknown) => void>>();
  // Messages sent before anyone listens (the first memory on joining) wait, as they would on the network.
  const pending = new Map<string, unknown[]>();
  // Deliver like the network would: after the current call stack.
  const deliver = (type: string, message: unknown) =>
    queueMicrotask(() => {
      const list = handlers.get(type);
      if (list?.length) list.forEach((h) => h(message));
      else pending.set(type, [...(pending.get(type) ?? []), message]);
    });
  const logic = new RoomLogic(
    {
      send: (id, type, message) => {
        if (id === PLAYER_ID) deliver(type, message);
      },
      broadcast: deliver,
      later: (fn, ms) => void window.setTimeout(fn, ms),
    },
    { devCommands: true },
  );
  logic.join(PLAYER_ID, options);

  let last = Date.now();
  window.setInterval(() => {
    const now = Date.now();
    logic.tick(Math.min(0.25, (now - last) / 1000), now);
    last = now;
  }, TICK_MS);

  const room = {
    sessionId: PLAYER_ID,
    state: logic.state,
    send(type: string, message?: unknown) {
      logic.message(PLAYER_ID, type, message);
    },
    onMessage(type: string, cb: (message: unknown) => void) {
      const list = handlers.get(type) ?? [];
      list.push(cb);
      handlers.set(type, list);
      const waiting = pending.get(type);
      if (waiting) {
        pending.delete(type);
        queueMicrotask(() => waiting.forEach((m) => cb(m)));
      }
      return () => handlers.set(type, (handlers.get(type) ?? []).filter((h) => h !== cb));
    },
    onLeave: { once(_cb: (code: number) => void) {} },
    onStateChange: { once(cb: (state: unknown) => void) { queueMicrotask(() => cb(logic.state)); } },
    leave() {},
  };
  return room as unknown as GameRoom;
}
