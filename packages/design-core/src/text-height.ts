/**
 * Shared helper to retrieve text object height from the textHeightsMm map.
 * Missing values throw — a guessed height would silently validate a design that
 * does not fit (spec §11).
 */
export function requireTextHeightMm(
  objectId: string,
  textHeightsMm: Record<string, number>,
): number {
  const measured = textHeightsMm[objectId]
  if (measured === undefined) {
    throw new Error(`No measured height supplied for text object ${objectId}`)
  }
  return measured
}
