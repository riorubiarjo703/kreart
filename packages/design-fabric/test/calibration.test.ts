import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import { dpiToPxPerMm, MM_PER_INCH, type DesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import { renderViewToPng, renderViewToCanvas } from '../src/render-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
const BLACK = fileURLToPath(new URL('./fixtures/black-1200.png', import.meta.url))

const resolve: MediaResolver = async () =>
  (await loadImage(BLACK)) as unknown as CanvasImageSource

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

/** A 100mm x 100mm black square at 10mm,10mm inside a 300x400mm print area. */
const calibrationDoc: DesignDocument = {
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 'square', kind: 'image', mediaId: 'black',
        xMm: 10, yMm: 10, wMm: 100, hMm: 100,
        rotation: 0, opacity: 1,
        sourcePx: { w: 1200, h: 1200 }, background: 'original',
      }],
    },
  },
}

/** Bounding box of dark pixels, in pixels. */
async function inkBounds(png: Buffer) {
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)

  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      if (data[i]! < 60 && data[i + 1]! < 60 && data[i + 2]! < 60) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { wPx: maxX - minX + 1, hPx: maxY - minY + 1, minX, minY, imageW: img.width, imageH: img.height }
}

describe('calibration — the keystone test', () => {
  it('renders a 100mm square to its true physical size at 300 DPI', async () => {
    const png = await renderViewToPng(calibrationDoc, 'front', { dpi: 300, resolve })
    const b = await inkBounds(png)
    const pxPerMm = dpiToPxPerMm(300)

    const measuredWmm = b.wPx / pxPerMm
    const measuredHmm = b.hPx / pxPerMm

    // spec §10.3: documented tolerance is +/- 0.1mm
    expect(Math.abs(measuredWmm - 100)).toBeLessThan(0.1)
    expect(Math.abs(measuredHmm - 100)).toBeLessThan(0.1)
  })

  it('places the square at its specified offset', async () => {
    const png = await renderViewToPng(calibrationDoc, 'front', { dpi: 300, resolve })
    const b = await inkBounds(png)
    const pxPerMm = dpiToPxPerMm(300)
    expect(Math.abs(b.minX / pxPerMm - 10)).toBeLessThan(0.1)
    expect(Math.abs(b.minY / pxPerMm - 10)).toBeLessThan(0.1)
  })

  it('holds at 150 and 600 DPI, not just 300', async () => {
    for (const dpi of [150, 600]) {
      const png = await renderViewToPng(calibrationDoc, 'front', { dpi, resolve })
      const b = await inkBounds(png)
      expect(Math.abs(b.wPx / dpiToPxPerMm(dpi) - 100)).toBeLessThan(0.1)
    }
  })

  it('sizes the canvas to the print area, rounding up', async () => {
    const png = await renderViewToPng(calibrationDoc, 'front', { dpi: 300, resolve })
    const b = await inkBounds(png)
    expect(b.imageW).toBe(Math.ceil(300 * dpiToPxPerMm(300)))   // 3544
    expect(b.imageH).toBe(Math.ceil(400 * dpiToPxPerMm(300)))   // 4725
  })

  it('rejects an unknown view rather than rendering an empty canvas', async () => {
    await expect(
      renderViewToPng(calibrationDoc, 'back', { dpi: 300, resolve }),
    ).rejects.toThrow(/back/)
  })
})

describe('scale parity', () => {
  it('agrees in millimetres between editor and print scales within 0.01mm', async () => {
    const docWithText: DesignDocument = structuredClone(calibrationDoc)
    docWithText.views.front!.objects.push({
      id: 't1', kind: 'text', text: 'AVATAR WAVY',
      xMm: 20, yMm: 250, wMm: 260, rotation: 0,
      font: { family: 'InterTest', weight: 700, sizeMm: 22, letterSpacingMm: 1.5, lineHeight: 1.2 },
      fill: '#111111',
      curve: { radiusMm: 90, direction: 'up' },
    })

    const editorDpi = 1.8 * MM_PER_INCH   // 1.8 px/mm expressed as DPI
    const a = await renderViewToCanvas(docWithText, 'front', { dpi: editorDpi, resolve })
    const b = await renderViewToCanvas(docWithText, 'front', { dpi: 300, resolve })

    const aScale = dpiToPxPerMm(editorDpi)
    const bScale = dpiToPxPerMm(300)

    for (let i = 0; i < a.getObjects().length; i++) {
      const ra = a.getObjects()[i]!.getBoundingRect()
      const rb = b.getObjects()[i]!.getBoundingRect()
      expect(Math.abs(ra.width / aScale - rb.width / bScale)).toBeLessThan(0.01)
      expect(Math.abs(ra.height / aScale - rb.height / bScale)).toBeLessThan(0.01)
      expect(Math.abs(ra.left / aScale - rb.left / bScale)).toBeLessThan(0.01)
    }
  })
})
