// design-fabric's textHeightsMm() builds a Fabric Textbox to measure glyphs.
// map.ts imports Textbox from the "." (browser) build of fabric so it stays
// bundler-safe for the real editor. That build reads bare `document`/`window`
// identifiers the moment a Fabric object computes its dimensions, which do
// not exist under plain Node and throw `ReferenceError: document is not
// defined`. Fabric's own docs sanction bridging this with `setEnv`: hand the
// browser build the jsdom-backed environment that the "fabric/node" build
// already constructs for itself, rather than adding another DOM dependency
// of our own. The direction matters — `setEnv` must come from the browser
// build ('fabric') and `getEnv` from the node build ('fabric/node'); taking
// both from 'fabric/node' does not bridge anything, since that just feeds
// the node build's env back to itself.
//
// This must run at module load, before any Fabric object is constructed
// anywhere in this process — including inside validateDesignForSave below,
// which this module calls from inside the Payload server process on every
// design save. Do not move or remove this: removing it kills every design
// save, because textHeightsMm() would crash the first time it measures a
// text object (see fabric/src/shapes/Textbox.ts -> _splitText).
import { getEnv as getNodeFabricEnv } from 'fabric/node'
import { setEnv as setFabricEnv } from 'fabric'
setFabricEnv(getNodeFabricEnv())

import {
  parseDesignDocument, validatePlacement, collectWarnings, unacknowledgedWarnings,
  type Guardrails, type Warning,
} from '@kreart/design-core'
import { textHeightsMm } from '@kreart/design-fabric'

export type DesignValidationResult = { warnings: Warning[]; unacknowledged: Warning[] }

/**
 * Authoritative, server-side validation of a design document.
 *
 * The client is tamperable and the print area is a physical constraint, so this
 * is the check that matters (project spec §6.2). Finalisation is additionally
 * blocked while any warning is unacknowledged (project spec §11.1).
 *
 * Text heights are MEASURED, not guessed: design-core deliberately throws when a
 * height is missing, and design-fabric is the only supplier.
 */
export function validateDesignForSave(input: {
  document: unknown
  guardrails: Guardrails
  finalising: boolean
}): DesignValidationResult {
  const doc = parseDesignDocument(input.document)

  // an editor-scale context is fine: text heights are scale-invariant
  const ctx = { pxPerMm: 1.8 }

  const warnings: Warning[] = []
  for (const [slug, view] of Object.entries(doc.views)) {
    const heights = textHeightsMm(view, ctx)

    const issues = validatePlacement(view, heights)
    if (issues.length) {
      const detail = issues
        .map((i) => `${i.objectId} (overflow mm: ${JSON.stringify(i.overflowMm)})`)
        .join('; ')
      throw new Error(`View "${slug}" has objects outside the print area: ${detail}`)
    }

    warnings.push(...collectWarnings(view, input.guardrails, heights))
  }

  const unacknowledged = unacknowledgedWarnings(doc, warnings)

  if (input.finalising && unacknowledged.length) {
    const detail = unacknowledged.map((w) => `${w.objectId}: ${w.kind}`).join(', ')
    throw new Error(
      `Cannot finalise: ${unacknowledged.length} warning(s) not acknowledged — ${detail}. ` +
      `Each must be acknowledged individually.`,
    )
  }

  return { warnings, unacknowledged }
}
