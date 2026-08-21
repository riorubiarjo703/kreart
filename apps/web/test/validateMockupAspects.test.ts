import { describe, it, expect, vi } from 'vitest'
import { assertMockupAspectsAgree, validateMockupAspects } from '../src/hooks/validateMockupAspects'

const a = { label: 'white.png', width: 1000, height: 1250 }      // 0.8

describe('assertMockupAspectsAgree', () => {
  it('accepts identical dimensions', () => {
    expect(() => assertMockupAspectsAgree('front', [a, { ...a, label: 'black.png' }])).not.toThrow()
  })

  it('accepts a higher-resolution image of the same ratio', () => {
    const bigger = { label: 'white@3x.png', width: 3000, height: 3750 }
    expect(() => assertMockupAspectsAgree('front', [a, bigger])).not.toThrow()
  })

  it('rejects a re-crop, naming the view and both images', () => {
    const cropped = { label: 'black.png', width: 1000, height: 1000 }
    expect(() => assertMockupAspectsAgree('front', [a, cropped])).toThrow(/front/)
    expect(() => assertMockupAspectsAgree('front', [a, cropped])).toThrow(/white\.png/)
    expect(() => assertMockupAspectsAgree('front', [a, cropped])).toThrow(/black\.png/)
  })

  it('reports both aspect ratios in the message so the admin can act', () => {
    const cropped = { label: 'black.png', width: 1000, height: 1000 }
    let msg = ''
    try { assertMockupAspectsAgree('front', [a, cropped]) } catch (e) { msg = String(e) }
    expect(msg).toMatch(/0\.8/)
    expect(msg).toMatch(/1(\.0+)?/)
  })

  it('accepts a difference inside the 0.5% tolerance', () => {
    const rounded = { label: 'black.png', width: 1003, height: 1250 }   // 0.8024, +0.3%
    expect(() => assertMockupAspectsAgree('front', [a, rounded])).not.toThrow()
  })

  it('rejects a difference outside it', () => {
    const off = { label: 'black.png', width: 1020, height: 1250 }       // 0.816, +2%
    expect(() => assertMockupAspectsAgree('front', [a, off])).toThrow(/disagree/)
  })

  it('accepts zero or one mockup — nothing to compare against', () => {
    expect(() => assertMockupAspectsAgree('front', [])).not.toThrow()
    expect(() => assertMockupAspectsAgree('front', [a])).not.toThrow()
  })

  it('rejects a mockup with a non-positive dimension rather than dividing by zero', () => {
    expect(() => assertMockupAspectsAgree('front', [a, { label: 'bad.png', width: 0, height: 10 }]))
      .toThrow(/positive/)
  })

  it('rejects when the first mockup is the outlier among three', () => {
    const outlier = { label: 'first.png', width: 1000, height: 1000 }      // 1.0, the outlier
    const correct1 = { label: 'second.png', width: 1000, height: 1250 }    // 0.8
    const correct2 = { label: 'third.png', width: 800, height: 1000 }      // 0.8
    expect(() => assertMockupAspectsAgree('front', [outlier, correct1, correct2])).toThrow(/first\.png/)
  })

  it('rejects when two mockups sit at opposite tolerance edges, exceeding spread tolerance', () => {
    // A: 0.8 (baseline)
    // B: 0.8032 (+0.4%, within 0.5% of A)
    // C: 0.7968 (-0.4%, within 0.5% of A)
    // But B-C spread is 0.804%, exceeding the 0.5% tolerance
    const a1 = { label: 'a.png', width: 1000, height: 1250 }          // 0.8
    const b1 = { label: 'b.png', width: 1004, height: 1250 }          // 0.8032
    const c1 = { label: 'c.png', width: 996, height: 1250 }           // 0.7968
    // Error should name the two extreme images
    expect(() => assertMockupAspectsAgree('front', [a1, b1, c1])).toThrow(/disagree/)
  })
})

describe('validateMockupAspects (Payload wrapper)', () => {
  it('accepts a mockup whose image is already a populated object', async () => {
    const findByID = vi.fn()
    const req = { payload: { findByID } }
    const data = {
      views: [{
        slug: 'front',
        mockups: [{
          image: { id: 1, filename: 'mock.png', width: 1000, height: 1250 }
        }]
      }]
    }
    await validateMockupAspects(data, req as never)
    expect(findByID).not.toHaveBeenCalled()
  })

  it('calls findByID for a mockup whose image is a bare id', async () => {
    const findByID = vi.fn().mockResolvedValue({ id: 2, filename: 'found.png', width: 1000, height: 1250 })
    const req = { payload: { findByID } }
    const data = {
      views: [{
        slug: 'front',
        mockups: [{ image: 'media-id-123' }]
      }]
    }
    await validateMockupAspects(data, req as never)
    expect(findByID).toHaveBeenCalledWith({ collection: 'media', id: 'media-id-123', depth: 0 })
  })

  it('propagates a mismatch and rejects the save', async () => {
    const findByID = vi.fn()
    const req = { payload: { findByID } }
    const data = {
      views: [{
        slug: 'front',
        mockups: [
          { image: { id: 1, filename: 'a.png', width: 1000, height: 1250 } },
          { image: { id: 2, filename: 'b.png', width: 1000, height: 1000 } }
        ]
      }]
    }
    await expect(validateMockupAspects(data, req as never)).rejects.toThrow(/disagree/)
  })

  it('accepts a view with no mockups', async () => {
    const findByID = vi.fn()
    const req = { payload: { findByID } }
    const data = {
      views: [{
        slug: 'front',
        mockups: []
      }]
    }
    await validateMockupAspects(data, req as never)
    expect(findByID).not.toHaveBeenCalled()
  })
})
