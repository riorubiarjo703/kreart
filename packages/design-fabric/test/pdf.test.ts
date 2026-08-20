import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import type { DesignDocument, ImageObject } from '@kreart/design-core'
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

const imageDoc: DesignDocument = {
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 'i1', kind: 'image', mediaId: 'black',
        xMm: 50, yMm: 50, wMm: 100, hMm: 100,
        rotation: 0, opacity: 1,
        sourcePx: { w: 1200, h: 1200 }, background: 'original',
      } satisfies ImageObject],
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

  it('sizes the page box in points to never clip the physical print area', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    // canvas@3.2.3's native Canvas constructor coerces width/height through
    // Napi's Uint32Value() before ever reaching
    // cairo_pdf_surface_create_for_stream (src/Canvas.cc, ~lines 96-99 and
    // 978) - there is no public API in this pinned version for a
    // fractional-point PDF page. A 300x400mm print area computes to
    // 850.3937 x 1133.8583pt exactly; naively passing that straight through
    // gets floored to [0 0 850 1133], a physical page 0.139mm / 0.303mm
    // SHORT of the requested size on the right/bottom edge - which can clip
    // artwork drawn right up to that edge.
    //
    // Per spec §10.3 ("canvas dimensions round UP, never down" - the same
    // rule canvasSizePx applies via Math.ceil), renderViewToPdf rounds the
    // page box UP instead, to [0 0 851 1134]: a marginally oversized page
    // (300.14 x 400.05mm) a print shop's RIP trims, never one that clips.
    // This is a deliberate regression guard pinning the behaviour we WANT,
    // not the raw truncation canvas@3.2.3 would otherwise produce. The
    // artwork itself is unaffected by this rounding - see the "positions
    // artwork at its exact physical size" test below, which is what a print
    // shop actually measures.
    const expectedW = Math.ceil(300 * PT_PER_MM)   // 851
    const expectedH = Math.ceil(400 * PT_PER_MM)   // 1134
    const content = contentStreams(pdf)
    expect(content).toMatch(new RegExp(`/MediaBox \\[ 0 0 ${expectedW} ${expectedH} \\]`))
  })

  it('positions artwork at its exact physical size regardless of page-box rounding', async () => {
    // The PDF equivalent of Task 11's calibration test: what a print shop
    // actually measures is the artwork, not the page box. A FabricImage is
    // drawn into the PDF content stream as `<a> 0 0 <-d> <e> <f> cm` followed
    // by a `Do` operator invoking its XObject (verified empirically - cairo
    // does not use a `re` rect operator for images, unlike vector shapes).
    // The `<a>` component of that matrix is the image's drawn width in
    // points; it must reflect the requested 100mm exactly, since it is
    // computed via ctx.scale(PT_PER_MM, PT_PER_MM) - a transform the page-box
    // ceiling above never touches.
    const pdf = await renderViewToPdf(imageDoc, 'front', { resolve })
    const content = contentStreams(pdf)
    const m = content.match(/([\d.]+) 0 0 -[\d.]+ [\d.]+ [\d.]+ cm\s*\n\/a\d+ gs \/x\d+ Do/)
    expect(m, `no image "cm ... Do" pair found in:\n${content}`).not.toBeNull()
    const widthPt = Number(m![1])
    const widthMm = widthPt / PT_PER_MM
    expect(Math.abs(widthMm - 100)).toBeLessThan(0.01)   // within 0.01mm
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
