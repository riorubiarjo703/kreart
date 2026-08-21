import { describe, it, expect } from 'vitest'
import {
  ASPECT_TOLERANCE, onMockupAspect, physicalAspect, aspectsAgree,
  heightMmForRect, rectForPhysical, clampRect,
} from '../src/print-area.js'

const mockup = { w: 1000, h: 1250 }          // a 4:5 photograph

describe('onMockupAspect', () => {
  it('accounts for the mockup being non-square', () => {
    // half the width, half the height -> 500px by 625px -> 0.8
    expect(onMockupAspect({ x: 0.25, y: 0.2, w: 0.5, h: 0.5 }, mockup)).toBeCloseTo(0.8, 10)
  })

  it('is unaffected by position', () => {
    const a = onMockupAspect({ x: 0, y: 0, w: 0.5, h: 0.5 }, mockup)
    const b = onMockupAspect({ x: 0.4, y: 0.3, w: 0.5, h: 0.5 }, mockup)
    expect(a).toBeCloseTo(b, 10)
  })

  it('throws on a zero-height rect rather than returning Infinity', () => {
    expect(() => onMockupAspect({ x: 0, y: 0, w: 0.5, h: 0 }, mockup)).toThrow(/positive/)
  })

  it('throws on a non-positive mockup dimension', () => {
    expect(() => onMockupAspect({ x: 0, y: 0, w: 0.5, h: 0.5 }, { w: 0, h: 100 })).toThrow(/positive/)
  })
})

describe('physicalAspect', () => {
  it('is width over height', () => {
    expect(physicalAspect({ widthMm: 300, heightMm: 400 })).toBeCloseTo(0.75, 10)
  })

  it('throws on a non-positive height', () => {
    expect(() => physicalAspect({ widthMm: 300, heightMm: 0 })).toThrow(/positive/)
  })
})

describe('aspectsAgree', () => {
  const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }   // 0.8 on this mockup

  it('accepts an exact match', () => {
    expect(aspectsAgree(rect, mockup, { widthMm: 400, heightMm: 500 })).toBe(true)
  })

  it('accepts a difference inside the 0.5% tolerance', () => {
    // 0.8 * 1.004 = 0.8032 -> heightMm chosen to land just inside
    expect(aspectsAgree(rect, mockup, { widthMm: 401.6, heightMm: 500 })).toBe(true)
  })

  it('rejects a difference outside the tolerance', () => {
    expect(aspectsAgree(rect, mockup, { widthMm: 300, heightMm: 400 })).toBe(false)
  })

  it('rejects a square rect declaring a 3:4 physical size', () => {
    // the incoherence the spec calls out by name
    const square = { x: 0.25, y: 0.25, w: 0.4, h: 0.32 }   // 400x400px -> 1.0
    expect(aspectsAgree(square, mockup, { widthMm: 300, heightMm: 400 })).toBe(false)
  })

  it('honours a caller-supplied tolerance', () => {
    expect(aspectsAgree(rect, mockup, { widthMm: 300, heightMm: 400 }, 0.5)).toBe(true)
  })

  it('exposes the default tolerance as 0.005', () => {
    expect(ASPECT_TOLERANCE).toBe(0.005)
  })

  it('throws on a non-positive tolerance', () => {
    expect(() => aspectsAgree(rect, mockup, { widthMm: 400, heightMm: 500 }, 0)).toThrow(/positive/)
  })

  it('throws on a NaN tolerance', () => {
    expect(() => aspectsAgree(rect, mockup, { widthMm: 400, heightMm: 500 }, NaN)).toThrow(/positive/)
  })
})

describe('heightMmForRect', () => {
  it('derives the height that makes the aspects agree', () => {
    const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }      // 0.8
    const result = heightMmForRect(rect, mockup, 400)
    // Aspect 0.8 means h = w / 0.8 = 400 / 0.8 = 500
    expect(result).toBeCloseTo(500, 6)
  })

  it('round-trips: the derived height satisfies aspectsAgree', () => {
    const rect = { x: 0.1, y: 0.1, w: 0.37, h: 0.22 }
    const heightMm = heightMmForRect(rect, mockup, 260)
    // Verify it independently: aspect on mockup is (0.37*1000)/(0.22*1250) ≈ 1.34545
    const expectedAspect = (0.37 * 1000) / (0.22 * 1250)
    expect(260 / heightMm).toBeCloseTo(expectedAspect, 6)
    // Also verify aspectsAgree agrees
    expect(aspectsAgree(rect, mockup, { widthMm: 260, heightMm })).toBe(true)
  })

  it('throws on a non-positive widthMm', () => {
    const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }
    expect(() => heightMmForRect(rect, mockup, 0)).toThrow(/positive/)
  })
})

