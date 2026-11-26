/** Open world instances by share code (this server process only). */
import { generateWorldCode } from "@rpg/shared";

const worlds = new Map<string, string>(); // code -> Colyseus room id

/** A fresh code no open world is using. */
export function reserveWorldCode(roomId: string): string {
  let code = generateWorldCode();
  while (worlds.has(code)) code = generateWorldCode();
  worlds.set(code, roomId);
  return code;
}

export function lookupWorld(code: string): string | undefined {
  return worlds.get(code);
}

export function releaseWorldCode(code: string): void {
  worlds.delete(code);
}
