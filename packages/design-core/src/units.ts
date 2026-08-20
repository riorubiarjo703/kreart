export const MM_PER_INCH = 25.4

/** Pixels per millimetre for a given dots-per-inch. 300 DPI -> 11.811 px/mm. */
export function dpiToPxPerMm(dpi: number): number {
  if (!(dpi > 0)) throw new Error(`DPI must be positive, got ${dpi}`)
  return dpi / MM_PER_INCH
}

export function mmToPx(mm: number, pxPerMm: number): number {
  return mm * pxPerMm
}

export function pxToMm(px: number, pxPerMm: number): number {
  return px / pxPerMm
}

/**
 * Canvas dimensions for a print area.
 * Rounds UP per spec §10.3: rounding down would silently crop the print area.
 */
export function canvasSizePx(
  printAreaMm: { w: number; h: number },
  pxPerMm: number,
): { w: number; h: number } {
  return {
    w: Math.ceil(mmToPx(printAreaMm.w, pxPerMm)),
    h: Math.ceil(mmToPx(printAreaMm.h, pxPerMm)),
  }
}
