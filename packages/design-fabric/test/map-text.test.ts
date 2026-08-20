import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { getEnv as getNodeFabricEnv } from 'fabric/node'
import { setEnv as setFabricEnv } from 'fabric'
import { dpiToPxPerMm } from '@kreart/design-core'
import { setMetricsContext, mapTextObject, textHeightsMm, CurvedText } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import type { TextObject, DesignView } from '@kreart/design-core'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)

  // map.ts imports FabricText/Shadow from the "." (browser) build of fabric
  // so it stays bundler-safe for the real editor — see the "no DOM in this
  // module" constraint. That build reads bare `document`/`window`
  // identifiers the moment a FabricText computes its dimensions, which do
  // not exist under plain Node. Fabric's own docs sanction bridging this
  // with `setEnv`; reuse the jsdom-backed environment fabric already builds
  // for its "fabric/node" entry rather than adding another DOM dependency.
  setFabricEnv(getNodeFabricEnv())
})

const text = (over: Partial<TextObject> = {}): TextObject => ({
  id: 't1', kind: 'text', text: 'AVATAR',
  xMm: 50, yMm: 100, wMm: 200, rotation: 0,
  font: { family: 'InterTest', weight: 700, sizeMm: 20, letterSpacingMm: 1, lineHeight: 1.2 },
  fill: '#111111',
  ...over,
} as TextObject)

describe('mapTextObject', () => {
  it('converts millimetre position to pixels at the given scale', () => {
    const o = mapTextObject(text(), { pxPerMm: 2 })
    expect(o.left).toBeCloseTo(100, 6)   // 50mm * 2
    expect(o.top).toBeCloseTo(200, 6)
  })

  it('produces a CurvedText only when curve is present', () => {
    expect(mapTextObject(text(), { pxPerMm: 2 })).not.toBeInstanceOf(CurvedText)
    const curved = mapTextObject(
      text({ curve: { radiusMm: 90, direction: 'up' } }), { pxPerMm: 2 },
    )
    expect(curved).toBeInstanceOf(CurvedText)
  })

  it('scales stroke and shadow into pixels, not just position', () => {
    const o = mapTextObject(
      text({
        stroke: { color: '#000', widthMm: 2 },
        shadow: { offsetXMm: 1, offsetYMm: 2, blurMm: 3, color: 'rgba(0,0,0,0.5)' },
      }),
      { pxPerMm: 10 },
    )
    expect(o.strokeWidth).toBeCloseTo(20, 6)
    expect(o.shadow!.offsetX).toBeCloseTo(10, 6)
    expect(o.shadow!.blur).toBeCloseTo(30, 6)
  })

  it('is geometrically identical across scales once divided back to mm', () => {
    const editor = mapTextObject(text(), { pxPerMm: 1.8 })
    const print = mapTextObject(text(), { pxPerMm: dpiToPxPerMm(300) })
    const eMm = editor.getBoundingRect().width / 1.8
    const pMm = print.getBoundingRect().width / dpiToPxPerMm(300)
    expect(Math.abs(eMm - pMm)).toBeLessThan(0.01)
  })

  // Carried from Task 7's review: CurvedText already calls
  // assertFontAvailable() before building its font string, so an
  // unregistered weight fails loudly instead of node-canvas silently
  // substituting the nearest face. Without the same check on the straight
  // text path, curved text would fail loudly on a bad weight while straight
  // text silently prints in the wrong weight.
  it('throws when the straight text font weight was never registered', () => {
    expect(() => mapTextObject(
      text({ font: { family: 'InterTest', weight: 900, sizeMm: 20, letterSpacingMm: 1, lineHeight: 1.2 } }),
      { pxPerMm: 2 },
    )).toThrow(/InterTest/)
    expect(() => mapTextObject(
      text({ font: { family: 'InterTest', weight: 900, sizeMm: 20, letterSpacingMm: 1, lineHeight: 1.2 } }),
      { pxPerMm: 2 },
    )).toThrow(/900/)
  })

  it('does not throw when the straight text font weight was registered', () => {
    expect(() => mapTextObject(text(), { pxPerMm: 2 })).not.toThrow()
  })
})

describe('textHeightsMm', () => {
  it('reports a height in mm for every text object, keyed by id', () => {
    const view: DesignView = {
      printAreaMm: { w: 300, h: 400 },
      objects: [text(), text({ id: 't2', curve: { radiusMm: 90, direction: 'up' } })],
    }
    const heights = textHeightsMm(view, { pxPerMm: 1.8 })
    expect(Object.keys(heights).sort()).toEqual(['t1', 't2'])
    expect(heights.t1).toBeGreaterThan(0)
  })

  it('is scale-invariant', () => {
    const view: DesignView = { printAreaMm: { w: 300, h: 400 }, objects: [text()] }
    const a = textHeightsMm(view, { pxPerMm: 1.8 }).t1!
    const b = textHeightsMm(view, { pxPerMm: dpiToPxPerMm(300) }).t1!
    expect(Math.abs(a - b)).toBeLessThan(0.01)
  })
})
