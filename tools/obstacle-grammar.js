(function attachSexMagickObstacleGrammar(root, factory) {
  'use strict';

  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SexMagickObstacleGrammar = api;

  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Game !== 'undefined' &&
    typeof GameState !== 'undefined' &&
    typeof Pillar !== 'undefined'
  ) {
    api.install();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createObstacleGrammarApi(root) {
  'use strict';

  const GRAMMAR_VERSION = 2;
  const STORAGE_KEY = 'sex_magick_patterns_v1';
  const DEFAULT_MAX_RUNS = 20;
  const DEFAULT_MAX_SPAWNS = 300;
  const MIN_TOP_RATIO = 0.22;
  const MAX_TOP_RATIO = 0.78;
  const MAX_RATIO_DELTA = 0.18;
  // The base cycle, kept as the default and as the shape every fingerprint and
  // replay tool already reports.
  const FAMILY_CYCLE = Object.freeze(['safe', 'pressure', 'recovery', 'pressure', 'climax', 'recovery']);

  /**
   * M40.3: the cycle now depends on how far the run has climbed.
   *
   * Until now a single fixed rotation ran from MALKUTH to KETHER, so the only
   * thing that changed late in a run was speed and gap - the *shapes* were the
   * same six beats a player had already seen in the first minute. That is why
   * late play stopped surprising.
   *
   * Each tier keeps the same six-beat length, so the cursor arithmetic and the
   * pattern-per-spawn cadence are unchanged; only which family is asked for on
   * a given beat differs. Early tiers give recovery beats freely; late tiers
   * spend them sparingly and stack climaxes.
   */
  const FAMILY_CYCLES = Object.freeze([
    // MALKUTH, YESOD - learning the vocabulary. No climax at all.
    Object.freeze(['safe', 'pressure', 'recovery', 'safe', 'pressure', 'recovery']),
    // TIPHARETH, GEBURAH - the historical cycle, unchanged.
    FAMILY_CYCLE,
    // CHESED, BINAH - climaxes twice a cycle, one fewer rest.
    Object.freeze(['pressure', 'climax', 'recovery', 'pressure', 'climax', 'safe']),
    // CHOKMAH, KETHER - three climaxes and a single recovery beat.
    Object.freeze(['pressure', 'climax', 'pressure', 'climax', 'recovery', 'climax'])
  ]);

  function cycleForBand(bandIndex) {
    const band = Math.max(0, Math.floor(finiteNumber(bandIndex, 0)));
    const tier = Math.min(FAMILY_CYCLES.length - 1, Math.floor(band / 2));
    return FAMILY_CYCLES[tier];
  }

  // `motion` is the vertical swing in pixels a pattern asks its walls to make, and
  // `gapScale` how open or tight it wants them. Both are properties of the named
  // pattern rather than per-spawn rolls, so each pattern has a recognisable
  // character and - critically - the seeded random stream is untouched, which
  // keeps the existing 252-case reachability audit valid.
  //
  // Neither value is trusted at face value at runtime. The variety runtime clamps
  // both so the corridor left after scaling and swing is never narrower than the
  // gap the solver has verified, which is why the boldest values here are safe:
  // they simply stop being reachable once a band's gap has nothing left to give.
  const PATTERN_LIBRARY = Object.freeze({
    HEX: Object.freeze([
      Object.freeze({ id: 'hex.axis-hold', family: 'safe', kind: 'offsets', values: [0, 0, 0], motion: 0, gapScale: 1.12 }),
      Object.freeze({ id: 'hex.gentle-step', family: 'safe', kind: 'offsets', values: [0, -0.05, -0.1, -0.05, 0], mirror: true, motion: 8, gapScale: 1.05 }),
      Object.freeze({ id: 'hex.staircase', family: 'pressure', kind: 'offsets', values: [0, -0.08, -0.16, -0.24, -0.16], mirror: true, motion: 0, gapScale: 0.94 }),
      Object.freeze({ id: 'hex.ascending-triad', family: 'pressure', kind: 'offsets', values: [0, -0.1, -0.2, -0.1, 0], mirror: true, motion: 14, gapScale: 1 }),
      Object.freeze({ id: 'hex.return-to-axis', family: 'recovery', kind: 'center', values: [0, 0.35, 0.7, 1], motion: 6, gapScale: 1.15 }),
      Object.freeze({ id: 'hex.square-breath', family: 'recovery', kind: 'offsets', values: [0, 0.05, 0, -0.05, 0], mirror: true, motion: 18, gapScale: 1.08 }),
      Object.freeze({ id: 'hex.cross-quadrants', family: 'climax', kind: 'offsets', values: [0, -0.14, 0.02, 0.16, 0, -0.12, 0], mirror: true, motion: 20, gapScale: 0.95 }),
      Object.freeze({ id: 'hex.lightning-flash', family: 'climax', kind: 'offsets', values: [0, -0.12, -0.22, -0.08, 0.08, 0.18, 0], mirror: true, motion: 26, gapScale: 0.9 }),

      // M40.3. Every entry below was materialized across the whole legal anchor
      // range (0.22-0.78) in both directions before being added; the envelope
      // check in materializePattern is what makes that a proof rather than a
      // hope. They exist because the owner asked for "more patterns for the
      // player to learn" - the library had exactly two per family, so a player
      // saw the same eight shapes from MALKUTH to KETHER.
      Object.freeze({ id: 'hex.open-corridor', family: 'safe', kind: 'offsets', values: [0, 0, 0.03, 0, 0], motion: 4, gapScale: 1.14 }),
      // Descends and *holds* there. Every other pressure shape returns toward
      // the anchor; this one makes the player commit to low ground and stay.
      Object.freeze({ id: 'hex.plunge', family: 'pressure', kind: 'offsets', values: [0, 0.09, 0.17, 0.17, 0.09], mirror: true, motion: 10, gapScale: 0.98 }),
      // Alternating without a rest beat - the read is rhythm rather than slope.
      Object.freeze({ id: 'hex.pendulum', family: 'pressure', kind: 'offsets', values: [0, -0.11, 0.06, -0.11, 0], mirror: true, motion: 16, gapScale: 0.97 }),
      Object.freeze({ id: 'hex.settle-drift', family: 'recovery', kind: 'offsets', values: [0, 0.04, 0.06, 0.03, 0], mirror: true, motion: 10, gapScale: 1.12 }),
      // Full-amplitude strikes back to the same line: punishing but learnable,
      // because the return is always to where you started.
      Object.freeze({ id: 'hex.serpent-strike', family: 'climax', kind: 'offsets', values: [0, -0.15, 0, -0.15, 0, -0.1, 0], mirror: true, motion: 24, gapScale: 0.92 }),
      // serpent-strike inverted - the same rhythm driving down instead of up,
      // so the learned shape has a mirror the player must also learn.
      Object.freeze({ id: 'hex.hammerfall', family: 'climax', kind: 'offsets', values: [0, 0.16, 0.02, 0.17, 0.03, 0.12, 0], mirror: true, motion: 22, gapScale: 0.93 })
    ]),
    MONAS: Object.freeze([
      Object.freeze({ id: 'monas.soft-orbit', family: 'safe', kind: 'offsets', values: [0, 0.04, 0, -0.04, 0], mirror: true, motion: 10, gapScale: 1.1 }),
      Object.freeze({ id: 'monas.still-point', family: 'safe', kind: 'offsets', values: [0, 0, 0, 0], motion: 0, gapScale: 1.15 }),
      Object.freeze({ id: 'monas.mercurial-wave', family: 'pressure', kind: 'offsets', values: [0, -0.09, -0.16, -0.08, 0.04, 0.12, 0.06], mirror: true, motion: 16, gapScale: 1 }),
      Object.freeze({ id: 'monas.lunar-sweep', family: 'pressure', kind: 'offsets', values: [0, -0.07, -0.14, -0.08, 0.02, 0.1, 0.04], mirror: true, motion: 12, gapScale: 0.96 }),
      Object.freeze({ id: 'monas.return-flow', family: 'recovery', kind: 'center', values: [0, 0.25, 0.55, 0.8, 1], motion: 8, gapScale: 1.14 }),
      Object.freeze({ id: 'monas.orbit-settle', family: 'recovery', kind: 'offsets', values: [0, 0.06, 0.03, 0, -0.03, 0], mirror: true, motion: 5, gapScale: 1.06 }),
      Object.freeze({ id: 'monas.serpent-current', family: 'climax', kind: 'offsets', values: [0, -0.12, -0.2, -0.08, 0.08, 0.18, 0.06, -0.06, 0], mirror: true, motion: 22, gapScale: 0.93 }),
      Object.freeze({ id: 'monas.caduceus-wave', family: 'climax', kind: 'offsets', values: [0, -0.1, -0.18, -0.06, 0.1, 0.16, 0.04, -0.08, 0], mirror: true, motion: 24, gapScale: 0.9 }),

      // M40.3. Four of these were rejected by the reachability solver on first
      // submission - three invalid, one marginal - despite all of them passing
      // the MAX_RATIO_DELTA envelope check. The envelope is necessary and not
      // sufficient: it bounds how far a gap may move between pillars, while the
      // solver asks whether a player can actually be in both places in time at
      // 8.5 speed and a 110px corridor. The amplitudes below are the ones that
      // came back verified, not the ones originally designed.
      //
      // Same envelope proof as the HEX additions above. MONAS glides
      // rather than jumps, so these lean on sustained curvature where the HEX
      // additions lean on sharp returns.
      Object.freeze({ id: 'monas.long-glide', family: 'safe', kind: 'offsets', values: [0, 0.02, 0.04, 0.02, 0], motion: 6, gapScale: 1.16 }),
      Object.freeze({ id: 'monas.spiral-tighten', family: 'pressure', kind: 'offsets', values: [0, -0.06, -0.11, -0.05, 0.02, 0.07], mirror: true, motion: 12, gapScale: 1.02 }),
      // spiral-tighten's inverse: opens downward first, so the glide has to be
      // fought rather than ridden.
      Object.freeze({ id: 'monas.undertow', family: 'pressure', kind: 'offsets', values: [0, 0.07, 0.12, 0.06, -0.01, -0.06], mirror: true, motion: 11, gapScale: 1.02 }),
      // A 'center' recovery here came back invalid from the solver even at the
      // shipped return-flow's exact values - the motion/gapScale envelope, not
      // the shape, is what MONAS refuses. This drifts gently *up* where
      // orbit-settle drifts down, so recovery still gains a distinct third beat.
      Object.freeze({ id: 'monas.rising-calm', family: 'recovery', kind: 'offsets', values: [0, -0.03, -0.05, -0.02, 0], mirror: true, motion: 9, gapScale: 1.15 }),
      Object.freeze({ id: 'monas.double-helix', family: 'climax', kind: 'offsets', values: [0, -0.1, 0.02, 0.12, 0, -0.1, 0], mirror: true, motion: 20, gapScale: 0.95 }),
      Object.freeze({ id: 'monas.vortex-fall', family: 'climax', kind: 'offsets', values: [0, 0.13, -0.01, 0.15, -0.02, 0.11, 0], mirror: true, motion: 23, gapScale: 0.92 })
    ])
  });

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeRite(value) {
    return value === 'MONAS' ? 'MONAS' : 'HEX';
  }

  function normalizeSeed(value) {
    const numeric = Math.floor(finiteNumber(Number(value), 0)) >>> 0;
    return numeric === 0 ? 0x6d2b79f5 : numeric;
  }

  function hashStringToSeed(value) {
    const text = String(value ?? '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return normalizeSeed(hash >>> 0);
  }

  function createSeededRandom(seed) {
    let state = normalizeSeed(seed);
    return function nextRandom() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One full swing of the wall motion takes 2*PI/0.05 frames. Phases are drawn
  // from that period so neighbouring pillars sit at different points in their
  // cycle instead of moving in lockstep as they did when the offset came from a
  // single global sine.
  const MOTION_PHASE_PERIOD = 126;

  // Matches the swing the stock game applied to every pillar from one global
  // sine, so a pattern that declares no `motion` behaves exactly as before.
  const DEFAULT_MOTION_PX = 5;

  // Deterministic per (seed, spawnIndex) and derived by hashing rather than by
  // pulling from the scheduler's random stream. Consuming the stream here would
  // shift every downstream pattern choice and invalidate the reachability audit,
  // for a value that only needs to look uncorrelated.
  function deriveMotionPhase(seed, spawnIndex) {
    return hashStringToSeed(`${normalizeSeed(seed)}|motion|${Math.max(0, Math.floor(finiteNumber(spawnIndex, 0)))}`)
      % MOTION_PHASE_PERIOD;
  }

  function materializePattern(pattern, anchorRatio = 0.5, direction = 1) {
    if (!pattern || !Array.isArray(pattern.values) || pattern.values.length === 0) {
      throw new TypeError('Pattern must contain at least one value');
    }

    const anchor = clamp(finiteNumber(anchorRatio, 0.5), MIN_TOP_RATIO, MAX_TOP_RATIO);
    const sign = direction < 0 ? -1 : 1;
    let ratios;

    if (pattern.kind === 'center') {
      ratios = pattern.values.map(progress => {
        const normalizedProgress = clamp(finiteNumber(progress, 0), 0, 1);
        return anchor + ((0.5 - anchor) * normalizedProgress);
      });
    } else {
      ratios = pattern.values.map(offset => anchor + (finiteNumber(offset, 0) * sign));
    }

    ratios = ratios.map(ratio => clamp(ratio, MIN_TOP_RATIO, MAX_TOP_RATIO));
    const maxDelta = ratios.slice(1).reduce((maximum, ratio, index) => {
      return Math.max(maximum, Math.abs(ratio - ratios[index]));
    }, 0);

    if (maxDelta > MAX_RATIO_DELTA + Number.EPSILON) {
      throw new RangeError(`${pattern.id || 'pattern'} exceeds the ${MAX_RATIO_DELTA} transition envelope`);
    }

    return ratios;
  }

  function validatePatternLibrary(library = PATTERN_LIBRARY) {
    const errors = [];
    for (const rite of ['HEX', 'MONAS']) {
      const patterns = library[rite] || [];
      // Every family any tier can request must be satisfiable, not just the
      // ones the base cycle happens to name.
      const requiredFamilies = new Set(FAMILY_CYCLES.flat());
      for (const family of requiredFamilies) {
        if (!patterns.some(pattern => pattern.family === family)) {
          errors.push(`${rite} has no ${family} pattern`);
        }
      }
      for (const pattern of patterns) {
        try {
          const base = materializePattern(pattern, 0.5, 1);
          const mirrored = materializePattern(pattern, 0.5, -1);
          if (base[0] !== 0.5 || mirrored[0] !== 0.5) {
            errors.push(`${pattern.id} must begin at the previous gap ratio`);
          }
        } catch (error) {
          errors.push(error.message);
        }
        if (pattern.motion !== undefined && !(Number.isFinite(pattern.motion) && pattern.motion >= 0)) {
          errors.push(`${pattern.id} declares a non-finite or negative motion`);
        }
        if (pattern.gapScale !== undefined && !(Number.isFinite(pattern.gapScale) && pattern.gapScale > 0)) {
          errors.push(`${pattern.id} declares a non-positive gapScale`);
        }
      }
    }
    return errors;
  }

  function computeTopFromRatio(viewportHeight, gap, ratio) {
    const height = Math.max(0, finiteNumber(viewportHeight, 0));
    const resolvedGap = Math.max(0, finiteNumber(gap, 0));
    const minimumTop = 30;
    const maximumTop = Math.max(minimumTop, height - resolvedGap - 50);
    const normalizedRatio = clamp(finiteNumber(ratio, 0.5), MIN_TOP_RATIO, MAX_TOP_RATIO);
    return Math.round((minimumTop + ((maximumTop - minimumTop) * normalizedRatio)) * 1000) / 1000;
  }

  function computeSpawnRate(gameSpeed, pillarSpawnBase) {
    const speed = Math.max(0.001, finiteNumber(gameSpeed, 3));
    const base = Math.max(1, finiteNumber(pillarSpawnBase, 140));
    return Math.max(20, Math.floor(base / (speed / 3)));
  }

  function isSpawnFrame(game, config) {
    if (!game || game.voidMode) return false;
    const frame = Math.max(0, Math.floor(finiteNumber(game.frames, 0)));
    if (frame === 0) return false;
    const rate = computeSpawnRate(game.gameSpeed, config?.PILLAR_SPAWN_BASE);
    return frame % rate === 0;
  }

  class PatternScheduler {
    constructor(options = {}) {
      this.seed = normalizeSeed(options.seed);
      this.rite = normalizeRite(options.rite);
      this.random = createSeededRandom(this.seed);
      this.familyCursor = 0;
      this.patternSerial = 0;
      this.spawnIndex = 0;
      this.lastRatio = clamp(finiteNumber(options.initialRatio, 0.5), MIN_TOP_RATIO, MAX_TOP_RATIO);
      this.lastBasePatternId = null;
      this.active = null;
    }

    /**
     * `bandIndex` defaults to 0 so every existing caller, replay tool and test
     * behaves exactly as before; the live spawn path passes the run's real band.
     * Note that the number of draws taken from `this.random()` per spawn is
     * unchanged - only *which* family is requested moves - but selecting from a
     * different candidate list still shifts the sequence, so the reachability
     * audit must re-run for this as it must for any library change.
     */
    choosePattern(bandIndex = 0) {
      const cycle = cycleForBand(bandIndex);
      const family = cycle[this.familyCursor % cycle.length];
      this.familyCursor += 1;
      const candidates = PATTERN_LIBRARY[this.rite].filter(pattern => pattern.family === family);
      if (candidates.length === 0) throw new Error(`No ${this.rite} ${family} pattern available`);

      let selectedIndex = Math.floor(this.random() * candidates.length);
      if (candidates.length > 1 && candidates[selectedIndex].id === this.lastBasePatternId) {
        selectedIndex = (selectedIndex + 1) % candidates.length;
      }
      const pattern = candidates[selectedIndex];
      const direction = pattern.mirror && this.random() < 0.5 ? -1 : 1;
      const ratios = materializePattern(pattern, this.lastRatio, direction);
      const variant = pattern.mirror ? (direction < 0 ? 'mirror' : 'base') : 'fixed';

      this.patternSerial += 1;
      this.lastBasePatternId = pattern.id;
      this.active = {
        id: `${pattern.id}.${variant}`,
        baseId: pattern.id,
        family,
        variant,
        serial: this.patternSerial,
        ratios,
        motion: finiteNumber(pattern.motion, DEFAULT_MOTION_PX),
        gapScale: finiteNumber(pattern.gapScale, 1),
        stepIndex: 0
      };
      return this.active;
    }

    next(options = {}) {
      if (!this.active || this.active.stepIndex >= this.active.ratios.length) {
        this.choosePattern(options.bandIndex);
      }

      const active = this.active;
      const stepIndex = active.stepIndex;
      const topRatio = active.ratios[stepIndex];
      const viewportHeight = Math.max(0, finiteNumber(options.viewportHeight, 0));
      const gap = Math.max(0, finiteNumber(options.gap, 0));
      const orbChance = clamp(finiteNumber(options.orbChance, 0), 0, 1);
      const orb = this.random() < orbChance;
      const rotation = this.random() * Math.PI * 2;
      const innerPattern = Math.floor(this.random() * 3);
      const warning = this.random() >= 0.5;
      const orbFloat = this.random() * Math.PI * 2;

      const result = {
        grammarVersion: GRAMMAR_VERSION,
        seed: this.seed,
        rite: this.rite,
        spawnIndex: this.spawnIndex,
        patternSerial: active.serial,
        patternId: active.id,
        basePatternId: active.baseId,
        family: active.family,
        variant: active.variant,
        patternStep: stepIndex,
        patternLength: active.ratios.length,
        topRatio,
        top: computeTopFromRatio(viewportHeight, gap, topRatio),
        gap,
        motion: active.motion,
        gapScale: active.gapScale,
        motionPhase: deriveMotionPhase(this.seed, this.spawnIndex),
        orb,
        rotation,
        innerPattern,
        warning,
        orbFloat
      };

      active.stepIndex += 1;
      this.spawnIndex += 1;
      this.lastRatio = topRatio;
      return result;
    }

    snapshot() {
      return {
        grammarVersion: GRAMMAR_VERSION,
        seed: this.seed,
        rite: this.rite,
        familyCursor: this.familyCursor,
        spawnIndex: this.spawnIndex,
        lastRatio: this.lastRatio,
        active: this.active ? {
          id: this.active.id,
          baseId: this.active.baseId,
          family: this.active.family,
          variant: this.active.variant,
          serial: this.active.serial,
          stepIndex: this.active.stepIndex,
          length: this.active.ratios.length
        } : null
      };
    }
  }

  function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { values.set(key, String(value)); },
      removeItem(key) { values.delete(key); },
      snapshot() { return Object.fromEntries(values.entries()); }
    };
  }

  function safeReadHistory(storage, key = STORAGE_KEY, maxRuns = DEFAULT_MAX_RUNS) {
    try {
      const raw = storage?.getItem?.(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(record => record && record.grammarVersion === GRAMMAR_VERSION && typeof record.runId === 'string')
        .slice(0, Math.max(0, maxRuns));
    } catch (_error) {
      return [];
    }
  }

  function safeWriteHistory(storage, records, key = STORAGE_KEY) {
    try {
      storage?.setItem?.(key, JSON.stringify(records));
      return true;
    } catch (_error) {
      return false;
    }
  }

  class PatternRunLedger {
    constructor(options = {}) {
      this.storage = options.storage || createMemoryStorage();
      this.storageKey = options.storageKey || STORAGE_KEY;
      this.maxRuns = Math.max(1, Math.floor(finiteNumber(options.maxRuns, DEFAULT_MAX_RUNS)));
      this.maxSpawns = Math.max(10, Math.floor(finiteNumber(options.maxSpawns, DEFAULT_MAX_SPAWNS)));
      this.now = typeof options.now === 'function' ? options.now : Date.now;
      this.recent = safeReadHistory(this.storage, this.storageKey, this.maxRuns);
      this.current = null;
    }

    begin(options = {}) {
      if (this.current) this.end('replaced');
      this.current = {
        grammarVersion: GRAMMAR_VERSION,
        runId: String(options.runId || `unlinked_${this.now().toString(36)}`),
        seed: normalizeSeed(options.seed),
        rite: normalizeRite(options.rite),
        startReason: String(options.startReason || 'menu'),
        startedAt: new Date(this.now()).toISOString(),
        endedAt: null,
        endReason: null,
        spawnCount: 0,
        familyCounts: { safe: 0, pressure: 0, recovery: 0, climax: 0 },
        patternEvents: []
      };
      return this.snapshot().current;
    }

    recordSpawn(spec, game = {}) {
      if (!this.current || !spec) return false;
      const event = {
        frame: Math.max(0, Math.floor(finiteNumber(game.frames, 0))),
        score: Math.floor(finiteNumber(game.score, 0)),
        spawnIndex: Math.max(0, Math.floor(finiteNumber(spec.spawnIndex, 0))),
        patternSerial: Math.max(1, Math.floor(finiteNumber(spec.patternSerial, 1))),
        patternId: String(spec.patternId),
        basePatternId: String(spec.basePatternId),
        family: String(spec.family),
        variant: String(spec.variant),
        patternStep: Math.max(0, Math.floor(finiteNumber(spec.patternStep, 0))),
        patternLength: Math.max(1, Math.floor(finiteNumber(spec.patternLength, 1))),
        topRatio: finiteNumber(spec.topRatio, 0.5),
        top: finiteNumber(spec.top, 0),
        gap: finiteNumber(spec.gap, 0),
        orb: Boolean(spec.orb)
      };
      this.current.spawnCount += 1;
      if (Object.prototype.hasOwnProperty.call(this.current.familyCounts, event.family)) {
        this.current.familyCounts[event.family] += 1;
      }
      this.current.patternEvents.push(event);
      if (this.current.patternEvents.length > this.maxSpawns) {
        this.current.patternEvents.splice(0, this.current.patternEvents.length - this.maxSpawns);
      }
      return true;
    }

    end(reason = 'unknown') {
      if (!this.current) return null;
      this.current.endedAt = new Date(this.now()).toISOString();
      this.current.endReason = String(reason);
      const completed = JSON.parse(JSON.stringify(this.current));
      this.recent.unshift(completed);
      this.recent = this.recent.slice(0, this.maxRuns);
      safeWriteHistory(this.storage, this.recent, this.storageKey);
      this.current = null;
      return completed;
    }

    clearHistory() {
      this.recent = [];
      try { this.storage?.removeItem?.(this.storageKey); } catch (_error) {}
    }

    snapshot() {
      return JSON.parse(JSON.stringify({
        grammarVersion: GRAMMAR_VERSION,
        storageKey: this.storageKey,
        retentionLimit: this.maxRuns,
        spawnEventLimit: this.maxSpawns,
        privacy: 'local-pattern-evidence-linked-only-by-local-run-id',
        current: this.current,
        recent: this.recent
      }));
    }
  }

  function safeBrowserStorage() {
    try {
      const storage = root.localStorage;
      const probe = '__sex_magick_pattern_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (_error) {
      return createMemoryStorage();
    }
  }

  function getCurrentRunId() {
    try {
      return root.__SEX_MAGICK_RUNS__?.getSnapshot?.()?.current?.runId || null;
    } catch (_error) {
      return null;
    }
  }

  function install() {
    if (Game.prototype.__obstacleGrammarRuntimeInstalled) return root.__SEX_MAGICK_PATTERNS__;

    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalGameOver = Game.prototype.gameOver;
    const originalReturnToMenu = Game.prototype.returnToMenu;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const ledger = new PatternRunLedger({ storage: safeBrowserStorage() });
    let forcedNextSeed = null;
    let debugEnabled = false;

    const query = new URLSearchParams(window.location.search);
    if (query.has('patternSeed')) forcedNextSeed = normalizeSeed(query.get('patternSeed'));
    debugEnabled = query.get('patterns') === '1' || window.location.hash.includes('patterns');

    function deriveSeed(gameInstance) {
      if (forcedNextSeed != null) {
        const seed = forcedNextSeed;
        forcedNextSeed = null;
        return seed;
      }
      const runId = getCurrentRunId();
      return hashStringToSeed(`${runId || Date.now()}|${normalizeRite(gameInstance.gameMode)}|grammar-${GRAMMAR_VERSION}`);
    }

    function initializePatternRun(gameInstance, startReason) {
      const seed = deriveSeed(gameInstance);
      const rite = normalizeRite(gameInstance.gameMode);
      const runId = getCurrentRunId() || `unlinked_${Date.now().toString(36)}`;
      gameInstance.obstaclePatternSeed = seed;
      gameInstance.obstaclePatternScheduler = new PatternScheduler({ seed, rite });
      ledger.begin({ runId, seed, rite, startReason });
      renderDebug();
      return gameInstance.obstaclePatternScheduler;
    }

    function ensureScheduler(gameInstance) {
      if (!gameInstance.obstaclePatternScheduler || gameInstance.obstaclePatternScheduler.rite !== normalizeRite(gameInstance.gameMode)) {
        initializePatternRun(gameInstance, 'lazy');
      }
      return gameInstance.obstaclePatternScheduler;
    }

    function spawnPatternPillar(gameInstance) {
      const scheduler = ensureScheduler(gameInstance);
      const gap = gameInstance.getCurrentGap();
      const spec = scheduler.next({
        viewportHeight: gameInstance.canvas?.height || window.innerHeight,
        gap,
        orbChance: CONFIG.ORB_SPAWN_CHANCE,
        // M40.3: which family the next pattern comes from now depends on how far
        // the run has climbed. Read from the live Gate state rather than stored
        // on the scheduler, because the scheduler is built once per run and the
        // band moves underneath it.
        bandIndex: gameInstance.gateSliceState?.bandIndex
      });

      // Construct once so global cosmetic Math.random consumption remains equivalent
      // to the legacy pillar constructor. The legacy Orb roll is consumed and discarded;
      // gameplay placement and Orb presence come from the per-run seeded stream.
      const pillar = new Pillar(gameInstance.currentLevelIdx, gap);
      const legacyOrbRoll = Math.random();
      const legacyWouldSpawnOrb = legacyOrbRoll > (1 - CONFIG.ORB_SPAWN_CHANCE);
      if (legacyWouldSpawnOrb) Math.random();
      // The variety runtime owns the safety clamps, so route geometry through it
      // when present and fall back to the flat pattern placement when it is not.
      const variety = root.SexMagickObstacleVariety;
      if (variety) {
        variety.applyPillarGeometry(pillar, variety.resolvePillarGeometry({
          gap,
          top: spec.top,
          gapScale: spec.gapScale,
          motionAmplitude: spec.motion,
          motionPhase: spec.motionPhase,
          minimumGap: variety.VERIFIED_STATIC_GAP
        }));
      } else {
        pillar.gap = gap;
        pillar.top = spec.top;
        pillar.baseTop = spec.top;
      }
      pillar.rotation = spec.rotation;
      pillar.innerPattern = spec.innerPattern;
      pillar.hasWarning = Boolean(gameInstance.isMobile && spec.warning);
      pillar.warningAlpha = 1;
      pillar.patternId = spec.patternId;
      pillar.patternFamily = spec.family;
      pillar.patternStep = spec.patternStep;
      pillar.patternSerial = spec.patternSerial;
      pillar.patternSpawnIndex = spec.spawnIndex;
      pillar.patternSeed = spec.seed;
      gameInstance.obstacles.push(pillar);

      if (spec.orb) {
        // M44: placement and scarcity come from the game rather than from here.
        //
        // The seeded decision above (`spec.orb`) still chooses which patterns may
        // carry an orb, so the stream is untouched; `orbPlacementFor` then applies
        // the progression scarcity and the off-corridor offset on top. Declining
        // here consumes nothing, so a skipped orb cannot shift any later draw.
        //
        // The comment this replaces warned that building the orb by hand means
        // "every field the constructor would set has to be set here too, and a new
        // one is easy to forget". M44 forgot `offset` and every orb in this path -
        // the shipped one - got a NaN height, while the index.html fallback looked
        // correct. Asking the game for the placement is what stops the two paths
        // from drifting again; only the seeded phase stays local.
        const placement = typeof gameInstance.orbPlacementFor === 'function'
          ? gameInstance.orbPlacementFor(pillar, computeSpawnRate(gameInstance.gameSpeed, CONFIG.PILLAR_SPAWN_BASE))
          : { x: pillar.x + pillar.w / 2, y: pillar.top + pillar.gap / 2, offset: 0 };
        if (placement) {
          const orb = Object.create(Orb.prototype);
          orb.x = placement.x;
          orb.y = placement.y;
          orb.r = 9;
          orb.collected = false;
          orb.float = spec.orbFloat;
          orb.pulse = 0;
          orb.rotation = 0;
          // The sweep needs the pillar it belongs to (M42), and the offset that
          // holds it off the corridor line (M44).
          orb.pillar = pillar;
          orb.offset = placement.offset;
          gameInstance.collectibles.push(orb);
        }
      }

      ledger.recordSpawn(spec, gameInstance);
      gameInstance.lastObstaclePattern = spec;
      renderDebug();
      return spec;
    }

    function callWithLegacySpawnSuppressed(gameInstance, args) {
      const originalBase = CONFIG.PILLAR_SPAWN_BASE;
      CONFIG.PILLAR_SPAWN_BASE = Number.MAX_SAFE_INTEGER;
      try {
        return originalUpdateGameObjects.apply(gameInstance, args);
      } finally {
        CONFIG.PILLAR_SPAWN_BASE = originalBase;
      }
    }

    Game.prototype.startGame = function startGameWithObstacleGrammar(...args) {
      const result = originalStartGame.apply(this, args);
      initializePatternRun(this, 'menu');
      return result;
    };

    Game.prototype.restartGame = function restartGameWithObstacleGrammar(...args) {
      const result = originalRestartGame.apply(this, args);
      initializePatternRun(this, 'retry');
      return result;
    };

    Game.prototype.gameOver = function gameOverWithObstacleGrammar(...args) {
      const previousState = this.state;
      const result = originalGameOver.apply(this, args);
      if (previousState !== GameState.GAME_OVER && this.state === GameState.GAME_OVER) {
        ledger.end('death');
        renderDebug();
      }
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithObstacleGrammar(...args) {
      const result = originalReturnToMenu.apply(this, args);
      if (ledger.current) ledger.end('menu');
      renderDebug();
      return result;
    };

    Game.prototype.updateGameObjects = function updateGameObjectsWithObstacleGrammar(...args) {
      if (!isSpawnFrame(this, CONFIG)) {
        return originalUpdateGameObjects.apply(this, args);
      }

      try {
        spawnPatternPillar(this);
        return callWithLegacySpawnSuppressed(this, args);
      } catch (error) {
        console.error('[SEX MAGICK] Deterministic obstacle spawn failed; using legacy spawn for this frame', error);
        return originalUpdateGameObjects.apply(this, args);
      }
    };

    function ensureDebugPanel() {
      let panel = document.getElementById('sex-magick-pattern-grammar');
      if (panel) return panel;
      panel = document.createElement('pre');
      panel.id = 'sex-magick-pattern-grammar';
      panel.hidden = true;
      panel.style.cssText = [
        'position:fixed',
        'right:10px',
        'bottom:10px',
        'z-index:9999',
        'max-width:min(420px,calc(100vw - 20px))',
        'margin:0',
        'padding:10px',
        'border:1px solid rgba(255,0,255,.5)',
        'background:rgba(0,0,0,.86)',
        'color:#fdf',
        'font:11px/1.45 monospace',
        'white-space:pre-wrap',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(panel);
      return panel;
    }

    function renderDebug() {
      const panel = ensureDebugPanel();
      panel.hidden = !debugEnabled;
      if (!debugEnabled) return;
      const scheduler = typeof game !== 'undefined' && game?.obstaclePatternScheduler
        ? game.obstaclePatternScheduler.snapshot()
        : null;
      const evidence = ledger.snapshot();
      const last = typeof game !== 'undefined' ? game?.lastObstaclePattern : null;
      panel.textContent = [
        ':: OBSTACLE GRAMMAR ::',
        scheduler ? `SEED: ${scheduler.seed}  RITE: ${scheduler.rite}` : 'SEED: NONE',
        scheduler ? `SPAWNS: ${scheduler.spawnIndex}  FAMILY CURSOR: ${scheduler.familyCursor}` : '',
        last ? `LAST: ${last.patternId}` : '',
        last ? `FAMILY: ${last.family}  STEP: ${last.patternStep + 1}/${last.patternLength}` : '',
        last ? `RATIO: ${last.topRatio.toFixed(3)}  ORB: ${last.orb ? 'YES' : 'NO'}` : '',
        `RECENT RUNS: ${evidence.recent.length}/${evidence.retentionLimit}`,
        'TOGGLE: P'
      ].filter(Boolean).join('\n');
    }

    window.addEventListener('keydown', event => {
      if (event.code !== 'KeyP') return;
      event.preventDefault();
      debugEnabled = !debugEnabled;
      renderDebug();
    });

    Game.prototype.__obstacleGrammarRuntimeInstalled = true;

    root.__SEX_MAGICK_PATTERNS__ = Object.freeze({
      mode: 'deterministic-obstacle-grammar',
      version: GRAMMAR_VERSION,
      storageKey: STORAGE_KEY,
      familyCycle: FAMILY_CYCLE,
      familyCycles: FAMILY_CYCLES,
      familyCycleForBand: cycleForBand,
      transitionEnvelope: MAX_RATIO_DELTA,
      privacy: 'local-pattern-evidence-linked-only-by-local-run-id',
      setNextSeed(value) {
        forcedNextSeed = normalizeSeed(value);
        return forcedNextSeed;
      },
      preview(seed, rite, count = 24, options = {}) {
        const scheduler = new PatternScheduler({ seed, rite });
        const results = [];
        for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) {
          results.push(scheduler.next({
            viewportHeight: finiteNumber(options.viewportHeight, 844),
            gap: finiteNumber(options.gap, 200),
            orbChance: finiteNumber(options.orbChance, 0.5)
          }));
        }
        return results;
      },
      getCatalog() {
        return JSON.parse(JSON.stringify(PATTERN_LIBRARY));
      },
      getSnapshot() {
        const scheduler = typeof game !== 'undefined' && game?.obstaclePatternScheduler
          ? game.obstaclePatternScheduler.snapshot()
          : null;
        return { scheduler, evidence: ledger.snapshot(), debugEnabled };
      },
      clearHistory() {
        ledger.clearHistory();
        renderDebug();
        return ledger.snapshot();
      },
      setDebug(value) {
        debugEnabled = Boolean(value);
        renderDebug();
        return debugEnabled;
      },
      isDebugEnabled() { return debugEnabled; }
    });

    renderDebug();
    console.info('[SEX MAGICK] Deterministic obstacle grammar installed', {
      grammarVersion: GRAMMAR_VERSION,
      familyCycle: FAMILY_CYCLE,
      familyCycles: FAMILY_CYCLES,
      familyCycleForBand: cycleForBand,
      transitionEnvelope: MAX_RATIO_DELTA,
      storageKey: STORAGE_KEY
    });

    return root.__SEX_MAGICK_PATTERNS__;
  }

  return Object.freeze({
    GRAMMAR_VERSION,
    STORAGE_KEY,
    DEFAULT_MAX_RUNS,
    DEFAULT_MAX_SPAWNS,
    MIN_TOP_RATIO,
    MAX_TOP_RATIO,
    MAX_RATIO_DELTA,
    MOTION_PHASE_PERIOD,
    DEFAULT_MOTION_PX,
    FAMILY_CYCLE,
    FAMILY_CYCLES,
    cycleForBand,
    PATTERN_LIBRARY,
    clamp,
    normalizeRite,
    normalizeSeed,
    hashStringToSeed,
    createSeededRandom,
    deriveMotionPhase,
    materializePattern,
    validatePatternLibrary,
    computeTopFromRatio,
    computeSpawnRate,
    isSpawnFrame,
    PatternScheduler,
    createMemoryStorage,
    safeReadHistory,
    safeWriteHistory,
    PatternRunLedger,
    install
  });
});
