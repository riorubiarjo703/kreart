import { describe, it, expect } from 'vitest'
import { rotatedBoundsMm } from '../src/geometry.js'
import { validatePlacement } from '../src/validate.js'
import type { DesignView } from '../src/schema.js'
import type { ImageObject, TextObject } from '../src/schema.js'

describe('rotatedBoundsMm', () => {
  it('leaves an unrotated rect unchanged', () => {
    const r = { xMm: 10, yMm: 20, wMm: 100, hMm: 50 }
    expect(rotatedBoundsMm(r, 0)).toEqual(r)
  })

  it('swaps width and height at 90 degrees, about the rect centre', () => {
    const b = rotatedBoundsMm({ xMm: 0, yMm: 0, wMm: 100, hMm: 50 }, 90)
    expect(b.wMm).toBeCloseTo(50, 6)
    expect(b.hMm).toBeCloseTo(100, 6)
    expect(b.xMm).toBeCloseTo(25, 6)   // centre stays at (50, 25)
    expect(b.yMm).toBeCloseTo(-25, 6)
  })

  it('grows the bounding box at 45 degrees', () => {
    const b = rotatedBoundsMm({ xMm: 0, yMm: 0, wMm: 100, hMm: 100 }, 45)
    expect(b.wMm).toBeCloseTo(141.421, 3)
  })
})

const view = (objects: DesignView['objects']): DesignView => ({
  printAreaMm: { w: 300, h: 400 }, objects,
})

const image = (over: Partial<Record<string, unknown>> = {}): ImageObject => ({
  id: 'i1', kind: 'image' as const, mediaId: 'm1',
  xMm: 10, yMm: 10, wMm: 100, hMm: 100,
  rotation: 0, opacity: 1,
  sourcePx: { w: 2400, h: 2400 }, background: 'original' as const,
  ...over,
} as ImageObject)

describe('validatePlacement', () => {
  it('passes an object fully inside the print area', () => {
    expect(validatePlacement(view([image()]), {})).toEqual([])
  })

  it('reports how far an object overflows each edge', () => {
    const issues = validatePlacement(view([image({ xMm: 250, yMm: -20 })]), {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.objectId).toBe('i1')
    expect(issues[0]!.overflowMm.right).toBeCloseTo(50, 6)   // 250 + 100 - 300
    expect(issues[0]!.overflowMm.top).toBeCloseTo(20, 6)
    expect(issues[0]!.overflowMm.left).toBe(0)
  })

  it('accounts for rotation when deciding containment', () => {
    // 100x100 at 45deg spans ~141mm, pushing it past the right edge
    const issues = validatePlacement(view([image({ xMm: 210, rotation: 45 })]), {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.overflowMm.right).toBeGreaterThan(0)
  })

  it('throws rather than guessing when a text height is not supplied', () => {
    const text: TextObject = {
      id: 't1', kind: 'text' as const, text: 'HI',
      xMm: 10, yMm: 10, wMm: 100, rotation: 0,
      font: { family: 'Inter', weight: 700, sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2 },
      fill: '#000',
    }
    expect(() => validatePlacement(view([text]), {})).toThrow(/t1/)
  })
})
