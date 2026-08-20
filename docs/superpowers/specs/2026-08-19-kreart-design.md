# kreart — Design Spec

**Date:** 2026-08-19
**Status:** Approved for planning
**Scope:** v1 = sub-projects A + B + C (product & print-area model, design editor, print pipeline)

---

## 1. What this is

kreart lets a customer customise a garment — upload artwork, remove its background, place and
size it in real-world centimetres, add styled text — and produces a print-ready file for
production.

This spec covers **v1 only**: the product and print-area model, the design editor, and the print
pipeline. It is deliberately the *risk-first spine*. The print render is what proves the
centimetre model is correct; building commerce on an unvalidated measurement model risks
discovering at launch that every export is wrong.

### 1.1 v1 delivers

An admin can define a product with print areas measured in millimetres. A user can design on it
in the browser. The system emits a print-ready file whose printed dimensions match what the user
typed, verified by measurement.

### 1.2 Non-goals for v1

Explicitly out of scope, with the seams designed in but not built:

- Storefront, cart, checkout, payments (sub-project E)
- Customer accounts and saved designs (sub-project F)
- Admin-authored design templates (sub-project D)
- Shipping rates, tax calculation
- 3D garment preview — rejected outright, see §3.4

---

## 2. Stack

| Concern | Choice | Version |
|---|---|---|
| App framework | Next.js (App Router) | 15.x |
| UI runtime | React | 19.x |
| Backend + admin | Payload CMS | 3.88.0 (pinned) |
| Database | PostgreSQL via `@payloadcms/db-postgres` | 3.88.0 |
| Media storage | `@payloadcms/storage-s3` | 3.88.0 |
| Design canvas | Fabric.js | 7.4.0 |
| Server-side canvas | `canvas` (node-canvas) | 3.x |
| Background removal | `@imgly/background-removal` | 1.7.0 |
| Job queue | Payload built-in jobs queue | (bundled) |

**Pin `payload` and every `@payloadcms/*` package to the same exact version.** The ecommerce
plugin peer-depends on an exact `payload` version, so core and plugins must move in lockstep.

### 2.1 Why Payload rather than Laravel + Filament

The decisive reason is that **Payload's admin panel is React, so the admin can embed the actual
design editor.** Two admin requirements need the design canvas inside the admin: defining a
product's print area by dragging a rectangle over the mockup, and (in sub-project D) authoring
design templates. In Payload these are custom field components reusing the same React + Fabric
code. In Filament they would require bridging a React island into Livewire and maintaining that
seam permanently.

Secondary reasons: one TypeScript type for the design document shared by editor, API, admin and
render worker; and the print renderer running in the same language and runtime as everything else.

### 2.2 Note on node-canvas

Fabric 7 declares `canvas@^3.2.0` as an **optional** dependency and ships a dedicated `fabric/node`
export. It does **not** use `@napi-rs/canvas`. node-canvas is a native module, so:

- The worker image needs `cairo`, `pango`, `libjpeg` and `giflib`.
- npm install-script blocking will prevent the prebuild from being fetched in CI. Allow scripts
  for `canvas` explicitly.

---

## 3. Core invariant: the measurement model

> **A design is authored in millimetres. Pixels exist only at render time.**

Every downstream guarantee depends on this. It is the single most important rule in the codebase.

### 3.1 Product structure

A **Product** (e.g. "Classic Cotton Tee") has **Views** — front, back, left sleeve, right sleeve.
The view set is configured per product, not hardcoded.

Each view has:

- a **mockup image per colourway**
- a **print area**, expressed two ways simultaneously:
  - **physical size in millimetres** — e.g. 300 × 400. This is what a user's "22 cm wide" means.
  - **position on the mockup** in normalised 0–1 coordinates of the image. Normalised rather than
    pixels so a 1200 px mockup can be replaced with a 3000 px one without redefining geometry.

Print areas may vary by size (S = 280 × 380 mm, XXL = 320 × 450 mm). The model is one print area
per view, with **optional** per-size overrides. Products with uniform print areas across sizes
simply omit the overrides.

