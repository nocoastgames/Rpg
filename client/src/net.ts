import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, SERVER_PORT, formatWorldCode, normalizeWorldCode, type JoinOptions } from "@rpg/shared";
import type { WorldStateView } from "./types.ts";

/**
 * Where the game server lives:
 *  - VITE_SERVER_URL if set at build time (e.g. a separate game-server host)
 *  - in dev, the Colyseus server on port 2567 of whatever host served the page
 *  - in production, the same origin (the server also serves the client build)
 */
export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:${SERVER_PORT}`;
  return location.origin;
}

export type GameRoom = Room<any, WorldStateView>;

/** Start a new world (it gets its own share code) or join a friend's by code. */
export type WorldChoice = { mode: "new" } | { mode: "join"; code: string };

export async function joinWorld(options: JoinOptions, world: WorldChoice = { mode: "new" }): Promise<GameRoom> {
  const client = new Client(serverUrl());
  if (world.mode === "new") return (await client.create(ROOM_NAME, options)) as GameRoom;
  const code = normalizeWorldCode(world.code);
  if (!code) throw new Error("World codes are 6 letters and numbers, like K7Q-M2X.");
  const res = await fetch(`${serverUrl()}/api/worlds/${code}`, { credentials: "include" });
  if (res.status === 404) throw new Error(`No open world has the code ${formatWorldCode(code)}. Check it, or start a new world.`);
  if (!res.ok) throw new Error(`The server couldn't look up that world (${res.status}).`);
  const { roomId } = (await res.json()) as { roomId: string };
  try {
    return (await client.joinById(roomId, options)) as GameRoom;
  } catch (err) {
    const msg = String((err as Error).message ?? err);
    throw new Error(/locked|full/i.test(msg) ? `World ${formatWorldCode(code)} is full.` : msg);
  }
}

/** A world code from the page address (?world=K7Q-M2X), for invite links. */
export function worldFromUrl(): string | null {
  try {
    return normalizeWorldCode(new URLSearchParams(location.search).get("world") ?? "");
  } catch {
    return null;
  }
}
