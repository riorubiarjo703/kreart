import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { fontString, setMetricsContext, CurvedText, kernedAdvances } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))

let measureCtx: CanvasRenderingContext2D

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  measureCtx = createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D
  setMetricsContext(measureCtx)
})

const make = (over = {}) => new CurvedText({
  text: 'STOREFRAME', fontFamily: 'InterTest', fontWeight: 700,
  fontSize: 40, radius: 200, letterSpacing: 2, direction: 'up',
  fill: '#111', ...over,
})

// Independently recomputes the same inkTotal #recalc() uses internally, so
// tests can predict the exact geometry without reaching into private state.
function inkTotalFor(text: string, fontSize: number, letterSpacing: number): number {
  measureCtx.font = fontString('InterTest', 700, fontSize)
  const advances = kernedAdvances(measureCtx, text, letterSpacing)
  if (advances.length === 0) return 0
  return advances.reduce((a, b) => a + b, 0) - letterSpacing
}

describe('CurvedText', () => {
  it('reports a bounding box wide enough for the arc', () => {
    const t = make()
    expect(t.width).toBeGreaterThan(0)
    expect(t.height).toBeGreaterThan(0)
    // a shallow arc is much wider than tall
    expect(t.width).toBeGreaterThan(t.height)
  })

  it('scales its bounding box linearly with the scale factor', () => {
    const small = make()
    const large = make({ fontSize: 40 * 10, radius: 200 * 10, letterSpacing: 2 * 10 })
    expect(large.width / small.width).toBeCloseTo(10, 1)
    expect(large.height / small.height).toBeCloseTo(10, 1)
  })

  it('grows the bounding box when text is added', () => {
    expect(make({ text: 'STOREFRAME LONGER' }).width).toBeGreaterThan(make().width)
  })

  it('produces the same box for both arc directions', () => {
    const up = make({ direction: 'up' })
    const down = make({ direction: 'down' })
    expect(down.width).toBeCloseTo(up.width, 6)
    expect(down.height).toBeCloseTo(up.height, 6)
  })

  it('recalculates when a property is set after construction', () => {
    const t = make()
    const before = t.width
    t.set('text', 'STOREFRAME EXTENDED')
    expect(t.width).toBeGreaterThan(before)
  })

  it('round-trips through toObject/fromObject preserving geometry', async () => {
    const t = make()
    const json = t.toObject()
    expect(json.text).toBe('STOREFRAME')
    expect(json.radius).toBe(200)
    expect(json.direction).toBe('up')
    const revived = await CurvedText.fromObject(json)
    expect(revived.width).toBeCloseTo(t.width, 6)
    expect(revived.height).toBeCloseTo(t.height, 6)
  })

  it('rejects a radius so small the glyphs would overlap themselves', () => {
    expect(() => make({ radius: 1 })).toThrow(/radius/i)
  })

  it('renders without touching DOM globals', () => {
    const canvas = createCanvas(600, 400)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    ctx.translate(300, 200)
    expect(() => make().render(ctx)).not.toThrow()
    // something was actually drawn
    const { data } = canvas.getContext('2d').getImageData(0, 0, 600, 400)
    expect(data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true)
  })

  // Correction A: the arc must be centred on the ink (advances minus the one
  // trailing letter-space), not on the raw advance total. A left/right
  // symmetric string makes any residual half-letter-space bias visible as an
  // asymmetric ink bounding box around the render origin.
  it('centres the ink horizontally, unaffected by the trailing letter-space', () => {
    const size = 900
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    const cx = size / 2
    const cy = size / 2
    ctx.translate(cx, cy)

    const t = make({ text: 'OXO', fontSize: 80, radius: 250, letterSpacing: 24 })
    t.render(ctx)

    const { data } = canvas.getContext('2d').getImageData(0, 0, size, size)
    let minX = Infinity
    let maxX = -Infinity
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const alpha = data[(y * size + x) * 4 + 3]!
        if (alpha > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
        }
      }
    }
    expect(minX).toBeLessThan(maxX) // sanity: something was drawn
    const inkCenterX = (minX + maxX) / 2
    expect(Math.abs(inkCenterX - cx)).toBeLessThanOrEqual(2)
  })

  // Correction B: node-canvas silently substitutes the nearest registered
  // face for an unregistered weight, which is exactly the silent-wrong-metrics
  // failure mode the project forbids. CurvedText must fail loudly instead.
  it('throws when constructed with a font weight that was never registered', () => {
    expect(() => make({ fontWeight: 900 })).toThrow(/InterTest/)
    expect(() => make({ fontWeight: 900 })).toThrow(/900/)
  })

  it('does not throw for a font weight that was registered', () => {
    expect(() => make({ fontWeight: 700 })).not.toThrow()
  })

  // Review fix round 2: the wide-arc (half >= PI/2) height branch was a
  // constant 2*rOuter, correct only at half === PI (a fully closed ring).
  // For a point at angle theta from the top of a circle of radius r centred
  // below the text, y = -r*cos(theta); once half exceeds PI/2 the lowest ink
  // is at theta=half, giving height = rOuter*(1 - cos(half)) instead.
  it('uses the continuous wide-arc height formula, not a constant 2*rOuter', () => {
    const text = 'STOREFRAME'
    const fontSize = 40
    const letterSpacing = 2
    const radius = 70
    const inkTotal = inkTotalFor(text, fontSize, letterSpacing)
    const half = Math.min(inkTotal / radius / 2, Math.PI)
    expect(half).toBeGreaterThan(Math.PI / 2) // sanity: genuinely in the wide-arc branch

    const rOuter = radius + fontSize / 2
    const expectedHeight = rOuter * (1 - Math.cos(half))
    const wrongConstantHeight = 2 * rOuter

    const t = make({ text, fontSize, letterSpacing, radius })
    expect(t.height).toBeCloseTo(expectedHeight, 6)
    expect(Math.abs(t.height - wrongConstantHeight)).toBeGreaterThan(20)
  })

  it('is continuous across the half === PI/2 boundary, not off by ~2x', () => {
    const text = 'STOREFRAME'
    const fontSize = 40
    const letterSpacing = 2
    const inkTotal = inkTotalFor(text, fontSize, letterSpacing)

    // radius 100 -> half just below PI/2 (narrow-arc branch);
    // radius 90  -> half just above PI/2 (wide-arc branch).
    const belowRadius = 100
    const aboveRadius = 90
    const halfBelow = Math.min(inkTotal / belowRadius / 2, Math.PI)
    const halfAbove = Math.min(inkTotal / aboveRadius / 2, Math.PI)
    expect(halfBelow).toBeLessThan(Math.PI / 2)
    expect(halfAbove).toBeGreaterThan(Math.PI / 2)

    const below = make({ text, fontSize, letterSpacing, radius: belowRadius })
    const above = make({ text, fontSize, letterSpacing, radius: aboveRadius })

    // Heights come from different radii so they won't be identical, but they
    // must stay within a few percent of each other across the boundary — not
    // differ by ~2x the way the old constant-2*rOuter branch would.
    const ratio = above.height / below.height
    expect(ratio).toBeGreaterThan(0.9)
    expect(ratio).toBeLessThan(1.1)
  })

  it('declares a wide-arc height close to the actually rendered ink, not ~33% too tall', () => {
    const size = 900
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    const cx = size / 2
    const cy = size / 2
    ctx.translate(cx, cy)

    const text = 'STOREFRAME'
    const fontSize = 40
    const letterSpacing = 2
    const radius = 70
    const t = make({ text, fontSize, letterSpacing, radius })
    t.render(ctx)

    const { data } = canvas.getContext('2d').getImageData(0, 0, size, size)
    let minY = Infinity
    let maxY = -Infinity
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const alpha = data[(y * size + x) * 4 + 3]!
        if (alpha > 0) {
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    const renderedHeight = maxY - minY
    expect(renderedHeight).toBeGreaterThan(0)
    // Declared height should be a reasonable envelope around the rendered
    // ink, not the ~33% overstatement the constant-2*rOuter branch produced.
    expect(t.height).toBeGreaterThanOrEqual(renderedHeight)
    expect(t.height / renderedHeight).toBeLessThan(1.15)
  })
})
