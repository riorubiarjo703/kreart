import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerFont } from 'canvas'

/**
 * node-canvas's font registry is process-global. In a persistent worker
 * (spec: Task 14) the same (family, weight) could be registered twice
 * pointing at different files — the cache in metrics.ts keys on the font
 * string alone, so a silent re-registration would make every previously
 * cached advance wrong with no way to detect it. Track what has actually
 * been registered so a conflicting re-registration fails loudly instead.
 */
const registered = new Map<string, string>()

/**
 * Register a font file with node-canvas.
 * Hard-fails on a missing file: a substituted font reflows text and misprints
 * the garment (spec §11).
 *
 * Also hard-fails if the same (family, weight) is registered again against a
 * different file: silently accepting it would leave stale kerning metrics
 * cached under an unchanged font string (spec §7.2 cache key).
 */
export function registerFontFile(path: string, family: string, weight: number): void {
  if (!existsSync(path)) {
    throw new Error(`Font file not found: ${path}`)
  }

  const resolvedPath = resolve(path)
  const key = `${family}|${weight}`
  const existingPath = registered.get(key)

  if (existingPath !== undefined) {
    if (existingPath === resolvedPath) return
    throw new Error(
      `Font "${family}" weight ${weight} is already registered from "${existingPath}"; ` +
        `refusing to re-register it from a different file "${resolvedPath}". ` +
        'Registering the same family/weight from two different files would leave ' +
        'cached kerning metrics silently stale.',
    )
  }

  registerFont(resolvedPath, { family, weight: String(weight) })
  registered.set(key, resolvedPath)
}
