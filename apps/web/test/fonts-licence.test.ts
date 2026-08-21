import { describe, it, expect } from 'vitest'
import { assertLicencePermissions } from '../src/collections/Fonts'

describe('assertLicencePermissions', () => {
  it('accepts a font with both permissions granted', () => {
    expect(() => assertLicencePermissions({
      permitsServerRendering: true, permitsOutlineConversion: true,
    })).not.toThrow()
  })

  it('rejects an unset server-rendering permission', () => {
    expect(() => assertLicencePermissions({
      permitsOutlineConversion: true,
    })).toThrow(/server/i)
  })

  it('rejects an unset outline-conversion permission, explaining why it matters', () => {
    let msg = ''
    try { assertLicencePermissions({ permitsServerRendering: true }) } catch (e) { msg = String(e) }
    expect(msg).toMatch(/outline/i)
    expect(msg).toMatch(/PDF/)
  })

  it('rejects an explicit false, not merely undefined', () => {
    expect(() => assertLicencePermissions({
      permitsServerRendering: false, permitsOutlineConversion: true,
    })).toThrow(/server/i)
  })

  it('names both when both are missing', () => {
    let msg = ''
    try { assertLicencePermissions({}) } catch (e) { msg = String(e) }
    expect(msg).toMatch(/server/i)
    expect(msg).toMatch(/outline/i)
  })
})
