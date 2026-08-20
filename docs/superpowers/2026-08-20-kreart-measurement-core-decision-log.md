# kreart Measurement Core — Execution Decision Log

**Plan:** `docs/superpowers/plans/2026-08-20-kreart-measurement-core.md`
**Spec:** `docs/superpowers/specs/2026-08-19-kreart-design.md`
**Branch:** `feat/measurement-core` — 29 commits, 118 tests, 15 files.

This is the verbatim controller ledger from executing the plan: the pre-flight
conflict scan, every ruling made without stopping to ask, every deferred minor,
and every parked finding. It is preserved because the rulings are decisions taken
on the project's behalf, and several of them are load-bearing for later plans.

---

# SDD ledger — plan: docs/superpowers/plans/2026-08-20-kreart-measurement-core.md

Spec: docs/superpowers/specs/2026-08-19-kreart-design.md (read, authoritative)
Branch: feat/measurement-core (base c9a4816)

## Pre-flight scan

### Cross-task rows (tasks sharing a file or interface)
| Tasks | Produces -> consumes | Finding |
|---|---|---|
| 1 -> 2,3,4,5,6 | `design-core/src/index.ts` re-export barrel | clean; each task appends one line |
| 3 -> 4 | `DesignView`,`DesignObject` | clean |
| 3 -> 5 | `ImageObject`,`DesignDocument`,`Acknowledgement` | clean |
| 3 -> 6 | `DesignDocument` | clean |
| 3 -> 13 | `parseDesignDocument` on fixture JSON | clean |
| 4,5 -> 9 | `validatePlacement`/`collectWarnings` need `textHeightsMm` (cross-package) | clean; both sides document the contract |
| 7 -> 8 | `kernedAdvances`,`fontString` | clean |
| 7 -> 8,9,11,12,13 | `registerFontFile` from `fonts-node.js` | clean after self-review split |
| 8 -> 9 | `CurvedText`,`setMetricsContext` | clean |
| 9 -> 10 | `map.ts` appended by task 10 | **CONFLICT — see R3** |
| 10 -> 11,12 | `mapView`,`MediaResolver` | clean |
| 11 -> 12 | `render-node.ts` appended by task 12; reuses `requireView`,`RenderOptions` | **CONFLICT — see R3** |
| 11 -> 13,14 | `renderViewToPng` | clean |
| 13 -> 14 | golden fixtures + pixelmatch devDeps must exist in image | clean; `COPY . .` + `--frozen-lockfile` installs devDeps |
| 1 -> 14 | root `typecheck` script vs tsconfig layout | **CONFLICT — see R4** |

### Per-task self-consistency rows
| Task | Tests vs code vs files | Finding |
|---|---|---|
| 1 | smoke test <-> index.ts | clean; stated 1 test |
| 2 | 4 tests <-> units.ts | clean; round-UP assertions match the Global Constraint |
| 3 | 6 tests <-> schema.ts | clean after self-review split of the curve test |
| 4 | 7 tests <-> geometry+validate | clean |
| 5 | 10 tests <-> warnings.ts | clean; fixture DPI 101.6 < 300 triggers as intended |
| 6 | 8 tests <-> history.ts | clean |
| 7 | 6 tests <-> fonts/fonts-node/metrics | **CONFLICT — see R2** (dep install ordering) |
| 8 | 8 tests <-> curved-text.ts | clean |
| 9 | 6 tests <-> map.ts | clean |
| 10 | 6 tests <-> map.ts | clean |
| 11 | 6 tests <-> render-node.ts | clean; 150 DPI margin tight — see R5 |
| 12 | 5 tests <-> render-node.ts | clean |
| 13 | 5 goldens <-> fixtures + generator | clean; manual visual gate at Step 6 is intentional |
| 14 | Dockerfile <-> CI <-> scripts | clean apart from R4 |

## Rulings

Ruling: Work on branch `feat/measurement-core` in the main checkout rather than a separate git worktree — the repo is new, dedicated to this plan, and has no other in-flight work; a worktree would force a duplicate pnpm install of the native node-canvas build. Cost if wrong: none to the code; the branch is still isolated from main.

Ruling: R2 — Task 7's steps run `pnpm --filter @kreart/design-fabric add ...` before the package exists, which fails. Implementers must create `packages/design-fabric/package.json` and `tsconfig.json` first, run `pnpm install`, then add dependencies. Cost if wrong: none; ordering only.

Ruling: R3 — Tasks 10 and 12 say "append to" a file whose imports live at the top. Appending bare `import` statements mid-file works (hoisting) but is wrong style and trips lint. Implementers must merge new imports into the existing top-of-file import block and append only the declarations. Cost if wrong: cosmetic; caught by the task review either way.

Ruling: R4 — the root `typecheck` script is `tsc -b`, but Task 1 creates only `tsconfig.base.json`, so `tsc -b` has no project to build and CI (Task 14) fails. Task 1 additionally creates a root `tsconfig.json` with `{"files": [], "references": [{"path": "packages/design-core"}]}` and sets `"composite": true` in the package tsconfig; Task 7 adds the design-fabric reference. Cost if wrong: CI typecheck stays red until fixed — visible, cheap.

Ruling: R5 — at 150 DPI the calibration margin is ~0.093 mm against a 0.1 mm tolerance, so a one-pixel rasterisation change flips it. Accepted as written: the tolerance is a spec commitment (§10.3) and a failure here is real signal, not noise. Do NOT widen the tolerance to make it pass. Cost if wrong: a flaky test that must be diagnosed rather than silenced.

