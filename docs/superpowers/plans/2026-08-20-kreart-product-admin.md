# kreart Product Model & Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can define a complete garment and place its print area **visually** — dragging a rectangle over the mockup and seeing its true physical size — with the geometry provably consistent between what they see and what the renderer produces.

**Architecture:** The aspect-coupling maths lives in `@kreart/design-core` as pure functions, so nearly every test runs without a browser or a database. The editor itself is a Payload `ui` field that reads and writes its sibling form fields through `useField` — a controller over form state, never an owner of it — drawn with plain DOM and pointer events rather than a canvas library. Hooks on `products` reject incoherent data at save time rather than warning about it.

**Tech Stack:** Next.js 15, React 19, Payload 3.88 (Postgres adapter), `@payloadcms/storage-s3`, `@payloadcms/ui`, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-kreart-product-admin-design.md`
**Project spec:** `docs/superpowers/specs/2026-08-19-kreart-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the specs.

- **A design is authored in millimetres; pixels exist only at render time.** Normalised 0–1 coordinates describe position on a *photograph*, never physical size.
- **The coupling rule:** `(w × mockupWidthPx) / (h × mockupHeightPx)` must equal `widthMm / heightMm`. When they disagree the print area is incoherent.
- **Aspect tolerance is 0.5 % (`0.005`)** for both the coupling rule and mockup validation.
- **Fail loudly, never substitute silently.** Aspect mismatches, duplicate view slugs, unset font licence permissions and invalid design documents all **reject the save**.
- **Never silently correct stored data on load.** A pre-existing mismatch is *shown* with a one-click reconcile; opening a document must not rewrite it.
- **A `DesignDocument` references a view by `slug`, not by id.** Slugs are unique within a product and well-formed (lowercase, hyphenated).
- **The canvas is a controller, not an owner.** Payload keeps validation, labels, required-field errors and dirty-tracking.
- **Plain DOM and pointer events in the editor — no Fabric.** `design-fabric` must not enter the admin bundle in this plan.
- Pinned: `payload@3.88.0` and every `@payloadcms/*` at the same exact version; `fabric@7.4.0`; `canvas@3.x`.
- ESM throughout; `packages/*` use `moduleResolution: NodeNext` and relative imports carry `.js`. `apps/web` uses `bundler` resolution.
- Never re-export `fonts-node.ts` or `render-node.ts` from `@kreart/design-fabric`'s browser surface.

---

## File Structure

```
packages/design-core/
  src/print-area.ts                 aspect coupling: pure, no DOM, no Payload
  test/print-area.test.ts

apps/web/src/
  collections/Products.ts           + slug rules, + the ui editor field
  collections/Fonts.ts              NEW — licence gate
  collections/Designs.ts            NEW — DesignDocument + server-side validation
  collections/Media.ts              + S3 storage
  hooks/validateMockupAspects.ts    NEW — beforeChange on products
  hooks/validateViewSlugs.ts        NEW — beforeChange on products
  components/PrintAreaEditor/
    index.tsx                       the Payload ui field: binding only
    Canvas.tsx                      presentational: image + draggable rect
    useRectDrag.ts                  pointer maths, no Payload imports
  payload.config.ts                 register new collections
  scripts/seed-garment.ts           NEW — one complete real product

apps/web/e2e/
  print-area.spec.ts                the keystone round-trip
  playwright.config.ts
```

`useRectDrag.ts` holds no Payload imports so its maths is unit-testable without a form context. `index.tsx` holds no pointer maths. That split is what keeps the editor testable.

---

### Task 0 (SPIKE): Does the editor stay responsive three levels deep?

**Output is an answer, not code you keep.** Everything built here is throwaway and must not be committed.

**The question:** the print-area editor is a custom `ui` component living at
`products → views[] → printArea → editor` — a React component inside a Payload array field, two
levels of nesting down. Payload array fields with embedded custom components have historically had
rough edges around re-render cost and row reordering. **Unwinding a collection shape after the fact
is exactly the retrofit spec §1.2 says role enforcement was deliberately avoiding**, so this is
worth an hour before Task 8 commits to it.

**What to find out, in order:**

1. **Does dragging stay smooth with several views?** Create a product with **four** views, each
   with three mockups. Drag the rectangle in view 4. Does it track the pointer, or lag?
2. **Does every view re-render on each pointer move?** Add a temporary `console.count()` at the top
   of the editor component. Drag once. If the count rises for views you are not touching, sibling
   rows are re-rendering on every frame and `useFormFields` is subscribing too broadly.
3. **Does reordering a view row corrupt the editor?** Drag view 2 above view 1 using Payload's row
   handle. Does each editor still show its own mockup and its own rectangle, or do they swap?
4. **Does collapsing and re-expanding a row lose state?** Payload unmounts collapsed array rows.

**If 1 or 2 is bad:** the likely cause is `useFormFields` selecting too much. Narrow the selector to
the single mockup path this row needs, and re-measure before concluding the structure is wrong.

**If 3 or 4 is broken:** that is a structural finding. Report it and stop — do not work around it.
The fallback is spec §2's rejected alternative (separate `product-views` collection), and choosing
it is a decision for the human, not for the implementer.

- [ ] **Step 1: Build a throwaway editor stub**

A minimal `ui` field component that renders a coloured box, a `console.count()`, and reads one
sibling field via `useField`. Enough to exercise nesting and re-render behaviour; no drag maths.

- [ ] **Step 2: Run the four probes above and record real numbers**

Not impressions. Frame rate or perceived lag for probe 1, actual counts for probe 2, and what you
observed for 3 and 4.

- [ ] **Step 3: Report and delete**

Write the findings into your report, delete the stub, and confirm `git status` is clean.
**Commit nothing from this task.**

**This gate is advisory, not blocking, with one exception:** if probe 3 or 4 shows corruption,
Task 8 does not start until a human has ruled on the structure.

---

### Task 1: Print-area coupling maths

**Files:**
- Create: `packages/design-core/src/print-area.ts`
- Create: `packages/design-core/test/print-area.test.ts`
- Modify: `packages/design-core/src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type NormRect = { x: number; y: number; w: number; h: number }`
  - `type MockupPx = { w: number; h: number }`
  - `type PhysicalMm = { widthMm: number; heightMm: number }`
  - `ASPECT_TOLERANCE = 0.005`
  - `onMockupAspect(rect: NormRect, mockup: MockupPx): number`
  - `physicalAspect(mm: PhysicalMm): number`
  - `aspectsAgree(rect: NormRect, mockup: MockupPx, mm: PhysicalMm, tolerance?: number): boolean`
  - `heightMmForRect(rect: NormRect, mockup: MockupPx, widthMm: number): number`
  - `rectForPhysical(rect: NormRect, mockup: MockupPx, mm: PhysicalMm): NormRect`
  - `clampRect(rect: NormRect): NormRect`

- [ ] **Step 1: Write the failing test**