### 3.2 The scale factor

Everything derives from one number, `pxPerMm`:

- **Editor canvas:** ~1.8 px/mm — a 300 mm area becomes a 540 px canvas.
- **Print render:** target DPI ÷ 25.4. At 300 DPI that is **11.811 px/mm**, so 300 mm becomes
  3543 px.

The same document rendered at two scale factors produces geometrically identical layout. Verified:
0.0002 mm deviation on a 163 mm object. The scale-parity test in §12 enforces this.

Target DPI is a **per-product setting defaulting to 300**, because DTG shops variously require
150, 300 or 600.

### 3.3 Resolution warnings

An image placed 200 mm wide needs at least 200 × 11.811 ≈ **2362 px** of source resolution to hit
300 DPI. Customers will upload 800 px phone screenshots and stretch them across the chest.

The editor therefore shows a **live per-image resolution indicator** that updates as the image is
resized — green / amber / red against the product's target DPI. This is a required feature, not a
refinement: without it the print queue fills with unusable orders.

### 3.4 Rejected: 3D preview

2D flat mockups with multiple views were chosen over a 3D garment preview. A 3D preview requires
a GLB model with correct UV mapping per product — a 3D artist per SKU rather than an admin upload
— is heavy on mobile, and is never print-accurate. Adding a product must stay: upload photos, drag
a rectangle, type the millimetres.

---

## 4. Data model

### 4.1 Payload collections (v1)

| Collection | Purpose |
|---|---|
| `products` | Garment. Owns view set, target DPI, size guide. |
| `product-views` | Front / back / sleeve. Owns mockup media per colourway and the print area. |
| `print-areas` | Physical mm size + normalised rect on the mockup. Optional per-size overrides. |
| `sizes` | Size taxonomy (S/M/L/XL) with size-guide measurements. |
| `colourways` | Garment colour; each view has one mockup image per colourway. |
| `media` | Uploads. Originals and background-removed cutouts are separate documents. |
| `fonts` | Admin-managed allowed font list; the binary is the asset. |
| `designs` | A saved `DesignDocument` plus its render outputs and status. |
| `users` | Admin and content-manager roles (customer accounts deferred to F). |

Products, views and sizes are shaped to be adopted by `@payloadcms/plugin-ecommerce` in
sub-project E — its `variantTypes` / `variantOptions` model maps directly onto size and colourway.
v1 does not install the plugin.

### 4.2 The design document

**Do not persist Fabric.js JSON.** Persist a custom millimetre-based schema and map to and from
Fabric at the edges.

```ts
type DesignDocument = {
  schemaVersion: 1
  productId: string
  sizeId: string
  colourwayId: string
  views: Record<string, {                  // 'front' | 'back' | ...
    printAreaMm: { w: number; h: number }
    objects: DesignObject[]
  }>
  acknowledgedLowDpi?: { objectId: string; atDpi: number; at: string }[]
}

type DesignObject =
  | { id: string; kind: 'image'
      mediaId: string
      xMm: number; yMm: number; wMm: number; hMm: number
      rotation: number; opacity: number
      sourcePx: { w: number; h: number }          // drives the DPI warning
      background: 'original' | 'removed' }
  | { id: string; kind: 'text'
      text: string
      xMm: number; yMm: number; wMm: number; rotation: number
      font: { family: string; weight: number; sizeMm: number
              letterSpacingMm: number; lineHeight: number }
      fill: string
      stroke?: { color: string; widthMm: number }
      shadow?: { offsetXMm: number; offsetYMm: number; blurMm: number; color: string }
      background?: { color: string; paddingMm: number }
      curve?: { radiusMm: number; direction: 'up' | 'down' } }
```

Three reasons this matters more than it appears:

1. **Fabric's serialisation is pixel-based and version-coupled.** A Fabric 7 → 8 upgrade could
   silently change how a stored design re-renders. A design attached to an order is a commercial
   record and must re-render identically years later.
2. **The renderer never touches Fabric internals.** It reads this schema and draws. Fabric could be
   replaced without touching stored data.
