/** Shared tuning constants. Anything both the client and server must agree on lives here. */

export const SERVER_PORT = 2567;
export const ROOM_NAME = "forest";
export const MAX_PLAYERS_PER_ROOM = 16;

/** Server simulation rate. Clients interpolate between patches. */
export const TICK_RATE = 20;
export const TICK_MS = 1000 / TICK_RATE;

/** World units are metres. The valley fits in a square of WORLD_SIZE x WORLD_SIZE centred on the origin. */
export const WORLD_SIZE = 6000;
export const WORLD_HALF = WORLD_SIZE / 2;

/** Analog stick input below this magnitude counts as "not moving". */
export const MOVE_DEADZONE = 0.08;

/** Default world seed. Every room currently uses the same seed so the forest is identical for everyone. */
export const DEFAULT_WORLD_SEED = 1337;

export const PLAYER_RADIUS = 0.45;
export const BASE_MOVE_SPEED = 5; // m/s
export const WATER_SPEED_MULTIPLIER = 0.55;

/** How close (m) a player must be to the stream bank to interact with water. */
export const WATER_INTERACT_RANGE = 2.5;

/** Seconds a player stays down before respawning at the stream. */
export const RESPAWN_SECONDS = 5;

export const MAX_LEVEL = 50;

export const INVENTORY_SLOTS = 24;
export const NAME_MAX_LENGTH = 16;
export const CHAT_MAX_LENGTH = 200;
