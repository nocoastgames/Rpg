/**
 * Data-driven abilities. The server executes these generically (see
 * server/src/sim/abilities.ts) so adding a new ability is mostly data.
 * Add new effect types here and handle them on the server.
 */

export type AbilityEffect =
  /** Damage a target point. radius 0 = nearest enemy to the point, >0 = everything in the circle. */
  | { type: "strike"; multiplier: number; radius: number; lifesteal?: number }
  /** Damage everything around the caster. */
  | { type: "nova"; multiplier: number; radius: number }
  /** Heal the caster (radius 0) or every player within radius, as a fraction of max HP. */
  | { type: "heal"; fraction: number; radius: number }
  /** Move quickly toward the cursor, optionally damaging enemies where you land. */
  | { type: "dash"; distance: number; multiplier: number; radius: number }
  /** Temporary buff on the caster (radius 0) or nearby allies. */
  | { type: "buff"; stat: BuffStat; amount: number; duration: number; radius: number };

export type BuffStat = "damage" | "speed" | "armor";

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  /** Resource cost. */
  cost: number;
  /** Cooldown in seconds. */
  cooldown: number;
  /** Max distance from caster to the targeted point (ignored for self-centred effects). */
  range: number;
  effect: AbilityEffect;
}

export interface BasicAttackDef {
  kind: "melee" | "ranged";
  /** Max distance to target. */
  range: number;
  damage: [min: number, max: number];
  /** Seconds between attacks. */
  cooldown: number;
  /** Visual hint for the client: what flies through the air for ranged attacks. */
  projectile?: "arrow" | "bolt" | "orb" | "dagger" | "note" | "shadow";
}