describe('rectForPhysical', () => {
  const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }

  it('reshapes about the rect centre, leaving the centre put', () => {
    const next = rectForPhysical(rect, mockup, { widthMm: 300, heightMm: 400 })
    expect(next.x + next.w / 2).toBeCloseTo(rect.x + rect.w / 2, 10)
    expect(next.y + next.h / 2).toBeCloseTo(rect.y + rect.h / 2, 10)
  })

  it('produces a rect whose aspect matches the requested physical size', () => {
    const next = rectForPhysical(rect, mockup, { widthMm: 300, heightMm: 400 })
    // Hand-computed: aspect 300/400 = 0.75
    const expectedAspect = 300 / 400
    const onPhotoAspect = (next.w * 1000) / (next.h * 1250)
    expect(onPhotoAspect).toBeCloseTo(expectedAspect, 5)
    // Also verify aspectsAgree agrees
    expect(aspectsAgree(next, mockup, { widthMm: 300, heightMm: 400 })).toBe(true)
  })

  it('is a no-op when the aspects already agree', () => {
    const next = rectForPhysical(rect, mockup, { widthMm: 400, heightMm: 500 })
    expect(next.w).toBeCloseTo(rect.w, 8)
    expect(next.h).toBeCloseTo(rect.h, 8)
  })

  it('keeps the result inside the mockup', () => {
    const edge = { x: 0.9, y: 0.9, w: 0.09, h: 0.09 }
    const next = rectForPhysical(edge, mockup, { widthMm: 400, heightMm: 100 })
    expect(next.x).toBeGreaterThanOrEqual(0)
    expect(next.y).toBeGreaterThanOrEqual(0)
    expect(next.x + next.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(next.y + next.h).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('shrinks to fit when necessary while preserving aspect', () => {
    // Original rect: {x:.25, y:.2, w:.5, h:.5}, requested 100 x 900 mm
    // Aspect 100/900 = 0.11111
    // On photo: (w*1000)/(h*1250) = 0.11111
    // With area = 0.25, solve: w/h = 0.11111, w*h = 0.25
    // h = sqrt(0.25/0.11111) = 1.50, w = 0.16667
    // Both exceed 1, so scale by k = min(1/0.16667, 1/1.50, 1) = 0.66667
    // Result should be ~0.11111 aspect and fully inside
    const testRect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }
    const next = rectForPhysical(testRect, mockup, { widthMm: 100, heightMm: 900 })
    expect(next.x).toBeGreaterThanOrEqual(0)
    expect(next.y).toBeGreaterThanOrEqual(0)
    expect(next.x + next.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(next.y + next.h).toBeLessThanOrEqual(1 + 1e-9)
    // Verify aspect is preserved
    expect(aspectsAgree(next, mockup, { widthMm: 100, heightMm: 900 })).toBe(true)
  })

  it('preserves area when no shrinking is needed', () => {
    const testRect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }
    const next = rectForPhysical(testRect, mockup, { widthMm: 400, heightMm: 500 })
    const originalArea = testRect.w * testRect.h
    const resultArea = next.w * next.h
    expect(resultArea).toBeCloseTo(originalArea, 8)
  })

  it('throws on a zero mockup width', () => {
    expect(() => rectForPhysical(rect, { w: 0, h: 1250 }, { widthMm: 300, heightMm: 400 })).toThrow(/positive/)
  })

  it('throws on a NaN mockup dimension', () => {
    expect(() => rectForPhysical(rect, { w: NaN, h: 1250 }, { widthMm: 300, heightMm: 400 })).toThrow(/positive/)
  })

  it('throws on a zero rect width', () => {
    expect(() => rectForPhysical({ x: 0.25, y: 0.2, w: 0, h: 0.5 }, mockup, { widthMm: 300, heightMm: 400 })).toThrow(/positive/)
  })
})

describe('clampRect', () => {
  it('leaves an inside rect alone', () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }
    expect(clampRect(r)).toEqual(r)
  })

  it('slides an overhanging rect back inside without resizing it', () => {
    const c = clampRect({ x: 0.8, y: 0.9, w: 0.5, h: 0.3 })
    expect(c.w).toBeCloseTo(0.5, 10)
    expect(c.h).toBeCloseTo(0.3, 10)
    expect(c.x).toBeCloseTo(0.5, 10)
    expect(c.y).toBeCloseTo(0.7, 10)
  })

  it('shrinks a rect larger than the mockup rather than overflowing', () => {
    const c = clampRect({ x: -0.2, y: -0.2, w: 1.5, h: 1.4 })
    expect(c).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('throws on a NaN x coordinate', () => {
    expect(() => clampRect({ x: NaN, y: 0.2, w: 0.5, h: 0.5 })).toThrow(/finite/)
  })

  it('throws on an Infinity dimension', () => {
    expect(() => clampRect({ x: 0.2, y: 0.2, w: Infinity, h: 0.5 })).toThrow(/finite/)
  })
})
