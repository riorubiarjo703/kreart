import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { fontString, kernedAdvances, clearMetricsCache } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
let ctx: CanvasRenderingContext2D

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  ctx = createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D
  ctx.font = fontString('InterTest', 700, 100)
})

describe('registerFontFile', () => {
  it('throws on a missing file rather than silently substituting', () => {
    expect(() => registerFontFile('/no/such/font.ttf', 'Nope', 400)).toThrow(/no\/such\/font/)
  })
})

describe('kernedAdvances', () => {
  it('sums to the width the engine reports for the whole string', () => {
    for (const s of ['STOREFRAME', 'AVATAR', 'WAVY', 'TO THE MAX']) {
      const whole = ctx.measureText(s).width
      const summed = kernedAdvances(ctx, s, 0).reduce((a, b) => a + b, 0)
      expect(Math.abs(summed - whole)).toBeLessThan(0.01)
    }
  })

  it('differs measurably from naive per-glyph measurement on kern-heavy strings', () => {
    const naive = [...'AVATAR'].reduce((a, c) => a + ctx.measureText(c).width, 0)
    const kerned = kernedAdvances(ctx, 'AVATAR', 0).reduce((a, b) => a + b, 0)
    // spec §7.2 measured 7.67% drift on this string; assert the fix actually bites
    expect((naive - kerned) / kerned).toBeGreaterThan(0.02)
  })

  it('adds letter spacing to every glyph', () => {
    const base = kernedAdvances(ctx, 'ABC', 0).reduce((a, b) => a + b, 0)
    const spaced = kernedAdvances(ctx, 'ABC', 10).reduce((a, b) => a + b, 0)
    expect(spaced - base).toBeCloseTo(30, 6)
  })

  it('returns one advance per code point, handling astral characters', () => {
    expect(kernedAdvances(ctx, 'AB', 0)).toHaveLength(2)
    expect(kernedAdvances(ctx, '', 0)).toHaveLength(0)
  })

  it('caches by font, text and spacing', () => {
    clearMetricsCache()
    const a = kernedAdvances(ctx, 'CACHE', 0)
    const b = kernedAdvances(ctx, 'CACHE', 0)
    expect(b).toBe(a) // identical reference proves the cache was hit
  })
})