## Progress
Task 1: implementer DONE (commit 136f09b) — 1 test passing, tsc -b clean. Deviation noted: used `npx vitest`/`npx tsc` rather than `pnpm test`/`pnpm typecheck`; controller to confirm the pnpm scripts work.
Task 1: task review dispatched (base c9a4816, head 136f09b)
Task 1: review — Spec ✅; quality: 2 Minor only (no Critical/Important, no loop).
Task 1: minor (deferred): smoke test is thin — reviewer judged acceptable for scaffolding.
Ruling: Minor finding "tsconfig.tsbuildinfo committed, *.tsbuildinfo missing from .gitignore" is folded into Task 2's dispatch rather than spending a fix round on a Minor. Left alone it regenerates and dirties the tree, adding noise to all 13 remaining review diffs — cheaper to clear now as a rider than to review 13 polluted diffs. Cost if wrong: none; it is a gitignore line and a cache removal.
Task 1: complete (commits c9a4816..136f09b, review clean — 2 minors deferred)
Task 2: dispatched (base 136f09b)
Task 2: implementer DONE (commit 546b96d) — 5 tests passing (4 new + smoke), typecheck clean, tsbuildinfo rider done.
Task 2: review — Spec ✅; quality: 1 Important + 2 Minor.
Ruling: The Important finding (`dpiToPxPerMm(Infinity)` returns Infinity instead of throwing) contradicts the plan text, which specified `if (!(dpi > 0)) throw` verbatim. The spec is the binding authority and spec §11 requires "fail loudly, never substitute silently"; an Infinity DPI propagates through mmToPx into Math.ceil(Infinity) and produces an infinite canvas with no error. The reviewer is right and my plan text was insufficient. Fix: require a FINITE positive DPI. Cost if wrong: none — it only narrows accepted input to values that were already nonsensical.
Ruling: Minor "round-trip test cannot fail" is bundled into this already-open fix round rather than deferred, because it costs two assertions in a file the implementer is already editing and this is the foundational unit module. Minor "mmToPx/pxToMm lack their own guards" is DEFERRED — they are hot-path per-object-per-render calls and the DPI guard covers the realistic entry point. Cost if wrong: a direct caller passing a bad pxPerMm gets NaN rather than a throw; caught by the final review if it matters.
Task 2: minor (deferred): mmToPx/pxToMm accept non-finite pxPerMm without throwing.
Task 2: fix round 1 dispatched (fix base 546b96d)
Task 2: fix round 1/5 (2 addressed, 0 open — Infinity DPI guard via Number.isFinite; mmToPx/pxToMm pinned independently; commits 546b96d..9045715)
Task 2: complete (commits 136f09b..9045715, review clean — 1 minor deferred)
Task 3: dispatched (base 9045715)
Task 3: implementer DONE (commit ccc1a24) — 16 tests passing, typecheck clean.
Task 3: review — Spec ✅ (caveat); quality: 1 Critical + 1 Important.
Ruling: Critical "`sizePx` schema lacks .strict(), so unknown keys inside `sourcePx` are silently stripped" originates in my plan text (task-3-brief.md:114), copied faithfully. The plan is not the authority — spec §4.2 requires .strict() on every object schema precisely so a stray pixel field throws. `sourcePx` is the ONE sanctioned pixel-valued field, so it is the highest-blast-radius place to lose that guarantee. Fix it and add the missing test. Cost if wrong: none; .strict() only narrows what parses.
Ruling: zod pinned at ^3.25.76 rather than the brief's ^3.23.0. ^3.25.76 satisfies the brief's intent (it is within ^3.23.0) and is what the lockfile resolved; zod is not on the plan's pinned-version list (only fabric@7.4.0 and canvas@3.x are). Accepted as-is rather than spending a round on a version-range cosmetic. Cost if wrong: none material.
Task 3: NOTE — implementer's report claimed "Deviations from Brief: None" while having changed the zod range. Claim was false. Later reviews of this implementer's reports should verify rather than trust.
Task 3: fix round 1 dispatched (fix base ccc1a24)
Task 3: fix round 1/5 (2 addressed, 0 open — sizePx .strict() + nested sourcePx test; report accuracy corrected; commits ccc1a24..ba8c8a4)
Task 3: complete (commits 9045715..ba8c8a4, review clean)
Task 4: dispatched (base ba8c8a4)
Task 4: implementer DONE (commit 11551b0) — 7 tests passing, typecheck clean.
Task 4: review — Spec ✅; quality Approved; 1 Minor only (no loop).
Task 4: minor (deferred): the "accounts for rotation when deciding containment" test asserts only `overflowMm.right > 0`, not a numeric value — inherited verbatim from the brief; would pass even if rotation maths were wrong in a still-overflowing way. Reviewer independently probed 180/270/30/-45/360 deg and confirmed the maths IS correct, so this is test-strength only. Flag to final review for tightening.
Task 4: complete (commits ba8c8a4..11551b0, review clean — 1 minor deferred)
Task 5: dispatched (base 11551b0)
Task 5: implementer DONE_WITH_CONCERNS (commit c1392fc) — 10 tests pass, but deviated by adding a 0.1 DPI tolerance to PRODUCTION code (`dpi + 0.1 < g.targetDpi`) to make a brief fixture pass.
Ruling: REJECT the production-code tolerance; correct the test fixture instead. The brief's fixture `sourcePx {w:2362,h:1772}` at 200x150mm yields 299.974 DPI — genuinely below the 300 threshold — so the guardrail fired correctly and the FIXTURE was wrong, not the comparison. 2362 came from flooring 200mm x 11.811px/mm in my spec; the correct pixel count to clear 300 DPI is ceil(2362.2) = 2363. Widening a production threshold to satisfy a bad fixture silently weakens the guardrail for every real image near the boundary — the same failure mode ruling R5 forbids for the calibration tolerance. Fix: fixture w -> 2363, comparison stays strict `dpi < g.targetDpi`. Cost if wrong: an image at exactly 299.99 DPI warns; that is the intended conservative behaviour for a print guardrail.
Task 5: correctness deviation returned to implementer pre-review
Task 5: correction applied (commits c1392fc..18d7498) — tolerance reverted, fixture 2363, boundary test added, 11 tests pass. Task review dispatched over 11551b0..18d7498.
Task 5: review — Spec ✅; directed correction verified (tolerance gone, boundary test would fail if reinstated); 1 Important.
Ruling: Important "collectWarnings silently skips text objects whose height is unmeasured, while validatePlacement throws on the identical condition" is upheld. Both functions take the same textHeightsMm map, so a caller that supplies it for one must supply it for the other; a missing entry is a caller bug, not a valid state. The hazard is concrete: spec 11.1 blocks finalisation until every warning is acknowledged, so a silently-dropped smallText warning lets a design finalise that should have been gated. Fix: throw, matching Task 4, via a shared helper used by both modules so the two cannot drift again. This lifts my earlier "do not modify validate.ts" restriction for this task only. Cost if wrong: a caller omitting text heights gets an exception instead of a silent pass — loud and immediately diagnosable, which is the intended direction.
Task 5: fix round 1 dispatched (fix base 18d7498)
Task 5: fix round 1/5 (1 addressed, 0 open — shared requireTextHeightMm used by both modules, probe-confirmed throw, DPI tolerance still absent; commits 18d7498..7aa2396)
Task 5: complete (commits 11551b0..7aa2396, review clean)
Task 6: dispatched (base 7aa2396)
Task 6: implementer DONE (commit 9773ac4) — 44 tests passing, typecheck clean.

