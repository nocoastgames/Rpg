/**
 * Movement step shared by the server (authoritative) and client (prediction).
 * Keeping this in one place means the local player's predicted position
 * matches what the server computes, so corrections are rare and small.
 */
import { PLAYER_RADIUS, WATER_SPEED_MULTIPLIER } from "./constants.ts";
import { isInWater, resolveCollisions, type World } from "./world.ts";

export interface MoveIntent {
  /**
   * Direction from keyboard/stick in world space. Length 0..1: analog sticks
   * walk slower when only partly pushed. Takes priority over the target.
   */
  dirX: number;
  dirZ: number;
  /** Click-to-move destination, if any. */
  target: { x: number; z: number } | null;
}

export interface MoveResult {
  x: number;
  z: number;
  /** Facing angle (radians, atan2(dx, dz)) if the entity moved. */
  facing: number | null;
  /** True once the click-to-move target is reached. */
  arrived: boolean;
  moving: boolean;
}

export function stepMovement(
  world: World,
  x: number,
  z: number,
  intent: MoveIntent,
  speed: number,
  dt: number,
  radius = PLAYER_RADIUS,
  /** Speed multiplier while wading (lower = slower). */
  waterMultiplier = WATER_SPEED_MULTIPLIER,
): MoveResult {
  let dx = intent.dirX;
  let dz = intent.dirZ;
  let arrived = false;
  let maxStep = Infinity;
  // Analog magnitude: 0..1, with a floor so a light push still walks.
  const dirLen = Math.hypot(dx, dz);
  let throttle = dirLen > 0 ? Math.max(0.3, Math.min(1, dirLen)) : 1;

  if (dx === 0 && dz === 0 && intent.target) {
    dx = intent.target.x - x;
    dz = intent.target.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.1) return { x, z, facing: null, arrived: true, moving: false };
    maxStep = dist;
  }

  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x, z, facing: null, arrived, moving: false };
  dx /= len;
  dz /= len;

  if (intent.target && dirLen === 0) throttle = 1;
  const effSpeed = speed * throttle * (isInWater(x, z) ? waterMultiplier : 1);
  const stepLen = Math.min(effSpeed * dt, maxStep);
  if (stepLen >= maxStep) arrived = true;

  const resolved = resolveCollisions(world, x + dx * stepLen, z + dz * stepLen, radius);
  return { x: resolved.x, z: resolved.z, facing: Math.atan2(dx, dz), arrived, moving: true };
}
