/** Harmful status effects creatures can inflict. Shrines cure them all; so does resting at camp. */

export type StatusId = "bleed" | "poison" | "blight";

export interface StatusDef {
  id: StatusId;
  name: string;
  icon: string;
  color: string;
  /** Seconds it lasts (re-applying refreshes it; it doesn't stack). */
  duration: number;
  /** Damage per second, ignoring armour. */
  dps?: number;
  /** Multiplier on the damage you deal while afflicted. */
  damageDealt?: number;
  description: string;
}

export const STATUS_EFFECTS: Record<StatusId, StatusDef> = {
  bleed: { id: "bleed", name: "Bleeding", icon: "🩸", color: "#c0392b", duration: 5, dps: 3, description: "Losing 3 health a second." },
  poison: { id: "poison", name: "Poisoned", icon: "☠️", color: "#6abf3a", duration: 8, dps: 2, description: "Losing 2 health a second." },
  blight: { id: "blight", name: "Blighted", icon: "🥀", color: "#7a4fa0", duration: 10, damageDealt: 0.75, description: "Black thorn-rot in the blood: you deal 25% less damage." },
};

export function getStatus(id: string): StatusDef | undefined {
  return STATUS_EFFECTS[id as StatusId];
}
