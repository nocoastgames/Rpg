/**
 * World instances are shared with short codes, e.g. "K7Q-M2X". No look-alike
 * characters (0/O, 1/I/L), so codes survive being read aloud or typed on a phone.
 */
export const WORLD_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const WORLD_CODE_LENGTH = 6;

/** How long an empty world stays open so friends can come back to it. */
export const EMPTY_WORLD_TTL_MS = 30 * 60 * 1000;

export function generateWorldCode(random: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < WORLD_CODE_LENGTH; i++) code += WORLD_CODE_ALPHABET[Math.floor(random() * WORLD_CODE_ALPHABET.length)];
  return code;
}

/** Tidy what someone typed: case, spaces and dashes don't matter. Null if it can't be a code. */
export function normalizeWorldCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== WORLD_CODE_LENGTH) return null;
  for (const c of code) if (!WORLD_CODE_ALPHABET.includes(c)) return null;
  return code;
}

/** "K7QM2X" -> "K7Q-M2X". */
export function formatWorldCode(code: string): string {
  return code.length === WORLD_CODE_LENGTH ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}