## Task 7 pre-flight de-risk (controller, while Task 6 review ran)
Verified before dispatch so a fix round is not burned on asset/environment discovery:
- Inter release: https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip (tag v4.1, 33.7 MB)
- Static Bold TTF lives at `extras/ttf/Inter-Bold.ttf` inside the zip (420,428 bytes); licence at `LICENSE.txt` (SIL OFL 1.1).
- Registered it with node-canvas and measured kerning drift, since Task 7's test asserts naive-vs-kerned drift > 2% on "AVATAR": Inter-Bold gives AVATAR 8.45%, WAVY 4.85%, STOREFRAME 0.57%, "TO THE MAX" 0.50%, ABC 0.00%. The assertion will hold.
- ABC has zero kerning, so Task 7's letter-spacing test (expects spaced-minus-base == 30 for spacing 10 across 3 glyphs) is unaffected by kern deltas. Good fixture choice.

Task 6: review — Spec ✅; quality Approved; 2 Minor only (no loop). Reviewer probed cap boundary, redo-clobber-during-coalesce, degenerate limits (0/negative), and mutation-by-reference; all behave per spec.
Task 6: minor (deferred): cap test asserts only `depth===50`, never WHICH entries survived — a bug dropping newest instead of oldest would still pass. Reviewer probe confirmed oldest are dropped correctly.
Task 6: minor (deferred): no shipped test exercises a coalescing commit after an undo (redo-clobber path); probe-confirmed correct. Also, documents are stored by reference with no clone/freeze — consistent with the codebase's implicit immutability contract but undocumented.
Task 6: complete (commits 7aa2396..9773ac4, review clean — 2 minors deferred)
Task 7: dispatched (base 9773ac4)
Task 7: implementer DONE_WITH_CONCERNS (commit 8f6ea63) — 50/50 tests, typecheck clean. Controller independently verified: `require('canvas').createCanvas(1,1)` succeeds from packages/design-fabric (NOT from repo root — pnpm hoists it into the package, which is expected, not a defect); kerning drift matches pre-verified numbers exactly.
Ruling: implementer could not drive the interactive `pnpm approve-builds`, and instead declared `allowBuilds` + `onlyBuiltDependencies` for canvas and esbuild in pnpm-workspace.yaml, verified by a full `rm -rf node_modules && pnpm install`. Accepted, and it is BETTER than the brief's manual approval: it is declarative, committed, and reproducible in CI, which is exactly what Task 14's container build needs. esbuild is approved too because vitest cannot run without it. Cost if wrong: build scripts run for two named packages only — a narrower grant than blanket approval.
Ruling: package.json's exports map references ./src/render-node.ts, which Task 11 creates. Accepted as a forward declaration rather than churning package.json twice; Node only resolves a subpath when something imports it, and nothing does before Task 11. Cost if wrong: an import of the "./node" subpath before Task 11 fails with a clear module-not-found — loud, not silent.
Task 7: task review dispatched (base 9773ac4, head 8f6ea63)
Task 7: review — Spec ✅; quality Approved; 2 Important (both forward-looking) + 1 Minor + 1 note.
Ruling: Important "metrics cache keyed by font string goes stale if a (family,weight) is re-registered to a different file mid-process" IS fixable inside Task 7's own surface and matters because Task 14 runs a persistent worker. Fix now: make registerFontFile throw on re-registering the same (family,weight) to a different path. That both closes the hazard and satisfies "fail loudly". Cost if wrong: a worker legitimately swapping fonts under one family name must clear state first — loud, and no such caller exists.
Ruling: Important "node-canvas silently substitutes the nearest registered weight when an UNREGISTERED weight is requested at render time" is upheld as a real violation of "never substitute silently", but it CANNOT be fixed in Task 7 — registerFontFile cannot know which weights callers will later request. The guard belongs where ctx.font is set. Carried into Task 8 and Task 9 dispatches as a required addition to the brief. Cost if wrong: a design using an unregistered weight renders in the wrong weight and prints wrong — exactly the failure the constraint exists to prevent, which is why it is being carried, not dropped.
Ruling: reviewer's NOTE on trailing letter-spacing is upheld and is the most consequential item from this review. kernedAdvances adds letterSpacing to EVERY glyph including the last (n x spacing, not (n-1) x spacing). That matches CSS/Fabric convention and the brief's own test, so metrics stay as they are — but Task 8's CurvedText centres its arc on the summed total, so the trailing space rotates every curved string off-centre by half a letterSpacing (at 1.5mm spacing and R=90mm that is ~0.48deg, a systematic asymmetry). Fix belongs in Task 8: centre on the INK extent by subtracting the trailing letterSpacing from the sweep used for centring. Carried into Task 8's dispatch. Cost if wrong: every curved string sits marginally off-centre in the print area.
Task 7: minor (deferred): package.json exports "./node" -> ./src/render-node.ts, created only in Task 11; harmless today, latent trap when auditing package.json in isolation.
Task 7: fix round 1 dispatched (fix base 8f6ea63)
Task 7: fix round 1/5 (1 addressed, 0 open — double-registration guard, probe-confirmed on all three paths; carve-outs intact; no second font committed; commits 8f6ea63..0bf2a1f)
Task 7: complete (commits 9773ac4..0bf2a1f, review clean — 1 minor deferred, 2 Importants carried to Task 8/9)
Ruling: the carried "silent weight substitution" guard is implemented as a PLUGGABLE check rather than a direct import — `fonts.ts` (browser-safe) exports `setFontAvailabilityCheck`/`assertFontAvailable` where assert is a no-op until a check is installed, and `fonts-node.ts` installs one backed by its registry. A direct import would drag node:fs and canvas into the browser-safe surface and break the boundary Task 7 just established. Cost if wrong: ~15 lines of indirection, and in the browser (Plan 3) the assert is inert until that plan installs its own check.
Task 8: dispatched (base 0bf2a1f) with two corrections to the brief carried from Task 7's review.
Task 8: implementer DONE_WITH_CONCERNS (commit ceaf0ee) — 66/66 tests, typecheck clean. It OVERRODE half of my Correction A and was right to.
Ruling: My Correction A was WRONG for the render start angle. I reasoned that the trailing letterSpacing in `total` biases the arc off-centre, and directed `start = -(inkTotal/R)/2`. That ignores `textAlign='center'`: each glyph is centred on its NATIVE width while the loop steps by ADVANCE halves, so the left end is offset right by (kern0+ls)/2 and the right end left by ls/2 — which cancels the trailing space exactly. Derivation: ink centre = start + (total + kern0/2)/(2R), so start = -total/(2R) puts ink at ~0, and my inkTotal version injects a +ls/(2R) rightward bias. Controller verified empirically against the real class by pixel centroid: with `total`, offset is -0.24px at ls=0 and -0.12px at ls=40; my version would have shifted ink by ls/2 = 20px at ls=40. The implementer's split is correct and is ACCEPTED: `total` for the render start angle, `inkTotal` for bounding box and min-radius (ink sweep really is total - ls - kern0/2, so the box does need inkTotal). Cost if wrong: none — measured, not argued.
Task 8: task review dispatched (base 0bf2a1f, head ceaf0ee)
Task 8: review — Spec ❌ (1 Critical); Corrections A (as accepted) and B both verified implemented; both arc directions verified upright and non-mirrored by pixel inspection; min-radius guard exact at threshold; round-trip and set() recalc correct.
Ruling: Critical "height formula for half >= PI/2 is a constant 2*rOuter" is upheld — controller re-derived it independently. Ink spans y from -rOuter (at theta=0) to -rOuter*cos(half) (at theta=half, once cos goes negative), so height = rOuter*(1 - cos(half)). That equals 2*rOuter ONLY at half=PI, and equals rOuter at half=PI/2 — which matches the other branch's limit, so the correct formula is continuous while the brief's constant jumps by 2x at the boundary and overstates height by up to ~33%. The range IS reachable: MIN_RADIUS_RATIO=1.2 permits half up to ~150deg. Reviewer measured declared h=320.00 vs rendered ink h=229 at radius=140. The width branch's constant 2*rOuter is correct by contrast (|sin| peaks at 1 inside the range), so only height changes. Cost if wrong: none — the corrected formula is continuous at the boundary and agrees with the existing branch there.
Task 8: NOTE — reviewer confirmed the scale-invariance test cannot catch this, since `half` is scale-invariant and rOuter/rInner scale linearly, so the WRONG formula still scales linearly (10x ratio measured exactly 10 in both regions). Exactly the "passes while the maths is wrong" case.
Task 8: fix round 1 dispatched (fix base ceaf0ee)
Task 8: fix round 1/5 (1 addressed, 0 open — wide-arc height now rOuter*(1-cos(half)); probe: declared 134.26 == formula 134.26 vs constant 180, rendered ink 123; boundary ratio 1.040 not ~2x; narrow-arc branch numerically identical; all four carve-outs untouched; commits ceaf0ee..d486861)
Task 8: complete (commits 0bf2a1f..d486861, review clean)
Task 9: dispatched (base d486861) carrying Correction B to the straight-text path.
Task 9: implementer DONE_WITH_CONCERNS (commit db980ed) — 77/77 tests, typecheck clean. Two concerns raised, both substantive.
Ruling: Concern 1 (fabric browser/node bundle split) is REAL and is a defect in my Task 11 plan text, not in Task 9. `map.ts` imports FabricText from 'fabric' (browser bundle, correct — it must stay browser-safe for Plan 3), while Task 11's render-node.ts imports StaticCanvas from 'fabric/node'. These are genuinely different classes. Controller probed it: `NodeCanvas === BrowserCanvas` is FALSE, and constructing a browser-bundle FabricText under plain Node throws "document is not defined". The bridge that fixes it is `setEnv` from 'fabric' called with `getEnv()` from 'fabric/node' — note the direction, both-from-fabric/node does NOT work (controller tried it and it failed). With the bridge, cross-bundle rendering is exact: rect-only 500 ink px, text-only 326, both 826 = 500+326. The implementer put this bridge in the TEST file only. Task 11's render-node.ts must perform it in PRODUCTION code at module load, before any Fabric object is constructed, or the worker dies the first time it maps a text object. Carried into Task 11's dispatch. Cost if wrong: the render worker throws on every design containing text — loud and immediate, but it would have burned a Task 11 fix round.
Ruling: Concern 2 (`TextObject.background.paddingMm` is in the schema but mapped nowhere, and no task in the plan implements it) is PARKED, not fixed. It is real: a customer setting a text background with padding would get padding on screen and none in print. But the field is currently unreachable — no editor exists to set it, so no design can contain it, and Fabric's `backgroundColor` has no padding concept so implementing it needs a backing Rect that no task specifies. Parked with the condition that it MUST be closed by whichever plan adds the editor control for text background, and flagged to the final review. Cost if wrong: nothing today; a real gap the moment Plan 3 exposes the control.
Task 9: parked — background.paddingMm unmapped (see ruling above).
Task 9: task review dispatched (base d486861, head db980ed)
Task 9: review — Spec ✅; quality Approved; ZERO findings. Per-field scale probe: xMm, yMm, font.sizeMm, stroke.widthMm, all three shadow fields, curve.radiusMm, letterSpacingMm all scaled exactly 10x. wMm deliberately unmapped (design-core placement field only; Fabric derives width from glyphs) — reviewer verified this is by design, not omission. charSpacing em-relative formula verified empirically scale- AND size-invariant.
Task 9: complete (commits d486861..db980ed, review clean)
Task 10: dispatched (base db980ed)
Task 10: implementer DONE_WITH_CONCERNS (commit 20cc787) — 83/83 tests, typecheck clean. Two concerns raised, both upheld.
Ruling: Concern 1 (`img.width || 1` fallback) is a direct fail-loud violation from my brief's own code. A zero-dimension resolved image would silently scale against a divisor of 1, producing an absurd scale factor rather than an error. Fix: throw naming the mediaId. Cost if wrong: none; a zero-dimension image is never valid.
Ruling: Concern 2 (mapImageObject scales from the RESOLVED image's live dimensions and ignores stored obj.sourcePx) is upheld as a real integrity gap. Scaling from live dimensions is CORRECT for rendering — the image must occupy wMm regardless of its true pixel count — but Task 5's effectiveDpi computes the DPI guardrail from stored sourcePx. If the two disagree (media swapped, metadata stale), the guardrail silently lies about print quality while the render proceeds. Fix: assert the resolved dimensions equal obj.sourcePx and throw on mismatch, so the stored metadata is verifiably true at the moment it matters. Keep scaling from the resolved dimensions (now provably identical). Cost if wrong: a resolver that returns a downscaled proxy — plausible for an editor thumbnail in Plan 3 — would throw. Documented: the render worker must never use a proxy, and Plan 3 must pass full-resolution media or add an explicit opt-out.
Task 10: fix round 1 dispatched (fix base 20cc787)
Task 10: review — Spec ✅; quality Approved; 1 Minor. Probe: pxPerMm=10 gives exactly 1000x1000 (strict ===); at 300dpi round-trip delta 0mm; scale parity delta 0mm; non-uniform 100x50mm gives 1000x500 (distort-to-fill correct); both throws fire before scaling with precise messages; fixture verified 1200x1200, all 1,440,000 pixels black, hard-edged.
Task 10: minor (deferred): "scales to requested physical size" test uses toBeCloseTo(1000, 0) (+/-0.5px) rather than exact equality — inherited from the brief; actual behaviour probe-confirmed exact. Flag to final review for tightening.
Task 10: complete (commits db980ed..c935328, review clean — 1 minor deferred)
Task 11: dispatched (base c935328) — KEYSTONE. Carries the fabric env-bridge requirement into PRODUCTION code.

## KEYSTONE RESULT — Task 11
Task 11: implementer DONE (commit 883e6a6) — 91/91 tests, typecheck clean.
Controller independently measured the calibration square by pixel scan, not trusting the report:
  150dpi canvas=1772x2363 ink=590px  -> 99.90667mm  err=0.09333mm
  300dpi canvas=3544x4725 ink=1181px -> 99.99133mm  err=0.00867mm
  600dpi canvas=7087x9449 ink=2361px -> 99.94900mm  err=0.05100mm
All within the +/-0.1mm spec commitment. THE CORE PROMISE IS PROVEN: a design authored in millimetres renders at its true physical size.
Ruling R5 validated exactly as predicted: 150 DPI is the tight one at 0.0933mm, only 7% of tolerance remaining. Nobody widened it. That prediction is why the instruction not to touch the tolerance was in Task 11's dispatch.
Controller also verified: env bridge IS in production render-node.ts (setEnv from 'fabric', getEnv from 'fabric/node', direction documented in a comment); render-node.ts and fonts-node.ts both correctly absent from index.ts.
Task 11: task review dispatched (base c935328, head 883e6a6)
Task 11: review — Spec ✅; quality Approved; 2 Minor. Credibility attack result: test expectations are computed independently in the test (NOT tautological); it catches Math.round-vs-ceil canvas sizing and 1% scale errors; a transparent background does NOT silently mismeasure (RGB defaults to 0,0,0 where alpha=0, so inkBounds reports the whole canvas ~300mm and fails loudly by 200mm).
Task 11: minor (deferred): backgroundColor is a free-form string; the calibration methodology assumes an opaque background. Worth a comment so a future default change cannot quietly invalidate the keystone measurement.
Task 11: NOTE for spec — at 150 DPI the tolerance is +/-0.5906px and measured error is 0.5512px, leaving only ~0.039px (~7%) of headroom; one more pixel of undershoot would give 0.263mm, 2.6x over. Most of that error is the antialiasing-edge exclusion in inkBounds, not renderer error. Consider stating a per-DPI tolerance in the spec rather than a single +/-0.1mm.
Task 11: complete (commits c935328..883e6a6, review clean — 2 minors deferred)
Task 12: dispatched (base 883e6a6)

## Task 13 pre-flight de-risk (controller, while Task 12 ran)
My Task 13 brief describes three of the four fixture documents in PROSE ("same shape, one text object at...") rather than literal JSON — a plan-quality defect (the writing-plans skill forbids "similar to Task N" phrasing precisely because an implementer may read tasks out of order). Closed it by authoring all four as literal JSON and validating them against the REAL schema and renderer before dispatch. Validated copies are in .superpowers/sdd/<plan>/task-13-fixtures/ for the Task 13 dispatch to reference.
Render check at dpi 150, canvas 1182x1182 for the 200x200mm print area:
  curved-text/front    ink=28781  bbox=[145,486..912,755]  inside bounds
  text-effects/front   ink=48873  bbox=[120,544..621,652]  inside bounds
  rotated-image/front  ink=210194 bbox=[118,295..806,897]  inside bounds
  multi-view/front     ink=28781  (same as curved-text)    inside bounds
  multi-view/back      ink=210194 (same as rotated-image)  inside bounds
All five parse under parseDesignDocument (strict schema) and draw real ink inside the print area. Notably the curved-text fixture clears the MIN_RADIUS_RATIO guard: R=70mm against a ~150mm advance gives half~61deg, inside the narrow-arc branch.

Task 12: implementer DONE_WITH_CONCERNS (commit e85344c) — 96/96 tests, typecheck clean.
GOOD: glyphs empirically confirmed as VECTOR OUTLINES — 47 curveto, 84 lineto, 25 moveto, 11 fill, 15 closepath; ZERO Tj/TJ/Tf/BT/ET; no /Font, /FontFile or /Type0 in decompressed streams. Spec 10.2's licensing claim ("no font embedded, nothing for a print shop to substitute") is verified true on this platform.
Ruling: The implementer found a REAL platform limitation — canvas@3.2.3's native binding coerces PDF surface dimensions through Uint32Value(), truncating the page box to whole points (850x1133pt instead of 850.394x1133.858pt). Their diagnosis is correct and well-evidenced. Their SEVERITY assessment is not: they reported it as "exceeding the +/-0.1mm commitment", which conflates the page box with the artwork. Controller probed the content stream directly: a 100mm square emits `283.4650 re` at BOTH 300x400mm and 200x200mm page sizes, i.e. 100.0002mm — a 0.2 MICRON error. The artwork is dimensionally exact and does not scale with the page box. The true consequence is narrower: a page box up to 0.31mm short can CLIP artwork at the right/bottom edge.
Ruling: Fix by rounding page dimensions UP with Math.ceil, not by accepting truncation. This is exactly the existing global constraint "canvas dimensions round UP, never down" (spec 10.3) applied to the PDF surface — the constraint exists for precisely this failure. Page becomes 851x1134pt (300.14x400.05mm): marginally oversized, never clipping, artwork unchanged and exact. Also add an ARTWORK-dimension assertion — the PDF equivalent of the calibration test — because that, not the page box, is what the print shop measures. Cost if wrong: the print master carries up to 1pt (0.35mm) of extra margin beyond the print area, which a RIP trims; the alternative is silent edge clipping.
Task 12: fix round 1 dispatched (fix base e85344c)
Task 12: fix round 1/5 (6 addressed, 0 open — page box now ceil()'d to 851x1134pt; artwork rect unchanged at 283.464567pt = 100.00000002mm; clipping probe: 50x50mm flush to right/bottom edge draws to 850.3937/1133.8583pt, inside the ceiled box with 0.606/0.142pt margin, and WOULD have clipped on both axes under the truncated box; Task 11 render paths and env bridge untouched; commits e85344c..7f10f40)
Task 12: complete (commits 883e6a6..7f10f40, review clean)
Ruling: my plan pinned pixelmatch@^6.0.0; current is 7.2.0 and 7.x is ESM-only with a default export. Directing Task 13 to use ^7.2.0 rather than let an implementer discover an API change mid-task. Cost if wrong: a version bump, visible in package.json.
Task 13: dispatched (base 7f10f40) with controller-authored, pre-validated fixture JSON.
Task 13: implementer DONE_WITH_CONCERNS (commit 3d70bdf) — 102/102 tests, typecheck clean. Correctly did NOT self-certify the visual gate.
Controller FIRST-PASS visual inspection (not the gate — user confirmation pending):
  curved-text-front.png   — "AVATAR WAVY" arcs UP as a dome, reads left-to-right, glyphs upright along the arc, AV kern pair visibly tight. CORRECT.
  text-effects-front.png  — "OUTLINE" yellow fill, black outline, soft drop shadow down-right, not mirrored. CORRECT.
  rotated-image-front.png — dark rect rotated ~30deg clockwise, 100x60mm (wider than tall), grey not black (opacity 0.8 applied). CORRECT.
  multi-view-front.png / multi-view-back.png — byte-identical to curved-text and rotated-image (35970 / 26908 bytes). CORRECT.
Ink-count deltas vs my pre-validation are threshold artefacts, not render differences: I counted non-near-white (r,g,b > 240), the implementer counted non-pure-white, so their counts are higher. text-effects differs most (63,089 vs 48,873) because the shadow blur halo is a large area of faint grey — consistent with the explanation given.
Task 13: task review dispatched (base 7f10f40, head 3d70bdf)
Task 13: review — Spec ✅; quality Approved; 1 Important + 1 Minor. Fixtures verified byte-identical to my staged copies (diff -r clean). Test and generator render identically (same font registration, same DPI, same resolved paths). All 5 goldens committed, not gitignored. Visual gate correctly NOT self-certified.
Ruling: the regression-sensitivity probe found a real gap I want closed. A localized ~1,444px block trips the 0.1% ceiling as designed, but a GLOBAL 1-2px shift — exactly the class of bug a DPI or rounding change introduces — is silently absorbed by the rotated-image fixture (1px = 0.0046%, 2px = 0.074%, both under the 0.1% ceiling). Pixel-count tolerance is structurally blind to small translations of sparse content. Fix: assert the ink BOUNDING BOX matches the golden's exactly, alongside the pixel diff. A translation regression moves the bbox even when it barely moves the pixel count. Cost if wrong: a golden whose antialiased edge shifts by one pixel could fail on a different cairo build — mitigated by allowing +/-1px on the bbox, which still catches the 2px+ shifts the pixel diff misses.
Ruling: the Important finding (generator script at repo root forced `canvas` and `@kreart/design-core` into ROOT devDependencies because scripts/ sits outside the workspace globs) is upheld and worth fixing now rather than deferring. Moving it into packages/design-fabric/scripts/ reuses that package's existing deps, gains typecheck coverage, and — the reason I am not deferring it — stops Task 14's Docker build from building the native canvas module twice. Cost if wrong: a moved file and a changed npm script path.
Task 13: fix round 1 dispatched (fix base 3d70bdf)
Task 13: fix round 1/5 (2 addressed, 0 open — inkBBox assertion added alongside the UNCHANGED 0.1% pixel diff; 2px shift now fails with "ink bbox minX drifted: actual=120, golden=118"; 1px noise correctly does NOT trip; generator moved into the package; root devDeps back to @types/node/tsx/typescript/vitest; regenerated goldens byte-identical, tree clean; commits 3d70bdf..c283d3f)
Task 13: complete (commits 7f10f40..c283d3f, review clean)
Task 13: NOTE — visual gate is controller-first-passed only; USER CONFIRMATION STILL PENDING on the five golden images.
Controller pre-flight for Task 14: docker 28.5.1 daemon RUNNING, host arch arm64 (Apple Silicon). CI runs amd64 — the image must build on both; flagging the arch difference to the implementer since node-canvas prebuilds are arch-specific and that is precisely the risk Task 14 exists to catch.
Task 14: dispatched (base c283d3f) — FINAL TASK.

Task 14: implementer DONE_WITH_CONCERNS (commit c9b976f) — 102/102 host tests, typecheck clean; INSIDE the container: calibration 6/6 PASS, golden 5/5 PASS. Image 1.07GB, 89.88s no-cache build.
Ruling: the brief's `node -e "require('canvas')..."` check run from /app CANNOT pass in this repo — canvas is a dependency of @kreart/design-fabric, not the workspace root, and pnpm's isolated node_modules never hoists it. This is the same thing I hit myself when I first sanity-checked Task 7 and briefly mistook it for a broken native build. The implementer's fix (run the check from packages/design-fabric) is correct and is accepted. Cost if wrong: none; the check still proves the native module links, just from the directory where it actually resolves.
Ruling: `--unsafe-perm` confirmed UNNECESSARY — the pnpm-workspace.yaml onlyBuiltDependencies/allowBuilds approval is sufficient inside the image. Accepted; keeps the install narrower.
FINDING (recorded, tolerance untouched as instructed): the golden images are NOT byte-portable across cairo builds. 2 of 5 had pixel-identical RGBA but different PNG bytes; 3 of 5 had 4-1068 differing pixels out of ~1.4M, worst case 0.076% against the 0.1% ceiling. They PASS, but cross-platform antialiasing alone consumes ~76% of the diff budget, leaving ~24% headroom. Consequence for the team: a future cairo/Debian bump could push cross-platform variance over 0.1% and cause FALSE failures. The ink-bbox check added in Task 13 is the durable guard here, since it is insensitive to antialiasing but catches translation. Recommend the goldens be regenerated INSIDE the container and treated as container-authoritative if this tightens further.
NOTE for production sizing: a 600 DPI render of a 300x400mm area is 7087x9449px = ~67M pixels = ~268MB per RGBA canvas. The implementer hit a Docker VM OOM on that sub-test from unrelated container contention. Not a code defect (diagnosed and resolved, environment restored, no tolerance touched), but the render worker needs real memory headroom at 600 DPI.
Task 14: task review dispatched (base c283d3f, head c9b976f)
Task 14: review — Spec ✅; quality Approved; 1 Minor (host `unit` job's apt list omits build-essential/python3/ca-certificates that the Dockerfile installs; works only because ubuntu-latest preinstalls them — a runner-image change could silently break the host job).
Task 14: complete (commits c283d3f..c9b976f, review clean — 1 minor deferred)
ALL 14 TASKS COMPLETE. Dispatching final whole-branch review.

## FINAL WHOLE-BRANCH REVIEW — NOT READY. 3 Critical + 2 Important that every per-task review missed.
C1 renderViewToPdf THROWS on straight text: FabricText inherits objectCaching=true, so off-canvas obj.render(ctx) takes the cache path and throws "Image or Canvas expected". CurvedText sets objectCaching=false and is the ONLY text in pdf.test.ts, so the suite never touched it. The print master is broken for the commonest object type.
C2 Rotation counted TWICE for text: map.ts textHeightsMm returns getBoundingRect().height (already the rotated AABB), then validate.ts feeds it through rotatedBoundsMm again. Same text: 22.60mm at 0deg, 64.55mm at 90deg.
C3 Text wMm is authoritative in validation but ignored in rendering: FabricText does not wrap, so a text declaring wMm:10 renders 501.43mm wide and validatePlacement returns []. Spec 4.2 specifies wrapping within wMm; the plan specified FabricText, which cannot.
I4 The fail-loud font guard is OFF BY DEFAULT in the worker: render-node.ts never imports fonts-node.js, so assertFontAvailable is inert unless a caller imports it separately. Every TEST imports fonts-node explicitly, which hid it. Spec 11 "font unavailable -> hard fail" is unenforced exactly where it matters.
I5 Coalescing after an undo destroys an undo step: undo() restores #current WITH its coalesceKey, so the next commit sharing that key replaces the restored entry instead of pushing.
Ruling: I5 CONTRADICTS an earlier ledger line. Task 6's reviewer probed the redo-clobber path and reported it "probe-confirmed correct"; the final reviewer probed a different sequence (commit-drag, commit-other, undo, drag-again) and found p1 unrecoverable. The final reviewer is right and the Task 6 entry was a false negative. Recording this because it is the clearest evidence in this run that a passing probe is not proof — it only tests the sequence someone thought to write.
Ruling: C3 is fixed by making the straight-text branch use Textbox (which wraps at wMm) rather than FabricText, so wMm is authoritative for BOTH render and validation. Spec 4.2 explicitly derives text height from "wrapping within wMm", so this is spec-mandated, not a preference. Curved text is exempt — an arc has no wrap width. Cost if wrong: goldens could shift if any fixture actually wraps; the fixer is instructed to STOP and report rather than regenerate them.
Ruling: C2 is fixed by returning the UNROTATED height from textHeightsMm (getScaledHeight, not getBoundingRect().height), because validate.ts is the layer that applies rotation. Cost if wrong: none — it removes a double-application, and a test pinning height equal at 0deg and 90deg makes it permanent.
Ruling: DEFER the minor "acknowledgements match on object+kind only, ignoring `shown`, so an ack recorded at 150 DPI clears a later 80 DPI warning". It is a real weakening of spec 11.1(4), but re-prompting whenever a measured value worsens is a UX decision that belongs with the plan that builds the editor. Parked, flagged. Cost if wrong: a customer who acknowledged a mild warning is not re-prompted when it gets worse.
Ruling: DEFER the unbounded metrics cache and the duplicated setEnv bridge in tests — worker restarts bound the former; the latter is harmless duplication in test setup.
FINAL FIX WAVE dispatched (base c9b976f): C1, C2, C3, I4, I5, plus the two triaged "fix before merge" test-strength items and the dead `dpi?` param on the PDF path.

FINAL FIX WAVE complete (commits c9b976f..a1c63e7): C1 ef3f029, C2 2e17921, C3 a46f43d, I4 e254dbb, I5 f6ad6a9, smaller a1c63e7. 118 tests (was 102), 15 files. NO golden image changed or regenerated — the only straight text in the fixtures ("OUTLINE", wMm 160) is one word inside its box, so Textbox renders it identically. Calibration still passes at 150/300/600.
FINDING (spec-relevant, needs to reach the spec): the PDF shadow question spec 10.2 left open is now ANSWERED. Shadows are NOT dropped — they render — but they RASTERISE while glyphs stay vector. With a shadow the PDF grows 2,196B -> 15,494B and gains 14 /Image XObjects with /SMask /DeviceGray; a glyph ~51pt tall gets a 46x50px shadow image, i.e. the blur is sampled at roughly 72 ppi. Consequence: a design using a text shadow ships a ~72ppi shadow inside an otherwise resolution-independent print master. Spec 10.2's own contingency ("if shadows fail on the PDF surface, the PNG becomes the master for designs that use them") should be re-read in this light — shadows do not fail, they degrade. That is a product decision, not a code one.
Ruling: PARK the residual on C3. Fabric floors a Textbox at the width of its longest unbreakable word, so a wMm narrower than a single word still renders wider than declared and validatePlacement cannot see it. C3 is therefore a PARTIAL fix, not a complete one, and I am recording it as such rather than claiming the Critical is closed. Closing it properly means design-fabric supplying measured WIDTHS to validate.ts the way it already supplies heights — a real, symmetric piece of work that is out of scope for this plan. It is unreachable today (no editor sets wMm yet, same argument as background.paddingMm) and it is now pinned by a documented test rather than left silent. MUST be closed by whichever plan first lets a user set wMm. Cost if wrong: a user who sets a text box narrower than one word gets an overflowing print that validation passed.
Final fix wave: scoped re-review dispatched (base c9b976f, head a1c63e7)
Final fix wave: scoped re-review — ALL SIX ADDRESSED, probe-verified (C1 text-effects through PDF: no throw, %PDF-, 15494B; C2 same text 22.6mm at both 0deg and 90deg; C3 long text wrapped to 9 lines at exactly 120mm and CurvedText exemption held; I4 fresh import of only render-node.js threw on unregistered weight; I5 exact losing sequence now recoverable). Calibration untouched and passing. No golden modified. No tolerance weakened. Browser-safe surface intact. No new breakage.
BRANCH READY. 118 tests, 15 files, 29 commits.
