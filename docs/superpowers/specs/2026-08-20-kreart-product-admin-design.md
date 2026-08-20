# kreart Plan 2 — Product Model & Admin

**Date:** 2026-08-20
**Status:** Approved for planning
**Predecessor:** `2026-08-19-kreart-design.md` (the project spec). This document amends it — see §2.
**Scope:** sub-project A — the product/print-area model and the admin that maintains it.

---

## 0. Blocking item carried from Plan 1: the golden images are unverified

**This is listed first because it blocks trusting a test category, not because it blocks this
plan's code.**

Five golden images are committed and every future render is diffed against them. Nothing has
formally confirmed they were correct when generated. A golden-image test is **self-referential**:
it proves output has not changed, and proves nothing about whether the output was ever right. A
golden generated from broken code locks that bug in permanently, and the suite cannot detect it —
that is the one failure mode this category is blind to about itself.

**Scope, stated precisely.** This does *not* undermine the calibration tests, and the distinction
matters:

| Test category | Verified against | Status |
|---|---|---|
| Calibration, scale parity, PDF artwork size | **Arithmetic and physical truth** — `abs(measured − 100mm) < 0.1mm`, no reference image | Self-verifying; independently re-measured |
| Golden images | **Themselves** — a committed PNG | Unverified reference |

Plan 1's central claim — that a design authored in millimetres renders at its true physical size —
rests entirely on the first row and is sound. What is unverified is the regression net around
*appearance*: curve direction, stroke, shadow, rotation, opacity.

**Current evidence:** all five were inspected once and found correct — the arc bows upward and
reads left-to-right with visibly tight `AV` kerning, the outline and shadow are present and not
mirrored, the rotated image is ~30° clockwise at 100 × 60 mm and rendered grey by its 0.8 opacity,
and the two multi-view files are byte-identical to their counterparts. That is evidence, not a
sign-off.

**What closes it:** a human confirming the five images depict what a garment design should look
like. Until then, treat a golden failure as "output changed" and never as "output is wrong."

---

## 1. What this is

Plan 1 proved that a design authored in millimetres renders at its true physical size. It did so
with no database and no browser: two headless packages, 118 tests, and a calibration square
measured inside a container.

Plan 2 gives that model a home. An admin defines a garment — its views, its mockup photography,
and the printable rectangle on each view — and does so **visually**, by dragging a rectangle over
the mockup rather than typing four normalised numbers.

That interaction is not incidental. Spec project spec §2.1 justified choosing Payload over Laravel + Filament
on the grounds that Payload's admin is React and can embed React canvas components. **The
print-area editor is where that argument is cashed in.** If it is not built, the stack decision
was never tested.

### 1.1 v2 delivers

An admin can create a complete garment, see its print area on the mockup at the right place and
the right physical size, and save it. A design document can be stored and server-side validated
against that product. Media survives outside the container.

### 1.2 Non-goals

- The customer-facing design editor (Plan 3) — nothing here draws artwork.
- The render job queue and order pipeline (Plan 4).
- Storefront, cart, checkout, payments.
- **Role enforcement.** Deliberately deferred: the scaffold sketches admin vs content-manager
  but nothing tests it. It is cheap to add and awkward to retrofit, and it was consciously
  dropped from this plan's scope rather than forgotten.
- Design templates (sub-project D).

---

## 2. Amendments to the project spec

This plan contradicts the project spec in one place, deliberately.

**project spec §4.1 listed `product-views` and `print-areas` as separate collections. They are instead nested
arrays inside `products`.**

A view has no meaningful existence outside its garment, and a print area none outside its view.
Separating them would mean three screens to define one product and — decisively — would strip the
print-area editor of the context that makes it usable: the mockup, the target DPI, the sizes and
the millimetres all belong on one screen with the rectangle.

Consequence, recorded so Plan 3 does not rediscover it: **a `DesignDocument` references a view by
`slug`, not by id.** Slugs are therefore unique within a product and immutable once a design
references them.

The project spec's project spec §4.1 table should be read as amended by this section.

---

## 3. The print-area coupling rule

This is the core of the plan and the part most likely to be got wrong.

A print area stores two different things:

| Field | Meaning |
|---|---|
| `x, y, w, h` | normalised 0–1 — **where on the mockup photo** the printable rectangle sits |
| `widthMm, heightMm` | **what that rectangle measures in reality** |

Dragging cannot derive millimetres. Nothing tells the software how large the garment in the
photograph is; the admin knows the printable area from the garment supplier, and the photo only
shows where it goes.

**They are not independent either.** Both describe the same rectangle, so their aspect ratios must
agree:

