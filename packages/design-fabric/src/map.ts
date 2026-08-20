import { FabricText, Shadow, type FabricObject } from 'fabric'
import { mmToPx, pxToMm, type DesignView, type TextObject } from '@kreart/design-core'
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
