/** Pinned known-good WhatsApp Web version — fallback when live lookup fails. */
export const FALLBACK_WA_VERSION: [number, number, number] = [2, 3000, 1023223821];

/** Parse a "2,3000,123" / "2.3000.123" version string into a tuple, or null. */
export function parseWaVersionString(
  raw: string | undefined | null
): [number, number, number] | null {
  if (!raw?.trim()) return null;
  const parts = raw.split(/[,.]/).map((n) => parseInt(n.trim(), 10));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
    return [parts[0], parts[1], parts[2]];
  }
  return null;
}