`packages/design-core/test/print-area.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  ASPECT_TOLERANCE, onMockupAspect, physicalAspect, aspectsAgree,
  heightMmForRect, rectForPhysical, clampRect,
} from '../src/print-area.js'

const mockup = { w: 1000, h: 1250 }          // a 4:5 photograph

describe('onMockupAspect', () => {
  it('accounts for the mockup being non-square', () => {
    // half the width, half the height -> 500px by 625px -> 0.8
    expect(onMockupAspect({ x: 0.25, y: 0.2, w: 0.5, h: 0.5 }, mockup)).toBeCloseTo(0.8, 10)
  })

  it('is unaffected by position', () => {
    const a = onMockupAspect({ x: 0, y: 0, w: 0.5, h: 0.5 }, mockup)
    const b = onMockupAspect({ x: 0.4, y: 0.3, w: 0.5, h: 0.5 }, mockup)
    expect(a).toBeCloseTo(b, 10)
  })

  it('throws on a zero-height rect rather than returning Infinity', () => {
    expect(() => onMockupAspect({ x: 0, y: 0, w: 0.5, h: 0 }, mockup)).toThrow(/positive/)
  })

  it('throws on a non-positive mockup dimension', () => {
    expect(() => onMockupAspect({ x: 0, y: 0, w: 0.5, h: 0.5 }, { w: 0, h: 100 })).toThrow(/positive/)
  })
})

describe('physicalAspect', () => {
  it('is width over height', () => {
    expect(physicalAspect({ widthMm: 300, heightMm: 400 })).toBeCloseTo(0.75, 10)
  })

  it('throws on a non-positive height', () => {
    expect(() => physicalAspect({ widthMm: 300, heightMm: 0 })).toThrow(/positive/)
  })
})

describe('aspectsAgree', () => {
  const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }   // 0.8 on this mockup

  it('accepts an exact match', () => {
    expect(aspectsAgree(rect, mockup, { widthMm: 400, heightMm: 500 })).toBe(true)
  })

  it('accepts a difference inside the 0.5% tolerance', () => {
    // 0.8 * 1.004 = 0.8032 -> heightMm chosen to land just inside
    expect(aspectsAgree(rect, mockup, { widthMm: 401.6, heightMm: 500 })).toBe(true)
  })

  it('rejects a difference outside the tolerance', () => {
    expect(aspectsAgree(rect, mockup, { widthMm: 300, heightMm: 400 })).toBe(false)
  })

  it('rejects a square rect declaring a 3:4 physical size', () => {
    // the incoherence the spec calls out by name
    const square = { x: 0.25, y: 0.25, w: 0.4, h: 0.32 }   // 400x400px -> 1.0
    expect(aspectsAgree(square, mockup, { widthMm: 300, heightMm: 400 })).toBe(false)
  })

  it('honours a caller-supplied tolerance', () => {
    expect(aspectsAgree(rect, mockup, { widthMm: 300, heightMm: 400 }, 0.5)).toBe(true)
  })

  it('exposes the default tolerance as 0.005', () => {
    expect(ASPECT_TOLERANCE).toBe(0.005)
  })
})

describe('heightMmForRect', () => {
  it('derives the height that makes the aspects agree', () => {
    const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }      // 0.8
    expect(heightMmForRect(rect, mockup, 400)).toBeCloseTo(500, 6)
  })

  it('round-trips: the derived height satisfies aspectsAgree', () => {
    const rect = { x: 0.1, y: 0.1, w: 0.37, h: 0.22 }
    const heightMm = heightMmForRect(rect, mockup, 260)
    expect(aspectsAgree(rect, mockup, { widthMm: 260, heightMm })).toBe(true)
  })
})

describe('rectForPhysical', () => {
  const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }

  it('reshapes about the rect centre, leaving the centre put', () => {
    const next = rectForPhysical(rect, mockup, { widthMm: 300, heightMm: 400 })
    expect(next.x + next.w / 2).toBeCloseTo(rect.x + rect.w / 2, 10)
    expect(next.y + next.h / 2).toBeCloseTo(rect.y + rect.h / 2, 10)
  })

  it('produces a rect whose aspect matches the requested physical size', () => {
    const next = rectForPhysical(rect, mockup, { widthMm: 300, heightMm: 400 })
    expect(aspectsAgree(next, mockup, { widthMm: 300, heightMm: 400 })).toBe(true)
  })

  it('is a no-op when the aspects already agree', () => {
    const next = rectForPhysical(rect, mockup, { widthMm: 400, heightMm: 500 })
    expect(next.w).toBeCloseTo(rect.w, 8)
    expect(next.h).toBeCloseTo(rect.h, 8)
  })

  it('keeps the result inside the mockup', () => {
    const edge = { x: 0.9, y: 0.9, w: 0.09, h: 0.09 }
    const next = rectForPhysical(edge, mockup, { widthMm: 400, heightMm: 100 })
    expect(next.x).toBeGreaterThanOrEqual(0)
    expect(next.y).toBeGreaterThanOrEqual(0)
    expect(next.x + next.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(next.y + next.h).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('clampRect', () => {
  it('leaves an inside rect alone', () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 }
    expect(clampRect(r)).toEqual(r)
  })

  it('slides an overhanging rect back inside without resizing it', () => {
    const c = clampRect({ x: 0.8, y: 0.9, w: 0.5, h: 0.3 })
    expect(c.w).toBeCloseTo(0.5, 10)
    expect(c.h).toBeCloseTo(0.3, 10)
    expect(c.x).toBeCloseTo(0.5, 10)
    expect(c.y).toBeCloseTo(0.7, 10)
  })

  it('shrinks a rect larger than the mockup rather than overflowing', () => {
    const c = clampRect({ x: -0.2, y: -0.2, w: 1.5, h: 1.4 })
    expect(c).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run packages/design-core/test/print-area.test.ts`
Expected: FAIL — cannot resolve `../src/print-area.js`.

- [ ] **Step 3: Implement**

`packages/design-core/src/print-area.ts`:
```ts
/**
 * The coupling between where a print area sits on a mockup photograph and how
 * large it is in reality.
 *
 * These are genuinely different things: normalised 0-1 coordinates say where on
 * the photo, millimetres say how big on the garment. Dragging cannot derive
 * millimetres, because nothing tells us how large the garment in the photo is.
 *
 * But they are not independent — both describe the same rectangle, so their
 * aspect ratios must agree. When they do not, the print area is incoherent: a
 * rectangle that looks square on the mockup while declaring 300x400mm.
 */

export type NormRect = { x: number; y: number; w: number; h: number }
export type MockupPx = { w: number; h: number }
export type PhysicalMm = { widthMm: number; heightMm: number }

/** Spec §3.2 and §6: absorbs rounding in stored values, admits nothing visibly wrong. */
export const ASPECT_TOLERANCE = 0.005

function requirePositive(value: number, what: string): number {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error(`${what} must be a positive finite number, got ${value}`)
  }
  return value
}

/** Width over height of the rectangle as it appears on the mockup, in pixels. */
export function onMockupAspect(rect: NormRect, mockup: MockupPx): number {
  requirePositive(mockup.w, 'mockup width')
  requirePositive(mockup.h, 'mockup height')
  requirePositive(rect.w, 'rect width')
  requirePositive(rect.h, 'rect height')
  return (rect.w * mockup.w) / (rect.h * mockup.h)
}

/** Width over height of the declared physical size. */
export function physicalAspect(mm: PhysicalMm): number {
  requirePositive(mm.widthMm, 'widthMm')
  requirePositive(mm.heightMm, 'heightMm')
  return mm.widthMm / mm.heightMm
}

/** Do the two descriptions of the same rectangle agree, within tolerance? */
export function aspectsAgree(
  rect: NormRect,
  mockup: MockupPx,
  mm: PhysicalMm,
  tolerance: number = ASPECT_TOLERANCE,
): boolean {
  const onPhoto = onMockupAspect(rect, mockup)
  const physical = physicalAspect(mm)
  return Math.abs(onPhoto - physical) / physical <= tolerance
}

/**
 * The height in mm that makes the declared size agree with the drawn rectangle.
 * Used when the admin drags: the shape changes, so the declared height follows.
 */
export function heightMmForRect(rect: NormRect, mockup: MockupPx, widthMm: number): number {
  requirePositive(widthMm, 'widthMm')
  return widthMm / onMockupAspect(rect, mockup)
}

/**
 * Reshape the rectangle to match a requested physical size, about its own centre.
 * Used when the admin types a millimetre value: the declared size changes, so the
 * drawn shape follows. Position is preserved; only the shape moves.
 *
 * The area on the photo is preserved so the rectangle neither balloons nor
 * collapses as it is reshaped.
 */
export function rectForPhysical(rect: NormRect, mockup: MockupPx, mm: PhysicalMm): NormRect {
  const target = physicalAspect(mm)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2

  // solve for w,h with (w*mockup.w)/(h*mockup.h) === target, preserving w*h
  const area = rect.w * rect.h
  const ratio = (target * mockup.h) / mockup.w      // w/h in normalised units
  const h = Math.sqrt(area / ratio)
  const w = ratio * h

  return clampRect({ x: cx - w / 2, y: cy - h / 2, w, h })
}

/**
 * Keep a rectangle inside the mockup. Slides it back if it overhangs; shrinks it
 * only if it is genuinely larger than the image.
 */
export function clampRect(rect: NormRect): NormRect {
  const w = Math.min(Math.max(rect.w, 0), 1)
  const h = Math.min(Math.max(rect.h, 0), 1)
  const x = Math.min(Math.max(rect.x, 0), 1 - w)
  const y = Math.min(Math.max(rect.y, 0), 1 - h)
  return { x, y, w, h }
}
```

Add to `packages/design-core/src/index.ts`:
```ts
export * from './print-area.js'
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/design-core/test/print-area.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/design-core
git commit -m "feat(design-core): print-area aspect coupling"
```

---

### Task 2: View slug rules

**Files:**
- Create: `apps/web/src/hooks/validateViewSlugs.ts`
- Create: `apps/web/test/validateViewSlugs.test.ts`
- Modify: `apps/web/src/collections/Products.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `validateViewSlugs(views: { slug?: string | null }[]): void` — throws on a duplicate or malformed slug

A `DesignDocument` references a view by `slug` (spec §2), so a duplicate makes a design ambiguous and a renamed slug orphans it.

- [ ] **Step 1: Write the failing test**

`apps/web/test/validateViewSlugs.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { validateViewSlugs } from '../src/hooks/validateViewSlugs'