```
(w × mockupWidthPx) / (h × mockupHeightPx)   ==   widthMm / heightMm
```

When they disagree the print area is incoherent — a rectangle that looks square on the mockup
while declaring 300 × 400 mm. Artwork would be placed correctly in millimetres and drawn wrongly
relative to the garment in every customer preview. Nothing in the current scaffold prevents this.

### 3.1 How the editor enforces it

- **Drag or resize** writes `x/y/w/h`, then rewrites `heightMm` from `widthMm` and the new
  on-photo aspect. Drag wider and the declared height follows.
- **Typing a millimetre value** reshapes the rectangle to that aspect about its own centre,
  leaving position untouched.
- **A live readout** under the canvas shows the physical size continuously while dragging.
- **Keyboard nudge** (arrow keys; shift for coarse steps) and a **centre horizontally** action.
  Chest prints are almost always centred and dragging to exact centre by hand is miserable.

### 3.2 Pre-existing mismatches are shown, never silently corrected

A product saved before this rule existed may already hold values that disagree. The editor
**displays the mismatch and offers a one-click reconcile**; it does not rewrite on load. A
corrective write triggered by merely opening a document changes data the admin never touched,
which is how catalogues quietly rot.

Tolerance: aspect ratios are compared to within **0.5 %**, which absorbs rounding in stored
normalised values without admitting a visibly wrong rectangle.

---

## 4. The editor's construction

A **`ui`-type field** inside the `printArea` group renders the mockup and the draggable rectangle.
It reads and writes its sibling fields (`widthMm`, `heightMm`, `x`, `y`, `w`, `h`) through
Payload's `useField` hooks. The stock number inputs remain.

The canvas is a **controller over form state, not an owner of it**. Payload keeps validation,
labels, required-field errors and dirty-tracking. Two controls, one value.

**Plain DOM and pointer events — not Fabric.** Dragging one rectangle over an image does not need
a canvas library, and pulling `design-fabric` into the admin bundle for it would be real cost for
nothing. This is not a retreat from project spec §2.1: the argument was that the admin *can* embed React canvas
components, and sub-project D's template authoring genuinely will. Fabric arrives in the admin when
templates do.

**Which mockup is shown:** the first colourway's image for that view. If the view has no mockup
yet, the canvas renders a neutral placeholder at the print area's aspect ratio and the rectangle is
still editable — defining geometry must not require photography to exist first.

---

## 5. Collections

### 5.1 `products` (amended)

Already scaffolded. Changes:

- `views[].slug` gains a **uniqueness constraint within the product** and a format rule
  (lowercase, hyphenated), because designs reference it.
- The `printArea` group gains the `ui` editor field described in §4.
- A `beforeChange` hook enforces §6's aspect-ratio rule on mockups.

### 5.2 `media`

- Storage moves to **S3-compatible** via `@payloadcms/storage-s3` (project spec §13).
- `kind` already distinguishes `mockup`, `artwork-original`, `artwork-cutout`. Originals and
  cutouts stay separate documents — never overwrite an original (project spec §8).
- Payload records `width`/`height` on upload; §6 relies on that rather than re-reading files.

### 5.3 `fonts` (new)

Per project spec §11.2, a licence permitting webfont use in a browser does **not** automatically
permit server-side rendering, nor conversion to outlines — and project spec §10.2's PDF path converts glyphs to
outlines as a side effect, so it is easy to violate a licence without deciding to.

Required fields: `family`, `weight`, the font `file`, `licenceName`, `licenceUrl`,
`permitsServerRendering`, `permitsOutlineConversion`.

**A font cannot be published with either permission unset.** Enforced by validation, not by
convention.

### 5.4 `designs` (new)

Stores a `DesignDocument` (project spec §4.2) plus render outputs and status. Nothing writes to it
until Plan 3, and it is created now so Plan 3 starts against a real schema rather than inventing
one, and so the server-side validation can be built and tested here against fixtures.

Fields: `product` (relationship), `sizeId`, `colourwayId`, `document` (JSON), `status`
(`draft` | `finalising` | `finalised` | `render-failed`), `renderOutputs` (PDF and PNG media
relationships), `acknowledgements`.

**Server-side validation on save** runs `parseDesignDocument`, then `validatePlacement` and
`collectWarnings` from `@kreart/design-core`, supplying text heights via `textHeightsMm` from
`@kreart/design-fabric`. Finalisation is blocked while `unacknowledgedWarnings` is non-empty
(project spec §11.1). The client is tamperable; this check is authoritative.

---

## 6. Mockup aspect-ratio validation

