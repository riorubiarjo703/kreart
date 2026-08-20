# kreart Measurement Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a design authored in millimetres renders to a print file whose physical dimensions are correct, verified by measurement, with no Payload and no browser involved.

**Architecture:** Two pure packages and a node renderer. `design-core` holds the millimetre schema, unit conversion, validation, warnings and undo history — zero canvas, zero DOM, so nearly all tests are plain unit tests. `design-fabric` maps that schema onto Fabric.js objects and is isomorphic, so the browser editor (Plan 3) and the print worker call the *same* geometry code. The plan ends with a CI job that builds the real worker container and measures a calibration square inside it.

**Tech Stack:** pnpm workspaces, TypeScript, Vitest, Fabric.js 7.4.0, node-canvas 3.x, Zod, Docker.

**Spec:** `docs/superpowers/specs/2026-08-19-kreart-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **The core invariant (§3):** a design is authored in millimetres; pixels exist only at render time. Any function that stores a pixel value in a `DesignDocument` is a bug.
- **Never persist Fabric.js JSON (§4.2).** `DesignDocument` is the only persisted shape. Fabric objects are constructed on demand and thrown away.
- **Pinned versions (§2):** `fabric@7.4.0`, `canvas@3.x`, Node >= 20. Fabric 7 does **not** use `@napi-rs/canvas`.
- **Canvas dimensions round UP, never down (§10.3).**
- **Physical accuracy tolerance: ±0.1 mm (§10.3).** A 100 mm square at 300 DPI measures 1180 ± 1 px.
- **Scale parity: bounding boxes must agree in mm within 0.01 mm across scales (§12).**
- **Custom rendering uses only the canvas 2D API (§5).** No DOM, no `window`, no `document`. Code that touches them works in the editor and crashes the worker.
- **Fail loudly, never substitute silently (§11).** A missing font or missing media is a hard failure, not a fallback.
- **Fonts are self-hosted and licence-checked (§11.2).** Any font committed to this repo must permit server-side rendering *and* conversion to outlines.
- **DPI default 300; `minTextHeightMm` default 4; `minStrokeWidthMm` default 1 (§3.4, §15).**

---

## File Structure

```
package.json                         pnpm workspace root, shared scripts
pnpm-workspace.yaml                  workspace globs
tsconfig.base.json                   shared compiler options
vitest.config.ts                     shared test config

packages/design-core/                pure TypeScript. no canvas, no DOM.
  src/units.ts                       mm <-> px, DPI, canvas sizing
  src/schema.ts                      Zod schemas + inferred types for DesignDocument
  src/geometry.ts                    rotated bounding boxes in mm
  src/validate.ts                    print-area containment, authoritative on the server
  src/warnings.ts                    DPI floor, text/stroke minimums, acknowledgement gating
  src/history.ts                     undo/redo stack with drag coalescing
  src/index.ts                       public surface
  test/*.test.ts

packages/design-fabric/              isomorphic. canvas 2D only.
  src/metrics.ts                     kerned glyph advances via pairwise measureText
  src/curved-text.ts                 CurvedText FabricObject subclass
  src/map.ts                         DesignDocument -> Fabric objects at a given pxPerMm
  src/fonts.ts                       font registration, hard-fails on missing
  src/render-node.ts                 node-only PNG and PDF renderers
  src/index.ts                       browser-safe surface (excludes render-node)
  test/fixtures/                     vendored OFL font + golden PNGs + design fixtures
  test/*.test.ts

docker/worker.Dockerfile             the real worker image, built in CI
.github/workflows/ci.yml             unit tests + calibration inside the container
```

`render-node.ts` is deliberately **not** exported from `src/index.ts`. Importing it from browser code must fail at build time rather than at runtime.

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/design-core/package.json`, `packages/design-core/tsconfig.json`
- Create: `packages/design-core/src/index.ts`, `packages/design-core/test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: a working `pnpm test` at the repo root that discovers tests in `packages/*/test`

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { PACKAGE_NAME } from '../src/index.js'

describe('workspace', () => {
  it('resolves the package entrypoint', () => {
    expect(PACKAGE_NAME).toBe('design-core')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/smoke.test.ts`
Expected: FAIL — cannot resolve `../src/index.js`.

- [ ] **Step 3: Create the workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

Root `package.json`:
```json
{
  "name": "kreart",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "skipLibCheck": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
  },
})
```

`packages/design-core/package.json`:
```json
{
  "name": "@kreart/design-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" }
}
```

`packages/design-core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/design-core/src/index.ts`:
```ts
export const PACKAGE_NAME = 'design-core'
```

- [ ] **Step 4: Install and run the test**

Run: `pnpm install && pnpm test`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: pnpm workspace with vitest"
```

---

### Task 2: Unit conversion

**Files:**
- Create: `packages/design-core/src/units.ts`
- Create: `packages/design-core/test/units.test.ts`
- Modify: `packages/design-core/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `MM_PER_INCH: 25.4`
  - `dpiToPxPerMm(dpi: number): number`
  - `mmToPx(mm: number, pxPerMm: number): number`
  - `pxToMm(px: number, pxPerMm: number): number`
  - `canvasSizePx(printAreaMm: { w: number; h: number }, pxPerMm: number): { w: number; h: number }`

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/units.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { MM_PER_INCH, dpiToPxPerMm, mmToPx, pxToMm, canvasSizePx } from '../src/units.js'

