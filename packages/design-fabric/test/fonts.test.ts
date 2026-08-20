import { describe, it, expect } from 'vitest'
import { assertFontAvailable, setFontAvailabilityCheck } from '../src/index.js'

// This file intentionally never imports fonts-node.ts, so no availability
// check is installed until a test in this file installs one itself. That
// lets the first test observe the true "nothing installed yet" state.
describe('assertFontAvailable', () => {
  it('is a no-op when no availability check has been installed', () => {
    expect(() => assertFontAvailable('Nonexistent', 400)).not.toThrow()
  })

  it('throws naming the family and weight when the installed check rejects it', () => {
    setFontAvailabilityCheck((family, weight) => family === 'Known' && weight === 400)
    expect(() => assertFontAvailable('Unknown', 700)).toThrow(/Unknown/)
    expect(() => assertFontAvailable('Unknown', 700)).toThrow(/700/)
  })

  it('does not throw when the installed check accepts the family/weight', () => {
    setFontAvailabilityCheck((family, weight) => family === 'Known' && weight === 400)
    expect(() => assertFontAvailable('Known', 400)).not.toThrow()
  })
})
