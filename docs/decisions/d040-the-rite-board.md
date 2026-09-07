# D-040 — The Rite board: a leaderboard that works today, without pretending

Date: 2026-08-13
Status: Accepted

## Decision

The menu's board comes back, filled from the player's own run history and ranked by
**gates cleared** — the thing 2.0 actually measures. It performs **no network I/O**,
and a test asserts that against the module's own source.

Shared submission stays off. That is not an oversight, and the reasons are below.

## Why the owner had no leaderboard

Three separate things were true at once:

1. **D-004 ruled the 1.0 board untrusted.** The browser submitted an arbitrary
   integer with no server-side validation.
2. **M16 stubbed submission to local-only** and hid the board container outright, so
   the menu showed nothing at all.
3. **The scale changed.** 1.0 ranked `score`; 2.0's real measure is gates cleared
   across eight bands. The existing `global_ritual` board holds 1.0 score data, and
   writing gate totals into it would corrupt a live board with two incompatible
   scales.

So "turn the leaderboard back on" was never one change. The part that needed no
decision from the owner — *give them a board of their own runs* — is done here.

## What the board shows

The top five verified runs from `sex_magick_gate_slice_v1` (already written by
`finishRun`, up to 20 runs), ranked by gates, then band reached, then score, then
the earlier run. Each row names the Sephirah reached and the gates cleared.

The history was already being recorded. Nothing new is stored, and no new storage
key exists.

## What "verified" means, and what it does not

Every rule compares one recorded field against another recorded field, so a run is
judged only against itself:

- the band must be the one its gate total implies
- Gate entries + banks may not exceed Gate offers
- Void survivals + deaths may not exceed Void attempts, which may not exceed entries
- gnosis must lie within its capacity
- the run must end after it starts, and may not clear gates faster than the spawn
  rate allows
- it must be a Rite of Hexagram run

**This is consistency checking, not security.** It catches corrupted storage and
casually edited JSON — raising `gatesCleared` alone now fails on the band that no
longer matches it *and* on the impossible pace. Anything running in the player's own
browser can still produce a consistent forgery. A verified mark here must never be
read as proof against a determined cheat; that needs server-side validation, which a
guest session on the 1.0 service does not provide. Runs that fail are excluded from
the board and keep their reasons in `getBoard().rejected`.

## Why shared submission is still off

Three prerequisites, all the owner's to decide:

1. **A leaderboard of its own.** Gate totals must not be written into
   `global_ritual`, which holds 1.0 scores on a different scale. This needs a new
   board created in the service's dashboard, which I cannot do.
2. **A view on the API key.** A `dev_` key sits in `index.html` in a **public**
   repository, with `development_mode: true`.
3. **A position on validation.** D-004 asked for proportional validation before a
   competitive release. Client-side checks do not meet that bar, and shipping a
   shared board that claims to be competitive without server-side validation would
   repeat exactly what D-004 objected to.

Turning it on is a small change once those are settled; the ranking and validation
are already written and tested.

## Evidence

- `test-leaderboard-runtime.js`: 20 assertions over validation and ranking,
  including that a zero-gate run stays valid (the player died early — legitimate),
  that ties break by score then by the earlier run, and that the board cap is the
  top of the ranking rather than the first five encountered.
- `browser-leaderboard-test.mjs` drives the real page with seeded storage: the
  board renders `#1 KETHER 147 GATES`, a tampered 99999-gate run is rejected and
  never reaches the DOM, an empty history says `NO RUNS YET · WALK THE GATE`, the
  board stays inert under `visualQa=1`, and rendering adds **zero** external
  requests.
- 39 fast suites and 13 browser suites green.

## What changed elsewhere

`gate-slice-runtime.js` gains a `getHistory()` accessor so the board reads runs
through the slice rather than through a second copy of the storage key, and it no
longer hides the board container. The network connection test button stays hidden.
`browser-gate-slice-test.mjs` asserted the container was hidden; that assertion now
asserts the new intent — visible, titled `RITE BOARD`, declaring itself local — while
the preflight and no-lootlocker-traffic checks it already had are untouched.
