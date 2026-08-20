const cache = new Map<string, number[]>()

export function clearMetricsCache(): void {
  cache.clear()
}

/**
 * Per-glyph advances with kerning preserved.
 *
 * Measuring each glyph alone loses every kerning pair — spec §7.2 measured 7.67%
 * drift on "AVATAR", which is 15mm of spurious width at 200mm. Recovering it needs
 * no extra library: the width of a pair minus the two solo widths IS the kern delta.
 */
export function kernedAdvances(
  ctx: CanvasRenderingContext2D,
  text: string,
  letterSpacingPx: number,
): number[] {
  const key = `${ctx.font}|${letterSpacingPx}|${text}`
  const hit = cache.get(key)
  if (hit) return hit

  const chars = [...text]
  const width = (s: string) => ctx.measureText(s).width

  const advances = chars.map((c, i) => {
    const solo = width(c)
    if (i === chars.length - 1) return solo + letterSpacingPx
    const next = chars[i + 1]!
    const kern = width(c + next) - solo - width(next)
    return solo + kern + letterSpacingPx
  })

  cache.set(key, advances)
  return advances
}
