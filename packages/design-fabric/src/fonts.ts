export function fontString(family: string, weight: number, sizePx: number): string {
  return `${weight} ${sizePx}px "${family}"`
}

/**
 * Optional pluggable check for whether a (family, weight) pair was actually
 * registered before use. node-canvas silently substitutes the nearest
 * registered face for an unregistered weight, returning plausible-but-wrong
 * metrics — the project's "fail loudly, never substitute silently" rule
 * (spec §11) forbids that. This module stays browser-safe (no node imports),
 * so the check itself is installed by an environment-specific module
 * (fonts-node.ts registers one backed by its registration map); the browser
 * has no registry yet, so by default no check is installed and the assertion
 * below is a no-op.
 */
let availabilityCheck: ((family: string, weight: number) => boolean) | undefined

export function setFontAvailabilityCheck(fn: (family: string, weight: number) => boolean): void {
  availabilityCheck = fn
}

/**
 * Throws if an availability check is installed and reports this
 * (family, weight) as never registered. No-op when no check is installed.
 */
export function assertFontAvailable(family: string, weight: number): void {
  if (availabilityCheck && !availabilityCheck(family, weight)) {
    throw new Error(
      `Font "${family}" weight ${weight} was never registered; refusing to let ` +
        'the renderer silently substitute the nearest available weight.',
    )
  }
}
