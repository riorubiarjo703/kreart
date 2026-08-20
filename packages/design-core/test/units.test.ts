import { describe, it, expect } from 'vitest'
import { MM_PER_INCH, dpiToPxPerMm, mmToPx, pxToMm, canvasSizePx } from '../src/units.js'

describe('units', () => {
  it('converts DPI to px/mm', () => {
    expect(dpiToPxPerMm(300)).toBeCloseTo(11.8110, 4)
    expect(dpiToPxPerMm(150)).toBeCloseTo(5.9055, 4)
    expect(MM_PER_INCH).toBe(25.4)
  })

  it('converts mm to px independently', () => {
    const pxPerMm = dpiToPxPerMm(300)
    // 220mm @ 300dpi = 220 * (300/25.4) = 2598.4252px
    expect(mmToPx(220, pxPerMm)).toBeCloseTo(2598.4252, 4)
  })

  it('converts px to mm independently', () => {
    const pxPerMm = dpiToPxPerMm(300)
    // 2598.4252px @ 300dpi = 2598.4252 / (300/25.4) = 220mm
    expect(pxToMm(2598.4252, pxPerMm)).toBeCloseTo(220, 4)
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

  it('rejects DPI of 0', () => {
    expect(() => dpiToPxPerMm(0)).toThrow(/positive/)
  })

  it('rejects negative DPI', () => {
    expect(() => dpiToPxPerMm(-300)).toThrow(/positive/)
  })

  it('rejects NaN DPI', () => {
    expect(() => dpiToPxPerMm(NaN)).toThrow(/positive/)
  })

  it('rejects Infinity DPI', () => {
    expect(() => dpiToPxPerMm(Infinity)).toThrow(/positive/)
  })
})
