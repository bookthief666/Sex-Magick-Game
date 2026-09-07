# D-059 — The gallery comes home

**Date:** 2026-08-20
**Status:** Accepted; tooling landed, assets not yet fetched. Not a release
authorization.

## Context

Every one of the 75 gallery images is fetched at runtime from
`https://lh3.googleusercontent.com/d/{id}=s0` — a Google Drive *viewer* URL,
not a CDN. The project has known this was fragile since M30:
`tools/migrate-images-to-r2.mjs` was written specifically to fix it and says so
in its own header ("a failed fetch is why `SIGIL CHANNEL OFFLINE` exists at
all"). That migration was never run. There is no `gallery-manifest.json`, there
has never been an R2 bucket, and the game has shipped on Drive hotlinks the
whole time.

On 2026-08-20 the owner served the branch from Termux on the Fold 6 — the first
time this build has run on the physical target — and **every background image
failed to load.** The whole gallery fell back to
`asset-resilience-runtime.js`'s procedural placeholder surface.

That is worth stating precisely, because the failure is not ambiguous: Termux
served only `index.html` and the runtime scripts over localhost. The images were
requested by Chrome directly from `lh3.googleusercontent.com` over the phone's
ordinary network, with nothing of ours in that path. What failed is the Drive
dependency itself, on the target device, in the ordinary configuration a player
would use.

The theoretical fragility M30 described is now a measured defect. It also means
the first physical Fold 6 session — the standing gate every decision since D-047
has deferred to — cannot judge any of the M21 aesthetic work or D-055/D-056's
sensory identity, because half of what those milestones built is invisible
behind placeholders.

## Decision

**The images move into the repository**, served same-origin from
`assets/gallery/`, rather than to R2 or any other host. The owner chose this over
the worked-out R2 alternative for two reasons: no third-party account sits in the
critical path of the game rendering at all, and the itch build becomes genuinely
self-contained — which is one of the audit's own §10 release requirements
("reproducible itch build"), not a new goal invented here.

The wiring change in `index.html` is two lines, because the filenames are the
existing Drive ids:

```
BASE_URL: "assets/gallery/"   (was https://lh3.googleusercontent.com/d/)
IMG_SUFFIX: ".webp"           (was =s0)
```

`originalLevels`, `newImageIDs` and `esotericNames` are untouched.

This milestone lands the tooling and the guard; the fetch itself has to run
outside CI. **This development environment cannot reach
`lh3.googleusercontent.com` — the egress gateway refuses `CONNECT` with a 403
policy denial** (confirmed against the proxy's own status endpoint, and the same
class of unroutable-around block D-046 hit on the Actions artifact host). The
owner runs the fetch on a machine that can.

What landed:

- `tools/gallery-source.mjs` — the single derivation of *which* images exist,
  parsed out of index.html's own three arrays. Both `fetch-gallery.mjs` and the
  retained `migrate-images-to-r2.mjs` import it rather than keeping a copy, for
  the same reason `rite-validation.js` is shared by the client and the Worker:
  a second copy drifts the first time an image is added, silently, in the
  direction that produces a missing asset at runtime.
- `tools/fetch-gallery.mjs` — fetches, transcodes and manifests. Requests
  `=s1600` rather than `=s0`, since the original photographs are far larger than
  a canvas at most 2176px wide can use and 75 sequential full-size requests are
  markedly more likely to trip Drive's rate limiting. Sequential with backoff,
  resumable, and with a `--from-dir` mode for the case where Drive refuses
  hotlinks entirely and the originals are exported from the owner's Drive
  account by hand.
- `tools/gallery-transcode.py` — WebP encoding via Pillow. Deliberately Python:
  every npm image codec ships native binaries that the M15 supply-chain audit
  would then carry permanently, and this is a dev-time tool whose output is
  plain `.webp` files. `package.json` gains no dependency.
- `tools/test-gallery-source.mjs` — the guard, wired into `qa.yml`'s fast suite.

## Consequences

**M14's baselines are unaffected.** `tests/visual-state.spec.ts` pins
`assetMode: 'offline'` on every capture, so all 28 baselines were taken against
the procedural fallback surface and have never contained the real art. Nothing
M14 compares changes here, and no regeneration round is needed. This was the
main risk and it is not one.

**The same fact is a coverage opportunity, deliberately not taken here.** D-046
lists "the offline gallery fallback out of scope for image-fetch regressions" as
a known honest limit of the visual net. That limit exists because the art was a
*network* dependency; once it is same-origin in the repo, the reason evaporates
and M14 could cover the game's actual visual identity for the first time. That
is a real expansion and it costs a 28-PNG baseline regeneration and review, so
it belongs to its own milestone rather than being smuggled in alongside a fix.

**Repository weight is permanent and one-shot.** Git history keeps every
encoding forever, so committing at one quality and re-encoding at another leaves
both copies in the repo for good. The procedure is therefore: fetch, look at the
result on the real device, and only then commit — not the other way round.
Expected order of magnitude is 15–20 MB at the WebP q82 / 1600px defaults, which
the fetch tool reports before anything is committed.

**The guard fails half-migrated states, which is the actual risk.** Assets
present while `CONFIG` still points at Drive, or `CONFIG` switched over with no
files behind it, both ship a broken gallery and neither is visible by reading
either file alone. `test-gallery-source.mjs` fails on either, on a per-image
sha256 mismatch, and on any id in index.html without a corresponding asset —
so adding an image to the arrays without fetching it now breaks CI instead of
breaking a player's screen. Before the migration runs it reports pending rather
than failing, so the check could land with the tooling.

**What this does not establish.** The fetch has not been run; no image is in the
repo yet; `CONFIG` still points at Drive. Whether Drive will even serve the 75
originals is unverified — if it 403s, the `--from-dir` path is the fallback and
the owner exports from their own Drive account. And nothing here has been seen on
the Fold 6: the point of the milestone is to make the physical playtest
*possible*, not to substitute for it.

`asset-resilience-runtime.js` is untouched and stays as insurance. Once the
images are same-origin its fallback should effectively never fire, but a bounded
loader with a procedural fallback is correct behaviour regardless of where the
bytes come from, and removing it because the current host is more reliable would
be exactly the wrong lesson to draw from this defect.

**Full record:** this document.
