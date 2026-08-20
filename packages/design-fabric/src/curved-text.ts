import { FabricObject, classRegistry } from 'fabric'
import { kernedAdvances } from './metrics.js'
import { fontString, assertFontAvailable } from './fonts.js'

/** Minimum ratio of radius to the circle radius the text would need to close on itself. */
export const MIN_RADIUS_RATIO = 1.2

let metricsCtx: CanvasRenderingContext2D | undefined

/** The scratch 2D context used for text measurement. Set once per environment. */
export function setMetricsContext(ctx: CanvasRenderingContext2D): void {
  metricsCtx = ctx
}

function requireMetricsCtx(): CanvasRenderingContext2D {
  if (!metricsCtx) throw new Error('setMetricsContext() must be called before using CurvedText')
  return metricsCtx
}

export class CurvedText extends FabricObject {
  static type = 'CurvedText'

  declare text: string
  declare fontSize: number
  declare fontFamily: string
  declare fontWeight: number
  declare letterSpacing: number
  declare radius: number
  declare direction: 'up' | 'down'
  declare strokeWidth: number

  #cy = 0

  static ownDefaults = {
    text: '', fontSize: 40, fontFamily: 'sans-serif', fontWeight: 400,
    letterSpacing: 0, radius: 200, direction: 'up' as const,
    fill: '#000000', stroke: null, strokeWidth: 0,
  }

  static getDefaults() {
    return { ...super.getDefaults(), ...CurvedText.ownDefaults }
  }

  constructor(options: Partial<CurvedText> = {}) {
    super()
    Object.assign(this, CurvedText.getDefaults(), options)
    this.objectCaching = false   // spec §7.4: curved text cannot use Fabric's render cache
    this.#recalc()
  }

