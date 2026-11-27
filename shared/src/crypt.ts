/**
 * The crypt under Ashford's chapel: a small underground dungeon that ends
 * The Silent Village. Like the castle cell it lives in its own patch of the
 * world, far outside the valley; the stairs in the village crypt lead here.
 *
 * Rooms and corridors are axis-aligned rectangles (local metres, +x and +z
 * run toward the camera). Walls are wherever the floor ends.
 */

/** World position of the crypt's local origin (the middle of the stair hall). */
export const CRYPT_ORIGIN = { x: 8000, z: 400 };

export interface CryptRoom {
  id: string;
  name: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  corridor?: boolean;
}

/** Stair hall → ossuary → burial hall → the thorn chamber. Corridors overlap the rooms they join. */
export const CRYPT_ROOMS: readonly CryptRoom[] = [
  { id: "stairs", name: "The Stair Hall", x0: -4, z0: -4, x1: 4, z1: 4 },
  { id: "c1", name: "", x0: 3, z0: -1.5, x1: 17, z1: 1.5, corridor: true },
  { id: "ossuary", name: "The Ossuary", x0: 16, z0: -5, x1: 26, z1: 5 },
  { id: "c2", name: "", x0: 19.5, z0: 4, x1: 22.5, z1: 16, corridor: true },
  { id: "burial", name: "The Burial Hall", x0: 14, z0: 15, x1: 28, z1: 25 },
  { id: "c3", name: "", x0: 27, z0: 18.5, x1: 39, z1: 21.5, corridor: true },
  { id: "thorns", name: "The Thorn Chamber", x0: 38, z0: 12, x1: 52, z1: 28 },
];

export function cryptPoint(lx: number, lz: number): { x: number; z: number } {
  return { x: CRYPT_ORIGIN.x + lx, z: CRYPT_ORIGIN.z + lz };
}

/** Anywhere in the crypt's patch of the world. */
export function inCrypt(x: number, z: number): boolean {
  return Math.abs(x - (CRYPT_ORIGIN.x + 24)) < 40 && Math.abs(z - (CRYPT_ORIGIN.z + 12)) < 30;
}

/** Signed distance to the crypt walls (positive inside a room or corridor). */
export function cryptSdf(x: number, z: number): number {
  const lx = x - CRYPT_ORIGIN.x;
  const lz = z - CRYPT_ORIGIN.z;
  let best = -Infinity;
  for (const r of CRYPT_ROOMS) best = Math.max(best, Math.min(lx - r.x0, r.x1 - lx, lz - r.z0, r.z1 - lz));
  return best;
}

/** The room (not corridor) a point is in, if any. */
export function cryptRoomAt(x: number, z: number): CryptRoom | undefined {
  const lx = x - CRYPT_ORIGIN.x;
  const lz = z - CRYPT_ORIGIN.z;
  return CRYPT_ROOMS.find((r) => !r.corridor && lx > r.x0 && lx < r.x1 && lz > r.z0 && lz < r.z1);
}

/** Where you arrive at the foot of the stairs, and the stairs back up (against the far wall). */
export const CRYPT_ENTRY = cryptPoint(0, 1);
export const CRYPT_STAIRS = cryptPoint(0, -3);
/** The heart of the black thorns, and where the Hollow Priest keeps its vigil. */
export const CRYPT_HEART = cryptPoint(48, 20);
export const CRYPT_PRIEST = cryptPoint(44, 20);

/** The dead that walk the crypt (they come back a while after they fall). */
export const CRYPT_SPAWNS: ReadonlyArray<{ kind: string; level: number; lx: number; lz: number }> = [
  { kind: "skeleton", level: 3, lx: 19, lz: -2.5 },
  { kind: "skeleton", level: 3, lx: 24, lz: 2.5 },
  { kind: "risen", level: 3, lx: 21, lz: 11 },
  { kind: "risen", level: 3, lx: 16.5, lz: 18 },
  { kind: "risen", level: 3, lx: 25.5, lz: 23 },
  { kind: "skeleton", level: 4, lx: 21, lz: 22.5 },
];
