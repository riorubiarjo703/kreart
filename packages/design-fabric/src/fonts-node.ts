import { existsSync } from 'node:fs'
import { registerFont } from 'canvas'

/**
 * Register a font file with node-canvas.
 * Hard-fails on a missing file: a substituted font reflows text and misprints
 * the garment (spec §11).
 */
export function registerFontFile(path: string, family: string, weight: number): void {
  if (!existsSync(path)) {
    throw new Error(`Font file not found: ${path}`)
  }
  registerFont(path, { family, weight: String(weight) })
}
