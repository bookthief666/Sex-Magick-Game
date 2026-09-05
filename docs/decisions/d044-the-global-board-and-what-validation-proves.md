# D-044 — The global Rite board: a Worker that validates, and the limit of what that proves

Date: 2026-08-18
Status: Accepted

## Decision

Shared submission is built, on a **Cloudflare Worker with KV** rather than
LootLocker, and it stays **off by default** behind `?globalBoard=1` until the owner
deploys the Worker and turns it on.

The Worker re-judges every submitted run with the **same validation module the
browser uses**, against a single-use token it issued, bounded by its own clock and
rate limited per identity.

LootLocker is removed entirely — the client, the `dev_` key, the `global_ritual`
board, and the runtime stub that existed to neuter it.

## Why this, and why now

D-040 left three prerequisites, all the owner's to decide. Two are now settled by
them, and the third falls out of the build:

| D-040 prerequisite | Resolution |
|---|---|
| A leaderboard of its own | Built new. `global_ritual` holds 1.0 *score* data; 2.0 measures gates cleared across eight bands, and writing gate totals into it would have corrupted a live board with two incompatible scales. |
| A view on the API key | The service is gone, so the key is gone with it. |
| A position on validation | Server-validated **before** the board goes live, rather than shipping an unverified board with an honest label. |

D-004 refused to call the 1.0 board competitively trustworthy because "the browser
submits an arbitrary integer score without visible server-side run validation."
That specific hole is what this closes.

D-004 also asked for **separate Rite categories**. The Worker takes a rite key from
the start rather than assuming HEX — but see the limitation below.

## What the validation establishes

The Worker's submit path, in order:

1. the token exists and has not been spent (it is deleted on first use, so a
   replayed payload is refused)
2. the summary passes `validateRun` — every rule comparing one recorded field
   against another
3. the claimed duration does not exceed the age of the token the Worker issued,
   plus a clock grace
4. the submitter is under their rate limit
5. only then is it inserted and the board trimmed

That defeats edited `localStorage`, replayed submissions, fabricated durations, and
casual scripted grinding — none of which a client-only board can touch.

## What it does not establish, stated plainly

**This is not anti-cheat, and no copy anywhere should imply that it is.**

The Worker validates a *self-reported summary*. Anything able to construct an
internally consistent record and hold a valid token can still submit a lie. Moving
the same rules to the edge raises the floor; it does not change what the rules are
capable of proving.

Real proof requires the server to derive the result itself — replaying an input
trace against a deterministic simulation. **That is not currently possible here:**
gameplay randomness is unseeded, with `Math.random()` throughout `index.html`'s
spawn paths. The `seededRandom` mulberry generator in `occult-art-runtime.js` seeds
*visuals* only. Deterministic replay would first require seeding gameplay RNG, which
is a substantial separate change and is **not** claimed as done here.

So the board's own copy reads `SERVER-VALIDATED · NOT ANTI-CHEAT`, and the API
response carries `verification: "server-validated-consistency"` so the UI cannot
drift into overclaiming. This is an honest step past D-040, not a solution to
D-004's harder half.

## Architecture

```
browser                          Worker (edge)                KV
  POST /run/start   ───────────▶ issue single-use token ────▶ token:{token}
  ...play...
  POST /run/submit  ───────────▶ validateRun()  ── shared ───┐
    { token, summary, name }     clock bound                 │ rite-validation.js
                                 rate limit ─────────────────┘
                                 insert + trim ────────────▶ board:{rite}
  GET  /board/{rite} ──────────▶ read top-N ◀───────────────┘
```

**One copy of the rules.** `tools/rite-validation.js` is imported by the browser and
by the Worker. A second copy in the Worker would have drifted the first time a
threshold moved — silently, and in the direction that lets a rejected run onto a
shared board. `test-global-board-worker.js` asserts parity directly: the same
fixtures must produce identical verdicts *and identical reasons* on both sides.

**The local board is untouched and stays network-free.** `leaderboard-runtime.js`
performs no network I/O and its test asserts that against the module's own source.
Submission lives in a separate module, `tools/global-board-runtime.js`, so the
board every player gets keeps working offline and stays provably incapable of
phoning anywhere. The global board renders *beneath* the local one; an unreachable
Worker degrades to the board the player already has.

