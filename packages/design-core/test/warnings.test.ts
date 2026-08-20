import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GUARDRAILS, effectiveDpi, collectWarnings, unacknowledgedWarnings,
} from '../src/warnings.js'
import type { DesignDocument, DesignView } from '../src/schema.js'

const img = (over = {}) => ({
  id: 'i1', kind: 'image' as const, mediaId: 'm1',
  xMm: 0, yMm: 0, wMm: 200, hMm: 150, rotation: 0, opacity: 1,
  sourcePx: { w: 2363, h: 1772 }, background: 'original' as const,
  ...over,
})

const txt = (over = {}) => ({
  id: 't1', kind: 'text' as const, text: 'HI',
  xMm: 0, yMm: 0, wMm: 100, rotation: 0,
  font: { family: 'Inter', weight: 700, sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2 },
  fill: '#000',
  ...over,
})

const view = (objects: DesignView['objects']): DesignView =>
  ({ printAreaMm: { w: 300, h: 400 }, objects })

describe('effectiveDpi', () => {
  it('computes DPI from source pixels over physical size', () => {
    // 2363px across 200mm == 200/25.4 = 7.874in -> ~300 dpi
    expect(effectiveDpi(img())).toBeCloseTo(300, 0)
  })

  it('takes the worse of the two axes', () => {
    const stretched = img({ sourcePx: { w: 2362, h: 400 } })
    expect(effectiveDpi(stretched)).toBeLessThan(100)
  })
})

describe('collectWarnings', () => {
  it('is silent when everything clears the guardrails', () => {
    expect(collectWarnings(view([img()]), DEFAULT_GUARDRAILS, { t1: 10 })).toEqual([])
  })

  it('warns on a low-resolution image, reporting measured and threshold', () => {
    const w = collectWarnings(view([img({ sourcePx: { w: 800, h: 600 } })]), DEFAULT_GUARDRAILS, {})
    expect(w).toHaveLength(1)
    expect(w[0]!.kind).toBe('lowDpi')
    expect(w[0]!.threshold).toBe(300)
    expect(w[0]!.unit).toBe('dpi')
    expect(w[0]!.measured).toBeLessThan(300)
  })

  it('warns on text below the minimum height', () => {
    const w = collectWarnings(view([txt()]), DEFAULT_GUARDRAILS, { t1: 3 })
    expect(w.map((x) => x.kind)).toEqual(['smallText'])
  })

  it('warns on a stroke thinner than the minimum', () => {
    const w = collectWarnings(
      view([txt({ stroke: { color: '#000', widthMm: 0.4 } })]),
      DEFAULT_GUARDRAILS, { t1: 10 },
    )
    expect(w.map((x) => x.kind)).toEqual(['thinStroke'])
  })

  it('reports every problem on one object separately, not merged', () => {
    const w = collectWarnings(
      view([txt({ stroke: { color: '#000', widthMm: 0.2 } })]),
      DEFAULT_GUARDRAILS, { t1: 2 },
    )
    expect(w.map((x) => x.kind).sort()).toEqual(['smallText', 'thinStroke'])
  })

  it('warns when DPI just below threshold (boundary test)', () => {
    // 2362px / (200mm / 25.4) = 299.974 dpi, which is strictly less than 300
    const w = collectWarnings(
      view([img({ sourcePx: { w: 2362, h: 1772 } })]),
      DEFAULT_GUARDRAILS, {},
    )
    expect(w).toHaveLength(1)
    expect(w[0]!.kind).toBe('lowDpi')
    expect(w[0]!.measured).toBeLessThan(300)
  })

  it('throws when text object height is not measured', () => {
    expect(() => {
      collectWarnings(view([txt()]), DEFAULT_GUARDRAILS, {})
    }).toThrow('No measured height supplied for text object t1')
  })
})

const doc = (warnings: DesignDocument['acknowledgements']): DesignDocument => ({
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: { front: view([img({ sourcePx: { w: 800, h: 600 } })]) },
  acknowledgements: warnings,
})

describe('unacknowledgedWarnings', () => {
  it('returns warnings with no matching acknowledgement', () => {
    const warnings = collectWarnings(doc(undefined).views.front!, DEFAULT_GUARDRAILS, {})
    expect(unacknowledgedWarnings(doc(undefined), warnings)).toHaveLength(1)
  })

  it('clears a warning acknowledged for the same object and kind', () => {
    const warnings = collectWarnings(doc(undefined).views.front!, DEFAULT_GUARDRAILS, {})
    const acked = doc([{
      objectId: 'i1', kind: 'lowDpi',
      shown: { measured: warnings[0]!.measured, threshold: 300, unit: 'dpi' },
      at: '2026-08-20T09:00:00.000Z',
    }])
    expect(unacknowledgedWarnings(acked, warnings)).toEqual([])
  })

  it('does not let an acknowledgement of one kind clear a different kind', () => {
    const warnings = collectWarnings(doc(undefined).views.front!, DEFAULT_GUARDRAILS, {})
    const acked = doc([{
      objectId: 'i1', kind: 'smallText',
      shown: { measured: 1, threshold: 4, unit: 'mm' },
      at: '2026-08-20T09:00:00.000Z',
    }])
    expect(unacknowledgedWarnings(acked, warnings)).toHaveLength(1)
  })
})
