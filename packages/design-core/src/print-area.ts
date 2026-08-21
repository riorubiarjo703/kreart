/**
 * The coupling between where a print area sits on a mockup photograph and how
 * large it is in reality.
 *
 * These are genuinely different things: normalised 0-1 coordinates say where on
 * the photo, millimetres say how big on the garment. Dragging cannot derive
 * millimetres, because nothing tells us how large the garment in the photo is.
 *
 * But they are not independent — both describe the same rectangle, so their
 * aspect ratios must agree. When they do not, the print area is incoherent: a
 * rectangle that looks square on the mockup while declaring 300x400mm.
 */

export type NormRect = { x: number; y: number; w: number; h: number }
export type MockupPx = { w: number; h: number }
export type PhysicalMm = { widthMm: number; heightMm: number }

/** Spec §3.2 and §6: absorbs rounding in stored values, admits nothing visibly wrong. */
export const ASPECT_TOLERANCE = 0.005

function requirePositive(value: number, what: string): number {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error(`${what} must be a positive finite number, got ${value}`)
  }
  return value
}

/** Width over height of the rectangle as it appears on the mockup, in pixels. */
export function onMockupAspect(rect: NormRect, mockup: MockupPx): number {
  requirePositive(mockup.w, 'mockup width')
  requirePositive(mockup.h, 'mockup height')
  requirePositive(rect.w, 'rect width')
  requirePositive(rect.h, 'rect height')
  return (rect.w * mockup.w) / (rect.h * mockup.h)
}

/** Width over height of the declared physical size. */
export function physicalAspect(mm: PhysicalMm): number {
  requirePositive(mm.widthMm, 'widthMm')
  requirePositive(mm.heightMm, 'heightMm')
  return mm.widthMm / mm.heightMm
}

/** Do the two descriptions of the same rectangle agree, within tolerance? */
export function aspectsAgree(
  rect: NormRect,
  mockup: MockupPx,
  mm: PhysicalMm,
  tolerance: number = ASPECT_TOLERANCE,
): boolean {
  requirePositive(tolerance, 'tolerance')
  const onPhoto = onMockupAspect(rect, mockup)
  const physical = physicalAspect(mm)
  return Math.abs(onPhoto - physical) / physical <= tolerance
}

/**
 * The height in mm that makes the declared size agree with the drawn rectangle.
 * Used when the admin drags: the shape changes, so the declared height follows.
 */
export function heightMmForRect(rect: NormRect, mockup: MockupPx, widthMm: number): number {
  requirePositive(widthMm, 'widthMm')
  return widthMm / onMockupAspect(rect, mockup)
}

/**
 * Reshape the rectangle to match a requested physical size, about its own centre.
 * Used when the admin types a millimetre value: the declared size changes, so the
 * drawn shape follows. Position is preserved; only the shape moves.
 *
 * The area on the photo is preserved so the rectangle neither balloons nor
 * collapses as it is reshaped, unless the rectangle must shrink to fit inside
 * the mockup. Aspect ratio is the contract; area preservation is a best-effort
 * heuristic that yields when a rect must shrink to fit.
 */
export function rectForPhysical(rect: NormRect, mockup: MockupPx, mm: PhysicalMm): NormRect {
  requirePositive(mockup.w, 'mockup width')
  requirePositive(mockup.h, 'mockup height')
  requirePositive(rect.w, 'rect width')
  requirePositive(rect.h, 'rect height')

  const target = physicalAspect(mm)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2

  // solve for w,h with (w*mockup.w)/(h*mockup.h) === target, preserving w*h
  const area = rect.w * rect.h
  const ratio = (target * mockup.h) / mockup.w      // w/h in normalised units
  let h = Math.sqrt(area / ratio)
  let w = ratio * h

  // If the solved rectangle doesn't fit, scale both dimensions by the same
  // factor to preserve the aspect ratio
  const k = Math.min(1 / w, 1 / h, 1)
  w *= k
  h *= k

  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h })
}

/**
 * Keep a rectangle inside the mockup. Slides it back if it overhangs; shrinks it
 * only if it is genuinely larger than the image.
 */
export function clampRect(rect: NormRect): NormRect {
  if (!(Number.isFinite(rect.x) && Number.isFinite(rect.y) && Number.isFinite(rect.w) && Number.isFinite(rect.h))) {
    throw new Error(`clampRect requires finite x, y, w, h, got { x: ${rect.x}, y: ${rect.y}, w: ${rect.w}, h: ${rect.h} }`)
  }

  const w = Math.min(Math.max(rect.w, 0), 1)
  const h = Math.min(Math.max(rect.h, 0), 1)
  const x = Math.min(Math.max(rect.x, 0), 1 - w)
  const y = Math.min(Math.max(rect.y, 0), 1 - h)
  return { x, y, w, h }
}