describe('units', () => {
  it('converts DPI to px/mm', () => {
    expect(dpiToPxPerMm(300)).toBeCloseTo(11.8110, 4)
    expect(dpiToPxPerMm(150)).toBeCloseTo(5.9055, 4)
    expect(MM_PER_INCH).toBe(25.4)
  })

  it('round-trips mm through px without drift', () => {
    const pxPerMm = dpiToPxPerMm(300)
    expect(pxToMm(mmToPx(220, pxPerMm), pxPerMm)).toBeCloseTo(220, 10)
  })

  it('rounds canvas dimensions UP, never down', () => {
    // 300mm @ 300dpi is 3543.307px - rounding down would lose 0.026mm of print area
    const size = canvasSizePx({ w: 300, h: 400 }, dpiToPxPerMm(300))
    expect(size.w).toBe(3544)
    expect(size.h).toBe(4725)
  })

  it('rejects a non-positive DPI rather than producing Infinity', () => {
    expect(() => dpiToPxPerMm(0)).toThrow(/positive/)
    expect(() => dpiToPxPerMm(-300)).toThrow(/positive/)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/units.test.ts`
Expected: FAIL — cannot resolve `../src/units.js`.

- [ ] **Step 3: Implement**

`packages/design-core/src/units.ts`:
```ts
export const MM_PER_INCH = 25.4

/** Pixels per millimetre for a given dots-per-inch. 300 DPI -> 11.811 px/mm. */
export function dpiToPxPerMm(dpi: number): number {
  if (!(dpi > 0)) throw new Error(`DPI must be positive, got ${dpi}`)
  return dpi / MM_PER_INCH
}

export function mmToPx(mm: number, pxPerMm: number): number {
  return mm * pxPerMm
}

export function pxToMm(px: number, pxPerMm: number): number {
  return px / pxPerMm
}

/**
 * Canvas dimensions for a print area.
 * Rounds UP per spec §10.3: rounding down would silently crop the print area.
 */
export function canvasSizePx(
  printAreaMm: { w: number; h: number },
  pxPerMm: number,
): { w: number; h: number } {
  return {
    w: Math.ceil(mmToPx(printAreaMm.w, pxPerMm)),
    h: Math.ceil(mmToPx(printAreaMm.h, pxPerMm)),
  }
}
```

Add to `packages/design-core/src/index.ts`:
```ts
export * from './units.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-core/test/units.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/design-core
git commit -m "feat(design-core): mm/px unit conversion with round-up canvas sizing"
```

---

### Task 3: The DesignDocument schema

**Files:**
- Create: `packages/design-core/src/schema.ts`
- Create: `packages/design-core/test/schema.test.ts`
- Modify: `packages/design-core/src/index.ts`, `packages/design-core/package.json`

**Interfaces:**
- Consumes: nothing
- Produces:
  - types `DesignDocument`, `DesignView`, `DesignObject`, `ImageObject`, `TextObject`, `Acknowledgement`
  - `designDocumentSchema: z.ZodType<DesignDocument>`
  - `parseDesignDocument(input: unknown): DesignDocument` — throws on invalid
  - `SCHEMA_VERSION = 1`

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseDesignDocument, SCHEMA_VERSION } from '../src/schema.js'

const validDoc = {
  schemaVersion: 1,
  productId: 'prod_1',
  sizeId: 'size_m',
  colourwayId: 'col_white',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [
        {
          id: 'o1', kind: 'image', mediaId: 'm1',
          xMm: 50, yMm: 60, wMm: 200, hMm: 150,
          rotation: 0, opacity: 1,
          sourcePx: { w: 2400, h: 1800 },
          background: 'original',
        },
        {
          id: 'o2', kind: 'text', text: 'AVATAR',
          xMm: 40, yMm: 250, wMm: 220, rotation: 0,
          font: { family: 'Inter', weight: 700, sizeMm: 20, letterSpacingMm: 1, lineHeight: 1.2 },
          fill: '#111111',
          curve: { radiusMm: 90, direction: 'up' },
        },
      ],
    },
  },
}

describe('designDocumentSchema', () => {
  it('accepts a valid document and reports the schema version', () => {
    const doc = parseDesignDocument(validDoc)
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.views.front!.objects).toHaveLength(2)
  })

  it('rejects an unknown schema version rather than guessing', () => {
    expect(() => parseDesignDocument({ ...validDoc, schemaVersion: 2 })).toThrow()
  })

  it('rejects a pixel-valued dimension leaking into the document', () => {
    const bad = structuredClone(validDoc)
    // @ts-expect-error deliberately wrong shape
    bad.views.front.objects[0].widthPx = 2400
    expect(() => parseDesignDocument(bad)).toThrow()
  })

  it('rejects negative millimetre dimensions', () => {
    const bad = structuredClone(validDoc)
    bad.views.front.objects[0]!.wMm = -10
    expect(() => parseDesignDocument(bad)).toThrow()
  })

  it('preserves curve settings on curved text', () => {
    const doc = parseDesignDocument(validDoc)
    const text = doc.views.front!.objects[1]!
    expect(text.kind).toBe('text')
    if (text.kind === 'text') {
      expect(text.curve?.direction).toBe('up')
      expect(text.curve?.radiusMm).toBe(90)
    }
  })

  it('leaves curve undefined on straight text', () => {
    const straight = structuredClone(validDoc)
    delete (straight.views.front.objects[1] as Record<string, unknown>).curve
    const doc = parseDesignDocument(straight)
    const text = doc.views.front!.objects[1]!
    if (text.kind === 'text') expect(text.curve).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/schema.test.ts`
Expected: FAIL — cannot resolve `../src/schema.js`.

- [ ] **Step 3: Add Zod and implement**

Run: `pnpm --filter @kreart/design-core add zod@^3.23.0`

`packages/design-core/src/schema.ts`:
```ts
import { z } from 'zod'

export const SCHEMA_VERSION = 1 as const

const mm = z.number().finite().nonnegative()
const signedMm = z.number().finite()
const colour = z.string().min(1)

const sizePx = z.object({ w: z.number().int().positive(), h: z.number().int().positive() })

export const imageObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('image'),
  mediaId: z.string().min(1),
  xMm: signedMm, yMm: signedMm, wMm: mm, hMm: mm,
  rotation: z.number().finite(),
  opacity: z.number().min(0).max(1),
  sourcePx: sizePx,
  background: z.enum(['original', 'removed']),
}).strict()

export const textObjectSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('text'),
  text: z.string(),
  xMm: signedMm, yMm: signedMm, wMm: mm,
  rotation: z.number().finite(),
  font: z.object({
    family: z.string().min(1),
    weight: z.number().int().min(100).max(900),
    sizeMm: mm.positive(),
    letterSpacingMm: signedMm,
    lineHeight: z.number().positive(),
  }).strict(),
  fill: colour,
  stroke: z.object({ color: colour, widthMm: mm }).strict().optional(),
  shadow: z.object({
    offsetXMm: signedMm, offsetYMm: signedMm, blurMm: mm, color: colour,
  }).strict().optional(),
  background: z.object({ color: colour, paddingMm: mm }).strict().optional(),
  curve: z.object({
    radiusMm: mm.positive(),
    direction: z.enum(['up', 'down']),
  }).strict().optional(),
}).strict()

export const designObjectSchema = z.discriminatedUnion('kind', [
  imageObjectSchema,
  textObjectSchema,
])

export const acknowledgementSchema = z.object({
  objectId: z.string().min(1),
  kind: z.enum(['lowDpi', 'smallText', 'thinStroke']),
  shown: z.object({
    measured: z.number().finite(),
    threshold: z.number().finite(),
    unit: z.enum(['dpi', 'mm']),
  }).strict(),
  at: z.string().datetime(),
}).strict()

export const designViewSchema = z.object({
  printAreaMm: z.object({ w: mm.positive(), h: mm.positive() }).strict(),
  objects: z.array(designObjectSchema),
}).strict()

export const designDocumentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  productId: z.string().min(1),
  sizeId: z.string().min(1),
  colourwayId: z.string().min(1),
  views: z.record(z.string(), designViewSchema),
  acknowledgements: z.array(acknowledgementSchema).optional(),
}).strict()

export type ImageObject = z.infer<typeof imageObjectSchema>
export type TextObject = z.infer<typeof textObjectSchema>
export type DesignObject = z.infer<typeof designObjectSchema>
export type Acknowledgement = z.infer<typeof acknowledgementSchema>
export type DesignView = z.infer<typeof designViewSchema>
export type DesignDocument = z.infer<typeof designDocumentSchema>

/** Throws on any invalid document. There is no lenient mode: see spec §11. */
export function parseDesignDocument(input: unknown): DesignDocument {
  return designDocumentSchema.parse(input)
}
```

Note: every object uses `.strict()`, which is what makes the "pixel value leaks into the document" test fail loudly instead of silently ignoring the extra key.

Add to `packages/design-core/src/index.ts`:
```ts
export * from './schema.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-core/test/schema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-core): millimetre-based DesignDocument schema"
```

---

### Task 4: Rotated geometry and print-area validation

**Files:**
- Create: `packages/design-core/src/geometry.ts`, `packages/design-core/src/validate.ts`
- Create: `packages/design-core/test/validate.test.ts`
- Modify: `packages/design-core/src/index.ts`

**Interfaces:**
- Consumes: `DesignObject`, `DesignView` from Task 3
- Produces:
  - `type RectMm = { xMm: number; yMm: number; wMm: number; hMm: number }`
  - `rotatedBoundsMm(rect: RectMm, rotationDeg: number): RectMm`
  - `type PlacementIssue = { objectId: string; overflowMm: { left: number; top: number; right: number; bottom: number } }`
  - `validatePlacement(view: DesignView, textHeightsMm: Record<string, number>): PlacementIssue[]`

Text objects store `wMm` but no `hMm` (spec §4.2) — height is derived from font metrics, which live in `design-fabric`. `design-core` stays pure by requiring the caller to supply measured text heights, and **throwing if one is missing** rather than guessing a height.

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/validate.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { rotatedBoundsMm } from '../src/geometry.js'
import { validatePlacement } from '../src/validate.js'
import type { DesignView } from '../src/schema.js'

describe('rotatedBoundsMm', () => {
  it('leaves an unrotated rect unchanged', () => {
    const r = { xMm: 10, yMm: 20, wMm: 100, hMm: 50 }
    expect(rotatedBoundsMm(r, 0)).toEqual(r)
  })

  it('swaps width and height at 90 degrees, about the rect centre', () => {
    const b = rotatedBoundsMm({ xMm: 0, yMm: 0, wMm: 100, hMm: 50 }, 90)
    expect(b.wMm).toBeCloseTo(50, 6)
    expect(b.hMm).toBeCloseTo(100, 6)
    expect(b.xMm).toBeCloseTo(25, 6)   // centre stays at (50, 25)
    expect(b.yMm).toBeCloseTo(-25, 6)
  })

  it('grows the bounding box at 45 degrees', () => {
    const b = rotatedBoundsMm({ xMm: 0, yMm: 0, wMm: 100, hMm: 100 }, 45)
    expect(b.wMm).toBeCloseTo(141.421, 3)
  })
})

const view = (objects: DesignView['objects']): DesignView => ({
  printAreaMm: { w: 300, h: 400 }, objects,
})

const image = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'i1', kind: 'image' as const, mediaId: 'm1',
  xMm: 10, yMm: 10, wMm: 100, hMm: 100,
  rotation: 0, opacity: 1,
  sourcePx: { w: 2400, h: 2400 }, background: 'original' as const,
  ...over,
})

describe('validatePlacement', () => {
  it('passes an object fully inside the print area', () => {
    expect(validatePlacement(view([image()]), {})).toEqual([])
  })

  it('reports how far an object overflows each edge', () => {
    const issues = validatePlacement(view([image({ xMm: 250, yMm: -20 })]), {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.objectId).toBe('i1')
    expect(issues[0]!.overflowMm.right).toBeCloseTo(50, 6)   // 250 + 100 - 300
    expect(issues[0]!.overflowMm.top).toBeCloseTo(20, 6)
    expect(issues[0]!.overflowMm.left).toBe(0)
  })

  it('accounts for rotation when deciding containment', () => {
    // 100x100 at 45deg spans ~141mm, pushing it past the right edge
    const issues = validatePlacement(view([image({ xMm: 210, rotation: 45 })]), {})
    expect(issues).toHaveLength(1)
    expect(issues[0]!.overflowMm.right).toBeGreaterThan(0)
  })

  it('throws rather than guessing when a text height is not supplied', () => {
    const text = {
      id: 't1', kind: 'text' as const, text: 'HI',
      xMm: 10, yMm: 10, wMm: 100, rotation: 0,
      font: { family: 'Inter', weight: 700, sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2 },
      fill: '#000',
    }
    expect(() => validatePlacement(view([text]), {})).toThrow(/t1/)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/validate.test.ts`
Expected: FAIL — cannot resolve `../src/geometry.js`.

- [ ] **Step 3: Implement**

`packages/design-core/src/geometry.ts`:
```ts
export type RectMm = { xMm: number; yMm: number; wMm: number; hMm: number }

/** Axis-aligned bounding box of a rect rotated about its own centre. */
export function rotatedBoundsMm(rect: RectMm, rotationDeg: number): RectMm {
  const norm = ((rotationDeg % 360) + 360) % 360
  if (norm === 0) return { ...rect }

  const rad = (norm * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))

  const w = rect.wMm * cos + rect.hMm * sin
  const h = rect.wMm * sin + rect.hMm * cos

  const cx = rect.xMm + rect.wMm / 2
  const cy = rect.yMm + rect.hMm / 2

  return { xMm: cx - w / 2, yMm: cy - h / 2, wMm: w, hMm: h }
}
```

`packages/design-core/src/validate.ts`:
```ts
import type { DesignObject, DesignView } from './schema.js'
import { rotatedBoundsMm, type RectMm } from './geometry.js'

export type PlacementIssue = {
  objectId: string
  overflowMm: { left: number; top: number; right: number; bottom: number }
}

/**
 * Height in mm for an object. Images carry their own; text height is derived from
 * font metrics in design-fabric and must be supplied. Missing values throw — a
 * guessed height would silently validate a design that does not fit (spec §11).
 */
function heightMm(obj: DesignObject, textHeightsMm: Record<string, number>): number {
  if (obj.kind === 'image') return obj.hMm
  const measured = textHeightsMm[obj.id]
  if (measured === undefined) {
    throw new Error(`No measured height supplied for text object ${obj.id}`)
  }
  return measured
}

/**
 * Authoritative print-area containment check. Run on the server: the client is
 * tamperable and the print area is a physical constraint (spec §6.2).
 */
export function validatePlacement(
  view: DesignView,
  textHeightsMm: Record<string, number>,
): PlacementIssue[] {
  const issues: PlacementIssue[] = []

  for (const obj of view.objects) {
    const rect: RectMm = {
      xMm: obj.xMm, yMm: obj.yMm,
      wMm: obj.wMm, hMm: heightMm(obj, textHeightsMm),
    }
    const b = rotatedBoundsMm(rect, obj.rotation)

    const overflowMm = {
      left: Math.max(0, -b.xMm),
      top: Math.max(0, -b.yMm),
      right: Math.max(0, b.xMm + b.wMm - view.printAreaMm.w),
      bottom: Math.max(0, b.yMm + b.hMm - view.printAreaMm.h),
    }

    if (overflowMm.left || overflowMm.top || overflowMm.right || overflowMm.bottom) {
      issues.push({ objectId: obj.id, overflowMm })
    }
  }

  return issues
}
```

Add to `packages/design-core/src/index.ts`:
```ts
export * from './geometry.js'
export * from './validate.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-core/test/validate.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-core): rotated bounds and print-area validation"
```

---

### Task 5: Warnings and acknowledgement gating

**Files:**
- Create: `packages/design-core/src/warnings.ts`
- Create: `packages/design-core/test/warnings.test.ts`
- Modify: `packages/design-core/src/index.ts`

**Interfaces:**
- Consumes: `ImageObject`, `TextObject`, `DesignView`, `DesignDocument`, `Acknowledgement` from Task 3
- Produces:
  - `type Guardrails = { targetDpi: number; minTextHeightMm: number; minStrokeWidthMm: number }`
  - `DEFAULT_GUARDRAILS: Guardrails` — `{ targetDpi: 300, minTextHeightMm: 4, minStrokeWidthMm: 1 }`
  - `type Warning = { objectId: string; kind: 'lowDpi' | 'smallText' | 'thinStroke'; measured: number; threshold: number; unit: 'dpi' | 'mm' }`
  - `effectiveDpi(obj: ImageObject): number`
  - `collectWarnings(view: DesignView, g: Guardrails, textHeightsMm: Record<string, number>): Warning[]`
  - `unacknowledgedWarnings(doc: DesignDocument, warnings: Warning[]): Warning[]`

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/warnings.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_GUARDRAILS, effectiveDpi, collectWarnings, unacknowledgedWarnings,
} from '../src/warnings.js'
import type { DesignDocument, DesignView } from '../src/schema.js'

const img = (over = {}) => ({
  id: 'i1', kind: 'image' as const, mediaId: 'm1',
  xMm: 0, yMm: 0, wMm: 200, hMm: 150, rotation: 0, opacity: 1,
  sourcePx: { w: 2362, h: 1772 }, background: 'original' as const,
  ...over,
})

const txt = (over = {}) => ({
  id: 't1', kind: 'text' as const, text: 'HI',
  xMm: 0, yMm: 0, wMm: 100, rotation: 0,
  font: { family: 'Inter', weight: 700, sizeMm: 20, letterSpacingMm: 0, lineHeight: 1.2 },
  fill: '#000',
  ...over,
})

const view = (objects: DesignView['objects']): DesignView =>
  ({ printAreaMm: { w: 300, h: 400 }, objects })

describe('effectiveDpi', () => {
  it('computes DPI from source pixels over physical size', () => {
    // 2362px across 200mm == 200/25.4 = 7.874in -> exactly 300 dpi
    expect(effectiveDpi(img())).toBeCloseTo(300, 0)
  })

  it('takes the worse of the two axes', () => {
    const stretched = img({ sourcePx: { w: 2362, h: 400 } })
    expect(effectiveDpi(stretched)).toBeLessThan(100)
  })
})

describe('collectWarnings', () => {
  it('is silent when everything clears the guardrails', () => {
    expect(collectWarnings(view([img()]), DEFAULT_GUARDRAILS, { t1: 10 })).toEqual([])
  })

  it('warns on a low-resolution image, reporting measured and threshold', () => {
    const w = collectWarnings(view([img({ sourcePx: { w: 800, h: 600 } })]), DEFAULT_GUARDRAILS, {})
    expect(w).toHaveLength(1)
    expect(w[0]!.kind).toBe('lowDpi')
    expect(w[0]!.threshold).toBe(300)
    expect(w[0]!.unit).toBe('dpi')
    expect(w[0]!.measured).toBeLessThan(300)
  })

  it('warns on text below the minimum height', () => {
    const w = collectWarnings(view([txt()]), DEFAULT_GUARDRAILS, { t1: 3 })
    expect(w.map((x) => x.kind)).toEqual(['smallText'])
  })

  it('warns on a stroke thinner than the minimum', () => {
    const w = collectWarnings(
      view([txt({ stroke: { color: '#000', widthMm: 0.4 } })]),
      DEFAULT_GUARDRAILS, { t1: 10 },
    )
    expect(w.map((x) => x.kind)).toEqual(['thinStroke'])
  })

  it('reports every problem on one object separately, not merged', () => {
    const w = collectWarnings(
      view([txt({ stroke: { color: '#000', widthMm: 0.2 } })]),
      DEFAULT_GUARDRAILS, { t1: 2 },
    )
    expect(w.map((x) => x.kind).sort()).toEqual(['smallText', 'thinStroke'])
  })
})

const doc = (warnings: DesignDocument['acknowledgements']): DesignDocument => ({
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: { front: view([img({ sourcePx: { w: 800, h: 600 } })]) },
  acknowledgements: warnings,
})

describe('unacknowledgedWarnings', () => {
  it('returns warnings with no matching acknowledgement', () => {
    const warnings = collectWarnings(doc(undefined).views.front!, DEFAULT_GUARDRAILS, {})
    expect(unacknowledgedWarnings(doc(undefined), warnings)).toHaveLength(1)
  })

  it('clears a warning acknowledged for the same object and kind', () => {
    const warnings = collectWarnings(doc(undefined).views.front!, DEFAULT_GUARDRAILS, {})
    const acked = doc([{
      objectId: 'i1', kind: 'lowDpi',
      shown: { measured: warnings[0]!.measured, threshold: 300, unit: 'dpi' },
      at: '2026-08-20T09:00:00.000Z',
    }])
    expect(unacknowledgedWarnings(acked, warnings)).toEqual([])
  })

  it('does not let an acknowledgement of one kind clear a different kind', () => {
    const warnings = collectWarnings(doc(undefined).views.front!, DEFAULT_GUARDRAILS, {})
    const acked = doc([{
      objectId: 'i1', kind: 'smallText',
      shown: { measured: 1, threshold: 4, unit: 'mm' },
      at: '2026-08-20T09:00:00.000Z',
    }])
    expect(unacknowledgedWarnings(acked, warnings)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/warnings.test.ts`
Expected: FAIL — cannot resolve `../src/warnings.js`.

- [ ] **Step 3: Implement**

`packages/design-core/src/warnings.ts`:
```ts
import { MM_PER_INCH } from './units.js'
import type { DesignDocument, DesignView, ImageObject } from './schema.js'

export type Guardrails = {
  targetDpi: number
  minTextHeightMm: number
  minStrokeWidthMm: number
}

/** Spec §3.4 / §15: starting values, pending a test print on the production printer. */
export const DEFAULT_GUARDRAILS: Guardrails = {
  targetDpi: 300,
  minTextHeightMm: 4,
  minStrokeWidthMm: 1,
}

export type WarningKind = 'lowDpi' | 'smallText' | 'thinStroke'

export type Warning = {
  objectId: string
  kind: WarningKind
  measured: number
  threshold: number
  unit: 'dpi' | 'mm'
}

/** Achievable DPI once the image is scaled to its physical size. Worst axis wins. */
export function effectiveDpi(obj: ImageObject): number {
  const dpiW = obj.sourcePx.w / (obj.wMm / MM_PER_INCH)
  const dpiH = obj.sourcePx.h / (obj.hMm / MM_PER_INCH)
  return Math.min(dpiW, dpiH)
}

export function collectWarnings(
  view: DesignView,
  g: Guardrails,
  textHeightsMm: Record<string, number>,
): Warning[] {
  const out: Warning[] = []

  for (const obj of view.objects) {
    if (obj.kind === 'image') {
      const dpi = effectiveDpi(obj)
      if (dpi < g.targetDpi) {
        out.push({ objectId: obj.id, kind: 'lowDpi', measured: dpi, threshold: g.targetDpi, unit: 'dpi' })
      }
      continue
    }

    const height = textHeightsMm[obj.id]
    if (height !== undefined && height < g.minTextHeightMm) {
      out.push({
        objectId: obj.id, kind: 'smallText',
        measured: height, threshold: g.minTextHeightMm, unit: 'mm',
      })
    }

    if (obj.stroke && obj.stroke.widthMm > 0 && obj.stroke.widthMm < g.minStrokeWidthMm) {
      out.push({
        objectId: obj.id, kind: 'thinStroke',
        measured: obj.stroke.widthMm, threshold: g.minStrokeWidthMm, unit: 'mm',
      })
    }
  }

  return out
}

/**
 * Warnings the user has not individually acknowledged. Finalisation is blocked
 * while this is non-empty (spec §11.1). Matching is by object AND kind: one
 * blanket confirmation is not a record of informed consent.
 */
export function unacknowledgedWarnings(
  doc: DesignDocument,
  warnings: Warning[],
): Warning[] {
  const acked = new Set(
    (doc.acknowledgements ?? []).map((a) => `${a.objectId}:${a.kind}`),
  )
  return warnings.filter((w) => !acked.has(`${w.objectId}:${w.kind}`))
}
```

Add to `packages/design-core/src/index.ts`:
```ts
export * from './warnings.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-core/test/warnings.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-core): DPI and guardrail warnings with acknowledgement gating"
```

---

### Task 6: Undo/redo history with drag coalescing

**Files:**
- Create: `packages/design-core/src/history.ts`
- Create: `packages/design-core/test/history.test.ts`
- Modify: `packages/design-core/src/index.ts`

**Interfaces:**
- Consumes: `DesignDocument` from Task 3
- Produces:
  - `class DesignHistory` with `current`, `commit(next, opts?)`, `undo()`, `redo()`, `canUndo`, `canRedo`, `depth`
  - `HISTORY_LIMIT = 50`

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/history.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { DesignHistory, HISTORY_LIMIT } from '../src/history.js'
import type { DesignDocument } from '../src/schema.js'

const doc = (n: number): DesignDocument => ({
  schemaVersion: 1, productId: `p${n}`, sizeId: 's', colourwayId: 'c', views: {},
})

describe('DesignHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const h = new DesignHistory(doc(0))
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.current.productId).toBe('p0')
  })

  it('undoes and redoes a single commit', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1))
    expect(h.current.productId).toBe('p1')
    expect(h.undo().productId).toBe('p0')
    expect(h.canRedo).toBe(true)
    expect(h.redo().productId).toBe('p1')
  })

  it('collapses a continuous drag into one undo step', () => {
    const h = new DesignHistory(doc(0))
    for (let i = 1; i <= 60; i++) h.commit(doc(i), { coalesceKey: 'drag:o1' })
    expect(h.depth).toBe(1)
    expect(h.current.productId).toBe('p60')
    expect(h.undo().productId).toBe('p0')
  })

  it('starts a new entry when the coalesce key changes', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1), { coalesceKey: 'drag:o1' })
    h.commit(doc(2), { coalesceKey: 'drag:o2' })
    expect(h.depth).toBe(2)
  })

  it('starts a new entry for an uncoalesced commit after a drag', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1), { coalesceKey: 'drag:o1' })
    h.commit(doc(2))
    expect(h.depth).toBe(2)
    expect(h.undo().productId).toBe('p1')
  })

  it('discards the redo stack once a new commit lands', () => {
    const h = new DesignHistory(doc(0))
    h.commit(doc(1))
    h.undo()
    h.commit(doc(2))
    expect(h.canRedo).toBe(false)
    expect(h.current.productId).toBe('p2')
  })

  it('caps depth at the limit, dropping the oldest entry', () => {
    const h = new DesignHistory(doc(0))
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h.commit(doc(i))
    expect(h.depth).toBe(HISTORY_LIMIT)
  })

  it('returns current unchanged when there is nothing to undo', () => {
    const h = new DesignHistory(doc(0))
    expect(h.undo().productId).toBe('p0')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/history.test.ts`
Expected: FAIL — cannot resolve `../src/history.js`.

- [ ] **Step 3: Implement**

`packages/design-core/src/history.ts`:
```ts
import type { DesignDocument } from './schema.js'

/** Spec §9 / §15: starting value. */
export const HISTORY_LIMIT = 50

type Entry = { doc: DesignDocument; coalesceKey?: string }

/**
 * Undo/redo over the document, never over Fabric state (spec §9).
 * Because entries are plain data, this is testable with no browser.
 */
export class DesignHistory {
  #past: Entry[] = []
  #future: Entry[] = []
  #current: Entry

  constructor(initial: DesignDocument, private readonly limit = HISTORY_LIMIT) {
    this.#current = { doc: initial }
  }

  get current(): DesignDocument { return this.#current.doc }
  get canUndo(): boolean { return this.#past.length > 0 }
  get canRedo(): boolean { return this.#future.length > 0 }
  /** Number of undoable steps. */
  get depth(): number { return this.#past.length }

  /**
   * Record a new state. Consecutive commits sharing a `coalesceKey` replace the
   * current entry instead of pushing, so one drag is one undo step rather than sixty.
   */
  commit(next: DesignDocument, opts: { coalesceKey?: string } = {}): void {
    this.#future = []

    const coalescing =
      opts.coalesceKey !== undefined &&
      opts.coalesceKey === this.#current.coalesceKey

    if (!coalescing) {
      this.#past.push(this.#current)
      if (this.#past.length > this.limit) this.#past.shift()
    }

    this.#current = { doc: next, coalesceKey: opts.coalesceKey }
  }

  undo(): DesignDocument {
    const prev = this.#past.pop()
    if (!prev) return this.#current.doc
    this.#future.push(this.#current)
    this.#current = prev
    return this.#current.doc
  }

  redo(): DesignDocument {
    const next = this.#future.pop()
    if (!next) return this.#current.doc
    this.#past.push(this.#current)
    this.#current = next
    return this.#current.doc
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-core/test/history.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-core): undo/redo history with drag coalescing"
```

---

### Task 7: design-fabric package, fonts, and kerned glyph metrics

**Files:**
- Create: `packages/design-fabric/package.json`, `packages/design-fabric/tsconfig.json`
- Create: `packages/design-fabric/src/fonts.ts`, `packages/design-fabric/src/fonts-node.ts`, `packages/design-fabric/src/metrics.ts`, `packages/design-fabric/src/index.ts`
- Create: `packages/design-fabric/test/fixtures/fonts/Inter-Bold.ttf`, `packages/design-fabric/test/fixtures/fonts/OFL.txt`
- Create: `packages/design-fabric/test/metrics.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces:
  - `fontString(family: string, weight: number, sizePx: number): string` — browser-safe, exported from `index.ts`
  - `registerFontFile(path: string, family: string, weight: number): void` — **node only, imported from `src/fonts-node.js`**, throws if the file is missing
  - `kernedAdvances(ctx: CanvasRenderingContext2D, text: string, letterSpacingPx: number): number[]`
  - `clearMetricsCache(): void`

Spec §7.2: measuring glyphs independently destroys kerning by up to 7.67 %. The fix is pairwise: measure the pair, subtract the two solo widths, and the remainder is the kern delta.

- [ ] **Step 1: Vendor a licence-clean font**

Download the latest Inter release from `https://github.com/rsms/inter/releases`, take the static **Bold** TTF from the archive, and save it as `packages/design-fabric/test/fixtures/fonts/Inter-Bold.ttf`. Copy the release's `LICENSE.txt` (SIL Open Font License 1.1) to `packages/design-fabric/test/fixtures/fonts/OFL.txt`.

Inter is used because OFL 1.1 permits both server-side rendering and conversion to outlines — the two permissions spec §11.2 makes mandatory. Do **not** substitute a system font: system fonts are not redistributable and will not exist inside the worker container.

- [ ] **Step 2: Write the failing test**

`packages/design-fabric/test/metrics.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { fontString, kernedAdvances, clearMetricsCache } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
let ctx: CanvasRenderingContext2D

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  ctx = createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D
  ctx.font = fontString('InterTest', 700, 100)
})

describe('registerFontFile', () => {
  it('throws on a missing file rather than silently substituting', () => {
    expect(() => registerFontFile('/no/such/font.ttf', 'Nope', 400)).toThrow(/no\/such\/font/)
  })
})

describe('kernedAdvances', () => {
  it('sums to the width the engine reports for the whole string', () => {
    for (const s of ['STOREFRAME', 'AVATAR', 'WAVY', 'TO THE MAX']) {
      const whole = ctx.measureText(s).width
      const summed = kernedAdvances(ctx, s, 0).reduce((a, b) => a + b, 0)
      expect(Math.abs(summed - whole)).toBeLessThan(0.01)
    }
  })

  it('differs measurably from naive per-glyph measurement on kern-heavy strings', () => {
    const naive = [...'AVATAR'].reduce((a, c) => a + ctx.measureText(c).width, 0)
    const kerned = kernedAdvances(ctx, 'AVATAR', 0).reduce((a, b) => a + b, 0)
    // spec §7.2 measured 7.67% drift on this string; assert the fix actually bites
    expect((naive - kerned) / kerned).toBeGreaterThan(0.02)
  })

  it('adds letter spacing to every glyph', () => {
    const base = kernedAdvances(ctx, 'ABC', 0).reduce((a, b) => a + b, 0)
    const spaced = kernedAdvances(ctx, 'ABC', 10).reduce((a, b) => a + b, 0)
    expect(spaced - base).toBeCloseTo(30, 6)
  })

  it('returns one advance per code point, handling astral characters', () => {
    expect(kernedAdvances(ctx, 'AB', 0)).toHaveLength(2)
    expect(kernedAdvances(ctx, '', 0)).toHaveLength(0)
  })

  it('caches by font, text and spacing', () => {
    clearMetricsCache()
    const a = kernedAdvances(ctx, 'CACHE', 0)
    const b = kernedAdvances(ctx, 'CACHE', 0)
    expect(b).toBe(a) // identical reference proves the cache was hit
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/metrics.test.ts`
Expected: FAIL — the package does not exist.

- [ ] **Step 4: Create the package and implement**

Run: `pnpm --filter @kreart/design-fabric add fabric@7.4.0 canvas@^3.2.0`

`packages/design-fabric/package.json`:
```json
{
  "name": "@kreart/design-fabric",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./fonts-node": "./src/fonts-node.ts",
    "./node": "./src/render-node.ts"
  },
  "dependencies": {
    "@kreart/design-core": "workspace:*"
  }
}
```

`packages/design-fabric/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist" },
  "include": ["src"]
}
```

`packages/design-fabric/src/fonts.ts` — browser-safe, no node imports:
```ts
export function fontString(family: string, weight: number, sizePx: number): string {
  return `${weight} ${sizePx}px "${family}"`
}
```

`packages/design-fabric/src/fonts-node.ts` — node only, deliberately **not** re-exported from
`index.ts` so that importing it from browser code fails at build time:
```ts
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
```

`packages/design-fabric/src/metrics.ts`:
```ts
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
```

`packages/design-fabric/src/index.ts` — the browser-safe surface:
```ts
export * from './fonts.js'
export * from './metrics.js'
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/metrics.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(design-fabric): kerned glyph metrics and fail-loud font registration"
```

---

### Task 8: The CurvedText Fabric object

**Files:**
- Create: `packages/design-fabric/src/curved-text.ts`
- Create: `packages/design-fabric/test/curved-text.test.ts`
- Modify: `packages/design-fabric/src/index.ts`

**Interfaces:**
- Consumes: `kernedAdvances`, `fontString` from Task 7
- Produces:
  - `class CurvedText extends FabricObject` with props `text, fontSize, fontFamily, fontWeight, letterSpacing, radius, direction, fill, stroke, strokeWidth`
  - `setMetricsContext(ctx: CanvasRenderingContext2D): void` — the scratch context used for measurement
  - `MIN_RADIUS_RATIO = 1.2` — minimum `radius / (totalAdvance / (2π))` before glyphs collide

Spec §7: canvas 2D API only. No DOM, no `window`. Code that touches them works in the editor and crashes the worker.

- [ ] **Step 1: Write the failing test**

`packages/design-fabric/test/curved-text.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { fontString, setMetricsContext, CurvedText } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  const ctx = createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D
  setMetricsContext(ctx)
})

const make = (over = {}) => new CurvedText({
  text: 'STOREFRAME', fontFamily: 'InterTest', fontWeight: 700,
  fontSize: 40, radius: 200, letterSpacing: 2, direction: 'up',
  fill: '#111', ...over,
})

describe('CurvedText', () => {
  it('reports a bounding box wide enough for the arc', () => {
    const t = make()
    expect(t.width).toBeGreaterThan(0)
    expect(t.height).toBeGreaterThan(0)
    // a shallow arc is much wider than tall
    expect(t.width).toBeGreaterThan(t.height)
  })

  it('scales its bounding box linearly with the scale factor', () => {
    const small = make()
    const large = make({ fontSize: 40 * 10, radius: 200 * 10, letterSpacing: 2 * 10 })
    expect(large.width / small.width).toBeCloseTo(10, 1)
    expect(large.height / small.height).toBeCloseTo(10, 1)
  })

  it('grows the bounding box when text is added', () => {
    expect(make({ text: 'STOREFRAME LONGER' }).width).toBeGreaterThan(make().width)
  })

  it('produces the same box for both arc directions', () => {
    const up = make({ direction: 'up' })
    const down = make({ direction: 'down' })
    expect(down.width).toBeCloseTo(up.width, 6)
    expect(down.height).toBeCloseTo(up.height, 6)
  })

  it('recalculates when a property is set after construction', () => {
    const t = make()
    const before = t.width
    t.set('text', 'STOREFRAME EXTENDED')
    expect(t.width).toBeGreaterThan(before)
  })

  it('round-trips through toObject/fromObject preserving geometry', async () => {
    const t = make()
    const json = t.toObject()
    expect(json.text).toBe('STOREFRAME')
    expect(json.radius).toBe(200)
    expect(json.direction).toBe('up')
    const revived = await CurvedText.fromObject(json)
    expect(revived.width).toBeCloseTo(t.width, 6)
    expect(revived.height).toBeCloseTo(t.height, 6)
  })

  it('rejects a radius so small the glyphs would overlap themselves', () => {
    expect(() => make({ radius: 1 })).toThrow(/radius/i)
  })

  it('renders without touching DOM globals', () => {
    const canvas = createCanvas(600, 400)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    ctx.translate(300, 200)
    expect(() => make().render(ctx)).not.toThrow()
    // something was actually drawn
    const { data } = canvas.getContext('2d').getImageData(0, 0, 600, 400)
    expect(data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/curved-text.test.ts`
Expected: FAIL — `CurvedText` is not exported.

- [ ] **Step 3: Implement**

`packages/design-fabric/src/curved-text.ts`:
```ts
import { FabricObject, classRegistry } from 'fabric'
import { kernedAdvances } from './metrics.js'
import { fontString } from './fonts.js'

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
    return fontString(this.fontFamily, this.fontWeight, this.fontSize)
  }

  #advances(): number[] {
    const ctx = requireMetricsCtx()
    ctx.font = this.#font()
    return kernedAdvances(ctx, this.text, this.letterSpacing)
  }

  #recalc(): this {
    const advances = this.#advances()
    const total = advances.reduce((a, b) => a + b, 0)

    // the radius at which the text would exactly close the circle
    const closingRadius = total / (2 * Math.PI)
    if (total > 0 && this.radius < closingRadius * MIN_RADIUS_RATIO) {
      throw new Error(
        `radius ${this.radius} is too small for this text; minimum is ` +
        `${(closingRadius * MIN_RADIUS_RATIO).toFixed(2)}`,
      )
    }

    const R = this.radius
    const em = this.fontSize
    const rOuter = R + em / 2
    const rInner = Math.max(R - em / 2, 0)
    const half = Math.min(total / R / 2, Math.PI)

    this.width = Math.max(2 * (half >= Math.PI / 2 ? rOuter : rOuter * Math.sin(half)), 1)
    this.height = Math.max(
      half >= Math.PI / 2 ? 2 * rOuter : rOuter - rInner * Math.cos(half),
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
```

Add to `packages/design-fabric/src/index.ts`:
```ts
export * from './curved-text.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/curved-text.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-fabric): CurvedText object with kerning and minimum-radius guard"
```

---

### Task 9: Map text objects to Fabric

**Files:**
- Create: `packages/design-fabric/src/map.ts`
- Create: `packages/design-fabric/test/map-text.test.ts`
- Modify: `packages/design-fabric/src/index.ts`

**Interfaces:**
- Consumes: `CurvedText` (Task 8), `fontString` (Task 7), `DesignView`, `TextObject` (Task 3), `mmToPx` (Task 2)
- Produces:
  - `type MapContext = { pxPerMm: number }`
  - `mapTextObject(obj: TextObject, ctx: MapContext): FabricObject`
  - `textHeightsMm(view: DesignView, ctx: MapContext): Record<string, number>`

`textHeightsMm` is what feeds `validatePlacement` and `collectWarnings` in `design-core`, which deliberately refuse to guess text heights (Tasks 4 and 5).

- [ ] **Step 1: Write the failing test**

`packages/design-fabric/test/map-text.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { dpiToPxPerMm } from '@kreart/design-core'
import { setMetricsContext, mapTextObject, textHeightsMm, CurvedText } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import type { TextObject, DesignView } from '@kreart/design-core'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const text = (over: Partial<TextObject> = {}): TextObject => ({
  id: 't1', kind: 'text', text: 'AVATAR',
  xMm: 50, yMm: 100, wMm: 200, rotation: 0,
  font: { family: 'InterTest', weight: 700, sizeMm: 20, letterSpacingMm: 1, lineHeight: 1.2 },
  fill: '#111111',
  ...over,
} as TextObject)

describe('mapTextObject', () => {
  it('converts millimetre position to pixels at the given scale', () => {
    const o = mapTextObject(text(), { pxPerMm: 2 })
    expect(o.left).toBeCloseTo(100, 6)   // 50mm * 2
    expect(o.top).toBeCloseTo(200, 6)
  })

  it('produces a CurvedText only when curve is present', () => {
    expect(mapTextObject(text(), { pxPerMm: 2 })).not.toBeInstanceOf(CurvedText)
    const curved = mapTextObject(
      text({ curve: { radiusMm: 90, direction: 'up' } }), { pxPerMm: 2 },
    )
    expect(curved).toBeInstanceOf(CurvedText)
  })

  it('scales stroke and shadow into pixels, not just position', () => {
    const o = mapTextObject(
      text({
        stroke: { color: '#000', widthMm: 2 },
        shadow: { offsetXMm: 1, offsetYMm: 2, blurMm: 3, color: 'rgba(0,0,0,0.5)' },
      }),
      { pxPerMm: 10 },
    )
    expect(o.strokeWidth).toBeCloseTo(20, 6)
    expect(o.shadow!.offsetX).toBeCloseTo(10, 6)
    expect(o.shadow!.blur).toBeCloseTo(30, 6)
  })

  it('is geometrically identical across scales once divided back to mm', () => {
    const editor = mapTextObject(text(), { pxPerMm: 1.8 })
    const print = mapTextObject(text(), { pxPerMm: dpiToPxPerMm(300) })
    const eMm = editor.getBoundingRect().width / 1.8
    const pMm = print.getBoundingRect().width / dpiToPxPerMm(300)
    expect(Math.abs(eMm - pMm)).toBeLessThan(0.01)
  })
})

describe('textHeightsMm', () => {
  it('reports a height in mm for every text object, keyed by id', () => {
    const view: DesignView = {
      printAreaMm: { w: 300, h: 400 },
      objects: [text(), text({ id: 't2', curve: { radiusMm: 90, direction: 'up' } })],
    }
    const heights = textHeightsMm(view, { pxPerMm: 1.8 })
    expect(Object.keys(heights).sort()).toEqual(['t1', 't2'])
    expect(heights.t1).toBeGreaterThan(0)
  })

  it('is scale-invariant', () => {
    const view: DesignView = { printAreaMm: { w: 300, h: 400 }, objects: [text()] }
    const a = textHeightsMm(view, { pxPerMm: 1.8 }).t1!
    const b = textHeightsMm(view, { pxPerMm: dpiToPxPerMm(300) }).t1!
    expect(Math.abs(a - b)).toBeLessThan(0.01)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/map-text.test.ts`
Expected: FAIL — `mapTextObject` is not exported.

- [ ] **Step 3: Implement**

`packages/design-fabric/src/map.ts`:
```ts
import { FabricText, Shadow, type FabricObject } from 'fabric'
import { mmToPx, pxToMm, type DesignView, type TextObject } from '@kreart/design-core'
import { CurvedText } from './curved-text.js'

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
```

Add to `packages/design-fabric/src/index.ts`:
```ts
export * from './map.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/map-text.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-fabric): map text objects to Fabric with mm to px conversion"
```

---

### Task 10: Map image objects with a fail-loud media resolver

**Files:**
- Modify: `packages/design-fabric/src/map.ts`
- Create: `packages/design-fabric/test/fixtures/black-1200.png`
- Create: `packages/design-fabric/test/map-image.test.ts`

**Interfaces:**
- Consumes: `ImageObject` (Task 3), `MapContext` (Task 9)
- Produces:
  - `type MediaResolver = (mediaId: string, background: 'original' | 'removed') => Promise<CanvasImageSource>`
  - `mapImageObject(obj: ImageObject, ctx: MapContext, resolve: MediaResolver): Promise<FabricObject>`
  - `mapView(view: DesignView, ctx: MapContext, resolve: MediaResolver): Promise<FabricObject[]>`

- [ ] **Step 1: Create the fixture image**

Run from the repo root:
```bash
node -e "
const { createCanvas } = require('canvas');
const fs = require('fs');
const c = createCanvas(1200, 1200);
const x = c.getContext('2d');
x.fillStyle = '#000000';
x.fillRect(0, 0, 1200, 1200);
fs.writeFileSync('packages/design-fabric/test/fixtures/black-1200.png', c.toBuffer('image/png'));
"
```

A solid black square is used deliberately: its rendered ink boundary is unambiguous, which is what the calibration test in Task 11 measures.

- [ ] **Step 2: Write the failing test**

`packages/design-fabric/test/map-image.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import { mapImageObject, mapView, type MediaResolver } from '../src/index.js'
import type { ImageObject, DesignView } from '@kreart/design-core'

const BLACK = fileURLToPath(new URL('./fixtures/black-1200.png', import.meta.url))

const resolver: MediaResolver = async (mediaId) => {
  if (mediaId !== 'black') throw new Error(`Media not found: ${mediaId}`)
  return (await loadImage(BLACK)) as unknown as CanvasImageSource
}

const image = (over: Partial<ImageObject> = {}): ImageObject => ({
  id: 'i1', kind: 'image', mediaId: 'black',
  xMm: 10, yMm: 10, wMm: 100, hMm: 100,
  rotation: 0, opacity: 1,
  sourcePx: { w: 1200, h: 1200 }, background: 'original',
  ...over,
} as ImageObject)

describe('mapImageObject', () => {
  it('scales the source image to the requested physical size', async () => {
    const o = await mapImageObject(image(), { pxPerMm: 10 }, resolver)
    expect(o.getScaledWidth()).toBeCloseTo(1000, 0)   // 100mm * 10px/mm
    expect(o.getScaledHeight()).toBeCloseTo(1000, 0)
  })

  it('positions in pixels converted from millimetres', async () => {
    const o = await mapImageObject(image(), { pxPerMm: 10 }, resolver)
    expect(o.left).toBeCloseTo(100, 6)
  })

  it('applies opacity and rotation', async () => {
    const o = await mapImageObject(image({ opacity: 0.5, rotation: 30 }), { pxPerMm: 2 }, resolver)
    expect(o.opacity).toBe(0.5)
    expect(o.angle).toBe(30)
  })

  it('propagates a missing-media failure instead of rendering a blank', async () => {
    await expect(
      mapImageObject(image({ mediaId: 'gone' }), { pxPerMm: 2 }, resolver),
    ).rejects.toThrow(/Media not found: gone/)
  })

  it('requests the cutout when background is removed', async () => {
    const seen: string[] = []
    const spy: MediaResolver = async (id, bg) => { seen.push(bg); return resolver(id, bg) }
    await mapImageObject(image({ background: 'removed' }), { pxPerMm: 2 }, spy)
    expect(seen).toEqual(['removed'])
  })
})

describe('mapView', () => {
  it('maps every object in document order', async () => {
    const view: DesignView = {
      printAreaMm: { w: 300, h: 400 },
      objects: [image(), image({ id: 'i2', xMm: 150 })],
    }
    const objects = await mapView(view, { pxPerMm: 2 }, resolver)
    expect(objects).toHaveLength(2)
    expect(objects[1]!.left).toBeCloseTo(300, 6)
  })
})
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/map-image.test.ts`
Expected: FAIL — `mapImageObject` is not exported.

- [ ] **Step 4: Implement**

Append to `packages/design-fabric/src/map.ts`:
```ts
import { FabricImage } from 'fabric'
import type { ImageObject } from '@kreart/design-core'

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

  // scale the intrinsic pixels down to the requested physical size
  img.scaleX = mmToPx(obj.wMm, pxPerMm) / (img.width || 1)
  img.scaleY = mmToPx(obj.hMm, pxPerMm) / (img.height || 1)

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
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/map-image.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(design-fabric): map image objects with fail-loud media resolution"
```

---

### Task 11: The node PNG renderer and the calibration test

This is the keystone task. Everything before it exists so that this test can pass.

**Files:**
- Create: `packages/design-fabric/src/render-node.ts`
- Create: `packages/design-fabric/test/calibration.test.ts`

**Interfaces:**
- Consumes: `mapView`, `MediaResolver` (Task 10), `canvasSizePx`, `dpiToPxPerMm` (Task 2)
- Produces:
  - `type RenderOptions = { dpi: number; resolve: MediaResolver; backgroundColor?: string }`
  - `renderViewToPng(doc: DesignDocument, viewSlug: string, opts: RenderOptions): Promise<Buffer>`
  - `renderViewToCanvas(doc, viewSlug, opts): Promise<StaticCanvas>`

`render-node.ts` must **not** be re-exported from `src/index.ts`. Importing it from browser code has to fail at build time.

- [ ] **Step 1: Write the failing test**

`packages/design-fabric/test/calibration.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import { dpiToPxPerMm, MM_PER_INCH, type DesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import { renderViewToPng, renderViewToCanvas } from '../src/render-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
const BLACK = fileURLToPath(new URL('./fixtures/black-1200.png', import.meta.url))

const resolve: MediaResolver = async () =>
  (await loadImage(BLACK)) as unknown as CanvasImageSource

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

/** A 100mm x 100mm black square at 10mm,10mm inside a 300x400mm print area. */
const calibrationDoc: DesignDocument = {
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 'square', kind: 'image', mediaId: 'black',
        xMm: 10, yMm: 10, wMm: 100, hMm: 100,
        rotation: 0, opacity: 1,
        sourcePx: { w: 1200, h: 1200 }, background: 'original',
      }],
    },
  },
}

/** Bounding box of dark pixels, in pixels. */
async function inkBounds(png: Buffer) {
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const { data } = ctx.getImageData(0, 0, img.width, img.height)

  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4
      if (data[i]! < 60 && data[i + 1]! < 60 && data[i + 2]! < 60) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return { wPx: maxX - minX + 1, hPx: maxY - minY + 1, minX, minY, imageW: img.width, imageH: img.height }
}

describe('calibration — the keystone test', () => {
  it('renders a 100mm square to its true physical size at 300 DPI', async () => {
    const png = await renderViewToPng(calibrationDoc, 'front', { dpi: 300, resolve })
    const b = await inkBounds(png)
    const pxPerMm = dpiToPxPerMm(300)

    const measuredWmm = b.wPx / pxPerMm
    const measuredHmm = b.hPx / pxPerMm

    // spec §10.3: documented tolerance is +/- 0.1mm
    expect(Math.abs(measuredWmm - 100)).toBeLessThan(0.1)
    expect(Math.abs(measuredHmm - 100)).toBeLessThan(0.1)
  })

  it('places the square at its specified offset', async () => {
    const png = await renderViewToPng(calibrationDoc, 'front', { dpi: 300, resolve })
    const b = await inkBounds(png)
    const pxPerMm = dpiToPxPerMm(300)
    expect(Math.abs(b.minX / pxPerMm - 10)).toBeLessThan(0.1)
    expect(Math.abs(b.minY / pxPerMm - 10)).toBeLessThan(0.1)
  })

  it('holds at 150 and 600 DPI, not just 300', async () => {
    for (const dpi of [150, 600]) {
      const png = await renderViewToPng(calibrationDoc, 'front', { dpi, resolve })
      const b = await inkBounds(png)
      expect(Math.abs(b.wPx / dpiToPxPerMm(dpi) - 100)).toBeLessThan(0.1)
    }
  })

  it('sizes the canvas to the print area, rounding up', async () => {
    const png = await renderViewToPng(calibrationDoc, 'front', { dpi: 300, resolve })
    const b = await inkBounds(png)
    expect(b.imageW).toBe(Math.ceil(300 * dpiToPxPerMm(300)))   // 3544
    expect(b.imageH).toBe(Math.ceil(400 * dpiToPxPerMm(300)))   // 4725
  })

  it('rejects an unknown view rather than rendering an empty canvas', async () => {
    await expect(
      renderViewToPng(calibrationDoc, 'back', { dpi: 300, resolve }),
    ).rejects.toThrow(/back/)
  })
})

describe('scale parity', () => {
  it('agrees in millimetres between editor and print scales within 0.01mm', async () => {
    const docWithText: DesignDocument = structuredClone(calibrationDoc)
    docWithText.views.front!.objects.push({
      id: 't1', kind: 'text', text: 'AVATAR WAVY',
      xMm: 20, yMm: 250, wMm: 260, rotation: 0,
      font: { family: 'InterTest', weight: 700, sizeMm: 22, letterSpacingMm: 1.5, lineHeight: 1.2 },
      fill: '#111111',
      curve: { radiusMm: 90, direction: 'up' },
    })

    const editorDpi = 1.8 * MM_PER_INCH   // 1.8 px/mm expressed as DPI
    const a = await renderViewToCanvas(docWithText, 'front', { dpi: editorDpi, resolve })
    const b = await renderViewToCanvas(docWithText, 'front', { dpi: 300, resolve })

    const aScale = dpiToPxPerMm(editorDpi)
    const bScale = dpiToPxPerMm(300)

    for (let i = 0; i < a.getObjects().length; i++) {
      const ra = a.getObjects()[i]!.getBoundingRect()
      const rb = b.getObjects()[i]!.getBoundingRect()
      expect(Math.abs(ra.width / aScale - rb.width / bScale)).toBeLessThan(0.01)
      expect(Math.abs(ra.height / aScale - rb.height / bScale)).toBeLessThan(0.01)
      expect(Math.abs(ra.left / aScale - rb.left / bScale)).toBeLessThan(0.01)
    }
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/calibration.test.ts`
Expected: FAIL — cannot resolve `../src/render-node.js`.

- [ ] **Step 3: Implement**

`packages/design-fabric/src/render-node.ts`:
```ts
import { StaticCanvas } from 'fabric/node'
import {
  canvasSizePx, dpiToPxPerMm, type DesignDocument,
} from '@kreart/design-core'
import { mapView, type MediaResolver } from './map.js'

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

  const canvas = new StaticCanvas(null, {
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
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/calibration.test.ts`
Expected: PASS, 6 tests.

If calibration fails, do **not** widen the tolerance. The tolerance is a spec commitment (§10.3). Find the geometry bug.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-fabric): node PNG renderer with calibration and scale-parity tests"
```

---

### Task 12: The vector PDF print master

**Files:**
- Modify: `packages/design-fabric/src/render-node.ts`
- Create: `packages/design-fabric/test/pdf.test.ts`

**Interfaces:**
- Consumes: `renderViewToCanvas` internals (Task 11)
- Produces:
  - `PT_PER_MM = 72 / 25.4`
  - `renderViewToPdf(doc: DesignDocument, viewSlug: string, opts: Omit<RenderOptions, 'dpi'> & { dpi?: number }): Promise<Buffer>`

Spec §10.2: the PDF is the print master because glyphs become vector outlines — resolution-independent, no font embedded, nothing for a print shop to substitute.

- [ ] **Step 1: Write the failing test**

`packages/design-fabric/test/pdf.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import type { DesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import { renderViewToPdf, PT_PER_MM } from '../src/render-node.js'

const FONT = fileURLToPath(new URL('./fixtures/fonts/Inter-Bold.ttf', import.meta.url))
const BLACK = fileURLToPath(new URL('./fixtures/black-1200.png', import.meta.url))
const resolve: MediaResolver = async () =>
  (await loadImage(BLACK)) as unknown as CanvasImageSource

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const doc: DesignDocument = {
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 't1', kind: 'text', text: 'AVATAR WAVY',
        xMm: 20, yMm: 200, wMm: 260, rotation: 0,
        font: { family: 'InterTest', weight: 700, sizeMm: 22, letterSpacingMm: 1.5, lineHeight: 1.2 },
        fill: '#111111',
        curve: { radiusMm: 90, direction: 'up' },
      }],
    },
  },
}

function contentStreams(pdf: Buffer): string {
  const raw = pdf.toString('latin1')
  const out: string[] = []
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const bytes = Buffer.from(m[1]!, 'latin1')
    try { out.push(zlib.inflateSync(bytes).toString('latin1')) }
    catch { out.push(bytes.toString('latin1')) }
  }
  return out.join('\n')
}

describe('renderViewToPdf', () => {
  it('produces a PDF', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('sizes the page in points to the true physical print area', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    const raw = pdf.toString('latin1')
    const expectedW = (300 * PT_PER_MM).toFixed(2)   // 850.39
    const expectedH = (400 * PT_PER_MM).toFixed(2)   // 1133.86
    expect(raw).toMatch(new RegExp(expectedW.replace('.', '\\.')))
    expect(raw).toMatch(new RegExp(expectedH.replace('.', '\\.')))
  })

  it('emits glyphs as vector paths, not as a raster image', async () => {
    const content = contentStreams(await renderViewToPdf(doc, 'front', { resolve }))
    // curve and line operators present; no text-showing operators
    expect(content).toMatch(/(?<![A-Za-z])c(?![A-Za-z])/)
    expect(content).not.toMatch(/(?<![A-Za-z])Tj(?![A-Za-z])/)
  })

  it('is far smaller than the equivalent raster', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    expect(pdf.length).toBeLessThan(100_000)
  })

  it('documents the known colour limitation from spec 10.4', async () => {
    const pdf = await renderViewToPdf(doc, 'front', { resolve })
    const raw = pdf.toString('latin1')
    // Deliberate regression guard, NOT an endorsement. Spec §10.4: output is
    // untagged device RGB. If this assertion ever fails, colour management was
    // added - update §10.4 and this test together rather than deleting it.
    expect(raw).not.toContain('/OutputIntent')
    expect(raw).not.toContain('/ICCBased')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/pdf.test.ts`
Expected: FAIL — `renderViewToPdf` is not exported.

- [ ] **Step 3: Implement**

Append to `packages/design-fabric/src/render-node.ts`:
```ts
import { createCanvas } from 'canvas'

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
  opts: Omit<RenderOptions, 'dpi'> & { dpi?: number },
): Promise<Buffer> {
  const view = requireView(doc, viewSlug)

  const pdf = createCanvas(
    view.printAreaMm.w * PT_PER_MM,
    view.printAreaMm.h * PT_PER_MM,
    'pdf',
  )
  const ctx = pdf.getContext('2d') as unknown as CanvasRenderingContext2D

  if (opts.backgroundColor) {
    ctx.fillStyle = opts.backgroundColor
    ctx.fillRect(0, 0, view.printAreaMm.w * PT_PER_MM, view.printAreaMm.h * PT_PER_MM)
  }

  ctx.save()
  ctx.scale(PT_PER_MM, PT_PER_MM)   // one unit == one millimetre
  for (const obj of await mapView(view, { pxPerMm: 1 }, opts.resolve)) {
    obj.render(ctx)
  }
  ctx.restore()

  return pdf.toBuffer()
}
```

Note `pxPerMm: 1` in the `mapView` call: the context is already scaled to millimetres, so the mapper must not scale again. Passing the print scale here would double-scale everything.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/pdf.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(design-fabric): vector PDF print master at true physical page size"
```

---

### Task 13: Golden-image regression tests

**Files:**
- Create: `packages/design-fabric/test/fixtures/designs/*.json`
- Create: `packages/design-fabric/test/golden.test.ts`
- Create: `scripts/update-goldens.ts`
- Modify: root `package.json` (add `test:update-goldens` script)

**Interfaces:**
- Consumes: `renderViewToPng` (Task 11)
- Produces: committed golden PNGs under `packages/design-fabric/test/fixtures/golden/`

Spec §12: golden images are what catch a Fabric upgrade silently changing output — the exact risk that justified not persisting Fabric JSON.

- [ ] **Step 1: Add the pixel-diff dependency**

Run: `pnpm --filter @kreart/design-fabric add -D pixelmatch@^6.0.0 pngjs@^7.0.0 @types/pngjs@^6.0.4`

- [ ] **Step 2: Write the four fixture documents**

Create `packages/design-fabric/test/fixtures/designs/curved-text.json`:
```json
{
  "schemaVersion": 1, "productId": "p", "sizeId": "s", "colourwayId": "c",
  "views": { "front": { "printAreaMm": { "w": 200, "h": 200 }, "objects": [
    { "id": "t1", "kind": "text", "text": "AVATAR WAVY", "xMm": 20, "yMm": 80,
      "wMm": 160, "rotation": 0,
      "font": { "family": "InterTest", "weight": 700, "sizeMm": 18,
                "letterSpacingMm": 1.5, "lineHeight": 1.2 },
      "fill": "#111111",
      "curve": { "radiusMm": 70, "direction": "up" } }
  ] } }
}
```

Create `packages/design-fabric/test/fixtures/designs/text-effects.json` — same shape, one text object at `xMm: 20, yMm: 90`, `text: "OUTLINE"`, `fill: "#f5c518"`, plus:
```json
"stroke": { "color": "#101010", "widthMm": 1.2 },
"shadow": { "offsetXMm": 1.5, "offsetYMm": 1.5, "blurMm": 3, "color": "rgba(0,0,0,0.55)" }
```

Create `packages/design-fabric/test/fixtures/designs/rotated-image.json` — one image object, `mediaId: "black"`, `xMm: 50, yMm: 50, wMm: 100, hMm: 60, rotation: 30, opacity: 0.8, sourcePx: { "w": 1200, "h": 1200 }, background: "original"`.

Create `packages/design-fabric/test/fixtures/designs/multi-view.json` — two views, `front` and `back`, each a 200x200mm print area, `front` holding the curved text above and `back` holding the rotated image above.

- [ ] **Step 3: Write the failing test**

`packages/design-fabric/test/golden.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas, loadImage } from 'canvas'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { parseDesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../src/index.js'
import { registerFontFile } from '../src/fonts-node.js'
import { renderViewToPng } from '../src/render-node.js'

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const FONT = dir('./fixtures/fonts/Inter-Bold.ttf')
const BLACK = dir('./fixtures/black-1200.png')

const resolve: MediaResolver = async () =>
  (await loadImage(BLACK)) as unknown as CanvasImageSource

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const CASES: { name: string; view: string }[] = [
  { name: 'curved-text', view: 'front' },
  { name: 'text-effects', view: 'front' },
  { name: 'rotated-image', view: 'front' },
  { name: 'multi-view', view: 'front' },
  { name: 'multi-view', view: 'back' },
]

describe('golden images', () => {
  for (const { name, view } of CASES) {
    it(`${name} / ${view} matches its golden`, async () => {
      const doc = parseDesignDocument(
        JSON.parse(readFileSync(dir(`./fixtures/designs/${name}.json`), 'utf8')),
      )
      const actualPng = await renderViewToPng(doc, view, { dpi: 150, resolve })

      const goldenPath = dir(`./fixtures/golden/${name}-${view}.png`)
      expect(
        existsSync(goldenPath),
        `Missing golden ${name}-${view}.png. Run: pnpm test:update-goldens`,
      ).toBe(true)

      const actual = PNG.sync.read(actualPng)
      const golden = PNG.sync.read(readFileSync(goldenPath))

      expect(actual.width).toBe(golden.width)
      expect(actual.height).toBe(golden.height)

      const diff = new PNG({ width: actual.width, height: actual.height })
      const differing = pixelmatch(
        actual.data, golden.data, diff.data,
        actual.width, actual.height,
        { threshold: 0.1 },
      )

      // antialiasing varies slightly across cairo builds; 0.1% of pixels is the ceiling
      const ratio = differing / (actual.width * actual.height)
      expect(ratio).toBeLessThan(0.001)
    })
  }
})
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-fabric/test/golden.test.ts`
Expected: FAIL — every case reports a missing golden.

- [ ] **Step 5: Write the golden generator**

`scripts/update-goldens.ts`:
```ts
import { createCanvas, loadImage } from 'canvas'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDesignDocument } from '@kreart/design-core'
import { setMetricsContext, type MediaResolver } from '../packages/design-fabric/src/index.js'
import { registerFontFile } from '../packages/design-fabric/src/fonts-node.js'
import { renderViewToPng } from '../packages/design-fabric/src/render-node.js'

const dir = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const base = '../packages/design-fabric/test/fixtures'

registerFontFile(dir(`${base}/fonts/Inter-Bold.ttf`), 'InterTest', 700)
setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)

const resolve: MediaResolver = async () =>
  (await loadImage(dir(`${base}/black-1200.png`))) as unknown as CanvasImageSource

const CASES = [
  ['curved-text', 'front'], ['text-effects', 'front'],
  ['rotated-image', 'front'], ['multi-view', 'front'], ['multi-view', 'back'],
] as const

mkdirSync(dir(`${base}/golden`), { recursive: true })

for (const [name, view] of CASES) {
  const doc = parseDesignDocument(
    JSON.parse(readFileSync(dir(`${base}/designs/${name}.json`), 'utf8')),
  )
  const png = await renderViewToPng(doc, view, { dpi: 150, resolve })
  writeFileSync(dir(`${base}/golden/${name}-${view}.png`), png)
  console.log(`wrote ${name}-${view}.png`)
}
```

Add to the root `package.json` scripts:
```json
"test:update-goldens": "tsx scripts/update-goldens.ts"
```

Run: `pnpm add -Dw tsx`

- [ ] **Step 6: Generate the goldens, then inspect them by eye**

Run: `pnpm test:update-goldens`

**Open each generated PNG and look at it.** A golden generated from broken code locks the bug in permanently — that is the one failure mode this whole task cannot catch by itself. Confirm: the curved text arcs upward and reads left to right, the outline and shadow are visible and not mirrored, and the rotated image is rotated.

- [ ] **Step 7: Run the tests**

Run: `pnpm vitest run packages/design-fabric/test/golden.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "test(design-fabric): golden-image regression suite"
```

---

### Task 14: The worker container and CI

**Files:**
- Create: `docker/worker.Dockerfile`
- Create: `.github/workflows/ci.yml`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: everything above
- Produces: a CI pipeline that runs unit tests on the host **and** the calibration test inside the real worker image

Spec §12.1: a green test on a developer machine proves nothing about the container. node-canvas is a native module with a long history of prebuild friction on Alpine and ARM, and during the spike npm's install-script blocking silently prevented its prebuild from being fetched.

- [ ] **Step 1: Write the Dockerfile**

`docker/worker.Dockerfile`:
```dockerfile
# Debian-based, NOT Alpine: node-canvas prebuilds target glibc, and building
# from source on musl is a long-tail source of failures (spec §12.1).
FROM node:22-bookworm-slim

# node-canvas runtime and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      build-essential \
      python3 \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/design-core/package.json packages/design-core/
COPY packages/design-fabric/package.json packages/design-fabric/

# --unsafe-perm so canvas's prebuild-install actually runs. Without it the
# native binary is silently absent and every render fails at runtime.
RUN pnpm install --frozen-lockfile --unsafe-perm

COPY . .

# fail the build immediately if the native module did not link
RUN node -e "require('canvas').createCanvas(1,1); console.log('node-canvas OK')"

CMD ["pnpm", "vitest", "run"]
```

`.dockerignore`:
```
node_modules
**/node_modules
.git
.next
dist
```

- [ ] **Step 2: Build the image locally and confirm it fails loudly if deps are missing**

Run: `docker build -f docker/worker.Dockerfile -t kreart-worker .`
Expected: the `node-canvas OK` line appears near the end of the build output.

- [ ] **Step 3: Run the calibration test inside the container**

Run:
```bash
docker run --rm kreart-worker pnpm vitest run packages/design-fabric/test/calibration.test.ts
```
Expected: PASS, 6 tests — the same result as on the host. If the numbers differ between host and container, the container is authoritative: it matches production.

- [ ] **Step 4: Write the CI workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: sudo apt-get update && sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm test

  # Spec §12.1: the print pipeline depends on node-canvas behaving identically
  # in CI and on the deploy target. A host-only test does not establish that.
  container:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build the real worker image
        run: docker build -f docker/worker.Dockerfile -t kreart-worker .
      - name: Measure a calibration square inside the container
        run: docker run --rm kreart-worker pnpm vitest run packages/design-fabric/test/calibration.test.ts
      - name: Golden images inside the container
        run: docker run --rm kreart-worker pnpm vitest run packages/design-fabric/test/golden.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "ci: build the real worker image and measure calibration inside it"
```

---

## Definition of Done

Plan 1 is complete when all of the following hold:

- [ ] `pnpm test` passes on the host, and the same suite passes inside `kreart-worker`.
- [ ] A 100 mm square renders to within **±0.1 mm** at 150, 300 and 600 DPI.
- [ ] Editor-scale and print-scale bounding boxes agree within **0.01 mm**.
- [ ] Curved text renders with kerning summing to the engine's whole-string width within 0.01 px.
- [ ] The PDF page measures exactly 850.39 × 1133.86 pt for a 300 × 400 mm print area, with glyphs as vector paths.
- [ ] Five golden images are committed and visually confirmed correct by a human.
- [ ] `packages/design-fabric/src/index.ts` re-exports neither `render-node.ts` nor `fonts-node.ts`.
- [ ] No `DesignDocument` field anywhere holds a pixel value.

## What Plan 1 deliberately does not do

- No Payload, no database, no HTTP. Media is resolved through an injected `MediaResolver`, and the only implementation in this plan is a test fixture.
- No browser. `CurvedText` interaction — selection handles, live drag-resize, and the frame-rate cost of `objectCaching = false` (spec §7.4) — is unverified and belongs to Plan 3.
- No background removal. It is client-side (spec §8) and belongs to Plan 3.
- No colour management. Spec §10.4 defers it, and Task 12 includes a regression guard asserting the current untagged-RGB behaviour so the deferral stays visible.
- No `fonts` collection. Spec §11.2 requires `licenceName`, `licenceUrl`, `permitsServerRendering`
  and `permitsOutlineConversion` as required fields; that is Plan 2. Task 7 enforces the *policy*
  by vendoring an OFL font, but nothing yet enforces it for fonts an admin uploads.
- No resolution indicator UI. Spec §3.3 requires a non-colour-dependent green/amber/red indicator;
  `collectWarnings` (Task 5) supplies the data, and Plan 3 renders it.