3. **`schemaVersion` gives a migration path.** This model will change; existing documents must
   keep rendering.

All dimensions are millimetres. `rotation` is degrees clockwise. Colours are CSS colour strings.

Text objects carry `wMm` but no `hMm`: height is **derived** from `font.sizeMm`, `lineHeight` and
wrapping within `wMm`. Storing it would allow the stored value and the derived value to disagree,
and the derived one is what renders. Image objects store both because their aspect ratio is
independently adjustable.

---

## 5. Module architecture

Monorepo, pnpm workspaces. The split is driven by one requirement: **the editor and the print
worker must produce geometrically identical output.**

```
apps/
  web/              Next.js 15 + React 19 + Payload 3.88
                    admin panel, editor app, REST + Local API
                    (storefront added in sub-project E)
  worker/           render consumer, separate process, CPU-heavy
packages/
  design-core/      pure TS: schema, mm<->px, validation, DPI check, history
                    zero canvas, zero DOM  -> where most tests live
  design-fabric/    DesignDocument <-> Fabric objects. Isomorphic.
                    includes the CurvedText class
```

**Fabric 7 runs in Node as well as the browser.** `design-fabric` therefore contains exactly *one*
mapping from the schema to drawable objects, called by both the editor and the worker. The editor
layers selection and interaction on top.

The rejected alternative — Fabric in the browser, hand-written node-canvas drawing in the worker —
means two implementations of the same geometry, and the drift shows up as misprinted garments.

**Constraint this imposes:** every custom rendering, curved text especially, must use only the
canvas 2D API. No DOM, no `window`. Otherwise it works in the editor and crashes the worker.

---

## 6. The design editor

### 6.1 Feature map

| Requirement | Implementation |
|---|---|
| Select product, change product | Product picker; switching remaps the design onto the new print area, warning on objects that no longer fit |
| Select size, size guide | Size selector reads `sizes`; size guide is a modal from the product's size-guide content |
| Upload image | Direct-to-S3 upload, `media` document created, `sourcePx` captured on ingest |
| Remove background | Client-side, §8 |
| Resize by drag | Fabric transform controls, committed to mm on pointer-up |
| Resize by exact cm | Numeric inputs bound to `wMm` / `hMm`, with aspect-ratio lock |
| Move by dragging | Fabric drag, clamped to the print area |
| Add text + full styling | `DesignObject.kind === 'text'`; every option in the schema maps to a control |
| Curved text | §7 |
| Undo / redo | §9 |
| Zoom in / out | Viewport transform on the Fabric canvas. Zoom is view state and is **not** part of the design document |

### 6.2 Clamping

Objects are clamped to the print area on the client for feel, and **re-validated on the server**.
The client is tamperable; the print area is a physical constraint. Server validation is authoritative.

---

## 7. Curved text

Fabric 7 ships no curved text. A one-day spike was run before this spec was written; findings are
incorporated below and the throwaway harness lives outside the repo.

### 7.1 Decision: custom Fabric class, no `opentype.js`

A custom `FabricObject` subclass lays glyphs along an arc using `measureText` and per-glyph
transforms, using only the canvas 2D API so it runs in both browser and worker. The
`opentype.js` path-conversion alternative was **rejected** — see §7.3.

The spike produced a working ~90-line class. Verified: renders in Node, arc up and arc down,
outline + shadow + fill compositing correctly, `toObject`/`fromObject` round-trip preserving the
bounding box, and scale parity of 0.0002 mm.

### 7.2 Kerning must be recovered explicitly

The obvious implementation — measure each glyph independently — **silently destroys kerning**:

| String | Drift from correct width |
|---|---|
| `STOREFRAME` | 0.26 % |
| `AVATAR` | **7.67 %** |
| `WAVY` | 4.51 % |
| `TO THE MAX` | 0.29 % |

7.67 % on a 200 mm word is 15 mm of spurious width, and short bold words are exactly what goes on
garments.

**The fix requires no extra library.** For each adjacent pair, measure the pair and subtract the
two solo widths; the remainder is that pair's kern delta:

