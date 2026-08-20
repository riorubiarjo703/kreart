import { describe, it, expect } from 'vitest'
import type { DesignDocument, TextObject } from '@kreart/design-core'
// Whole-branch review I4. This is DELIBERATELY the only design-fabric import
// in this file: every other test registers fonts through fonts-node.js and so
// installs the availability check as a side effect of its own setup, which is
// exactly what hid the defect. A worker that imports nothing but the node
// render entry used to get assertFontAvailable() as a silent no-op, so an
// unregistered weight printed in a substituted face — the opposite of spec
// §11's "font unavailable at render → hard fail". If anything in this file
// ever grows an import of fonts-node.js, the test stops proving anything.
import { renderViewToPng } from '../src/render-node.js'

const resolve = async () => {
  throw new Error('this design has no images')
}

const text: TextObject = {
  id: 't1', kind: 'text', text: 'SUBSTITUTED',
  xMm: 10, yMm: 10, wMm: 180, rotation: 0,
  font: { family: 'NeverRegistered', weight: 900, sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2 },
  fill: '#111111',
}

const doc: DesignDocument = {
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: { front: { printAreaMm: { w: 200, h: 200 }, objects: [text] } },
}

describe('render-node as the only entry point', () => {
  it('hard-fails on a font weight that was never registered', async () => {
    await expect(
      renderViewToPng(doc, 'front', { dpi: 150, resolve }),
    ).rejects.toThrow(/NeverRegistered/)
  })

  it('names the weight it refused, not just the family', async () => {
    await expect(
      renderViewToPng(doc, 'front', { dpi: 150, resolve }),
    ).rejects.toThrow(/900/)
  })
})
