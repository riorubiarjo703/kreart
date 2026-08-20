import { describe, it, expect, beforeAll } from 'vitest'
import { loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import { getEnv as getNodeFabricEnv } from 'fabric/node'
import { setEnv as setFabricEnv } from 'fabric'
import { mapImageObject, mapView, type MediaResolver } from '../src/index.js'
import type { ImageObject, DesignView } from '@kreart/design-core'

beforeAll(() => {
  // map.ts imports from the browser build of fabric so it stays bundler-safe
  // for the real editor. That build reads bare `document`/`window`
  // identifiers when a FabricImage computes its dimensions, which do not
  // exist under plain Node. Bridge with fabric's own jsdom-backed
  // environment (see map-text.test.ts for the same pattern).
  setFabricEnv(getNodeFabricEnv())
})

const BLACK = fileURLToPath(new URL('./fixtures/black-1200.png', import.meta.url))

const resolver: MediaResolver = async (mediaId) => {
  if (mediaId !== 'black') throw new Error(`Media not found: ${mediaId}`)
  return (await loadImage(BLACK)) as unknown as CanvasImageSource
}

const image = (over: Partial<ImageObject> = {}): ImageObject => ({
  id: 'i1', kind: 'image', mediaId: 'black',
  xMm: 10, yMm: 10, wMm: 100, hMm: 100,
  rotation: 0, opacity: 1,
  sourcePx: { w: 1200, h: 1200 }, background: 'original',
  ...over,
} as ImageObject)

describe('mapImageObject', () => {
  it('scales the source image to the requested physical size', async () => {
    const o = await mapImageObject(image(), { pxPerMm: 10 }, resolver)
    expect(o.getScaledWidth()).toBeCloseTo(1000, 0)   // 100mm * 10px/mm
    expect(o.getScaledHeight()).toBeCloseTo(1000, 0)
  })

  it('positions in pixels converted from millimetres', async () => {
    const o = await mapImageObject(image(), { pxPerMm: 10 }, resolver)
    expect(o.left).toBeCloseTo(100, 6)
  })

  it('applies opacity and rotation', async () => {
    const o = await mapImageObject(image({ opacity: 0.5, rotation: 30 }), { pxPerMm: 2 }, resolver)
    expect(o.opacity).toBe(0.5)
    expect(o.angle).toBe(30)
  })

  it('propagates a missing-media failure instead of rendering a blank', async () => {
    await expect(
      mapImageObject(image({ mediaId: 'gone' }), { pxPerMm: 2 }, resolver),
    ).rejects.toThrow(/Media not found: gone/)
  })

  it('requests the cutout when background is removed', async () => {
    const seen: string[] = []
    const spy: MediaResolver = async (id, bg) => { seen.push(bg); return resolver(id, bg) }
    await mapImageObject(image({ background: 'removed' }), { pxPerMm: 2 }, spy)
    expect(seen).toEqual(['removed'])
  })

  it('throws instead of dividing by a fallback when the resolved image has a zero dimension', async () => {
    const zero: MediaResolver = async () => ({ width: 0, height: 1200 } as unknown as CanvasImageSource)
    await expect(
      mapImageObject(image(), { pxPerMm: 2 }, zero),
    ).rejects.toThrow(/black/)
    await expect(
      mapImageObject(image(), { pxPerMm: 2 }, zero),
    ).rejects.toThrow(/0x1200/)
  })

  it('throws when the resolved image dimensions do not match the recorded sourcePx', async () => {
    const mismatched: MediaResolver = async () => ({ width: 600, height: 600 } as unknown as CanvasImageSource)
    await expect(
      mapImageObject(image(), { pxPerMm: 2 }, mismatched),
    ).rejects.toThrow(/black/)
    await expect(
      mapImageObject(image(), { pxPerMm: 2 }, mismatched),
    ).rejects.toThrow(/1200x1200/) // recorded sourcePx
    await expect(
      mapImageObject(image(), { pxPerMm: 2 }, mismatched),
    ).rejects.toThrow(/600x600/) // actual resolved image
  })
})

describe('mapView', () => {
  it('maps every object in document order', async () => {
    const view: DesignView = {
      printAreaMm: { w: 300, h: 400 },
      objects: [image(), image({ id: 'i2', xMm: 150 })],
    }
    const objects = await mapView(view, { pxPerMm: 2 }, resolver)
    expect(objects).toHaveLength(2)
    expect(objects[1]!.left).toBeCloseTo(300, 6)
  })
})