describe('validateViewSlugs', () => {
  it('accepts distinct well-formed slugs', () => {
    expect(() => validateViewSlugs([{ slug: 'front' }, { slug: 'left-sleeve' }])).not.toThrow()
  })

  it('rejects a duplicate, naming it', () => {
    expect(() => validateViewSlugs([{ slug: 'front' }, { slug: 'front' }])).toThrow(/front/)
  })

  it('rejects uppercase', () => {
    expect(() => validateViewSlugs([{ slug: 'Front' }])).toThrow(/lowercase/i)
  })

  it('rejects spaces and underscores', () => {
    expect(() => validateViewSlugs([{ slug: 'left sleeve' }])).toThrow()
    expect(() => validateViewSlugs([{ slug: 'left_sleeve' }])).toThrow()
  })

  it('rejects an empty or missing slug', () => {
    expect(() => validateViewSlugs([{ slug: '' }])).toThrow()
    expect(() => validateViewSlugs([{}])).toThrow()
  })

  it('accepts an empty view list — required-ness is Payload\'s job', () => {
    expect(() => validateViewSlugs([])).not.toThrow()
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run apps/web/test/validateViewSlugs.test.ts`
Expected: FAIL — module not found.

Note: `vitest.config.ts` currently includes only `packages/*/test/**`. Widen it to
`['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts']` as part of this step, and say so in
your report.

- [ ] **Step 3: Implement**

`apps/web/src/hooks/validateViewSlugs.ts`:
```ts
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * A DesignDocument references a view by slug, so duplicates make a design
 * ambiguous. Throwing here rejects the save (spec §7).
 */
export function validateViewSlugs(views: { slug?: string | null }[]): void {
  const seen = new Set<string>()
  for (const [i, view] of views.entries()) {
    const slug = view.slug ?? ''
    if (!slug) {
      throw new Error(`View ${i + 1} has no slug. Designs reference views by slug.`)
    }
    if (!SLUG.test(slug)) {
      throw new Error(
        `View slug "${slug}" must be lowercase, hyphenated, and alphanumeric — e.g. "left-sleeve".`,
      )
    }
    if (seen.has(slug)) {
      throw new Error(`Duplicate view slug "${slug}". Slugs must be unique within a product.`)
    }
    seen.add(slug)
  }
}
```

In `apps/web/src/collections/Products.ts`, add to the collection config (alongside `fields`):
```ts
import { validateViewSlugs } from '../hooks/validateViewSlugs'
// ...
  hooks: {
    beforeChange: [
      ({ data }) => {
        validateViewSlugs(data?.views ?? [])
        return data
      },
    ],
  },
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run apps/web/test/validateViewSlugs.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web vitest.config.ts
git commit -m "feat(web): reject duplicate and malformed view slugs"
```

---

### Task 3: Mockup aspect-ratio validation

**Files:**
- Create: `apps/web/src/hooks/validateMockupAspects.ts`
- Create: `apps/web/test/validateMockupAspects.test.ts`
- Modify: `apps/web/src/collections/Products.ts`

**Interfaces:**
- Consumes: `ASPECT_TOLERANCE` from `@kreart/design-core` (Task 1)
- Produces:
  - `type MockupDims = { label: string; width: number; height: number }`
  - `assertMockupAspectsAgree(viewSlug: string, mockups: MockupDims[], tolerance?: number): void`
  - `validateMockupAspects(data, req): Promise<void>` — the Payload-facing wrapper

Normalised coordinates survive a mockup swap **only if the aspect ratio is unchanged** (project spec §15 assumption 6). A re-crop silently moves the print area and the corruption is invisible until something prints wrong — so this **refuses** rather than warns.

- [ ] **Step 1: Write the failing test**

`apps/web/test/validateMockupAspects.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { assertMockupAspectsAgree } from '../src/hooks/validateMockupAspects'

const a = { label: 'white.png', width: 1000, height: 1250 }      // 0.8

describe('assertMockupAspectsAgree', () => {
  it('accepts identical dimensions', () => {
    expect(() => assertMockupAspectsAgree('front', [a, { ...a, label: 'black.png' }])).not.toThrow()
  })

  it('accepts a higher-resolution image of the same ratio', () => {
    const bigger = { label: 'white@3x.png', width: 3000, height: 3750 }
    expect(() => assertMockupAspectsAgree('front', [a, bigger])).not.toThrow()
  })

  it('rejects a re-crop, naming the view and both images', () => {
    const cropped = { label: 'black.png', width: 1000, height: 1000 }
    expect(() => assertMockupAspectsAgree('front', [a, cropped])).toThrow(/front/)
    expect(() => assertMockupAspectsAgree('front', [a, cropped])).toThrow(/white\.png/)
    expect(() => assertMockupAspectsAgree('front', [a, cropped])).toThrow(/black\.png/)
  })

  it('reports both aspect ratios in the message so the admin can act', () => {
    const cropped = { label: 'black.png', width: 1000, height: 1000 }
    let msg = ''
    try { assertMockupAspectsAgree('front', [a, cropped]) } catch (e) { msg = String(e) }
    expect(msg).toMatch(/0\.8/)
    expect(msg).toMatch(/1(\.0+)?/)
  })

  it('accepts a difference inside the 0.5% tolerance', () => {
    const rounded = { label: 'black.png', width: 1003, height: 1250 }   // 0.8024, +0.3%
    expect(() => assertMockupAspectsAgree('front', [a, rounded])).not.toThrow()
  })

  it('rejects a difference outside it', () => {
    const off = { label: 'black.png', width: 1020, height: 1250 }       // 0.816, +2%
    expect(() => assertMockupAspectsAgree('front', [a, off])).toThrow()
  })

  it('accepts zero or one mockup — nothing to compare against', () => {
    expect(() => assertMockupAspectsAgree('front', [])).not.toThrow()
    expect(() => assertMockupAspectsAgree('front', [a])).not.toThrow()
  })

  it('rejects a mockup with a non-positive dimension rather than dividing by zero', () => {
    expect(() => assertMockupAspectsAgree('front', [a, { label: 'bad.png', width: 0, height: 10 }]))
      .toThrow(/positive/)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run apps/web/test/validateMockupAspects.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/hooks/validateMockupAspects.ts`:
```ts
import { ASPECT_TOLERANCE } from '@kreart/design-core'

export type MockupDims = { label: string; width: number; height: number }

/**
 * Every mockup for a view must share one aspect ratio.
 *
 * The print area's position is stored in normalised 0-1 coordinates precisely so
 * a mockup can be replaced with a higher-resolution one without redefining the
 * geometry (project spec §3.1). That only holds if the ratio is unchanged: a
 * re-crop silently moves the print area, and nobody finds out until a garment is
 * printed wrong. So this refuses rather than warns (project spec §15, assumption 6).
 */
export function assertMockupAspectsAgree(
  viewSlug: string,
  mockups: MockupDims[],
  tolerance: number = ASPECT_TOLERANCE,
): void {
  if (mockups.length < 2) return

  for (const m of mockups) {
    if (!(Number.isFinite(m.width) && m.width > 0) || !(Number.isFinite(m.height) && m.height > 0)) {
      throw new Error(
        `Mockup "${m.label}" on view "${viewSlug}" has a non-positive dimension ` +
        `(${m.width}x${m.height}). It cannot be used as a mockup.`,
      )
    }
  }

  const first = mockups[0]!
  const base = first.width / first.height

  for (const m of mockups.slice(1)) {
    const ratio = m.width / m.height
    if (Math.abs(ratio - base) / base > tolerance) {
      throw new Error(
        `View "${viewSlug}": mockup aspect ratios differ. ` +
        `"${first.label}" is ${first.width}x${first.height} (${base.toFixed(4)}) but ` +
        `"${m.label}" is ${m.width}x${m.height} (${ratio.toFixed(4)}). ` +
        `The print area is positioned in normalised coordinates, so a different ratio ` +
        `would silently move it. Re-export "${m.label}" at the same aspect ratio.`,
      )
    }
  }
}

/** Payload-facing wrapper: resolves media ids to dimensions, then asserts. */
export async function validateMockupAspects(
  data: { views?: { slug?: string | null; mockups?: { image?: unknown }[] }[] } | undefined,
  req: { payload: { findByID: (a: { collection: string; id: string | number; depth?: number }) => Promise<any> } },
): Promise<void> {
  for (const view of data?.views ?? []) {
    const dims: MockupDims[] = []
    for (const mockup of view.mockups ?? []) {
      const image: any = mockup.image
      const doc = typeof image === 'object' && image !== null
        ? image
        : await req.payload.findByID({ collection: 'media', id: image as string, depth: 0 })
      if (!doc) continue
      dims.push({
        label: doc.filename ?? String(doc.id),
        width: doc.width,
        height: doc.height,
      })
    }
    assertMockupAspectsAgree(view.slug ?? '(unnamed view)', dims)
  }
}
```

Wire it into `Products.ts`'s existing `beforeChange` array, after the slug check:
```ts
import { validateMockupAspects } from '../hooks/validateMockupAspects'
// ...
      async ({ data, req }) => {
        await validateMockupAspects(data, req as never)
        return data
      },
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run apps/web/test/validateMockupAspects.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): refuse mockups whose aspect ratio differs within a view"
```

---

### Task 4: The fonts collection

**Files:**
- Create: `apps/web/src/collections/Fonts.ts`
- Create: `apps/web/test/fonts-licence.test.ts`
- Modify: `apps/web/src/payload.config.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `Fonts: CollectionConfig` (slug `fonts`)
  - `assertLicencePermissions(doc: { permitsServerRendering?: unknown; permitsOutlineConversion?: unknown; _status?: string }): void`

Project spec §11.2: a licence permitting webfont use does **not** automatically permit server-side rendering, nor conversion to outlines — and §10.2's PDF path outlines glyphs as a *side effect*, so a licence can be violated without anyone deciding to.

- [ ] **Step 1: Write the failing test**

`apps/web/test/fonts-licence.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { assertLicencePermissions } from '../src/collections/Fonts'

describe('assertLicencePermissions', () => {
  it('accepts a font with both permissions granted', () => {
    expect(() => assertLicencePermissions({
      permitsServerRendering: true, permitsOutlineConversion: true,
    })).not.toThrow()
  })

  it('rejects an unset server-rendering permission', () => {
    expect(() => assertLicencePermissions({
      permitsOutlineConversion: true,
    })).toThrow(/server/i)
  })

  it('rejects an unset outline-conversion permission, explaining why it matters', () => {
    let msg = ''
    try { assertLicencePermissions({ permitsServerRendering: true }) } catch (e) { msg = String(e) }
    expect(msg).toMatch(/outline/i)
    expect(msg).toMatch(/PDF/)
  })

  it('rejects an explicit false, not merely undefined', () => {
    expect(() => assertLicencePermissions({
      permitsServerRendering: false, permitsOutlineConversion: true,
    })).toThrow(/server/i)
  })

  it('names both when both are missing', () => {
    let msg = ''
    try { assertLicencePermissions({}) } catch (e) { msg = String(e) }
    expect(msg).toMatch(/server/i)
    expect(msg).toMatch(/outline/i)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run apps/web/test/fonts-licence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/collections/Fonts.ts`:
```ts
import type { CollectionConfig } from 'payload'

/**
 * A font cannot be published unless its licence permits BOTH server-side
 * rendering and conversion to outlines (project spec §11.2).
 *
 * The second is the one that catches people out: the PDF print master converts
 * glyphs to vector outlines as a side effect of the cairo surface, not as a
 * deliberate step, so a licence forbidding outlining is violated without anyone
 * choosing to do it.
 */
export function assertLicencePermissions(doc: {
  permitsServerRendering?: unknown
  permitsOutlineConversion?: unknown
}): void {
  const missing: string[] = []
  if (doc.permitsServerRendering !== true) {
    missing.push('server-side rendering (the worker rasterises this font on a server)')
  }
  if (doc.permitsOutlineConversion !== true) {
    missing.push('conversion to outlines (the PDF print master outlines every glyph)')
  }
  if (missing.length) {
    throw new Error(
      `This font cannot be published until its licence is confirmed to permit: ` +
      `${missing.join('; and ')}. Read the licence before publishing — open-source ` +
      `families under SIL OFL 1.1 or Apache 2.0 satisfy both.`,
    )
  }
}

export const Fonts: CollectionConfig = {
  slug: 'fonts',
  admin: {
    useAsTitle: 'family',
    defaultColumns: ['family', 'weight', 'licenceName'],
    description: 'Fonts offered in the design editor. Self-hosted — never linked from a CDN.',
  },
  access: { read: () => true },
  upload: { staticDir: 'fonts', mimeTypes: ['font/ttf', 'font/otf', 'application/octet-stream'] },
  hooks: {
    beforeChange: [
      ({ data }) => { assertLicencePermissions(data ?? {}); return data },
    ],
  },
  fields: [
    { name: 'family', type: 'text', required: true },
    {
      name: 'weight', type: 'number', required: true, defaultValue: 400, min: 100, max: 900,
      admin: { description: 'The worker registers each weight separately; an unregistered weight fails loudly at render.' },
    },
    {
      type: 'collapsible',
      label: 'Licence',
      admin: { description: 'Project spec §11.2. Both permissions are required — a webfont licence does not imply either.' },
      fields: [
        { name: 'licenceName', type: 'text', required: true, admin: { description: 'SIL OFL 1.1, Apache 2.0, a commercial licence name…' } },
        { name: 'licenceUrl', type: 'text', required: true },
        {
          name: 'permitsServerRendering', type: 'checkbox', required: true, defaultValue: false,
          label: 'Licence permits server-side rendering',
        },
        {
          name: 'permitsOutlineConversion', type: 'checkbox', required: true, defaultValue: false,
          label: 'Licence permits conversion to outlines',
          admin: { description: 'The PDF print master outlines glyphs as a side effect — this is easy to violate unintentionally.' },
        },
      ],
    },
  ],
}
```

Register it in `payload.config.ts`:
```ts
import { Fonts } from './collections/Fonts'
// ...
  collections: [Users, Media, Sizes, Colourways, Products, Fonts],
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run apps/web/test/fonts-licence.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): fonts collection with a licence gate"
```

---

### Task 5: The designs collection and its server-side validation

**Files:**
- Create: `apps/web/src/collections/Designs.ts`
- Create: `apps/web/src/lib/validateDesign.ts`
- Create: `apps/web/test/validateDesign.test.ts`
- Modify: `apps/web/src/payload.config.ts`, `apps/web/next.config.mjs`

**Interfaces:**
- Consumes: `parseDesignDocument`, `validatePlacement`, `collectWarnings`, `unacknowledgedWarnings`, `DEFAULT_GUARDRAILS` from `@kreart/design-core`; `textHeightsMm`, `setMetricsContext` from `@kreart/design-fabric`; `registerFontFile` from `@kreart/design-fabric/fonts-node`
- Produces:
  - `type DesignValidationResult = { warnings: Warning[]; unacknowledged: Warning[] }`
  - `validateDesignForSave(input: { document: unknown; guardrails: Guardrails; finalising: boolean }): DesignValidationResult` — throws on invalid, on out-of-bounds placement, and on finalising with unacknowledged warnings
  - `Designs: CollectionConfig` (slug `designs`)

Nothing writes to this collection until Plan 3. It exists now so Plan 3 starts against a real schema, and so this validation is built and tested against fixtures rather than bolted on later.

**Why this needs node-canvas in the app process:** text heights come from measuring glyphs, so `textHeightsMm` needs a 2D context and registered fonts. That is the same machinery the render worker uses. Add `serverExternalPackages: ['canvas']` to `next.config.mjs` so Next does not try to bundle the native module.

- [ ] **Step 1: Write the failing test**

`apps/web/test/validateDesign.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createCanvas } from 'canvas'
import { fileURLToPath } from 'node:url'
import { DEFAULT_GUARDRAILS } from '@kreart/design-core'
import { setMetricsContext } from '@kreart/design-fabric'
import { registerFontFile } from '@kreart/design-fabric/fonts-node'
import { validateDesignForSave } from '../src/lib/validateDesign'

const FONT = fileURLToPath(
  new URL('../../../packages/design-fabric/test/fixtures/fonts/Inter-Bold.ttf', import.meta.url),
)

beforeAll(() => {
  registerFontFile(FONT, 'InterTest', 700)
  setMetricsContext(createCanvas(10, 10).getContext('2d') as unknown as CanvasRenderingContext2D)
})

const base = () => ({
  schemaVersion: 1, productId: 'p', sizeId: 's', colourwayId: 'c',
  views: {
    front: {
      printAreaMm: { w: 300, h: 400 },
      objects: [{
        id: 'i1', kind: 'image', mediaId: 'm1',
        xMm: 10, yMm: 10, wMm: 100, hMm: 100,
        rotation: 0, opacity: 1,
        sourcePx: { w: 1200, h: 1200 }, background: 'original',
      }],
    },
  },
})

describe('validateDesignForSave', () => {
  it('accepts a valid in-bounds design', () => {
    const r = validateDesignForSave({ document: base(), guardrails: DEFAULT_GUARDRAILS, finalising: false })
    expect(r.warnings).toEqual([])
    expect(r.unacknowledged).toEqual([])
  })

  it('rejects a document that fails the schema', () => {
    const bad: any = base(); bad.schemaVersion = 2
    expect(() => validateDesignForSave({ document: bad, guardrails: DEFAULT_GUARDRAILS, finalising: false }))
      .toThrow()
  })

  it('rejects an object overflowing the print area, naming it', () => {
    const bad: any = base(); bad.views.front.objects[0].xMm = 250
    expect(() => validateDesignForSave({ document: bad, guardrails: DEFAULT_GUARDRAILS, finalising: false }))
      .toThrow(/i1/)
  })

  it('reports a low-DPI warning without rejecting a draft', () => {
    const low: any = base(); low.views.front.objects[0].sourcePx = { w: 400, h: 400 }
    const r = validateDesignForSave({ document: low, guardrails: DEFAULT_GUARDRAILS, finalising: false })
    expect(r.warnings.map((w) => w.kind)).toEqual(['lowDpi'])
    expect(r.unacknowledged).toHaveLength(1)
  })

  it('blocks finalisation while a warning is unacknowledged', () => {
    const low: any = base(); low.views.front.objects[0].sourcePx = { w: 400, h: 400 }
    expect(() => validateDesignForSave({ document: low, guardrails: DEFAULT_GUARDRAILS, finalising: true }))
      .toThrow(/acknowledge/i)
  })

  it('allows finalisation once the warning is acknowledged', () => {
    const low: any = base()
    low.views.front.objects[0].sourcePx = { w: 400, h: 400 }
    low.acknowledgements = [{
      objectId: 'i1', kind: 'lowDpi',
      shown: { measured: 101.6, threshold: 300, unit: 'dpi' },
      at: '2026-08-20T09:00:00.000Z',
    }]
    expect(() => validateDesignForSave({ document: low, guardrails: DEFAULT_GUARDRAILS, finalising: true }))
      .not.toThrow()
  })

  it('measures text heights rather than guessing them', () => {
    const withText: any = base()
    withText.views.front.objects.push({
      id: 't1', kind: 'text', text: 'HELLO',
      xMm: 20, yMm: 300, wMm: 200, rotation: 0,
      font: { family: 'InterTest', weight: 700, sizeMm: 2, letterSpacingMm: 0, lineHeight: 1.2 },
      fill: '#000000',
    })
    // 2mm type is below the 4mm floor, so a smallText warning must appear —
    // which is only possible if the height was actually measured
    const r = validateDesignForSave({ document: withText, guardrails: DEFAULT_GUARDRAILS, finalising: false })
    expect(r.warnings.map((w) => w.kind)).toContain('smallText')
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run apps/web/test/validateDesign.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/lib/validateDesign.ts`:
```ts
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
```

`apps/web/src/collections/Designs.ts`:
```ts
import type { CollectionConfig } from 'payload'
import { DEFAULT_GUARDRAILS } from '@kreart/design-core'
import { validateDesignForSave } from '../lib/validateDesign'

export const Designs: CollectionConfig = {
  slug: 'designs',
  admin: {
    useAsTitle: 'id',
    defaultColumns: ['id', 'product', 'status', 'updatedAt'],
    description: 'Customer designs. Written by the editor in a later plan; validated here.',
  },
  hooks: {
    beforeChange: [
      ({ data }) => {
        if (!data?.document) return data
        validateDesignForSave({
          document: data.document,
          guardrails: DEFAULT_GUARDRAILS,
          finalising: data.status === 'finalising' || data.status === 'finalised',
        })
        return data
      },
    ],
  },
  fields: [
    { name: 'product', type: 'relationship', relationTo: 'products', required: true },
    { name: 'sizeId', type: 'text', required: true },
    { name: 'colourwayId', type: 'text', required: true },
    {
      name: 'status', type: 'select', required: true, defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Finalising', value: 'finalising' },
        { label: 'Finalised', value: 'finalised' },
        { label: 'Render failed', value: 'render-failed' },
      ],
    },
    {
      name: 'document', type: 'json', required: true,
      admin: { description: 'A DesignDocument (project spec §4.2). Millimetres only — a pixel value here is a bug.' },
    },
    {
      name: 'renderOutputs', type: 'group',
      fields: [
        { name: 'pdf', type: 'upload', relationTo: 'media' },
        { name: 'png', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}
```

In `next.config.mjs`, add alongside the existing options:
```js
  serverExternalPackages: ['canvas'],
```

Register in `payload.config.ts`:
```ts
import { Designs } from './collections/Designs'
// ...
  collections: [Users, Media, Sizes, Colourways, Products, Fonts, Designs],
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run apps/web/test/validateDesign.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Confirm the app still boots**

Run: `pnpm --filter @kreart/web dev` and load `http://localhost:3000/admin`.
Expected: 200, with `designs` and `fonts` in the sidebar. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): designs collection with authoritative server-side validation"
```

---

### Task 6: S3-compatible media storage

**Files:**
- Modify: `apps/web/src/collections/Media.ts`, `apps/web/src/payload.config.ts`, `apps/web/.env.example`, `apps/web/package.json`

**Interfaces:**
- Consumes: nothing
- Produces: media served from S3-compatible storage rather than local disk

Project spec §13 puts media on S3-compatible storage. Doing it now means mockups survive container restarts and are reachable by the render worker, which is a different process from the app.

- [ ] **Step 1: Add the adapter**

Run: `pnpm --filter @kreart/web add @payloadcms/storage-s3@3.88.0`

Pinned to the same exact version as `payload` — the plugin peer-depends on it.

- [ ] **Step 2: Configure it**

In `payload.config.ts`:
```ts
import { s3Storage } from '@payloadcms/storage-s3'
// ...
  plugins: [
    s3Storage({
      collections: { media: true, fonts: true },
      bucket: process.env.S3_BUCKET || '',
      config: {
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        forcePathStyle: true,   // required by MinIO and most S3-compatible services
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
        },
      },
    }),
  ],
```

Append to `.env.example`:
```
# S3-compatible media storage (project spec §13)
S3_BUCKET=kreart
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=kreart
S3_SECRET_ACCESS_KEY=kreart-dev-secret
```

- [ ] **Step 3: Add MinIO to the local stack**

Add to `~/Docker/general/kreart/docker-compose.yml`, in `services`:
```yaml
  minio-kreart:
    image: minio/minio
    container_name: minio-kreart
    restart: unless-stopped
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: "kreart"
      MINIO_ROOT_PASSWORD: "kreart-dev-secret"
    volumes:
      - "~/Docker/kreart/general/minio-kreart/data:/data"
    networks:
      - revproxy
```

Ports 9000/9001 were free at the time of writing; **check before starting** with
`docker ps --format '{{.Ports}}' | grep -oE '0.0.0.0:[0-9]+' | sort -u` and pick others if not.

Then: `cd ~/Docker/general/kreart && docker compose up -d`, and create the bucket at
`http://localhost:9001` (login `kreart` / `kreart-dev-secret`) or with `mc`.

- [ ] **Step 4: Verify a real upload round-trips**

Start the app, upload an image in the admin under Media, and confirm it appears in the MinIO
console and renders in the admin list view. Then confirm `width` and `height` are populated on the
document — Task 3's aspect validation depends on them.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): S3-compatible media storage"
```

---

### Task 7: Rectangle interaction maths

**Files:**
- Create: `apps/web/src/components/PrintAreaEditor/rectDrag.ts`
- Create: `apps/web/test/rectDrag.test.ts`

**Interfaces:**
- Consumes: `NormRect`, `clampRect` from `@kreart/design-core` (Task 1)
- Produces:
  - `type Handle = 'nw' | 'ne' | 'sw' | 'se'`
  - `type Bounds = { left: number; top: number; width: number; height: number }`
  - `pointerToNorm(clientX: number, clientY: number, bounds: Bounds): { x: number; y: number }`
  - `moveRect(rect: NormRect, dxNorm: number, dyNorm: number): NormRect`
  - `resizeRect(rect: NormRect, handle: Handle, dxNorm: number, dyNorm: number, minSize?: number): NormRect`
  - `nudgeRect(rect: NormRect, dir: 'up' | 'down' | 'left' | 'right', step: number): NormRect`
  - `centreHorizontally(rect: NormRect): NormRect`
  - `MIN_RECT_SIZE = 0.02`

No React and no Payload imports in this file — that is what makes the interaction maths testable without a browser or a form context.

- [ ] **Step 1: Write the failing test**

`apps/web/test/rectDrag.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  MIN_RECT_SIZE, pointerToNorm, moveRect, resizeRect, nudgeRect, centreHorizontally,
} from '../src/components/PrintAreaEditor/rectDrag'

const bounds = { left: 100, top: 50, width: 400, height: 500 }
const rect = { x: 0.25, y: 0.2, w: 0.5, h: 0.5 }

describe('pointerToNorm', () => {
  it('maps the top-left corner of the image to 0,0', () => {
    expect(pointerToNorm(100, 50, bounds)).toEqual({ x: 0, y: 0 })
  })

  it('maps the centre to 0.5,0.5', () => {
    expect(pointerToNorm(300, 300, bounds)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('clamps a pointer dragged outside the image', () => {
    expect(pointerToNorm(-500, -500, bounds)).toEqual({ x: 0, y: 0 })
    expect(pointerToNorm(9999, 9999, bounds)).toEqual({ x: 1, y: 1 })
  })
})

describe('moveRect', () => {
  it('translates without resizing', () => {
    const m = moveRect(rect, 0.1, -0.1)
    expect(m.w).toBeCloseTo(rect.w, 10)
    expect(m.h).toBeCloseTo(rect.h, 10)
    expect(m.x).toBeCloseTo(0.35, 10)
    expect(m.y).toBeCloseTo(0.1, 10)
  })

  it('stops at the edge instead of leaving the image', () => {
    const m = moveRect(rect, 5, 5)
    expect(m.x).toBeCloseTo(0.5, 10)
    expect(m.y).toBeCloseTo(0.5, 10)
    expect(m.w).toBeCloseTo(0.5, 10)
  })
})

describe('resizeRect', () => {
  it('se drags the far corner, leaving the origin put', () => {
    const r = resizeRect(rect, 'se', 0.1, 0.1)
    expect(r.x).toBeCloseTo(rect.x, 10)
    expect(r.y).toBeCloseTo(rect.y, 10)
    expect(r.w).toBeCloseTo(0.6, 10)
    expect(r.h).toBeCloseTo(0.6, 10)
  })

  it('nw drags the origin, leaving the far corner put', () => {
    const r = resizeRect(rect, 'nw', 0.1, 0.1)
    expect(r.x).toBeCloseTo(0.35, 10)
    expect(r.y).toBeCloseTo(0.3, 10)
    expect(r.x + r.w).toBeCloseTo(rect.x + rect.w, 10)
    expect(r.y + r.h).toBeCloseTo(rect.y + rect.h, 10)
  })

  it('refuses to shrink below the minimum instead of inverting', () => {
    const r = resizeRect(rect, 'se', -5, -5)
    expect(r.w).toBeCloseTo(MIN_RECT_SIZE, 10)
    expect(r.h).toBeCloseTo(MIN_RECT_SIZE, 10)
    expect(r.w).toBeGreaterThan(0)
  })

  it('keeps the result inside the image', () => {
    const r = resizeRect({ x: 0.8, y: 0.8, w: 0.15, h: 0.15 }, 'se', 5, 5)
    expect(r.x + r.w).toBeLessThanOrEqual(1 + 1e-9)
    expect(r.y + r.h).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('nudgeRect', () => {
  it('moves by exactly one step', () => {
    expect(nudgeRect(rect, 'right', 0.01).x).toBeCloseTo(0.26, 10)
    expect(nudgeRect(rect, 'up', 0.01).y).toBeCloseTo(0.19, 10)
  })

  it('does not resize', () => {
    const n = nudgeRect(rect, 'left', 0.01)
    expect(n.w).toBeCloseTo(rect.w, 10)
    expect(n.h).toBeCloseTo(rect.h, 10)
  })
})

describe('centreHorizontally', () => {
  it('centres without touching vertical position or size', () => {
    const c = centreHorizontally({ x: 0.1, y: 0.3, w: 0.4, h: 0.2 })
    expect(c.x).toBeCloseTo(0.3, 10)
    expect(c.y).toBeCloseTo(0.3, 10)
    expect(c.w).toBeCloseTo(0.4, 10)
  })

  it('is idempotent', () => {
    const once = centreHorizontally(rect)
    expect(centreHorizontally(once)).toEqual(once)
  })
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm vitest run apps/web/test/rectDrag.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/components/PrintAreaEditor/rectDrag.ts`:
```ts
import { clampRect, type NormRect } from '@kreart/design-core'

export type Handle = 'nw' | 'ne' | 'sw' | 'se'
export type Bounds = { left: number; top: number; width: number; height: number }

/** Below this a rectangle is too small to grab. Normalised units. */
export const MIN_RECT_SIZE = 0.02

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1)

/** Screen coordinates to normalised image coordinates, clamped to the image. */
export function pointerToNorm(clientX: number, clientY: number, bounds: Bounds): { x: number; y: number } {
  return {
    x: clamp01((clientX - bounds.left) / bounds.width),
    y: clamp01((clientY - bounds.top) / bounds.height),
  }
}

export function moveRect(rect: NormRect, dxNorm: number, dyNorm: number): NormRect {
  return clampRect({ ...rect, x: rect.x + dxNorm, y: rect.y + dyNorm })
}

/**
 * Drag one corner. The opposite corner stays put, which is what makes a resize
 * feel like a resize rather than a move.
 */
export function resizeRect(
  rect: NormRect,
  handle: Handle,
  dxNorm: number,
  dyNorm: number,
  minSize: number = MIN_RECT_SIZE,
): NormRect {
  const right = rect.x + rect.w
  const bottom = rect.y + rect.h

  let { x, y } = rect
  let w = rect.w
  let h = rect.h

  if (handle === 'se' || handle === 'ne') w = rect.w + dxNorm
  if (handle === 'sw' || handle === 'nw') { x = rect.x + dxNorm; w = right - x }
  if (handle === 'se' || handle === 'sw') h = rect.h + dyNorm
  if (handle === 'ne' || handle === 'nw') { y = rect.y + dyNorm; h = bottom - y }

  // never invert: pin the dragged edge instead of letting it cross the anchor
  if (w < minSize) {
    w = minSize
    if (handle === 'sw' || handle === 'nw') x = right - minSize
  }
  if (h < minSize) {
    h = minSize
    if (handle === 'ne' || handle === 'nw') y = bottom - minSize
  }

  return clampRect({ x, y, w, h })
}

export function nudgeRect(
  rect: NormRect,
  dir: 'up' | 'down' | 'left' | 'right',
  step: number,
): NormRect {
  const dx = dir === 'left' ? -step : dir === 'right' ? step : 0
  const dy = dir === 'up' ? -step : dir === 'down' ? step : 0
  return moveRect(rect, dx, dy)
}

/** Chest prints are almost always centred, and hitting exact centre by hand is miserable. */
export function centreHorizontally(rect: NormRect): NormRect {
  return clampRect({ ...rect, x: (1 - rect.w) / 2 })
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run apps/web/test/rectDrag.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): print-area rectangle interaction maths"
```

---

### Task 8: The print-area editor field

**Files:**
- Create: `apps/web/src/components/PrintAreaEditor/Canvas.tsx`
- Create: `apps/web/src/components/PrintAreaEditor/index.tsx`
- Modify: `apps/web/src/collections/Products.ts`, `apps/web/src/app/(payload)/admin/importMap.js`

**Interfaces:**
- Consumes: Task 1's `onMockupAspect`, `physicalAspect`, `aspectsAgree`, `heightMmForRect`, `rectForPhysical`; Task 7's `pointerToNorm`, `moveRect`, `resizeRect`, `nudgeRect`, `centreHorizontally`
- Produces: a Payload `ui` field component registered as `PrintAreaEditor`

**The coupling rule this implements (spec §3):** dragging writes `x/y/w/h` then rewrites `heightMm` from `widthMm` and the new on-photo aspect; typing a millimetre value reshapes the rectangle about its centre. A stored mismatch is **shown, never silently corrected**.

- [ ] **Step 1: Write the presentational canvas**

`apps/web/src/components/PrintAreaEditor/Canvas.tsx`:
```tsx
'use client'
import React, { useRef, useState, useCallback } from 'react'
import type { NormRect } from '@kreart/design-core'
import { pointerToNorm, moveRect, resizeRect, type Handle, type Bounds } from './rectDrag'

type Props = {
  imageUrl: string | null
  rect: NormRect
  onChange: (next: NormRect, committed: boolean) => void
  readoutMm: { widthMm: number; heightMm: number }
}

type DragState =
  | { kind: 'move'; lastX: number; lastY: number }
  | { kind: 'resize'; handle: Handle; lastX: number; lastY: number }
  | null

const HANDLES: Handle[] = ['nw', 'ne', 'sw', 'se']

export function Canvas({ imageUrl, rect, onChange, readoutMm }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<DragState>(null)

  const bounds = (): Bounds | null => {
    const el = frameRef.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag) return
    const b = bounds()
    if (!b) return
    const now = pointerToNorm(e.clientX, e.clientY, b)
    const last = pointerToNorm(drag.lastX, drag.lastY, b)
    const dx = now.x - last.x
    const dy = now.y - last.y
    const next = drag.kind === 'move'
      ? moveRect(rect, dx, dy)
      : resizeRect(rect, drag.handle, dx, dy)
    onChange(next, false)
    setDrag({ ...drag, lastX: e.clientX, lastY: e.clientY })
  }, [drag, rect, onChange])

  const endDrag = useCallback(() => {
    if (drag) { onChange(rect, true); setDrag(null) }
  }, [drag, rect, onChange])

  return (
    <div style={{ marginBottom: '.75rem' }}>
      <div
        ref={frameRef}
        data-testid="print-area-frame"
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{
          position: 'relative', userSelect: 'none', touchAction: 'none',
          border: '1px solid var(--theme-elevation-150)', borderRadius: 4,
          background: 'var(--theme-elevation-50)', overflow: 'hidden',
          aspectRatio: imageUrl ? undefined : '4 / 5', maxWidth: 520,
        }}
      >
        {imageUrl
          ? <img src={imageUrl} alt="" draggable={false} style={{ display: 'block', width: '100%' }} />
          : <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--theme-elevation-500)' }}>
              No mockup uploaded for this view yet — the print area can still be defined.
            </div>}

        <div
          data-testid="print-area-rect"
          onPointerDown={(e) => { e.preventDefault(); setDrag({ kind: 'move', lastX: e.clientX, lastY: e.clientY }) }}
          style={{
            position: 'absolute', cursor: 'move',
            left: `${rect.x * 100}%`, top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`, height: `${rect.h * 100}%`,
            border: '2px solid #2680eb', background: 'rgba(38,128,235,.12)',
          }}
        >
          {HANDLES.map((h) => (
            <span
              key={h}
              data-testid={`handle-${h}`}
              onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setDrag({ kind: 'resize', handle: h, lastX: e.clientX, lastY: e.clientY }) }}
              style={{
                position: 'absolute', width: 12, height: 12, background: '#fff',
                border: '2px solid #2680eb', borderRadius: 2,
                cursor: `${h}-resize`,
                left: h.includes('w') ? -7 : undefined, right: h.includes('e') ? -7 : undefined,
                top: h.includes('n') ? -7 : undefined, bottom: h.includes('s') ? -7 : undefined,
              }}
            />
          ))}
        </div>
      </div>

      <div data-testid="print-area-readout" style={{ marginTop: '.4rem', fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
        {readoutMm.widthMm.toFixed(1)} × {readoutMm.heightMm.toFixed(1)} mm
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the Payload binding**

`apps/web/src/components/PrintAreaEditor/index.tsx`:
```tsx
'use client'
import React, { useMemo } from 'react'
import { useField, useFormFields } from '@payloadcms/ui'
import {
  aspectsAgree, heightMmForRect, rectForPhysical, onMockupAspect, physicalAspect,
  type NormRect, type MockupPx,
} from '@kreart/design-core'
import { centreHorizontally, nudgeRect } from './rectDrag'
import { Canvas } from './Canvas'

/**
 * A controller over form state, never an owner of it.
 *
 * Payload keeps validation, labels, required-field errors and dirty-tracking;
 * this component only reads and writes the sibling fields. That is what makes
 * dragging and typing two controls over ONE value rather than two values that
 * can drift apart (spec §4).
 */
export const PrintAreaEditor: React.FC<{ path: string }> = ({ path }) => {
  const group = path.replace(/\.[^.]+$/, '')          // …views.0.printArea
  const viewPath = group.replace(/\.printArea$/, '')  // …views.0

  const x = useField<number>({ path: `${group}.x` })
  const y = useField<number>({ path: `${group}.y` })
  const w = useField<number>({ path: `${group}.w` })
  const h = useField<number>({ path: `${group}.h` })
  const widthMm = useField<number>({ path: `${group}.widthMm` })
  const heightMm = useField<number>({ path: `${group}.heightMm` })

  const mockup = useFormFields(([fields]) => fields[`${viewPath}.mockups.0.image`]?.value)

  // Payload stores upload relationships as an id or a populated doc; both appear here.
  const image = mockup as any
  const imageUrl: string | null = image?.url ?? null
  const mockupPx: MockupPx | null =
    image?.width && image?.height ? { w: image.width, h: image.height } : null

  const rect: NormRect = {
    x: x.value ?? 0.25, y: y.value ?? 0.2, w: w.value ?? 0.5, h: h.value ?? 0.5,
  }
  const mm = { widthMm: widthMm.value ?? 0, heightMm: heightMm.value ?? 0 }

  const writeRect = (next: NormRect) => {
    x.setValue(next.x); y.setValue(next.y); w.setValue(next.w); h.setValue(next.h)
    // dragging changes the shape, so the declared height follows (spec §3.1)
    if (mockupPx && mm.widthMm > 0) {
      heightMm.setValue(Number(heightMmForRect(next, mockupPx, mm.widthMm).toFixed(2)))
    }
  }

  const mismatch = useMemo(() => {
    if (!mockupPx || !(mm.widthMm > 0) || !(mm.heightMm > 0)) return null
    if (!(rect.w > 0) || !(rect.h > 0)) return null
    if (aspectsAgree(rect, mockupPx, mm)) return null
    return {
      onPhoto: onMockupAspect(rect, mockupPx),
      physical: physicalAspect(mm),
    }
  }, [mockupPx, mm.widthMm, mm.heightMm, rect.w, rect.h])

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.02 : 0.005
        const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as const
        const d = dir[e.key as keyof typeof dir]
        if (!d) return
        e.preventDefault()
        writeRect(nudgeRect(rect, d, step))
      }}
    >
      <Canvas
        imageUrl={imageUrl}
        rect={rect}
        onChange={(next) => writeRect(next)}
        readoutMm={mm}
      />

      <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
        <button type="button" className="btn btn--style-secondary btn--size-small"
                onClick={() => writeRect(centreHorizontally(rect))}>
          Centre horizontally
        </button>
        <button type="button" className="btn btn--style-secondary btn--size-small"
                disabled={!mockupPx || !(mm.widthMm > 0) || !(mm.heightMm > 0)}
                onClick={() => mockupPx && writeRect(rectForPhysical(rect, mockupPx, mm))}>
          Reshape to {mm.widthMm || '—'} × {mm.heightMm || '—'} mm
        </button>
      </div>

      {!mockupPx && (
        <p style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          Add a mockup to this view to see the rectangle over the garment. Millimetres can be set now;
          the shape is only coupled to the photo once one exists.
        </p>
      )}

      {/*
        Spec §6.1: mockups are validated against EACH OTHER, which is all a save-time
        hook can know. If the first upload for a view was mis-cropped, every later
        upload matching that same wrong ratio passes. Say so, so a clean save is never
        mistaken for confirmation that the photography is right.
      */}
      {mockupPx && (
        <p style={{ fontSize: 12, color: 'var(--theme-elevation-500)' }}>
          Mockups are checked for consistency with each other for this view. That cannot
          confirm the photograph itself is correctly framed — only that they agree.
        </p>
      )}

      {mismatch && (
        <div data-testid="aspect-mismatch" style={{
          border: '1px solid #c9700a', background: 'rgba(201,112,10,.08)',
          borderRadius: 4, padding: '.6rem .75rem', fontSize: 13,
        }}>
          <strong>This print area is inconsistent.</strong>{' '}
          The rectangle is {mismatch.onPhoto.toFixed(3)} wide-to-tall on the mockup, but{' '}
          {mm.widthMm} × {mm.heightMm} mm is {mismatch.physical.toFixed(3)}. Artwork would be placed
          at the right size in millimetres but drawn wrongly against the garment.{' '}
          <button type="button" className="btn btn--style-secondary btn--size-small"
                  style={{ marginTop: '.4rem' }}
                  onClick={() => mockupPx && writeRect(rectForPhysical(rect, mockupPx, mm))}>
            Reshape the rectangle to match the millimetres
          </button>
        </div>
      )}
    </div>
  )
}

export default PrintAreaEditor
```

**Do not auto-correct on mount.** A corrective write triggered by merely opening a document changes data the admin never touched (spec §3.2). The reconcile is a button.

- [ ] **Step 3: Register the component**

In `apps/web/src/collections/Products.ts`, add as the first entry of the `printArea` group's `fields`:
```ts
            {
              name: 'editor',
              type: 'ui',
              admin: { components: { Field: '/components/PrintAreaEditor#PrintAreaEditor' } },
            },
```

Then regenerate the import map:

Run: `pnpm --filter @kreart/web generate:importmap`

- [ ] **Step 4: Verify it renders**

Run: `pnpm --filter @kreart/web dev`, open a product, expand a view.
Expected: the mockup with a draggable blue rectangle, a live `300.0 × 400.0 mm` readout, and both
buttons. Drag it and watch the readout change. Stop the server afterwards.

- [ ] **Step 5: Run the suite and typecheck**

Run: `pnpm test && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): visual print-area editor"
```

---

### Task 9: The keystone — print-area round-trip in Playwright

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/print-area.spec.ts`
- Create: `apps/web/e2e/fixtures/mockup-front.png`
- Modify: `apps/web/package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the running app, the `products` REST API, `renderViewToPng` from `@kreart/design-fabric/node`
- Produces: `pnpm --filter @kreart/web test:e2e`

Project spec §12.1 requires this specifically: the print-area editor is the interaction the entire stack choice rests on, and leaving it under generic smoke coverage would make it the least-tested thing in the system. **This is to Plan 2 what the calibration test was to Plan 1** — the test that proves the claim rather than exercising the code.

- [ ] **Step 1: Create the mockup fixture**

Run from `apps/web`:
```bash
node -e "
const { createCanvas } = require('canvas'); const fs = require('fs');
const c = createCanvas(1000, 1250); const x = c.getContext('2d');
x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, 1000, 1250);
x.fillStyle = '#d8d8d8'; x.fillRect(150, 150, 700, 950);
fs.mkdirSync('e2e/fixtures', { recursive: true });
fs.writeFileSync('e2e/fixtures/mockup-front.png', c.toBuffer('image/png'));
"
```

1000 × 1250 is deliberately **not** square, so a bug that ignores the mockup's own aspect ratio produces a visibly wrong answer rather than coincidentally passing.

- [ ] **Step 2: Write the config**

`apps/web/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,          // these tests share one database
  retries: 0,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000/admin/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
```

Run: `pnpm --filter @kreart/web add -D @playwright/test`

Add to `apps/web/package.json` scripts:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 3: Write the failing test**

`apps/web/e2e/print-area.spec.ts`:
```ts
import { test, expect } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const EMAIL = process.env.E2E_EMAIL ?? 'e2e@kreart.test'
const PASSWORD = process.env.E2E_PASSWORD ?? 'e2e-password-1234'

test.describe('print-area editor', () => {
  test('drag, type, save, reload — both halves survive', async ({ page, request }) => {
    await page.goto('/admin/login')
    await page.fill('#field-email', EMAIL)
    await page.fill('#field-password', PASSWORD)
    await page.click('button[type="submit"]')
    await page.waitForURL((u) => !u.toString().includes('/login'))

    // upload the mockup
    await page.goto('/admin/collections/media/create')
    await page.setInputFiles('input[type="file"]', path.join(dir, 'fixtures/mockup-front.png'))
    await page.click('#action-save')
    await expect(page.locator('.payload-toast-item')).toContainText(/success/i)

    await page.goto('/admin/collections/products/create')
    await page.fill('#field-title', 'E2E Tee')
    await page.fill('#field-slug', 'e2e-tee')
    // sizes / colourways / a view with the mockup are filled here; the selectors
    // follow Payload's relationship and array controls
    await page.click('button:has-text("Add View")')
    await page.fill('#field-views__0__slug', 'front')
    await page.fill('#field-views__0__label', 'Front')

    // set the physical size, then drag the rectangle
    await page.fill('#field-views__0__printArea__widthMm', '300')
    await page.fill('#field-views__0__printArea__heightMm', '400')

    const rect = page.getByTestId('print-area-rect')
    const frame = page.getByTestId('print-area-frame')
    const fb = (await frame.boundingBox())!
    const rb = (await rect.boundingBox())!
    await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
    await page.mouse.down()
    await page.mouse.move(fb.x + fb.width * 0.5, fb.y + fb.height * 0.45, { steps: 12 })
    await page.mouse.up()

    // the readout tracks the drag
    await expect(page.getByTestId('print-area-readout')).toContainText('mm')

    await page.click('#action-save')
    await expect(page.locator('.payload-toast-item')).toContainText(/success/i)

    // reload and confirm BOTH halves survived
    await page.reload()
    const widthMm = await page.inputValue('#field-views__0__printArea__widthMm')
    const x = await page.inputValue('#field-views__0__printArea__x')
    expect(Number(widthMm)).toBeGreaterThan(0)
    expect(Number(x)).toBeGreaterThan(0)
    expect(Number(x)).toBeLessThan(1)

    // and confirm the API agrees with the form
    const res = await request.get('/api/products?where[slug][equals]=e2e-tee')
    const body = await res.json()
    const pa = body.docs[0].views[0].printArea
    expect(pa.widthMm).toBeCloseTo(Number(widthMm), 2)
    expect(pa.x).toBeCloseTo(Number(x), 6)
  })

  test('the saved print area is what the renderer draws', async ({ request }) => {
    // Step 4 of spec §12.1: close the loop between admin and renderer.
    const res = await request.get('/api/products?where[slug][equals]=e2e-tee')
    const pa = (await res.json()).docs[0].views[0].printArea

    const { renderViewToPng } = await import('@kreart/design-fabric/node')
    const { dpiToPxPerMm } = await import('@kreart/design-core')
    const { createCanvas, loadImage } = await import('canvas')
    const { setMetricsContext } = await import('@kreart/design-fabric')
    setMetricsContext(createCanvas(10, 10).getContext('2d') as never)

    const doc = {
      schemaVersion: 1 as const, productId: 'p', sizeId: 's', colourwayId: 'c',
      views: { front: { printAreaMm: { w: pa.widthMm, h: pa.heightMm }, objects: [] } },
    }
    const png = await renderViewToPng(doc, 'front', {
      dpi: 300,
      resolve: async () => { throw new Error('no media expected') },
    })

    const img = await loadImage(png)
    const pxPerMm = dpiToPxPerMm(300)
    // the rendered canvas must be the print area the admin saved, to within a pixel
    expect(Math.abs(img.width / pxPerMm - pa.widthMm)).toBeLessThan(0.1)
    expect(Math.abs(img.height / pxPerMm - pa.heightMm)).toBeLessThan(0.1)
  })
})
```

- [ ] **Step 4: Create the e2e user**

The suite needs a known login. Extend `scripts/create-admin.ts`'s pattern:

Run: `ADMIN_EMAIL=e2e@kreart.test ADMIN_PASSWORD=e2e-password-1234 pnpm --filter @kreart/web payload run scripts/create-admin.ts`

- [ ] **Step 5: Run it**

Run: `pnpm --filter @kreart/web test:e2e`
Expected: both tests pass.

If the Payload field selectors differ from those above, **fix the selectors, not the assertions** —
the assertions are the point of the test.

- [ ] **Step 6: Add it to CI**

In `.github/workflows/ci.yml`, add a job that installs the browser and runs the suite against a
Postgres service container. Also **pin the apt list** to match the Dockerfile — the existing `unit`
job omits `build-essential`, `python3` and `ca-certificates` and works only because the runner
image happens to preinstall them.

- [ ] **Step 7: Commit**

```bash
git add apps/web .github
git commit -m "test(web): print-area round-trip, admin through to renderer"
```

---

### Task 10: Seed one real garment

**Files:**
- Create: `apps/web/scripts/seed-garment.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: the `sizes` and `colourways` seeded by the existing `scripts/seed.ts`
- Produces: `pnpm --filter @kreart/web seed:garment`

Plan 3's editor should open on something real rather than a fixture. Idempotent, like the existing seed.

- [ ] **Step 1: Write the script**

`apps/web/scripts/seed-garment.ts`:
```ts
import { getPayload } from 'payload'
import { createCanvas } from 'canvas'
import config from '../src/payload.config.js'

/**
 * One complete, coherent garment: two views, three colourways, correct print
 * areas, one per-size override. Idempotent.
 *
 * Mockups are generated rather than photographed — all at 1000x1250 so they
 * share an aspect ratio, which Task 3's validation requires.
 */
function mockup(label: string, fill: string): Buffer {
  const c = createCanvas(1000, 1250)
  const x = c.getContext('2d')
  x.fillStyle = '#fafafa'; x.fillRect(0, 0, 1000, 1250)
  x.fillStyle = fill; x.fillRect(150, 150, 700, 950)
  x.fillStyle = '#00000022'; x.font = 'bold 40px sans-serif'
  x.fillText(label, 170, 210)
  return c.toBuffer('image/png')
}

const payload = await getPayload({ config })

const existing = await payload.find({
  collection: 'products', where: { slug: { equals: 'classic-cotton-tee' } }, limit: 1,
})
if (existing.totalDocs > 0) {
  console.log('classic-cotton-tee already exists — nothing to do')
  process.exit(0)
}

const sizes = await payload.find({ collection: 'sizes', limit: 10, sort: 'sortOrder' })
const colourways = await payload.find({ collection: 'colourways', limit: 10 })
if (!sizes.totalDocs || !colourways.totalDocs) {
  console.error('Run `pnpm seed` first — sizes and colourways must exist.')
  process.exit(1)
}

const views = [
  { slug: 'front', label: 'Front', widthMm: 300, heightMm: 400 },
  { slug: 'back', label: 'Back', widthMm: 300, heightMm: 420 },
]

const viewDocs = []
for (const v of views) {
  const mockups = []
  for (const c of colourways.docs as any[]) {
    const media = await payload.create({
      collection: 'media',
      data: { alt: `${v.label} — ${c.name}`, kind: 'mockup' },
      file: {
        data: mockup(`${v.label} · ${c.name}`, c.hex),
        name: `tee-${v.slug}-${String(c.name).toLowerCase().replace(/\s+/g, '-')}.png`,
        mimetype: 'image/png', size: 0,
      },
    })
    mockups.push({ colourway: c.id, image: media.id })
  }

  // the rectangle's aspect must match widthMm/heightMm on a 1000x1250 mockup
  const targetAspect = v.widthMm / v.heightMm            // e.g. 0.75
  const w = 0.5
  const h = (w * 1000) / (targetAspect * 1250)           // solve the coupling rule
  viewDocs.push({
    slug: v.slug, label: v.label, mockups,
    printArea: { widthMm: v.widthMm, heightMm: v.heightMm, x: (1 - w) / 2, y: 0.22, w, h },
    sizeOverrides: v.slug === 'front'
      ? [{ size: (sizes.docs[0] as any).id, widthMm: 280, heightMm: 373 }]
      : [],
  })
}

const product = await payload.create({
  collection: 'products',
  data: {
    title: 'Classic Cotton Tee', slug: 'classic-cotton-tee',
    targetDpi: 300, minTextHeightMm: 4, minStrokeWidthMm: 1,
    sizes: (sizes.docs as any[]).map((s) => s.id),
    colourways: (colourways.docs as any[]).map((c) => c.id),
    views: viewDocs,
  },
})

console.log(`created "${product.title}" with ${viewDocs.length} views`)
console.log('note: mockups are validated for consistency with each other, not for correct framing (spec §6.1)')
for (const v of viewDocs) {
  console.log(`  ${v.slug}: ${v.printArea.widthMm}x${v.printArea.heightMm}mm, ${v.mockups.length} mockups`)
}
process.exit(0)
```

Add to `apps/web/package.json` scripts:
```json
"seed:garment": "cross-env NODE_OPTIONS=--no-deprecation payload run scripts/seed-garment.ts"
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @kreart/web seed:garment`
Expected: the product is created and **passes Task 3's aspect validation** — if it does not, the
coupling arithmetic in this script is wrong, not the validation.

- [ ] **Step 3: Confirm in the admin**

Open the product, expand the front view: the rectangle should sit over the mockup with a
`300.0 × 400.0 mm` readout and **no mismatch banner**.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): seed one complete garment"
```

---

## Definition of Done

- [ ] `pnpm test` and `pnpm typecheck` both clean; Plan 1's 118 tests still pass.
- [ ] An admin can drag a rectangle over a mockup and see its physical size update live.
- [ ] Typing a millimetre value reshapes the rectangle; dragging updates the declared height.
- [ ] A stored mismatch is **shown with a reconcile button**, never corrected on load.
- [ ] Mockups whose aspect ratio differs within a view are **rejected**, naming both images.
- [ ] Duplicate or malformed view slugs are **rejected**.
- [ ] A font cannot be published with either licence permission unset.
- [ ] A design document is validated server-side, and finalisation is blocked while any warning is unacknowledged.
- [ ] Media is served from S3-compatible storage.
- [ ] The Playwright round-trip passes, **including the step that renders the saved print area and confirms it matches**.
- [ ] `pnpm seed:garment` produces a coherent product that raises no mismatch banner.
- [ ] The editor states that mockup validation proves consistency, not correct framing (spec §6.1).
- [ ] Task 0's spike findings are recorded, and its stub is **not** committed.

## Carried into Plan 3 as a blocking item

**`view.slug` immutability must appear in Plan 3's Definition of Done as a literal blocking item,
not as an assumption.** This plan makes slugs unique and well-formed; nothing yet stops one being
renamed after a design references it. Deferring is safe only while `designs` holds nothing. The
cost of forgetting is a silently orphaned design — discovered when someone tries to render it.

## What this plan deliberately does not do

- **No customer-facing editor.** Nothing here draws artwork; that is Plan 3.
- **No render queue.** `designs` stores render outputs but nothing produces them yet — Plan 4.
- **No role enforcement.** Consciously dropped from scope, not forgotten (spec §1.2).
- **No visual per-size overrides.** They remain numeric, as scaffolded.
- **`background.paddingMm` and text `wMm` containment stay parked.** Both must close in the plan that first exposes those controls to a user.
