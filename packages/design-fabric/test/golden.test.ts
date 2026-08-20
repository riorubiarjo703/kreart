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
    })
  }
})
