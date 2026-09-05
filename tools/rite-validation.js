/**
 * The Rite validation core — the rules a run must satisfy, and the order runs rank in.
 *
 * Extracted from `leaderboard-runtime.js` so that **the browser and the edge run the
 * same rules from the same file**. The global board (D-044) validates server-side,
 * and a second copy of these rules living in the Worker would drift from this one
 * the first time a threshold moved — silently, and in the direction that lets a
 * rejected run onto a shared board. There is one copy, and both sides import it.
 *
 * Nothing here touches the DOM, storage, or the network, so it loads unchanged in a
 * browser `<script>`, in Node for the unit suites, and in a Cloudflare Worker.
 *
 * On what these rules are: every rule compares one recorded field against another
 * recorded field, so a run is judged only against itself. That catches corrupted
 * storage, casually edited JSON, and a fabricated total that forgot to move the
 * fields implied by it. **It is consistency checking, not proof.** Anything that can
 * construct a self-consistent record can pass it, on either side of the wire.
 * Server-side execution adds what the client cannot have — a single-use token, an
 * independent clock, and a rate limit — but it does not turn these rules into
 * anti-cheat. D-044 states the limit; do not let this file be read as more.
 */
(function attachSexMagickRiteValidation(root) {
  'use strict';

  const VALIDATION_VERSION = 1;
  const BOARD_SIZE = 5;

  // Mirrors the live Gate slice ladder in gate-slice-runtime.js. These values are
  // duplicated here because this same file must execute unchanged in the browser,
  // Node tests and the Worker bundle. Whenever the live ladder moves, the parity
  // tests must move this copy in the same change or honest runs will be rejected.
  const FALLBACK_BANDS = Object.freeze([
    'MALKUTH', 'YESOD', 'TIPHARETH', 'GEBURAH', 'CHESED', 'BINAH', 'CHOKMAH', 'KETHER'
  ]);
  const FALLBACK_THRESHOLDS = Object.freeze([0, 9, 22, 40, 62, 88, 118, 152]);

  // Gates arrive on a spawn interval, so a run cannot clear them arbitrarily fast.
  // The floor is generous - the owner's fastest measured pace is about one gate per
  // 1.6s - and exists to catch a fabricated total, not to judge play.
  const DEFAULT_MIN_MS_PER_GATE = 400;

  // The default remains HEX for callers that predate rite-aware validation. MONAS
  // has its own recorder and ladder and is selected explicitly by the Worker from
  // the token's rite; D-004 requires the two categories to remain separate.
  const DEFAULT_RITE = 'HEX';

  // MONAS's own live ladder in `monas-progression-runtime.js`, which is nine bands
  // rather than eight and spaced differently. The Worker chooses this ladder by
  // rite rather than accepting thresholds from the client: client-supplied
  // thresholds would make the band check meaningless.
  //
  // These values intentionally mirror `monas-progression-runtime.js`'s BANDS. The
  // source ladder reached TORRENT at 108 and MAELSTROM at 138 in the current live
  // tuning; keeping an older threshold copy here rejects honest MONAS runs exactly
  // when they cross a band boundary.
  const MONAS_BANDS = Object.freeze([
    'STILL', 'CURRENT-I', 'CURRENT-II', 'AXIS', 'ORBIT', 'CROWN', 'ASCENT',
    'TORRENT', 'MAELSTROM'
  ]);
  const MONAS_THRESHOLDS = Object.freeze([0, 6, 15, 27, 42, 60, 82, 108, 138]);

  const RITE_LADDERS = Object.freeze({
    HEX: { bands: FALLBACK_BANDS, thresholds: FALLBACK_THRESHOLDS },
    MONAS: { bands: MONAS_BANDS, thresholds: MONAS_THRESHOLDS }
  });

  function ladderFor(rite) {
    return RITE_LADDERS[String(rite || '').toUpperCase()] || RITE_LADDERS[DEFAULT_RITE];
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function bandIndexFor(gatesCleared, thresholds) {
    let index = 0;
    for (let i = 0; i < thresholds.length; i += 1) {
      if (gatesCleared >= thresholds[i]) index = i;
    }
    return index;
  }

  function parseTime(value) {
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  /**
   * Is this run internally consistent?
   *
   * Every rule compares one recorded field against another recorded field, so a
   * run is judged only against itself. Nothing here trusts a single number in
   * isolation, because a single number is exactly what is easy to edit.
   */
  function validateRun(summary, options = {}) {
    const expectedRite = options.rite ?? DEFAULT_RITE;
    // Explicit thresholds stay supported for the parity test, which drives both
    // sides with the same fixtures; in production the Worker passes only the rite
    // and the ladder is chosen here.
    const thresholds = options.thresholds || ladderFor(expectedRite).thresholds;
    const reasons = [];

    if (!summary || typeof summary !== 'object') {
      return { valid: false, reasons: ['run is not an object'] };
    }

    const gates = summary.gatesCleared;
    if (!Number.isInteger(gates) || gates < 0) reasons.push('gatesCleared is not a whole count');

    const offers = summary.gateOffers;
    const entries = summary.gateEntries;
    const banks = summary.gateBanks;
    for (const [label, value] of [['gateOffers', offers], ['gateEntries', entries], ['gateBanks', banks]]) {
      if (!Number.isInteger(value) || value < 0) reasons.push(`${label} is not a whole count`);
    }
    if (Number.isInteger(offers) && Number.isInteger(entries) && Number.isInteger(banks)) {
      // A Gate can be entered or banked, and an offer can also simply expire, so
      // the two decisions may not exceed the offers that were actually made.
      if (entries + banks > offers) reasons.push('more Gate decisions than Gate offers');
    }

    const attempts = summary.voidAttempts;
    const survivals = summary.voidSurvivals;
    const deaths = summary.voidDeaths;
    if ([attempts, survivals, deaths].every(value => Number.isInteger(value) && value >= 0)) {
      if (survivals + deaths > attempts) reasons.push('more Void outcomes than Void attempts');
      if (Number.isInteger(entries) && attempts > entries) reasons.push('more Void attempts than Gate entries');
    } else {
      reasons.push('Void counters are not whole counts');
    }

    if (Number.isInteger(gates) && gates >= 0) {
      const expected = bandIndexFor(gates, thresholds);
      if (summary.bandIndex !== expected) {
        reasons.push(`band ${summary.bandIndex} does not match ${gates} gates (expected ${expected})`);
      }
    }

    if (isFiniteNumber(summary.gnosis) && isFiniteNumber(summary.gnosisCapacity)) {
      if (summary.gnosis < 0 || summary.gnosis > summary.gnosisCapacity) reasons.push('gnosis outside its capacity');
    }

    const started = parseTime(summary.startedAt);
    const ended = parseTime(summary.endedAt);
    if (started === null || ended === null) {
      reasons.push('run has no readable start and end time');
    } else {
      const durationMs = ended - started;
      if (durationMs <= 0) reasons.push('run ended before it started');
      else if (Number.isInteger(gates) && gates > 0) {
        const msPerGate = durationMs / gates;
        if (msPerGate < (options.minMsPerGate ?? DEFAULT_MIN_MS_PER_GATE)) {
          reasons.push(`${gates} gates in ${Math.round(durationMs / 100) / 10}s is faster than the spawn rate allows`);
        }
      }
    }

    if (summary.rite !== expectedRite) {
      reasons.push(expectedRite === 'HEX'
        ? 'run is not a Rite of Hexagram run'
        : `run is not a Rite of ${expectedRite} run`);
    }

    return { valid: reasons.length === 0, reasons };
  }

  /**
   * Rank runs by what 2.0 measures. Gates first, then the deeper band, then score,
   * then the earlier run - so a tie is broken in favour of whoever got there first.
   */
  function rankRuns(history, options = {}) {
    const list = Array.isArray(history) ? history : [];
    const limit = options.limit ?? BOARD_SIZE;

    const scored = list.map(summary => {
      const verdict = validateRun(summary, options);
      return {
        runId: summary?.runId ?? null,
        gatesCleared: Number.isInteger(summary?.gatesCleared) ? summary.gatesCleared : 0,
        bandIndex: Number.isInteger(summary?.bandIndex) ? summary.bandIndex : 0,
        bandName: (options.bandNames || FALLBACK_BANDS)[summary?.bandIndex] || '—',
        score: isFiniteNumber(summary?.finalScore) ? summary.finalScore : 0,
        endedAt: typeof summary?.endedAt === 'string' ? summary.endedAt : null,
        endReason: typeof summary?.endReason === 'string' ? summary.endReason : null,
        verified: verdict.valid,
        reasons: verdict.reasons
      };
    });

    const verified = scored.filter(entry => entry.verified);
    verified.sort((a, b) => {
      if (b.gatesCleared !== a.gatesCleared) return b.gatesCleared - a.gatesCleared;
      if (b.bandIndex !== a.bandIndex) return b.bandIndex - a.bandIndex;
      if (b.score !== a.score) return b.score - a.score;
      return (parseTime(a.endedAt) ?? 0) - (parseTime(b.endedAt) ?? 0);
    });

    return {
      entries: verified.slice(0, limit).map((entry, index) => ({ ...entry, rank: index + 1 })),
      totalRuns: scored.length,
      verifiedRuns: verified.length,
      rejected: scored.filter(entry => !entry.verified)
    };
  }

  const api = Object.freeze({
    VALIDATION_VERSION,
    BOARD_SIZE,
    FALLBACK_BANDS,
    FALLBACK_THRESHOLDS,
    DEFAULT_MIN_MS_PER_GATE,
    DEFAULT_RITE,
    MONAS_BANDS,
    MONAS_THRESHOLDS,
    RITE_LADDERS,
    ladderFor,
    isFiniteNumber,
    bandIndexFor,
    parseTime,
    validateRun,
    rankRuns
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SexMagickRiteValidation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