Normalised coordinates survive a mockup being replaced with a higher-resolution one **only if the
aspect ratio is unchanged** (project spec §15, assumption 6). A re-crop silently moves the print
area, and the corruption is invisible until something is printed wrong.

A `beforeChange` hook on `products` compares each mockup's stored dimensions against the others for
that view and **refuses** a mismatch — it does not warn. Tolerance **0.5 %**, matching §3.2.

The error names the view, both images, and both aspect ratios, so the admin can act on it without
guessing.

### 6.1 "Consistent" is not "correct"

This check compares mockups **against each other**, which is all a `beforeChange` hook can know.
If the first mockup uploaded for a view is itself mis-cropped, every later upload matching that
same wrong ratio passes cleanly.

That is the right check for what is knowable here, but a clean save must not be read as
confirmation that the photography is right. The editor therefore states this near the canvas —
"consistent with the other mockups for this view; it cannot confirm the photograph itself is
correctly framed" — and the seed script says the same in its output. A silent pass that reads as
validation is worse than no validation.

---

## 7. Error handling

Consistent with Plan 1: **fail loudly, never substitute silently.**

| Condition | Behaviour |
|---|---|
| Mockup aspect ratio differs from siblings | **Reject the save**, naming both images and ratios |
| Font published with a licence permission unset | **Reject** |
| Duplicate `view.slug` within a product | **Reject** — designs reference it |
| Design document fails `parseDesignDocument` | **Reject** |
| Design finalised with unacknowledged warnings | **Reject** |
| Stored print area whose aspects disagree | **Show** in the editor; never auto-correct (§3.2) |

---

## 8. Testing

| Layer | Approach |
|---|---|
| Coupling maths | Pure unit tests over the aspect/mm conversion, no DOM — the same discipline that put most of Plan 1's tests in `design-core` |
| Hooks | Integration tests against a real Payload instance: aspect mismatch rejected, duplicate slug rejected, font permissions enforced |
| Design validation | `designs` save path tested against fixtures, including the acknowledgement gate |
| **Print-area editor** | **Targeted Playwright, per project spec §12.1 — the keystone of this plan** |

### 8.1 The keystone test

Project spec project spec §12.1 requires the print-area editor to carry targeted coverage rather than generic
smoke tests, because it is the interaction the stack choice rests on. The round trip:

1. Drag a rectangle over a mockup.
2. Enter a physical size.
3. Save, reload, and confirm the normalised coordinates and millimetre values both survive.
4. **Render that product's print area through `@kreart/design-fabric` and confirm the rectangle
   lands where the admin put it.**

Step 4 is what makes this more than a UI test — it closes the loop between what the admin sees and
what the renderer does, which is the same property calibration proved for the measurement core.

---

## 9. What Plan 1 left open, and what happens to it here

| Item | Disposition |
|---|---|
| `background.paddingMm` unmapped | **Still parked.** Nothing sets it until Plan 3's editor exposes the control; it must close there. |
| Text `wMm` containment only partially enforced | **Still parked**, same reason. Closing it needs `design-fabric` to supply measured widths to `validate.ts` as it already supplies heights. |
| PDF shadows rasterise at ~72 ppi | **Product decision, outstanding.** Not a code change; project spec §10.2's contingency was written for shadows *failing*, and they degrade instead. |
| Golden images never formally reviewed | **Blocking — promoted out of this table. See §0.** |
| Acknowledgement matching ignores `shown` | Still deferred. Belongs with Plan 3's editor, which decides re-prompt behaviour. |
| CI `unit` job's apt list relies on runner defaults | Should be pinned; cheap, unrelated to this plan. |

---

## 10. Assumptions

Stated because they were not settled during design, and each is made cheap to reverse:

1. **One mockup per colourway per view.** No alternate angles within a view.
2. **The editor shows the first colourway's mockup.** Print geometry is assumed identical across
   colourways of the same view — true for garments printed from one pattern.
3. **Aspect tolerance is 0.5 %** for both the coupling rule and mockup validation. A starting
   value; it absorbs stored rounding without admitting a visibly wrong rectangle.
4. **Per-size print-area overrides remain optional**, as scaffolded, and are edited numerically in
   this plan. Visual per-size editing was considered and dropped.
5. **`view.slug` is immutable once a design references it.** This plan only makes slugs unique and
   well-formed; enforcement of immutability is Plan 3's.

   **That is an inheritance, not a hand-wave: it must appear as a literal blocking item in Plan 3's
   Definition of Done, not as an assumption carried forward.** It is safe to defer only because
   `designs` stores nothing until Plan 3 writes to it (§5.4). The cost of forgetting is a silently
   orphaned design — a stored document pointing at a view slug that no longer exists, discovered
   when someone tries to render it.
