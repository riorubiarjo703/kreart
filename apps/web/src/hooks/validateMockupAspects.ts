import { ASPECT_TOLERANCE } from '@kreart/design-core'

export type MockupDims = { label: string; width: number; height: number }

/**
 * Every mockup for a view must share one aspect ratio.
 *
 * The print area's position is stored in normalised 0-1 coordinates precisely so
 * a mockup can be replaced with a higher-resolution one without redefining the
 * geometry (project spec §3.1). That only holds if the ratio is unchanged: a
 * re-crop silently moves the print area, and nobody finds out until a garment is
 * printed wrong. So this refuses rather than warns (project spec §15, assumption 6).
 */
export function assertMockupAspectsAgree(
  viewSlug: string,
  mockups: MockupDims[],
  tolerance: number = ASPECT_TOLERANCE,
): void {
  if (mockups.length < 2) return

  for (const m of mockups) {
    if (!(Number.isFinite(m.width) && m.width > 0) || !(Number.isFinite(m.height) && m.height > 0)) {
      throw new Error(
        `Mockup "${m.label}" on view "${viewSlug}" has a non-positive dimension ` +
        `(${m.width}x${m.height}). It cannot be used as a mockup.`,
      )
    }
  }

  const ratios = mockups.map(m => ({ label: m.label, width: m.width, height: m.height, ratio: m.width / m.height }))
  const minRatio = Math.min(...ratios.map(r => r.ratio))
  const maxRatio = Math.max(...ratios.map(r => r.ratio))

  if ((maxRatio - minRatio) / minRatio > tolerance) {
    const minMockup = ratios.find(r => r.ratio === minRatio)!
    const maxMockup = ratios.find(r => r.ratio === maxRatio)!
    throw new Error(
      `View "${viewSlug}": mockup aspect ratios disagree. ` +
      `"${minMockup.label}" is ${minMockup.width}x${minMockup.height} (${minRatio.toFixed(4)}) and ` +
      `"${maxMockup.label}" is ${maxMockup.width}x${maxMockup.height} (${maxRatio.toFixed(4)}). ` +
      `They must share one ratio, because the print area is positioned in normalised coordinates. ` +
      `One of these is wrongly cropped.`,
    )
  }
}

/** Payload-facing wrapper: resolves media ids to dimensions, then asserts. */
export async function validateMockupAspects(
  data: { views?: { slug?: string | null; mockups?: { image?: unknown }[] }[] } | undefined,
  req: { payload: { findByID: (a: { collection: string; id: string | number; depth?: number }) => Promise<any> } },
): Promise<void> {
  for (const view of data?.views ?? []) {
    const dims: MockupDims[] = []
    for (const mockup of view.mockups ?? []) {
      const image: any = mockup.image
      const doc = typeof image === 'object' && image !== null
        ? image
        : await req.payload.findByID({ collection: 'media', id: image as string, depth: 0 })
      if (!doc) continue
      dims.push({
        label: doc.filename ?? String(doc.id),
        width: doc.width,
        height: doc.height,
      })
    }
    assertMockupAspectsAgree(view.slug ?? '(unnamed view)', dims)
  }
}
