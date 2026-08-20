import { MM_PER_INCH } from './units.js'
import type { DesignDocument, DesignView, ImageObject } from './schema.js'
import { requireTextHeightMm } from './text-height.js'

export type Guardrails = {
  targetDpi: number
  minTextHeightMm: number
  minStrokeWidthMm: number
}

/** Spec §3.4 / §15: starting values, pending a test print on the production printer. */
export const DEFAULT_GUARDRAILS: Guardrails = {
  targetDpi: 300,
  minTextHeightMm: 4,
  minStrokeWidthMm: 1,
}

export type WarningKind = 'lowDpi' | 'smallText' | 'thinStroke'

export type Warning = {
  objectId: string
  kind: WarningKind
  measured: number
  threshold: number
  unit: 'dpi' | 'mm'
}

/** Achievable DPI once the image is scaled to its physical size. Worst axis wins. */
export function effectiveDpi(obj: ImageObject): number {
  const dpiW = obj.sourcePx.w / (obj.wMm / MM_PER_INCH)
  const dpiH = obj.sourcePx.h / (obj.hMm / MM_PER_INCH)
  return Math.min(dpiW, dpiH)
}

export function collectWarnings(
  view: DesignView,
  g: Guardrails,
  textHeightsMm: Record<string, number>,
): Warning[] {
  const out: Warning[] = []

  for (const obj of view.objects) {
    if (obj.kind === 'image') {
      const dpi = effectiveDpi(obj)
      if (dpi < g.targetDpi) {
        out.push({ objectId: obj.id, kind: 'lowDpi', measured: dpi, threshold: g.targetDpi, unit: 'dpi' })
      }
      continue
    }

    const height = requireTextHeightMm(obj.id, textHeightsMm)
    if (height < g.minTextHeightMm) {
      out.push({
        objectId: obj.id, kind: 'smallText',
        measured: height, threshold: g.minTextHeightMm, unit: 'mm',
      })
    }

    if (obj.stroke && obj.stroke.widthMm > 0 && obj.stroke.widthMm < g.minStrokeWidthMm) {
      out.push({
        objectId: obj.id, kind: 'thinStroke',
        measured: obj.stroke.widthMm, threshold: g.minStrokeWidthMm, unit: 'mm',
      })
    }
  }

  return out
}

/**
 * Warnings the user has not individually acknowledged. Finalisation is blocked
 * while this is non-empty (spec §11.1). Matching is by object AND kind: one
 * blanket confirmation is not a record of informed consent.
 */
export function unacknowledgedWarnings(
  doc: DesignDocument,
  warnings: Warning[],
): Warning[] {
  const acked = new Set(
    (doc.acknowledgements ?? []).map((a) => `${a.objectId}:${a.kind}`),
  )
  return warnings.filter((w) => !acked.has(`${w.objectId}:${w.kind}`))
}