  #font(): string {
    // node-canvas silently substitutes the nearest registered weight for one
    // that was never registered, returning plausible-but-wrong metrics — the
    // project forbids silent substitution (spec §11), so fail loudly here,
    // at the single place this class builds a font string.
    assertFontAvailable(this.fontFamily, this.fontWeight)
    return fontString(this.fontFamily, this.fontWeight, this.fontSize)
  }

  #advances(): number[] {
    const ctx = requireMetricsCtx()
    ctx.font = this.#font()
    return kernedAdvances(ctx, this.text, this.letterSpacing)
  }

  // kernedAdvances (spec §7.2) adds letterSpacing after every glyph,
  // including the last, matching CSS/Fabric convention. That trailing
  // letter-space has no glyph after it, so it is not part of the visible
  // ink — subtract exactly one to get the extent the arc must actually be
  // centred and sized on. Guard the zero-glyph case: with no glyphs there is
  // no trailing space to subtract either.
  #inkTotal(advances: number[]): number {
    if (advances.length === 0) return 0
    const total = advances.reduce((a, b) => a + b, 0)
    return total - this.letterSpacing
  }

  #recalc(): this {
    const advances = this.#advances()
    const inkTotal = this.#inkTotal(advances)

    // the radius at which the text would exactly close the circle
    const closingRadius = inkTotal / (2 * Math.PI)
    if (inkTotal > 0 && this.radius < closingRadius * MIN_RADIUS_RATIO) {
      throw new Error(
        `radius ${this.radius} is too small for this text; minimum is ` +
        `${(closingRadius * MIN_RADIUS_RATIO).toFixed(2)}`,
      )
    }

    const R = this.radius
    const em = this.fontSize
    const rOuter = R + em / 2
    const rInner = Math.max(R - em / 2, 0)
    const half = Math.min(inkTotal / R / 2, Math.PI)

    this.width = Math.max(2 * (half >= Math.PI / 2 ? rOuter : rOuter * Math.sin(half)), 1)
    this.height = Math.max(
      // The wide-arc branch used to be a constant 2*rOuter, correct only at
      // half === PI (a closed ring). For a point at angle theta from the top
      // of a circle of radius r centred below the text, y = -r*cos(theta); the
      // topmost ink is at theta=0 (y=-rOuter) and, once half exceeds PI/2, the
      // lowest ink is at theta=half (y=-rOuter*cos(half)), giving a height of
      // rOuter*(1 - cos(half)) — continuous with the narrow-arc branch below at
      // half === PI/2 (both give rOuter there), unlike the old constant, which
      // jumped by 2x at the boundary.
      half >= Math.PI / 2 ? rOuter * (1 - Math.cos(half)) : rOuter - rInner * Math.cos(half),
      1,
    )

    // circle centre in the object's local frame, origin at the object centre, y down
    this.#cy = this.direction === 'down'
      ? this.height / 2 - rOuter
      : -this.height / 2 + rOuter

    return this
  }

  set(key: string | Record<string, unknown>, value?: unknown): this {
    const result = super.set(key as never, value as never)
    const keys = typeof key === 'object' ? Object.keys(key) : [key]
    const geometric = ['text', 'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'radius', 'direction']
    if (keys.some((k) => geometric.includes(k))) this.#recalc()
    return result as this
  }

  _render(ctx: CanvasRenderingContext2D): void {
    const advances = this.#advances()
    const chars = [...this.text]
    const total = advances.reduce((a, b) => a + b, 0)
    const R = this.radius
    const down = this.direction === 'down'

    ctx.save()
    ctx.font = this.#font()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (this.fill) ctx.fillStyle = this.fill as string
    if (this.stroke && this.strokeWidth > 0) {
      ctx.strokeStyle = this.stroke as string
      ctx.lineWidth = this.strokeWidth
      ctx.lineJoin = 'round'
    }

    ctx.translate(0, this.#cy)

    // DELIBERATE DEVIATION from the brief's Correction A for this one line —
    // see "Concerns about the brief" in the Task 8 report for the full
    // derivation and empirical proof. Short version: each glyph is drawn
    // with textAlign='center', which centres the glyph on its OWN native
    // width, not on its "cell" (advances[i], which bundles in kerning-to-next
    // and letterSpacing). Stepping by advances[i]/2 on each side already
    // places each glyph's native centre at a position that is biased right by
    // (kern_i + letterSpacing)/2 relative to true sequential typesetting —
    // and starting from -(total/R)/2 (the RAW advance sum, trailing
    // letter-space included) cancels that bias exactly, because the same
    // trailing letter-space appears once in `total` and once in the bias sum.
    // Switching the start angle to `-(inkTotal/R)/2` (total minus one
    // trailing letterSpacing, as Correction A specifies) removes that
    // cancellation and re-introduces a rightward drift of letterSpacing/2 —
    // confirmed both analytically and empirically (rendered pixel centroid
    // measured directly). inkTotal is still the right quantity for sizing the
    // bounding box and the minimum-radius guard in #recalc(), because that
    // bias only affects *where* the ink sits relative to local x=0, not how
    // wide the ink span is — so #recalc() keeps using inkTotal per the brief.
    let angle = -(total / R) / 2
    for (let i = 0; i < chars.length; i++) {
      const advance = advances[i]!
      angle += advance / 2 / R
      ctx.save()
      if (down) { ctx.rotate(-angle); ctx.translate(0, R) }
      else { ctx.rotate(angle); ctx.translate(0, -R) }
      if (this.stroke && this.strokeWidth > 0) ctx.strokeText(chars[i]!, 0, 0)
      if (this.fill) ctx.fillText(chars[i]!, 0, 0)
      ctx.restore()
      angle += advance / 2 / R
    }

    ctx.restore()
  }

  toObject(propertiesToInclude: string[] = []): Record<string, unknown> {
    return super.toObject([
      'text', 'fontSize', 'fontFamily', 'fontWeight',
      'letterSpacing', 'radius', 'direction',
      ...propertiesToInclude,
    ])
  }

  static async fromObject(object: Record<string, unknown>): Promise<CurvedText> {
    const { type: _ignored, ...rest } = object   // `type` is read-only in Fabric 7
    return new CurvedText(rest as Partial<CurvedText>)
  }
}

classRegistry.setClass(CurvedText, 'CurvedText')
