export type RectMm = { xMm: number; yMm: number; wMm: number; hMm: number }

/** Axis-aligned bounding box of a rect rotated about its own centre. */
export function rotatedBoundsMm(rect: RectMm, rotationDeg: number): RectMm {
  const norm = ((rotationDeg % 360) + 360) % 360
  if (norm === 0) return { ...rect }

  const rad = (norm * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))

  const w = rect.wMm * cos + rect.hMm * sin
  const h = rect.wMm * sin + rect.hMm * cos

  const cx = rect.xMm + rect.wMm / 2
  const cy = rect.yMm + rect.hMm / 2

  return { xMm: cx - w / 2, yMm: cy - h / 2, wMm: w, hMm: h }
}
