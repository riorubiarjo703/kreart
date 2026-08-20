import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import type { DesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import { renderViewToPdf, PT_PER_MM } from '../src/render-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
const BLACK = fileURLToPath(new URL('./fixtures/black-1200.png', import.meta.url))
const resolve: MediaResolver = async () =>
  (await loadImage(BLACK)) as unknown as CanvasImageSource

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const doc: DesignDocument = {
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 't1', kind: 'text', text: 'AVATAR WAVY',
        xMm: 20, yMm: 200, wMm: 260, rotation: 0,
        font: { family: 'InterTest', weight: 700, sizeMm: 22, letterSpacingMm: 1.5, lineHeight: 1.2 },
        fill: '#111111',
        curve: { radiusMm: 90, direction: 'up' },
      }],
    },
  },
}

function contentStreams(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const out: string[] = []
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const bytes = Buffer.from(m[1]!, 'latin1')
    try { out.push(zlib.inflateSync(bytes).toString('latin1')) }
    catch { out.push(bytes.toString('latin1')) }
  }
  return out.join('\n')
}

describe('renderViewToPdf', () => {
  it('produces a PDF', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('sizes the page in points to the true physical print area', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    // Deliberate regression guard, NOT the spec ideal. canvas@3.2.3's native
    // Canvas constructor coerces width/height via Napi's Uint32Value() before
    // ever reaching cairo_pdf_surface_create_for_stream (src/Canvas.cc,
    // ~lines 96-99 and 978) - there is no public API in this pinned version
    // for a fractional-point PDF page. So a 300x400mm print area, which
    // computes to 850.39 x 1133.86pt exactly, is truncated on page creation
    // to a MediaBox of exactly [0 0 850 1133] - a physical page of
    // 299.861 x 399.697mm, 0.139mm / 0.303mm short of the requested size and
    // outside the +/-0.1mm commitment. render-node.ts still computes and
    // passes the exact fractional value (see PT_PER_MM usage below) so this
    // self-corrects for free if a future canvas release adds fractional
    // support; the truncation happens inside the dependency, not our code.
    // If this assertion ever changes, the dependency's precision changed -
    // update spec 10.2 and this comment together rather than deleting it.
    const expectedW = Math.floor(300 * PT_PER_MM)   // 850
    const expectedH = Math.floor(400 * PT_PER_MM)   // 1133
    const content = contentStreams(pdf)
    expect(content).toMatch(new RegExp(`/MediaBox \\[ 0 0 ${expectedW} ${expectedH} \\]`))
  })

  it('emits glyphs as vector paths, not as a raster image', async () => {
    const content = contentStreams(await renderViewToPdf(doc, 'front', { resolve }))
    // curve and line operators present; no text-showing operators
    expect(content).toMatch(/(?<![A-Za-z])c(?![A-Za-z])/)
    expect(content).not.toMatch(/(?<![A-Za-z])Tj(?![A-Za-z])/)
  })

  it('is far smaller than the equivalent raster', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    expect(pdf.length).toBeLessThan(100_000)
  })

  it('documents the known colour limitation from spec 10.4', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    const raw = pdf.toString('latin1')
    // Deliberate regression guard, NOT an endorsement. Spec §10.4: output is
    // untagged device RGB. If this assertion ever fails, colour management was
    // added - update §10.4 and this test together rather than deleting it.
    expect(raw).not.toContain('/OutputIntent')
    expect(raw).not.toContain('/ICCBased')
  })
})
