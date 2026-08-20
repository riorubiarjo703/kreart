import type { DesignObject, DesignView } from './schema.js'
import { rotatedBoundsMm, type RectMm } from './geometry.js'

export type PlacementIssue = {
  objectId: string
  overflowMm: { left: number; top: number; right: number; bottom: number }
}

/**
 * Height in mm for an object. Images carry their own; text height is derived from
 * font metrics in design-fabric and must be supplied. Missing values throw — a
 * guessed height would silently validate a design that does not fit (spec §11).
 */
function heightMm(obj: DesignObject, textHeightsMm: Record<string, number>): number {
  if (obj.kind === 'image') return obj.hMm
  const measured = textHeightsMm[obj.id]
  if (measured === undefined) {
    throw new Error(`No measured height supplied for text object ${obj.id}`)
  }
  return measured
}

/**
 * Authoritative print-area containment check. Run on the server: the client is
 * tamperable and the print area is a physical constraint (spec §6.2).
 */
export function validatePlacement(
  view: DesignView,
  textHeightsMm: Record<string, number>,
): PlacementIssue[] {
  const issues: PlacementIssue[] = []

  for (const obj of view.objects) {
    const rect: RectMm = {
      xMm: obj.xMm, yMm: obj.yMm,
      wMm: obj.wMm, hMm: heightMm(obj, textHeightsMm),
    }
    const b = rotatedBoundsMm(rect, obj.rotation)

    const overflowMm = {
      left: Math.max(0, -b.xMm),
      top: Math.max(0, -b.yMm),
      right: Math.max(0, b.xMm + b.wMm - view.printAreaMm.w),
      bottom: Math.max(0, b.yMm + b.hMm - view.printAreaMm.h),
    }

    if (overflowMm.left || overflowMm.top || overflowMm.right || overflowMm.bottom) {
      issues.push({ objectId: obj.id, overflowMm })
    }
  }

  return issues
}
