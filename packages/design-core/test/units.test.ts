import { describe, it, expect } from 'vitest'
import { MM_PER_INCH, dpiToPxPerMm, mmToPx, pxToMm, canvasSizePx } from '../src/units.js'

describe('units', () => {
  it('converts DPI to px/mm', () => {
    expect(dpiToPxPerMm(300)).toBeCloseTo(11.8110, 4)
    expect(dpiToPxPerMm(150)).toBeCloseTo(5.9055, 4)
    expect(MM_PER_INCH).toBe(25.4)
  })

  it('round-trips mm through px without drift', () => {
    const pxPerMm = dpiToPxPerMm(300)
    expect(pxToMm(mmToPx(220, pxPerMm), pxPerMm)).toBeCloseTo(220, 10)
  })

  it('rounds canvas dimensions UP, never down', () => {
    // 300mm @ 300dpi is 3543.307px - rounding down would lose 0.026mm of print area
    const size = canvasSizePx({ w: 300, h: 400 }, dpiToPxPerMm(300))
    expect(size.w).toBe(3544)
    expect(size.h).toBe(4725)
  })

  it('rejects a non-positive DPI rather than producing Infinity', () => {
    expect(() => dpiToPxPerMm(0)).toThrow(/positive/)
    expect(() => dpiToPxPerMm(-300)).toThrow(/positive/)
  })
})
