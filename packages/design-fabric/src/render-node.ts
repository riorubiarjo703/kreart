import { setEnv } from 'fabric'
import { StaticCanvas, getEnv as getNodeFabricEnv } from 'fabric/node'
import {
  canvasSizePx, dpiToPxPerMm, type DesignDocument,
} from '@kreart/design-core'
import { mapView, type MediaResolver } from './map.js'

// map.ts (and everything it builds — FabricText, CurvedText, Shadow, ...)
// imports from the "." (browser) build of fabric so it stays bundler-safe
// for the real editor. That build reads bare `document`/`window`
// identifiers the moment a Fabric object computes its dimensions, which do
// not exist under plain Node and throw `ReferenceError: document is not
// defined`. Fabric's own docs sanction bridging this with `setEnv`: hand
// the browser build the jsdom-backed environment that the "fabric/node"
// build already constructs for itself, rather than adding another DOM
// dependency of our own. The direction matters — `setEnv` must come from
// the browser build ('fabric') and `getEnv` from the node build
// ('fabric/node'); taking both from 'fabric/node' does not bridge anything,
// since that just feeds the node build's env back to itself.
//
// This must run at module load, before any Fabric object is constructed
// anywhere in this process — including inside mapView below — otherwise
// the render worker crashes the first time it maps a text object. Do not
// move or remove this: it looks redundant next to the `fabric/node` import
// but it is load-bearing.
setEnv(getNodeFabricEnv())

export type RenderOptions = {
  dpi: number
  resolve: MediaResolver
  backgroundColor?: string
}

function requireView(doc: DesignDocument, viewSlug: string) {
  const view = doc.views[viewSlug]
  if (!view) {
    throw new Error(
      `View "${viewSlug}" not present in design; have: ${Object.keys(doc.views).join(', ') || '(none)'}`,
    )
  }
  return view
}

export async function renderViewToCanvas(
  doc: DesignDocument,
  viewSlug: string,
  opts: RenderOptions,
): Promise<StaticCanvas> {
  const view = requireView(doc, viewSlug)
  const pxPerMm = dpiToPxPerMm(opts.dpi)
  const size = canvasSizePx(view.printAreaMm, pxPerMm)

  // `el` is typed `string | HTMLCanvasElement | undefined` (not `null`);
  // StaticCanvasDOMManager treats a falsy arg0 as "create one for me"
  // either way, so `undefined` is behaviourally identical to the brief's
  // `null` and satisfies the type checker.
  const canvas = new StaticCanvas(undefined, {
    width: size.w,
    height: size.h,
    backgroundColor: opts.backgroundColor ?? '#ffffff',
  })

  for (const obj of await mapView(view, { pxPerMm }, opts.resolve)) {
    canvas.add(obj)
  }
  canvas.renderAll()
  return canvas
}

export async function renderViewToPng(
  doc: DesignDocument,
  viewSlug: string,
  opts: RenderOptions,
): Promise<Buffer> {
  const canvas = await renderViewToCanvas(doc, viewSlug, opts)
  return canvas.getNodeCanvas().toBuffer('image/png')
}