```ts
const kern = ctx.measureText(a + b).width
           - ctx.measureText(a).width
           - ctx.measureText(b).width
```

This recovered kerning to **0.000 %** error on every string tested. Glyph advances must be cached
per `(font, letterSpacing, text)` — the technique costs three `measureText` calls per glyph.

### 7.3 Why `opentype.js` was rejected

It was a candidate solely to obtain kerning and typographic accuracy. §7.2 obtains kerning from
canvas alone, at zero dependency cost, with no font binaries to parse server-side and no second
text-layout implementation to keep in sync with the browser's.

### 7.4 Known gaps to close during implementation

The spike ran headless. Outstanding:

- **Browser interaction is unverified.** Selection handles and live drag-resize need confirming in
  a real browser. The bounding box is computed analytically so controls should sit correctly.
- **`objectCaching` must be `false`** — curved text cannot use Fabric's render cache. This costs
  frame rate while dragging and needs measuring.
- **Minimum-radius guard.** Small radii make text overlap itself. The editor must enforce a floor.
- The bounding box approximates glyph height as `fontSize`; `actualBoundingBoxAscent/Descent`
  would tighten it.
- Multi-line curved text, RTL and emoji are untested.

**Estimate: 2–3 days for production quality**, not the one day originally assumed.

---

## 8. Background removal

`@imgly/background-removal` runs the segmentation model **client-side** via WASM. No per-image
cost, no upload round-trip, and customer images are never sent to a third party.

Two requirements:

1. The first invocation downloads a sizeable model. **Lazy-load it only when the user clicks the
   button**, and show real progress.
2. **Store both the original and the cutout** as separate `media` documents.
   `DesignObject.background` selects between them. Overwriting the original strands any customer
   who changes their mind.

The worker renders whichever variant the design document selects.

---

## 9. Undo / redo

History is kept over the **schema**, never over Fabric state.

Every user action produces a new immutable `DesignDocument`. History is a capped stack (50 entries)
living in `design-core`. Continuous drags and resizes **coalesce into a single entry on
pointer-up**, so one drag is not sixty undo steps.

Because history is pure data, undo/redo is unit-testable with no browser at all.

---

## 10. Print pipeline

### 10.1 Queueing

Payload's **built-in jobs queue** is used. No Redis, no BullMQ.

```ts
await payload.jobs.queue({
  task: 'renderPrintFile',
  input: { designId, viewSlug },
  queue: 'render',
})
```

The runner is a genuinely separate process, deployed as its own container:

```
pnpm payload jobs:run --queue render --cron "* * * * *"
```

Renders are keyed by a hash of the design document, so re-running is idempotent and cheap.
Rendering is triggered on design finalisation, not on every save.

### 10.2 Output: vector PDF as the print master

node-canvas exposes a PDF surface, and Fabric objects render directly into it. Verified: a
`%PDF-1.7` page of **850.39 × 1133.86 pt — exactly 300 × 400 mm** — with glyphs converted to
**vector path outlines** (no text operators in the content stream).

This is materially better than a raster master:

- Text is resolution-independent; there is no DPI ceiling on the sharpest part of the design.
- **No font is embedded**, so there is no font licensing question and nothing for a print shop to
  substitute.
- 3.7 KB versus 210 KB for the equivalent PNG.

Images remain raster within the PDF, which is correct.

**The pipeline emits both:** the vector PDF as print master, and a target-DPI PNG as fallback and
as the admin's visual check. The PNG fallback is retained because **shadow and blur behaviour on a
PDF surface is unverified** and may rasterise or drop. Confirming this is an implementation task;
if shadows fail on the PDF surface, the PNG becomes the master for designs that use them.

### 10.3 Physical accuracy tolerance

A 100 mm calibration square rendered at 300 DPI measures 1180 px against an ideal 1181.102 px — an
error of **93 µm**. The cause is raster rounding: 300 mm at 300 DPI is 3543.307 px and pixels are
integral.

