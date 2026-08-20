import { setEnv } from 'fabric'
import { StaticCanvas, getEnv as getNodeFabricEnv } from 'fabric/node'
import { createCanvas } from 'canvas'
import {
  canvasSizePx, dpiToPxPerMm, type DesignDocument,
} from '@kreart/design-core'
import { mapView, type MediaResolver } from './map.js'

// Side-effect import, deliberately value-free: fonts-node.js installs the
// font-availability check that assertFontAvailable() consults. Without it
// that assertion is a no-op, so a weight nobody registered renders silently
// in whatever face node-canvas substitutes — a garment printed in the wrong
// typeface, which spec §11 requires us to fail on instead. The tests all
// import fonts-node.js themselves in order to register fonts, so they never
// noticed; a worker importing only this module did. This module is the node
// render entry point, so it is the right place to guarantee the guard is
// armed. Never add this to index.ts, which must stay browser-safe.
import './fonts-node.js'

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

/** PostScript points per millimetre. A PDF page is measured in points. */
export const PT_PER_MM = 72 / 25.4

/**
 * Vector PDF print master (spec §10.2).
 *
 * The page is sized in points so the PDF carries true physical dimensions.
 * The context is scaled so one drawing unit equals one millimetre, then Fabric
 * objects are rendered straight onto it — cairo converts glyphs to outlines,
 * so no font is embedded and nothing can be substituted downstream.
 *
 * Known limitation (spec §10.4): output is untagged device RGB.
 */
export async function renderViewToPdf(
  doc: DesignDocument,
  viewSlug: string,
  // No `dpi`: a PDF page carries true physical dimensions and its content is
  // vector, so there is no resolution to choose. The option used to be
  // accepted here and silently ignored, which reads as if it did something.
  opts: Omit<RenderOptions, 'dpi'>,
): Promise<Buffer> {
  const view = requireView(doc, viewSlug)

  // canvas@3.2.3's native Canvas constructor coerces width/height through
  // Napi's Uint32Value() before ever reaching cairo_pdf_surface_create -
  // there is no public API in this pinned version for a fractional-point
  // PDF page, so a plain `mm * PT_PER_MM` surface size gets floored. Per
  // spec §10.3 ("canvas dimensions round UP, never down" - the same reason
  // canvasSizePx uses Math.ceil), we round the page box UP instead: a
  // marginally oversized page a print shop's RIP trims, never one that
  // clips the artwork at the right or bottom edge. The drawing scale below
  // (ctx.scale(PT_PER_MM, PT_PER_MM)) is untouched by this, so the artwork
  // itself stays placed at its exact millimetre coordinates regardless of
  // the page box rounding.
  const surfaceWpt = Math.ceil(view.printAreaMm.w * PT_PER_MM)
  const surfaceHpt = Math.ceil(view.printAreaMm.h * PT_PER_MM)

  const pdf = createCanvas(surfaceWpt, surfaceHpt, 'pdf')
  const ctx = pdf.getContext('2d') as unknown as CanvasRenderingContext2D

  if (opts.backgroundColor) {
    ctx.fillStyle = opts.backgroundColor
    ctx.fillRect(0, 0, surfaceWpt, surfaceHpt)
  }

  ctx.save()
  // pxPerMm: 1 is deliberate — the context below is already scaled by
  // PT_PER_MM so one drawing unit equals one millimetre. Passing the print
  // DPI's px-per-mm here would scale the mapped objects a second time.
  ctx.scale(PT_PER_MM, PT_PER_MM)   // one unit == one millimetre
  for (const obj of await mapView(view, { pxPerMm: 1 }, opts.resolve)) {
    // Fabric's render cache draws the object into an offscreen HTMLCanvas
    // first and then blits that bitmap onto the target context. There is no
    // Fabric canvas here — objects are rendered straight onto a cairo PDF
    // context — so `drawCacheOnCanvas` receives a context with no cache
    // element and throws `TypeError: Image or Canvas expected`. FabricText
    // inherits `objectCaching = true`, so every straight text used to crash
    // this routine; CurvedText disables caching in its own constructor,
    // which is the only reason the PDF tests ever passed.
    //
    // Turning the cache off per object, here, is also what we want for
    // print regardless: a cached blit would rasterise glyphs at the cache
    // canvas's resolution, whereas the direct path lets cairo convert them
    // to vector outlines (spec §10.2). This is a property of the PDF
    // surface only — the PNG path renders through a real StaticCanvas and
    // keeps caching, and CurvedText's own default is untouched.
    obj.objectCaching = false
    obj.render(ctx)
  }
  ctx.restore()

  return pdf.toBuffer()
}
