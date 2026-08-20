import { FabricImage, FabricText, Shadow, type FabricObject } from 'fabric'
import { mmToPx, pxToMm, type DesignView, type ImageObject, type TextObject } from '@kreart/design-core'
import { CurvedText } from './curved-text.js'
import { assertFontAvailable } from './fonts.js'

export type MapContext = { pxPerMm: number }

/**
 * Build a Fabric object from a text object. Every dimension is converted from mm
 * at this boundary; nothing downstream sees millimetres, nothing upstream sees pixels.
 */
export function mapTextObject(obj: TextObject, { pxPerMm }: MapContext): FabricObject {
  const px = (mm: number) => mmToPx(mm, pxPerMm)

  const shared = {
    left: px(obj.xMm),
    top: px(obj.yMm),
    angle: obj.rotation,
    fill: obj.fill,
    originX: 'left' as const,
    originY: 'top' as const,
    stroke: obj.stroke?.color ?? null,
    strokeWidth: obj.stroke ? px(obj.stroke.widthMm) : 0,
    shadow: obj.shadow
      ? new Shadow({
          color: obj.shadow.color,
          offsetX: px(obj.shadow.offsetXMm),
          offsetY: px(obj.shadow.offsetYMm),
          blur: px(obj.shadow.blurMm),
        })
      : null,
  }

  if (obj.curve) {
    return new CurvedText({
      ...shared,
      text: obj.text,
      fontFamily: obj.font.family,
      fontWeight: obj.font.weight,
      fontSize: px(obj.font.sizeMm),
      letterSpacing: px(obj.font.letterSpacingMm),
      radius: px(obj.curve.radiusMm),
      direction: obj.curve.direction,
    } as Partial<CurvedText>)
  }

  // CurvedText already calls assertFontAvailable() before building its font
  // string, so an unregistered weight fails loudly instead of node-canvas
  // silently substituting the nearest face. Mirror that here for the
  // straight-text path so the two paths agree: without this, curved text
  // would fail loudly on a bad weight while straight text silently printed
  // in the wrong weight.
  assertFontAvailable(obj.font.family, obj.font.weight)

  return new FabricText(obj.text, {
    ...shared,
    fontFamily: obj.font.family,
    fontWeight: obj.font.weight,
    fontSize: px(obj.font.sizeMm),
    lineHeight: obj.font.lineHeight,
    charSpacing: (obj.font.letterSpacingMm / obj.font.sizeMm) * 1000, // Fabric uses 1/1000 em
    backgroundColor: obj.background?.color,
  })
}

/**
 * Measured height in mm for each text object in a view.
 *
 * design-core refuses to guess text heights (Tasks 4 and 5) because a guessed
 * height silently validates a design that does not fit. This is the supplier.
 */
export function textHeightsMm(view: DesignView, ctx: MapContext): Record<string, number> {
  const out: Record<string, number> = {}
  for (const obj of view.objects) {
    if (obj.kind !== 'text') continue
    const mapped = mapTextObject(obj, ctx)
    out[obj.id] = pxToMm(mapped.getBoundingRect().height, ctx.pxPerMm)
  }
  return out
}

/**
 * Resolves a media id to a drawable image. Must reject on missing media:
 * silently rendering a blank would ship a garment with a hole in the design (spec §11).
 */
export type MediaResolver = (
  mediaId: string,
  background: 'original' | 'removed',
) => Promise<CanvasImageSource>

export async function mapImageObject(
  obj: ImageObject,
  { pxPerMm }: MapContext,
  resolve: MediaResolver,
): Promise<FabricObject> {
  const source = await resolve(obj.mediaId, obj.background)
  const img = new FabricImage(source as never, {
    left: mmToPx(obj.xMm, pxPerMm),
    top: mmToPx(obj.yMm, pxPerMm),
    angle: obj.rotation,
    opacity: obj.opacity,
    originX: 'left',
    originY: 'top',
  })

  // Fail loudly rather than dividing by a fallback: a resolved image with a
  // non-positive dimension would otherwise silently produce a nonsensical
  // scale factor instead of an error (spec §11 — no silent substitution).
  if (!Number.isFinite(img.width) || !Number.isFinite(img.height) || img.width <= 0 || img.height <= 0) {
    throw new Error(
      `Media "${obj.mediaId}" resolved to an image with invalid dimensions ${img.width}x${img.height} (both must be positive)`,
    )
  }

  // The document's stored sourcePx (used elsewhere, e.g. effectiveDpi's print-quality
  // guardrail) must describe the same pixels this function actually scales from.
  // If media was swapped or metadata went stale, the guardrail would silently report
  // a DPI the render does not have. Fail loudly instead of trusting stale metadata.
  if (img.width !== obj.sourcePx.w || img.height !== obj.sourcePx.h) {
    throw new Error(
      `Media "${obj.mediaId}" sourcePx mismatch: recorded ${obj.sourcePx.w}x${obj.sourcePx.h}, resolved image is ${img.width}x${img.height}`,
    )
  }

  // scale the intrinsic pixels down to the requested physical size
  img.scaleX = mmToPx(obj.wMm, pxPerMm) / img.width
  img.scaleY = mmToPx(obj.hMm, pxPerMm) / img.height

  return img
}

export async function mapView(
  view: DesignView,
  ctx: MapContext,
  resolve: MediaResolver,
): Promise<FabricObject[]> {
  const out: FabricObject[] = []
  for (const obj of view.objects) {
    out.push(
      obj.kind === 'image'
        ? await mapImageObject(obj, ctx, resolve)
        : mapTextObject(obj, ctx),
    )
  }
  return out
}