This is systematic, always sub-0.1 mm, and an order of magnitude inside DTG print registration
(±1 mm on a good day). **Documented tolerance: ±0.1 mm.** Canvas dimensions round up, never down.

---

## 11. Error handling

**Principle: fail loudly, never substitute silently.**

| Condition | Behaviour |
|---|---|
| Font unavailable at render | **Hard fail.** A substituted font reflows text and misprints the garment. |
| Media missing or deleted | **Hard fail.** |
| Object outside the print area | **Server-side rejection.** The client is tamperable. |
| Render throws | Payload retries with backoff, then the design is flagged for admin review with the error attached. |
| Image below target DPI | **Warn, but allow**, recording the user's acknowledgement on the design. |

The DPI rule is a deliberate business call: blocking low-resolution uploads costs sales, while an
*unrecorded* acknowledgement costs the argument when the customer complains about a blurry print.
The acknowledgement is stored in `DesignDocument.acknowledgedLowDpi`.

**Payload gotcha:** `onFail` fires *before* the retry and final-failure determination, so it must
not be used to mark a job permanently dead. Check `hasFinalError` on the job record instead.

### 11.1 Fonts

Fonts are **self-hosted, never linked from Google Fonts**. The worker must register the identical
binaries the browser used, or text reflows between preview and print. The `fonts` collection holds
the binaries; both the editor and the worker load from it.

---

## 12. Testing strategy

| Layer | Approach |
|---|---|
| `design-core` | Pure unit tests: mm↔px, kerning recovery, history, validation. No browser, milliseconds. |
| **Calibration** | A fixture with a 100 mm square renders at target DPI to 1180 ± 1 px. **Runs on every commit.** |
| **Scale parity** | Every fixture rendered at both scales; bounding boxes must agree in mm within 0.01 mm. |
| **Golden images** | Fixture set — curved text, stroke + shadow, rotated image, multi-view — rendered in Node and pixel-diffed against committed PNGs. |
| Schema migration | A `schemaVersion: 1` fixture must still render after schema changes. |
| Browser | Deliberately thin; Playwright smoke tests only. |

The **calibration test is the keystone**. It is what keeps "22 cm means 22 cm" true, and it must
never be skipped or marked flaky.

The **golden-image tests** are what catch a Fabric upgrade silently changing output — the exact
risk that justified not persisting Fabric JSON.

---

## 13. Deployment

- **Do not deploy the renderer to serverless.** Native canvas binaries, long render times and high
  memory are a poor match. Run Next.js and the worker as containers — Railway, Fly, or Coolify on
  a VPS.
- The worker scales independently of the web app; Payload documents the docker-compose pattern.
- The worker image needs cairo, pango, libjpeg and giflib.
- Media on S3-compatible storage.

---

## 14. Seams left for deferred sub-projects

| Sub-project | Seam already designed in |
|---|---|
| **D — design templates** | A template is a `DesignDocument` with no `sizeId` binding; the admin editor is the same React component |
| **E — storefront & commerce** | Products/sizes/colourways shaped to map onto `plugin-ecommerce` `variantTypes`/`variantOptions`; a cart line item references a `designs` document |
| **F — accounts & roles** | `users` already carries roles; customer accounts extend it rather than replacing it |

Indonesian market decisions recorded for E: Midtrans or Xendit, implemented against the plugin's
documented `PaymentAdapter` interface (`initiatePayment`, `confirmOrder`, optional `endpoints`).
The plugin ships a Stripe adapter only. IDR is configured via `currenciesConfig` with
`decimals: 0`. QRIS support is expected. Courier rates via Biteship. PPN treatment to be confirmed
with an accountant.

---

## 15. Assumptions

Stated explicitly because they were not pinned down during design, and each is made configurable
so that being wrong does not force a rewrite:

1. **View set** is per-product configuration, seeded with front / back / left sleeve / right sleeve.
2. **Per-size print-area overrides** are supported but optional.
3. **Target DPI** is a per-product setting defaulting to 300.
4. Editor canvas scale of ~1.8 px/mm is a starting value, tuned during implementation.
5. Undo history depth of 50 is a starting value.
