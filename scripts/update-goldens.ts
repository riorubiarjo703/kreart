import { createCanvas, loadImage } from 'canvas'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../packages/design-fabric/src/index.js'
import { registerFontFile } from '../packages/design-fabric/src/fonts-node.js'
import { renderViewToPng } from '../packages/design-fabric/src/render-node.js'

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const base = '../packages/design-fabric/test/fixtures'

registerFontFile(dir(`${base}/fonts/Inter-Bold.ttf`), 'InterTest', 700)
setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)

const resolve: MediaResolver = async () =>
  (await loadImage(dir(`${base}/black-1200.png`))) as unknown as CanvasImageSource

const CASES = [
  ['curved-text', 'front'], ['text-effects', 'front'],
  ['rotated-image', 'front'], ['multi-view', 'front'], ['multi-view', 'back'],
] as const

mkdirSync(dir(`${base}/golden`), { recursive: true })

for (const [name, view] of CASES) {
  const doc = parseDesignDocument(
    JSON.parse(readFileSync(dir(`${base}/designs/${name}.json`), 'utf8')),
  )
  const png = await renderViewToPng(doc, view, { dpi: 150, resolve })
  writeFileSync(dir(`${base}/golden/${name}-${view}.png`), png)
  console.log(`wrote ${name}-${view}.png`)
}
