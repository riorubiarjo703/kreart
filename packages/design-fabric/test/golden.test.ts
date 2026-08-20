import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { parseDesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import { renderViewToPng } from '../src/render-node.js'

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const FONT = dir('./fixtures/fonts/Inter-Bold.ttf')
const BLACK = dir('./fixtures/black-1200.png')

const resolve: MediaResolver = async () =>
  (await loadImage(BLACK)) as unknown as CanvasImageSource

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const CASES: { name: string; view: string }[] = [
  { name: 'curved-text', view: 'front' },
  { name: 'text-effects', view: 'front' },
  { name: 'rotated-image', view: 'front' },
  { name: 'multi-view', view: 'front' },
  { name: 'multi-view', view: 'back' },
]

/**
 * Bounding box of non-background (non-white, non-transparent) pixels.
 *
 * A pixel-count diff (pixelmatch below) is structurally blind to translation
 * of sparse content: shifting a large solid shape by a couple of pixels
 * barely changes how many pixels differ, so a systematic offset introduced
 * by e.g. a DPI or rounding regression can slip under the 0.1% ceiling
 * undetected. The ink bounding box moves with any such shift even when the
 * pixel count barely does, so comparing it independently catches what the
 * diff ratio alone cannot.
 */
function inkBBox(png: PNG): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2
      const r = png.data[idx]
      const g = png.data[idx + 1]
      const b = png.data[idx + 2]
      const a = png.data[idx + 3]
      if (a !== 0 && (r !== 255 || g !== 255 || b !== 255)) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

describe('golden images', () => {
  for (const { name, view } of CASES) {
    it(`${name} / ${view} matches its golden`, async () => {
      const doc = parseDesignDocument(
        JSON.parse(readFileSync(dir(`./fixtures/designs/${name}.json`), 'utf8')),
      )
      const actualPng = await renderViewToPng(doc, view, { dpi: 150, resolve })

      const goldenPath = dir(`./fixtures/golden/${name}-${view}.png`)
      expect(
        existsSync(goldenPath),
        `Missing golden ${name}-${view}.png. Run: pnpm test:update-goldens`,
      ).toBe(true)

      const actual = PNG.sync.read(actualPng)
      const golden = PNG.sync.read(readFileSync(goldenPath))

      expect(actual.width).toBe(golden.width)
      expect(actual.height).toBe(golden.height)

      const diff = new PNG({ width: actual.width, height: actual.height })
      const differing = pixelmatch(
        actual.data, golden.data, diff.data,
        actual.width, actual.height,
        { threshold: 0.1 },
      )

      // antialiasing varies slightly across cairo builds; 0.1% of pixels is the ceiling
      const ratio = differing / (actual.width * actual.height)
      expect(ratio).toBeLessThan(0.001)

      // Additional check: the pixel-diff ratio above is blind to a global
      // translation of sparse/solid content (a large shape shifted by a
      // couple of pixels barely changes the diff count). Compare ink
      // bounding boxes independently, with a small allowance for
      // antialiased-edge variation across cairo builds, to catch exactly
      // that failure mode.
      const actualBox = inkBBox(actual)
      const goldenBox = inkBBox(golden)
      const edges: Array<[string, number, number]> = [
        ['minX', actualBox.minX, goldenBox.minX],
        ['minY', actualBox.minY, goldenBox.minY],
        ['maxX', actualBox.maxX, goldenBox.maxX],
        ['maxY', actualBox.maxY, goldenBox.maxY],
      ]
      for (const [edge, a, b] of edges) {
        expect(
          Math.abs(a - b),
          `ink bbox ${edge} drifted: actual=${a}, golden=${b} (actual bbox ` +
            `[${actualBox.minX},${actualBox.minY}..${actualBox.maxX},${actualBox.maxY}], ` +
            `golden bbox [${goldenBox.minX},${goldenBox.minY}..${goldenBox.maxX},${goldenBox.maxY}])`,
        ).toBeLessThanOrEqual(1)
      }
    })
  }
})
