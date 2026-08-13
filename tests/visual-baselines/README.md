# M14 visual signatures — currently unestablished

`m14-signatures.json` was **removed in M21** and has not yet been replaced.

## Why

M21 replaced the rendered field entirely: procedural sigil strata instead of eight
rotating pentagrams, per-Sephirah palettes, inscribed walls, a summoning treatment
around the Gate, and a Void that closes in. Every one of the 28 signatures changes
as a direct consequence. Keeping the old file would fail every run for the one
reason that is not a regression — the pixels were *supposed* to change.

Replacements could not be generated in the development sandbox, which runs
Chromium 1194 against a Playwright pinned to 1217 and cannot reproduce the
committed hashes even at an unmodified commit. Committing hashes from the wrong
browser build would be worse than committing none.

## What still runs

`visual-state.spec.ts` guards with `if (baseline)`, so the suite continues to
execute and to log `M14_VISUAL_SIGNATURE` lines for every state and geometry. All
structural coverage is unaffected: every named state remains reachable, layers and
scores are asserted, LootLocker stays uninitiated, and page errors still fail the
run. Only the pixel comparison is paused.

## How to restore it

1. Run **M14 Visual-state QA** in CI on a green commit.
2. Collect the `M14_VISUAL_SIGNATURE` lines from the four reference projects —
   `chromium-small-phone`, `chromium-fold-cover`, `chromium-fold-inner`,
   `chromium-desktop`.
3. Write them to `m14-signatures.json` as `{ project: { state: hash } }`.
4. Review the attached screenshots before committing. D-024 requires baseline
   changes to be explicit, and this is the review step.

**This is an open obligation for release**, tracked in D-031. The game should not
ship without pixel regression coverage restored.