**Opt-in is enforced before the script loads.** The flag is read in
`fixed-step-prototype.js`, so without `?globalBoard=1` the module is never even
requested.

## Limitations, recorded rather than glossed

- **Only HEX records runs.** `finishRun` in `gate-slice-runtime.js` fires only when
  `gateSliceState` exists and stamps `rite: 'HEX'`. MONAS has no recorder, so a
  MONAS submission is **refused** rather than ranked on an empty board. D-004's
  separate-Rite requirement is satisfied structurally; a MONAS board needs a
  recorder first.
- **Identity is a throttle, not authentication.** Rate limiting hashes IP and user
  agent. It is not stored with board entries and does not identify a player.
- **Not deployed.** The Worker is written and fully tested against a fake KV, but
  the owner's Cloudflare billing is unresolved, so nothing is live and the flag
  stays off.

## Evidence

- `test-global-board-worker.js`: 18 sections over routing, tokens, validation,
  the clock bound, rate limiting, ranking, trimming, name sanitisation, and
  client/Worker parity.
- `browser-global-board-test.mjs`: drives the real page against `worker/board.js`
  itself over an in-memory KV — not a canned fixture. Flag off sends no board
  traffic and does not install; flag on submits a real run through the Gate slice's
  own `finishRun` path and renders it; a tampered 99999-gate run is refused
  server-side and never reaches the DOM.
- 29 fast suites green. 13 of 16 browser suites green, including
  `browser-gate-slice`, `browser-leaderboard` and `browser-global-board`.

### The three suites that did not pass, each checked against the pre-M30 baseline

None is caused by this milestone, and each was confirmed by running the same suite
at `4bff6cd` — the commit immediately before M30 — rather than by argument:

| Suite | Finding |
|---|---|
| `test-player-reachability.js` | Exceeds a 120s cap on this container. Passes at this HEAD given 400s. A timeout, not a failure. |
| `browser-m11-performance-budget-test` | **Fails at the baseline too.** Pre-existing, waiting on a `fold-open` performance profile that never arrives here. |
| `browser-monas-test` | The `coherence pulse` assertion is **nondeterministic at the baseline**: three baseline runs gave one pass and two failures, and at this HEAD it passed one run and failed the next. Pre-existing flake, not an M30 regression. |
| `browser-fixed-step-test` | Failed once in a 16-suite back-to-back batch, then passed twice when run alone. Contention under load. |

The `coherence pulse` flake deserves naming rather than filing away: D-042 built that
assertion knowing it had to be isolated from a pre-existing, identically-coloured
orb-pickup flash at the same gap centre the suite steers through, and its own record
notes a run failing on "this container's own several-millisecond noise". It is
measuring a one-frame event, and it is not reliably measuring it. That is a real
piece of test debt, and it belongs to the MONAS visual work rather than to this
milestone.

### The M26 debt, now closed

`M26.1-M26.2` was committed after unit tests passed and the browser suite timed out
unverified. It is verified here: the photo-transition spectacle fires exactly as
claimed — `shake: 12`, `hitStop: 3`, 30 particles from 0, and the glitch active, all
on the frame the gallery advances.

Two defects were found by testing rather than by review, both worth recording
because neither was visible to the layer above it:

- **The CORS preflight threw.** A cross-origin JSON POST is preceded by `OPTIONS`,
  and 204 is a null-body status, so constructing that response with a body raised a
  `TypeError`. Every submission would have failed in production. The unit suite
  could not see it; the browser suite hit it immediately, because a browser actually
  sends the preflight.
- **A strict clock bound rejects honest runs.** A run submitted the instant it ends
  claims a duration equal to its token's age, give or take round-trip latency, so
  the comparison failed at the boundary. Fixed with a 10s grace, plus a regression
  test for exactly that case. An inflated duration only makes the pace rule *easier*
  to satisfy, and the pace rule is not what stops a forgery, so the grace costs
  nothing.

## What the owner still has to do

1. `wrangler kv namespace create BOARD`, and paste the id into `worker/wrangler.toml`.
2. `wrangler deploy` from `worker/`.
3. Set `DEFAULT_BOARD_URL` in `tools/global-board-runtime.js` to the deployed URL.
4. Play with `?globalBoard=1` to confirm, then decide whether to make it the default.

Workers and KV have free tiers that may not require the payment method that
currently blocks R2; worth checking at deploy time rather than assuming either way.
