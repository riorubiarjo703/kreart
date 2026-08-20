import { describe, it, expect } from 'vitest'
import { parseDesignDocument, SCHEMA_VERSION } from '../src/schema.js'

const validDoc = {
  schemaVersion: 1,
  productId: 'prod_1',
  sizeId: 'size_m',
  colourwayId: 'col_white',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [
        {
          id: 'o1', kind: 'image', mediaId: 'm1',
          xMm: 50, yMm: 60, wMm: 200, hMm: 150,
          rotation: 0, opacity: 1,
          sourcePx: { w: 2400, h: 1800 },
          background: 'original',
        },
        {
          id: 'o2', kind: 'text', text: 'AVATAR',
          xMm: 40, yMm: 250, wMm: 220, rotation: 0,
          font: { family: 'Inter', weight: 700, sizeMm: 20, letterSpacingMm: 1, lineHeight: 1.2 },
          fill: '#111111',
          curve: { radiusMm: 90, direction: 'up' },
        },
      ],
    },
  },
}

describe('designDocumentSchema', () => {
  it('accepts a valid document and reports the schema version', () => {
    const doc = parseDesignDocument(validDoc)
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.views.front!.objects).toHaveLength(2)
  })

  it('rejects an unknown schema version rather than guessing', () => {
    expect(() => parseDesignDocument({ ...validDoc, schemaVersion: 2 })).toThrow()
  })

  it('rejects a pixel-valued dimension leaking into the document', () => {
    const bad = structuredClone(validDoc)
    // @ts-expect-error deliberately wrong shape
    bad.views.front.objects[0].widthPx = 2400
    expect(() => parseDesignDocument(bad)).toThrow()
  })

  it('rejects unknown keys inside sourcePx specifically', () => {
    const bad = structuredClone(validDoc)
    // @ts-expect-error deliberately wrong shape
    bad.views.front.objects[0].sourcePx.extraPx = 999
    expect(() => parseDesignDocument(bad)).toThrow()
  })

  it('rejects negative millimetre dimensions', () => {
    const bad = structuredClone(validDoc)
    bad.views.front.objects[0]!.wMm = -10
    expect(() => parseDesignDocument(bad)).toThrow()
  })

  it('preserves curve settings on curved text', () => {
    const doc = parseDesignDocument(validDoc)
    const text = doc.views.front!.objects[1]!
    expect(text.kind).toBe('text')
    if (text.kind === 'text') {
      expect(text.curve?.direction).toBe('up')
      expect(text.curve?.radiusMm).toBe(90)
    }
  })

  it('leaves curve undefined on straight text', () => {
    const straight = structuredClone(validDoc)
    delete (straight.views.front.objects[1] as Record<string, unknown>).curve
    const doc = parseDesignDocument(straight)
    const text = doc.views.front!.objects[1]!
    if (text.kind === 'text') expect(text.curve).toBeUndefined()
  })
})
