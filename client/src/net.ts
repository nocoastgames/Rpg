import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, SERVER_PORT, type JoinOptions } from "@rpg/shared";
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

export async function joinWorld(options: JoinOptions): Promise<GameRoom> {
  const client = new Client(serverUrl());
  return (await client.joinOrCreate(ROOM_NAME, options)) as GameRoom;
}
