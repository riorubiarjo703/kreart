import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { DEFAULT_GUARDRAILS } from '@kreart/design-core'
import { setMetricsContext } from '@kreart/design-fabric'
import { registerFontFile } from '@kreart/design-fabric/fonts-node'
import { validateDesignForSave } from '../src/lib/validateDesign'

const FONT = fileURLToPath(
  new URL('../../../packages/design-fabric/test/fixtures/fonts/Inter-Bold.ttf', import.meta.url),
)

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const base = () => ({
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 'i1', kind: 'image', mediaId: 'm1',
        xMm: 10, yMm: 10, wMm: 100, hMm: 100,
        rotation: 0, opacity: 1,
        sourcePx: { w: 1200, h: 1200 }, background: 'original',
      }],
    },
  },
})

describe('validateDesignForSave', () => {
  it('accepts a valid in-bounds design', () => {
    const r = validateDesignForSave({ document: base(), guardrails: DEFAULT_GUARDRAILS, finalising: false })
    expect(r.warnings).toEqual([])
    expect(r.unacknowledged).toEqual([])
  })

  it('rejects a document that fails the schema', () => {
    const bad: any = base(); bad.schemaVersion = 2
    expect(() => validateDesignForSave({ document: bad, guardrails: DEFAULT_GUARDRAILS, finalising: false }))
      .toThrow()
  })

  it('rejects an object overflowing the print area, naming it', () => {
    const bad: any = base(); bad.views.front.objects[0].xMm = 250
    expect(() => validateDesignForSave({ document: bad, guardrails: DEFAULT_GUARDRAILS, finalising: false }))
      .toThrow(/i1/)
  })

  it('reports a low-DPI warning without rejecting a draft', () => {
    const low: any = base(); low.views.front.objects[0].sourcePx = { w: 400, h: 400 }
    const r = validateDesignForSave({ document: low, guardrails: DEFAULT_GUARDRAILS, finalising: false })
    expect(r.warnings.map((w) => w.kind)).toEqual(['lowDpi'])
    expect(r.unacknowledged).toHaveLength(1)
  })

  it('blocks finalisation while a warning is unacknowledged', () => {
    const low: any = base(); low.views.front.objects[0].sourcePx = { w: 400, h: 400 }
    expect(() => validateDesignForSave({ document: low, guardrails: DEFAULT_GUARDRAILS, finalising: true }))
      .toThrow(/acknowledge/i)
  })

  it('allows finalisation once the warning is acknowledged', () => {
    const low: any = base()
    low.views.front.objects[0].sourcePx = { w: 400, h: 400 }
    low.acknowledgements = [{
      objectId: 'i1', kind: 'lowDpi',
      shown: { measured: 101.6, threshold: 300, unit: 'dpi' },
      at: '2026-08-20T09:00:00.000Z',
    }]
    expect(() => validateDesignForSave({ document: low, guardrails: DEFAULT_GUARDRAILS, finalising: true }))
      .not.toThrow()
  })

  it('measures text heights rather than guessing them', () => {
    const withText: any = base()
    withText.views.front.objects.push({
      id: 't1', kind: 'text', text: 'HELLO',
      xMm: 20, yMm: 300, wMm: 200, rotation: 0,
      font: { family: 'InterTest', weight: 700, sizeMm: 2, letterSpacingMm: 0, lineHeight: 1.2 },
      fill: '#000000',
    })
    // 2mm type is below the 4mm floor, so a smallText warning must appear —
    // which is only possible if the height was actually measured
    const r = validateDesignForSave({ document: withText, guardrails: DEFAULT_GUARDRAILS, finalising: false })
    expect(r.warnings.map((w) => w.kind)).toContain('smallText')
  })
})
