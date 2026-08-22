(function attachSexMagickGateSlice(root, factory) {
  'use strict';

  const api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.SexMagickGateSlice = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.scheduleInstall();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGateSliceApi(root) {
  'use strict';

  const SLICE_VERSION = 1;
  const STORAGE_KEY = 'sex_magick_gate_slice_v1';
  const HISTORY_LIMIT = 20;
  const GNOSIS_CAPACITY = 10;
  const VOID_DURATION_STEPS = 8 * 60;
  const VOID_SPEED_MULTIPLIER = 1.5;
  const VOID_GAP_REDUCTION = 20;
  const BANK_MULTIPLIER = 3;
  const VOID_MULTIPLIER = 10;
  const NEAR_MISS_PX = 6;
  const EFFECTIVE_PLAYER_HALF = 12;
  const REQUIRED_QUERY_VALUE = '1';

  // The Gate is entered when the player's centre reaches GATE_ENTRY_RADIUS of the
  // offer's centre, and that circle is the one drawn brightly, so the ring the
  // player aims at is the ring they hit. The 2026-08-12 Fold 6 pilot ran with an
  // entry radius of 31 against an outer ring drawn at 52 and produced a clean
  // bimodal miss distribution: five banks between 31.08 and 41.95 px, then
  // nothing until 82.17 px. Those five were failed entries, not declines - one
  // missed by 0.08 px. A 44 px aperture captures that whole near population and
  // still sits 16 px inside the outer glow, so aim is still required.
  const GATE_ENTRY_RADIUS = 44;
  const GATE_OUTER_RADIUS = 60;

  // Vertical placement bounds for a Gate offer, as a fraction of canvas height,
  // plus a hard pixel margin so the offer never hugs the ceiling clamp or floor.
  const GATE_MIN_RATIO = 0.2;
  const GATE_MAX_RATIO = 0.8;
  const GATE_EDGE_MARGIN_PX = 96;
  // Consecutive Gates must differ by at least this fraction of canvas height,
  // so a seeded stream cannot accidentally reproduce the fixed two-position
  // alternation it replaces.
  const GATE_MIN_SEPARATION_RATIO = 0.12;
  // Measured, not guessed: in the 2026-08-12 pilot the owner closed 289.65 px of
  // vertical error inside the 133 frames a Gate stayed visible. Holding placement
  // within this sustained rate keeps every offer physically reachable from
  // wherever the player happens to be when it spawns.
  const GATE_VERTICAL_PX_PER_FRAME = 2.2;
  const GATE_MIN_REACH_PX = 60;

  // The hardest configuration the reachability solver proves clearable is speed
  // 8.5 against a 110 px gap (see DEFAULT_SCENARIOS in player-reachability.js).
  // No band, and no Void applied on top of a band, may exceed it.
  const MAX_VALIDATED_SPEED = 8.5;
  const MIN_VALIDATED_GAP = 110;

  // The 2026-08-12 pilot cleared 507 gates and 196 of them - 38.7 percent of all
  // play - happened past GEBURAH, where the curve simply stopped. Runs of 81, 78,
  // 64, 64 and 53 gates all finished on flat difficulty. These four bands
  // continue the ascent to the edge of the proven envelope: KETHER sits exactly
  // at speed 8.5, and its 122 px gap stays at or above CONFIG.MIN_PILLAR_GAP even
  // at the bottom of the +/-10 px breathing that getCurrentGap applies.
  // D-067 re-spaced these thresholds. Speeds and gaps are untouched - every pair
  // is still an audited coordinate - only *when* the player arrives changed.
  //
  // The old spacing (0/6/16/32/48/68/92/120) was front-loaded: +0.9, +1.2, +1.2
  // across the first 32 gates, then +0.7, +0.6, +0.5, +0.5 across the next 88.
  // The owner reported speed that "kept increasing until it sortve topped off",
  // and that is this deceleration, felt at gate 32 rather than at the real
  // ceiling. Intervals now widen monotonically - 9, 13, 18, 22, 26, 30, 34 - so
  // each band lasts longer than the one before it and the ascent reads as a long
  // arc instead of a sprint into a plateau. KETHER moves 120 -> 152, keeping the
  // crown attainable in a strong run (the 2026-08-12 pilot's best was 507 gates,
  // with good runs of 81, 78, 64, 64 and 53).
  //
  // The deceleration in *speed* is unchanged and cannot be fixed by re-spacing:
  // it exists because 8.5 is the top of the proven envelope. Raising it is a
  // search, not an edit - see MAX_VALIDATED_SPEED.
  const BANDS = Object.freeze([
    Object.freeze({ name: 'MALKUTH', gateThreshold: 0, speed: 2.9, gap: 220, riskActive: false }),
    Object.freeze({ name: 'YESOD', gateThreshold: 9, speed: 3.8, gap: 190, riskActive: true }),
    Object.freeze({ name: 'TIPHARETH', gateThreshold: 22, speed: 5.0, gap: 165, riskActive: true }),
    Object.freeze({ name: 'GEBURAH', gateThreshold: 40, speed: 6.2, gap: 145, riskActive: true }),
    Object.freeze({ name: 'CHESED', gateThreshold: 62, speed: 6.9, gap: 138, riskActive: true }),
    Object.freeze({ name: 'BINAH', gateThreshold: 88, speed: 7.5, gap: 132, riskActive: true }),
    Object.freeze({ name: 'CHOKMAH', gateThreshold: 118, speed: 8.0, gap: 127, riskActive: true }),
    Object.freeze({ name: 'KETHER', gateThreshold: 152, speed: MAX_VALIDATED_SPEED, gap: 122, riskActive: true })
  ]);

  let installed = false;
  let installationTimer = null;
  let currentRun = null;
  let history = [];
  let gateSerial = 0;

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finiteNumber(Number(value), minimum)));
  }

  function roundHalf(value) {
    return Math.round(finiteNumber(Number(value), 0) * 2) / 2;
  }

  // The Void multiplies band speed and shrinks the gap. Left uncapped that runs
  // straight out of the envelope the reachability solver has proven: even at
  // GEBURAH it already reached 9.3, and the old gap floor of 100 sat below the
  // game's own CONFIG.MIN_PILLAR_GAP. The Void stays a sharp escalation at low
  // bands and saturates at the hardest provably clearable configuration instead
  // of running off into difficulty nobody has shown is survivable.
  function voidSpeedFor(bandSpeed) {
    const base = Math.max(0, finiteNumber(Number(bandSpeed), 0));
    return Math.min(MAX_VALIDATED_SPEED, base * VOID_SPEED_MULTIPLIER);
  }

  function voidGapFor(baseGap) {
    const base = finiteNumber(Number(baseGap), MIN_VALIDATED_GAP);
    return Math.max(MIN_VALIDATED_GAP, base - VOID_GAP_REDUCTION);
  }

  function getBandIndex(gatesCleared) {
    const gates = Math.max(0, Math.floor(finiteNumber(Number(gatesCleared), 0)));
    let index = 0;
    for (let candidate = 1; candidate < BANDS.length; candidate += 1) {
      if (gates >= BANDS[candidate].gateThreshold) index = candidate;
    }
    return index;
  }

  function getBand(gatesCleared) {
    return BANDS[getBandIndex(gatesCleared)];
  }

  function familyWeight(family) {
    switch (String(family || '').toLowerCase()) {
      case 'climax': return 2;
      case 'pressure': return 1;
      case 'safe':
      case 'recovery':
      default: return 0.5;
    }
  }

  function streakBonus(streak) {
    const resolved = Math.max(0, Math.floor(finiteNumber(Number(streak), 0)));
    if (resolved >= 7) return 2;
    if (resolved >= 3) return 1;
    return 0;
  }

  function classifyGateClear(options = {}) {
    const playerY = finiteNumber(Number(options.playerY), 0);
    const gapTop = finiteNumber(Number(options.gapTop), 0);
    const gapSize = Math.max(0, finiteNumber(Number(options.gapSize), 0));
    const playerHalf = Math.max(0, finiteNumber(Number(options.playerHalf), EFFECTIVE_PLAYER_HALF));
    const safeTop = gapTop + playerHalf;
    const safeBottom = gapTop + gapSize - playerHalf;
    const safeHeight = Math.max(0, safeBottom - safeTop);
    const clearanceTop = playerY - safeTop;
    const clearanceBottom = safeBottom - playerY;
    const minimumClearance = Math.min(clearanceTop, clearanceBottom);

    if (safeHeight <= 0 || playerY < safeTop || playerY > safeBottom) {
      return {
        zone: 'unsafe',
        minimumClearance,
        safeTop,
        safeBottom,
        topRiskBoundary: safeTop,
        bottomRiskBoundary: safeBottom
      };
    }

    const third = safeHeight / 3;
    const topRiskBoundary = safeTop + third;
    const bottomRiskBoundary = safeBottom - third;
    let zone = 'center';
    if (playerY <= topRiskBoundary) zone = 'risk-top';
    else if (playerY >= bottomRiskBoundary) zone = 'risk-bottom';

    return {
      zone,
      minimumClearance,
      safeTop,
      safeBottom,
      topRiskBoundary,
      bottomRiskBoundary
    };
  }

  // Samples a point from `intervals` (a list of [low, high] pairs) in proportion
  // to their widths, so a window with a hole in it stays uniformly distributed.
  function sampleIntervals(intervals, unitRandom) {
    const usable = intervals.filter(([low, high]) => high > low);
    const total = usable.reduce((sum, [low, high]) => sum + (high - low), 0);
    if (total <= 0) return null;
    let cursor = clamp(unitRandom, 0, 1) * total;
    for (const [low, high] of usable) {
      const width = high - low;
      if (cursor <= width) return low + cursor;
      cursor -= width;
    }
    const [low, high] = usable[usable.length - 1];
    return high === low ? low : high;
  }

  // Chooses where a Gate offer sits vertically. Replaces the `gateSerial % 2`
  // alternation that put all 28 offers of the 2026-08-12 pilot on exactly two Y
  // values. Pure and deterministic given `unitRandom`, so it is unit-testable and
  // reproducible from a run seed.
  function chooseGateY(options = {}) {
    const height = Math.max(1, finiteNumber(Number(options.canvasHeight), 0));
    const unitRandom = clamp(finiteNumber(Number(options.unitRandom), 0.5), 0, 1);
    const centre = height / 2;

    const margin = Math.min(GATE_EDGE_MARGIN_PX, height / 2);
    let low = Math.max(margin, height * GATE_MIN_RATIO);
    let high = Math.min(height - margin, height * GATE_MAX_RATIO);
    if (high <= low) return centre;

    // Keep the offer within reach of where the player actually is right now.
    const travelFrames = Math.max(1, finiteNumber(Number(options.travelFrames), 1));
    const reach = Math.max(GATE_MIN_REACH_PX, travelFrames * GATE_VERTICAL_PX_PER_FRAME);
    const playerY = finiteNumber(Number(options.playerY), centre);
    const reachLow = Math.max(low, playerY - reach);
    const reachHigh = Math.min(high, playerY + reach);
    // If the player is outside the corridor entirely, the reach window can come
    // out empty. Fall back to the nearest legal point rather than to the centre.
    if (reachHigh <= reachLow) return clamp(playerY, low, high);

    // Carve out a band around the previous Gate so consecutive offers differ.
    const previousY = Number(options.previousY);
    if (!Number.isFinite(previousY)) return reachLow + unitRandom * (reachHigh - reachLow);
    const separation = height * GATE_MIN_SEPARATION_RATIO;
    const sampled = sampleIntervals([
      [reachLow, Math.min(reachHigh, previousY - separation)],
      [Math.max(reachLow, previousY + separation), reachHigh]
    ], unitRandom);
    // A window narrower than the separation band leaves nothing to carve; take
    // the whole window rather than refusing to place a Gate.
    return sampled === null ? reachLow + unitRandom * (reachHigh - reachLow) : sampled;
  }

  function createSliceState(options = {}) {
    return {
      version: SLICE_VERSION,
      runId: String(options.runId || `gate_${Date.now().toString(36)}`),
      startedAt: options.startedAt || new Date().toISOString(),
      endedAt: null,
      endReason: null,
      enabled: true,
      rite: 'HEX',
      gatesCleared: 0,
      bandIndex: 0,
      gnosis: 0,
      gnosisCapacity: GNOSIS_CAPACITY,
      riskStreak: 0,
      timidGates: 0,
      gateReady: false,
      gateOffers: 0,
      gateEntries: 0,
      gateBanks: 0,
      voidAttempts: 0,
      voidSurvivals: 0,
      voidDeaths: 0,
      currentWager: 0,
      scoreBreakdown: {
        gate: 0,
        risk: 0,
        streak: 0,
        nearMiss: 0,
        bank: 0,
        void: 0
      },
      lastClear: null,
      events: []
    };
  }

  function cloneState(state) {
    return JSON.parse(JSON.stringify(state || createSliceState()));
  }

  function applyGateClearState(state, options = {}) {
    const next = cloneState(state);
    const classification = options.classification || classifyGateClear(options);
    const family = String(options.family || 'safe').toLowerCase();
    const riskActive = options.riskActive !== false;
    const nearMissThreshold = Math.max(0, finiteNumber(Number(options.nearMissThreshold), NEAR_MISS_PX));
    const isRisk = riskActive && (classification.zone === 'risk-top' || classification.zone === 'risk-bottom');
    const isNearMiss = classification.minimumClearance >= 0 && classification.minimumClearance < nearMissThreshold;
    let gnosisGained = 0;
    let gnosisDecayed = 0;
    let bonusScore = 0;
    let precisionBonus = 0;

    next.gatesCleared += 1;
    next.scoreBreakdown.gate += 1;
    next.bandIndex = getBandIndex(next.gatesCleared);

    if (isRisk) {
      gnosisGained = familyWeight(family);
      next.gnosis = roundHalf(Math.min(next.gnosisCapacity, next.gnosis + gnosisGained));
      next.riskStreak += 1;
      next.timidGates = 0;
      next.scoreBreakdown.risk += 2;
      bonusScore += 2;
      precisionBonus = streakBonus(next.riskStreak);
      next.scoreBreakdown.streak += precisionBonus;
      bonusScore += precisionBonus;
    } else {
      next.riskStreak = 0;
      if (riskActive) {
        next.timidGates += 1;
        if (next.timidGates >= 3 && next.gnosis > 0) {
          gnosisDecayed = Math.min(1, next.gnosis);
          next.gnosis = roundHalf(Math.max(0, next.gnosis - gnosisDecayed));
          next.timidGates = 0;
        }
      }
    }

    if (isNearMiss) {
      next.scoreBreakdown.nearMiss += 1;
      bonusScore += 1;
    }

    if (next.gnosis >= next.gnosisCapacity) next.gateReady = true;

    const clearRecord = {
      gateNumber: next.gatesCleared,
      family,
      zone: classification.zone,
      minimumClearance: Number(classification.minimumClearance.toFixed(3)),
      riskActive,
      gnosisGained,
      gnosisDecayed,
      gnosis: next.gnosis,
      precisionBonus,
      nearMiss: isNearMiss,
      bonusScore,
      gateReady: next.gateReady,
      bandIndex: next.bandIndex,
      band: BANDS[next.bandIndex].name
    };

    next.lastClear = clearRecord;
    next.events.push({ type: 'gate-clear', ...clearRecord });
    if (next.events.length > 120) next.events.splice(0, next.events.length - 120);

    return { state: next, result: clearRecord };
  }

  function offerGateState(state, offer = {}) {
    const next = cloneState(state);
    next.gateReady = false;
    next.gateOffers += 1;
    const record = {
      type: 'gate-offer',
      offerNumber: next.gateOffers,
      gnosis: next.gnosis,
      frame: Math.max(0, Math.floor(finiteNumber(Number(offer.frame), 0))),
      y: finiteNumber(Number(offer.y), 0)
    };
    next.events.push(record);
    return { state: next, result: record };
  }

  function bankGateState(state) {
    const next = cloneState(state);
    const wager = roundHalf(next.gnosis);
    const reward = Math.round(wager * BANK_MULTIPLIER);
    next.gnosis = 0;
    next.gateBanks += 1;
    next.scoreBreakdown.bank += reward;
    next.events.push({ type: 'gate-bank', wager, reward, bankNumber: next.gateBanks });
    return { state: next, result: { wager, reward } };
  }

  function enterGateState(state) {
    const next = cloneState(state);
    const wager = roundHalf(next.gnosis);
    next.gnosis = 0;
    next.gateEntries += 1;
    next.voidAttempts += 1;
    next.currentWager = wager;
    next.events.push({ type: 'gate-enter', wager, entryNumber: next.gateEntries });
    return { state: next, result: { wager } };
  }

  function completeVoidState(state, survivedSteps = VOID_DURATION_STEPS) {
    const next = cloneState(state);
    const wager = roundHalf(next.currentWager);
    const durationFraction = clamp(
      finiteNumber(Number(survivedSteps), 0) / VOID_DURATION_STEPS,
      0,
      1
    );
    const reward = Math.round(wager * VOID_MULTIPLIER * durationFraction);
    next.currentWager = 0;
    next.voidSurvivals += 1;
    next.scoreBreakdown.void += reward;
    next.events.push({ type: 'void-survived', wager, reward, durationFraction });
    return { state: next, result: { wager, reward, durationFraction } };
  }

  function failVoidState(state, survivedSteps = 0) {
    const next = cloneState(state);
    const wager = roundHalf(next.currentWager);
    next.currentWager = 0;
    next.voidDeaths += 1;
    next.events.push({
      type: 'void-death',
      wager,
      survivedSteps: Math.max(0, Math.floor(finiteNumber(Number(survivedSteps), 0)))
    });
    return { state: next, result: { wager } };
  }

  function gateEntryRate(state) {
    const offers = Math.max(0, Math.floor(finiteNumber(Number(state?.gateOffers), 0)));
    const entries = Math.max(0, Math.floor(finiteNumber(Number(state?.gateEntries), 0)));
    return offers > 0 ? entries / offers : null;
  }

  function safeStorageRead() {
    try {
      const raw = root.localStorage?.getItem?.(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, HISTORY_LIMIT) : [];
    } catch (_error) {
      return [];
    }
  }

  function safeStorageWrite(records) {
    try {
      root.localStorage?.setItem?.(STORAGE_KEY, JSON.stringify(records.slice(0, HISTORY_LIMIT)));
    } catch (_error) {}
  }

  function queryEnabled(locationLike = root.location) {
    if (!locationLike) return false;
    try {
      return new URLSearchParams(locationLike.search || '').get('gateSlice') === REQUIRED_QUERY_VALUE;
    } catch (_error) {
      return false;
    }
  }

  function dependenciesReady() {
    return (
      typeof Game !== 'undefined' &&
      typeof GameState !== 'undefined' &&
      typeof Pillar !== 'undefined' &&
      Boolean(Game.prototype.__collisionTruthRuntimeInstalled) &&
      Boolean(Game.prototype.__obstacleGrammarRuntimeInstalled) &&
      Boolean(root.__SEX_MAGICK_COLLISION__) &&
      Boolean(root.__SEX_MAGICK_PATTERNS__)
    );
  }

  function ensureStyle() {
    if (document.getElementById('sex-magick-gate-slice-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-gate-slice-style';
    style.textContent = `
      #gate-slice-hud {
        position: fixed;
        top: max(12px, env(safe-area-inset-top));
        left: 50%;
        transform: translateX(-50%);
        z-index: 28;
        width: min(330px, calc(100vw - 120px));
        pointer-events: none;
        font: 10px/1.2 'Orbitron', monospace;
        letter-spacing: 1.5px;
        color: #e9fdff;
        text-shadow: 0 0 8px #00e5ff;
      }
      #gate-slice-hud[hidden] { display: none !important; }
      .gate-slice-row { display:flex; justify-content:space-between; gap:12px; margin-bottom:5px; }
      .gate-slice-meter {
        height: 7px;
        overflow: hidden;
        border: 1px solid rgba(0,229,255,.55);
        background: rgba(0,0,0,.68);
        box-shadow: 0 0 10px rgba(0,229,255,.2);
      }
      #gate-slice-meter-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #00e5ff, #f8fbff);
        transition: width .12s linear;
      }
      #gate-slice-telegraph {
        position: fixed;
        left: 50%;
        /* D-065: the shared transient-notice band. Every transient message in
           the game sits at exactly this offset and notice-slot.js guarantees
           only one is visible at a time, so a single line of text at a small
           fixed offset can never migrate into the corridor - which is what
           D-064's "stack them upward" approach did (304px from the bottom of a
           643px viewport is 47% up: the middle). Clears the persistent
           #sex-magick-missions list (bottom:46px, up to ~70px tall). */
        bottom: max(128px, calc(env(safe-area-inset-bottom) + 122px));
        transform: translateX(-50%);
        z-index: 33;
        width: min(560px, calc(100vw - 30px));
        /* D-066: was a 1px box with a solid slab behind it. The owner called the
           box "unnecessary" and it is - a hard rectangle over the play field
           reads as a modal, not a whisper. An edge-faded scrim keeps the text
           legible over any artwork while having no perceivable edges. */
        padding: 7px 16px;
        border: none;
        background: linear-gradient(90deg,
          transparent, rgba(0,0,0,.72) 18%, rgba(0,0,0,.72) 82%, transparent);
        color: #eaffff;
        text-align: center;
        font: 12px/1.55 'Orbitron', monospace;
        letter-spacing: 3px;
        pointer-events: none;
        text-shadow: 0 0 12px #00e5ff;
        --gate-slice-telegraph-flash: #00e5ff;
      }
      #gate-slice-telegraph[hidden] { display:none !important; }
      #gate-slice-telegraph.gate-slice-telegraph-flash { animation: gate-slice-telegraph-flash .4s ease-out; }
      @keyframes gate-slice-telegraph-flash {
        0% {
          color: var(--gate-slice-telegraph-flash);
          text-shadow: 0 0 20px var(--gate-slice-telegraph-flash);
        }
        100% {
          color: #eaffff;
          text-shadow: 0 0 12px #00e5ff;
        }
      }
      html.sex-magick-reduced-motion #gate-slice-telegraph.gate-slice-telegraph-flash { animation: none; }
      html.sex-magick-reduced-motion #gate-slice-meter-fill { transition: none; }
      #gate-slice-local-note {
        margin-top: 10px;
        color: #00e5ff;
        font: 10px/1.4 'Orbitron', monospace;
        letter-spacing: 1.5px;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureHud() {
    ensureStyle();
    let hud = document.getElementById('gate-slice-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'gate-slice-hud';
      hud.hidden = true;
      hud.innerHTML = `
        <div class="gate-slice-row"><span id="gate-slice-band">MALKUTH</span><span id="gate-slice-streak"></span></div>
        <div class="gate-slice-row"><span>GNOSIS</span><span id="gate-slice-value">0 / ${GNOSIS_CAPACITY}</span></div>
        <div class="gate-slice-meter"><div id="gate-slice-meter-fill"></div></div>
        <div class="gate-slice-row" style="margin-top:5px"><span id="gate-slice-status">SEEK THE EDGE</span><span id="gate-slice-void"></span></div>
      `;
      document.body.appendChild(hud);
    }

    let telegraph = document.getElementById('gate-slice-telegraph');
    if (!telegraph) {
      telegraph = document.createElement('div');
      telegraph.id = 'gate-slice-telegraph';
      telegraph.hidden = true;
      document.body.appendChild(telegraph);
    }

    return { hud, telegraph };
  }

  // Unreserved against M7: hazard pink/Hexagram cyan/Monas gold/ward purple are all
  // spoken for elsewhere, so every kind below except 'danger' (which deliberately
  // reuses hazard pink - a wager lost *is* a danger event) picks a colour none of
  // those systems already own.
  const TELEGRAPH_FLASH_COLORS = {
    info: '#00e5ff',
    progress: '#8f7bff',
    bonus: '#ffb347',
    success: '#5dffb0',
    danger: '#ff2f6d'
  };


  /**
   * D-065: hand the shared transient-notice slot to this element before showing
   * it, so no two notices are ever on screen at once. Optional by design - the
   * module is a plain script and a page that somehow loads without it still
   * announces, it just loses the mutual exclusion.
   */
  function claimNoticeSlot(id) {
    try { root.SexMagickNoticeSlot?.register(id); root.SexMagickNoticeSlot?.claim(id); }
    catch (_error) { /* never let slot arbitration break an announce */ }
  }

  function setTelegraph(text, durationMs = 1100, kind = 'info') {
    const element = document.getElementById('gate-slice-telegraph');
    if (!element) return;
    element.textContent = text;
    claimNoticeSlot('gate-slice-telegraph');
    element.hidden = false;
    element.style.setProperty('--gate-slice-telegraph-flash', TELEGRAPH_FLASH_COLORS[kind] || TELEGRAPH_FLASH_COLORS.info);
    // Restart the flash animation even if a telegraph of the same kind is already
    // mid-flash - remove the class, force a reflow, then re-add it.
    element.classList.remove('gate-slice-telegraph-flash');
    void element.offsetWidth;
    element.classList.add('gate-slice-telegraph-flash');
    clearTimeout(element.__gateSliceTimer);
    element.__gateSliceTimer = setTimeout(() => { element.hidden = true; }, durationMs);
  }

  function renderHud(gameInstance) {
    const { hud } = ensureHud();
    const state = gameInstance?.gateSliceState;
    const active = Boolean(state && gameInstance.gameMode === 'HEX' && gameInstance.state !== GameState.START);
    hud.hidden = !active;
    if (!active) return;

    const band = BANDS[state.bandIndex] || BANDS[0];
    const fill = clamp(state.gnosis / state.gnosisCapacity, 0, 1) * 100;
    document.getElementById('gate-slice-band').textContent = band.name;

    // `riskStreak` counts consecutive clears taken through the risk zone, and it
    // resets on any centred clear - so on a readout that is always on screen it
    // reads zero for most of a run, and the owner reasonably asked what it was
    // for. It is shown now only while it is actually paying, which is where
    // `streakBonus` starts (3), and it names the bonus rather than the count, so
    // the number on screen is one the player can act on. The mechanic itself is
    // unchanged: the bonus is scored either way, it simply stops being silent.
    const streakPay = streakBonus(state.riskStreak);
    document.getElementById('gate-slice-streak').textContent =
      streakPay > 0 ? `EDGE ${state.riskStreak} · +${streakPay}` : '';
    document.getElementById('gate-slice-value').textContent = `${state.gnosis.toFixed(1).replace('.0', '')} / ${state.gnosisCapacity}`;
    document.getElementById('gate-slice-meter-fill').style.width = `${fill}%`;

    let status = band.riskActive ? 'COURT THE EDGE' : 'LEARN THE CURRENT';
    if (state.gateReady) status = 'THE GATE APPROACHES';
    if (gameInstance.gateSliceOffer) status = 'ENTER OR BANK';
    if (gameInstance.__gateSliceVoidActive) status = 'SURVIVE THE VOID';
    document.getElementById('gate-slice-status').textContent = status;

    const voidLabel = document.getElementById('gate-slice-void');
    if (gameInstance.__gateSliceVoidActive) {
      voidLabel.textContent = `${Math.max(0, gameInstance.voidTimer / 60).toFixed(1)}s × ${state.currentWager}`;
    } else {
      voidLabel.textContent = `GATES ${state.gatesCleared}`;
    }
  }

  // One seeded stream per run, derived from the run id, so Gate placement is
  // reproducible from a recorded run rather than dependent on Math.random.
  function nextGateRandom(gameInstance) {
    if (typeof gameInstance.__gateSliceRandom !== 'function') {
      const grammar = root.SexMagickObstacleGrammar;
      const runId = gameInstance.gateSliceState?.runId || '';
      if (typeof grammar?.createSeededRandom === 'function' && typeof grammar?.hashStringToSeed === 'function') {
        gameInstance.__gateSliceRandom = grammar.createSeededRandom(grammar.hashStringToSeed(runId));
      } else {
        gameInstance.__gateSliceRandom = Math.random;
      }
    }
    return gameInstance.__gateSliceRandom();
  }

  function createGateOffer(gameInstance) {
    gateSerial += 1;
    const spawnX = gameInstance.canvas.width + 68;
    const playerX = finiteNumber(Number(gameInstance.player?.x), 0);
    const speed = Math.max(0.1, finiteNumber(Number(gameInstance.gameSpeed), 1));
    const y = chooseGateY({
      canvasHeight: gameInstance.canvas.height,
      playerY: gameInstance.player?.y,
      previousY: gameInstance.__gateSlicePreviousOfferY,
      travelFrames: Math.max(1, (spawnX - playerX) / speed),
      unitRandom: nextGateRandom(gameInstance)
    });
    gameInstance.__gateSlicePreviousOfferY = y;
    const offer = {
      serial: gateSerial,
      x: spawnX,
      y,
      outerRadius: GATE_OUTER_RADIUS,
      entryRadius: GATE_ENTRY_RADIUS,
      // Retained as an alias so older evidence readers keep working. It now
      // reports the true aperture rather than a decorative inner circle.
      innerRadius: GATE_ENTRY_RADIUS,
      pulse: 0,
      resolved: false,
      offeredAtFrame: gameInstance.frames
    };

    const offered = offerGateState(gameInstance.gateSliceState, { frame: gameInstance.frames, y });
    gameInstance.gateSliceState = offered.state;
    gameInstance.gateSliceOffer = offer;
    setTelegraph('THE GATE OPENS  ·  ENTER TO WAGER  /  PASS TO BANK', 1500, 'info');
    try {
      if (gameInstance.settings.sfx && typeof SFX?.playTone === 'function') {
        SFX.playTone(220, 'sine', 0.18, 0.06);
        setTimeout(() => SFX.playTone(440, 'sine', 0.16, 0.05), 110);
      }
    } catch (_error) {}
    renderHud(gameInstance);
    return offer;
  }

  /**
   * HEX's own glitch signatures, gated the same way `installEffectPolicy` gates
   * `triggerOrbGlitch`/`triggerLevelUpGlitch`/`triggerDeathGlitch`/
   * `triggerGlitchEffect` in collision-runtime.js - reduced motion means no effect
   * at all, low flash means a shorter one - except these are raw `GlitchFX.trigger`
   * calls the policy wrap never reaches (it only wraps those named methods), so the
   * check has to happen here instead.
   */
  function triggerHexGlitch(duration, type, tint) {
    const accessibility = root.__SEX_MAGICK_COLLISION__?.getAccessibility?.() || {};
    if (accessibility.reducedMotion) return;
    const effectiveDuration = accessibility.lowFlash ? Math.min(duration, 70) : duration;
    try { GlitchFX.trigger(effectiveDuration, type, tint); } catch (_error) {}
  }

  function drawGateOffer(ctx, offer, gameInstance) {
    if (!offer || offer.resolved) return;
    const reduced = Boolean(root.__SEX_MAGICK_COLLISION__?.getAccessibility?.().reducedMotion);
    offer.pulse += reduced ? 0 : 0.08;
    const pulse = reduced ? 1 : 1 + Math.sin(offer.pulse) * 0.08;
    ctx.save();
    ctx.translate(offer.x, offer.y);
    ctx.rotate(reduced ? 0 : gameInstance.frames * 0.01);
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 4;
    optimizedShadow.apply(ctx, reduced ? 8 : 30, '#00e5ff');
    ctx.beginPath();
    ctx.arc(0, 0, offer.outerRadius * pulse, 0, Math.PI * 2);
    ctx.stroke();
    // The bright circle is the aperture itself, not decoration. Anything that
    // changes the entry radius must change this arc with it.
    const entryRadius = finiteNumber(Number(offer.entryRadius), GATE_ENTRY_RADIUS);
    ctx.strokeStyle = '#f8fbff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, entryRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.rotate(Math.PI / 6);
    for (let index = 0; index < 6; index += 1) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(entryRadius + 5, 0);
      ctx.lineTo(offer.outerRadius - 5, 0);
      ctx.stroke();
    }
    ctx.restore();
    optimizedShadow.clear(ctx);
  }

  function drawRiskZones(ctx, pillar, gameInstance) {
    if (!pillar || !gameInstance?.gateSliceState) return;
    const band = BANDS[gameInstance.gateSliceState.bandIndex] || BANDS[0];
    const geometry = classifyGateClear({
      playerY: pillar.top + pillar.gap / 2,
      gapTop: pillar.top,
      gapSize: pillar.gap,
      playerHalf: EFFECTIVE_PLAYER_HALF
    });
    const left = pillar.x + 4;
    const right = pillar.x + pillar.w - 4;
    const activeAlpha = band.riskActive ? 0.62 : 0.18;
    ctx.save();
    ctx.globalAlpha = activeAlpha;
    ctx.strokeStyle = band.riskActive ? '#00e5ff' : '#8a9aa0';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    for (const y of [geometry.topRiskBoundary, geometry.bottomRiskBoundary]) {
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  function applyBand(gameInstance, announce = false) {
    const state = gameInstance.gateSliceState;
    if (!state) return null;
    const band = BANDS[state.bandIndex] || BANDS[0];
    const matching = gameInstance.gameLevels.find(level => String(level.name).toUpperCase() === band.name);
    if (matching) {
      // Everything visual reads currentLevelIdx, not the band: drawLevelArtwork,
      // drawScene's tunnelColor, and the accent wash all look up
      // gameLevels[currentLevelIdx]. Until this assignment existed the pointer sat
      // at 0 for an entire session, so ascending the Tree changed the HUD text and
      // nothing else - roughly 24 band changes in a ten-minute session, none of
      // them visible.
      const matchedIndex = gameInstance.gameLevels.indexOf(matching);
      if (matchedIndex >= 0) gameInstance.currentLevelIdx = matchedIndex;
      document.getElementById('levelUi').textContent = matching.name;
      document.getElementById('levelUi').style.color = matching.accent;
      document.getElementById('levelUi').style.textShadow = `0 0 15px ${matching.accent}`;
      gameInstance.root.style.setProperty('--primary', matching.accent);
    } else {
      document.getElementById('levelUi').textContent = band.name;
    }
    gameInstance.gameSpeed = gameInstance.__gateSliceVoidActive
      ? voidSpeedFor(band.speed)
      : band.speed;
    gameInstance.currentBaseGap = band.gap;
    if (announce) {
      setTelegraph(`${band.name}  ·  ${band.riskActive ? 'THE EDGE AWAKENS' : 'LEARN THE CURRENT'}`, 950, 'progress');
      try { if (gameInstance.settings.sfx) SFX.levelUp(); } catch (_error) {}
    }
    renderHud(gameInstance);
    return matching || null;
  }

  /**
   * The background gallery.
   *
   * Bands own progression - difficulty, speed, gap, the Sephirah name - and there
   * are only eight of them, drawn from the eleven Sephirah-named images. The
   * original game cycled the whole ~71-image pool as you played, and
   * `prepareOrderedLevels` narrowing `gameLevels` to eight is what removed that.
   *
   * So the picture gets its own rotation, independent of the band, over the full
   * pool. The index is derived from `gatesCleared` rather than tracked, so it
   * cannot drift out of sync and resets with the run for free.
   */
  const GALLERY_ADVANCE_GATES = 4;
  let gallery = [];

  function buildGallery() {
    // Referenced, never copied: `preloadAllImages` mutates `img`/`loaded` on the
    // pool entries themselves, so a copy taken at startGame could hold a stale
    // `loaded: false` for anything that finished loading later.
    const pool = typeof MASTER_POOL !== 'undefined' && Array.isArray(MASTER_POOL) ? MASTER_POOL : [];
    const shuffled = [...pool];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    gallery = shuffled;
    return gallery;
  }

  function galleryEntryFor(gatesCleared) {
    if (!gallery.length) return null;
    const step = Math.floor(Math.max(0, finiteNumber(Number(gatesCleared), 0)) / GALLERY_ADVANCE_GATES);
    return gallery[step % gallery.length] || null;
  }

  function currentGalleryEntry(gameInstance) {
    const state = gameInstance?.gateSliceState;
    if (!state) return null;
    return galleryEntryFor(state.gatesCleared);
  }

  /**
   * The pentagram bonus corridor.
   *
   * The original ran one of these between levels: obstacles stopped and spinning
   * pentagrams flew past at +10 each. M16 reused the name "Void" for the Gate
   * wager and the bonus section was lost with it - `pentagrams.push` sits inside
   * `if (this.voidMode ...)`, and the Gate slice's Void branch clears that flag so
   * pillars spawn instead, making the line unreachable in HEX mode.
   *
   * This is a separate state from `__gateSliceVoidActive` on purpose: the wager
   * stays exactly as it is, and the reward corridor comes back alongside it.
   */
  // The original ran a bonus every 5 levels, and levels advanced every 5 score -
  // so roughly every 25 pillars. Gates cleared are this game's pillars (367 in the
  // owner's ten-minute session, about one every 1.6s), which makes 25 the faithful
  // translation: a corridor every ~40s of play. Every 5 would have handed the
  // player a bonus every eight seconds.
  const BONUS_EVERY_GATES = 25;
  const BONUS_DURATION_FRAMES = 5 * 60;

  /**
   * `?bonusEvery=N` - QA and playtest only.
   *
   * A corridor every 25 gates is right for play and wrong for testing: checking
   * the star section meant clearing 25 gates first, every time, which is about
   * forty seconds of unrelated play before the thing under test appears. That
   * cost is what makes a section go unverified. Clamped to at least 1 and
   * ignored when absent, so the shipped cadence is what a normal load gets.
   */
  function bonusEveryGates() {
    try {
      const raw = new URLSearchParams(root.location?.search || '').get('bonusEvery');
      if (raw === null) return BONUS_EVERY_GATES;
      const parsed = Math.floor(Number(raw));
      return Number.isFinite(parsed) && parsed >= 1 ? parsed : BONUS_EVERY_GATES;
    } catch (_error) {
      return BONUS_EVERY_GATES;
    }
  }

  function tickBonusCorridor(gameInstance) {
    const state = gameInstance.gateSliceState;
    if (!state) return false;

    if (gameInstance.__bonusCorridorFrames > 0) {
      gameInstance.__bonusCorridorFrames -= 1;
      if (gameInstance.__bonusCorridorFrames === 0) setTelegraph('THE PATH RESUMES', 700, 'info');
      return gameInstance.__bonusCorridorFrames > 0;
    }

    // Never inside the wager or while an offer is on screen - those are the
    // player's decision moments and a bonus corridor would talk over them.
    if (gameInstance.__gateSliceVoidActive || gameInstance.gateSliceOffer) return false;

    const gates = Math.max(0, Math.floor(finiteNumber(Number(state.gatesCleared), 0)));
    if (gates <= 0 || gates % bonusEveryGates() !== 0) return false;
    if (gameInstance.__bonusCorridorLastGate === gates) return false;

    gameInstance.__bonusCorridorLastGate = gates;
    gameInstance.__bonusCorridorFrames = BONUS_DURATION_FRAMES;
    setTelegraph('GATHER THE SIGILS', 900, 'bonus');
    return true;
  }

  function resetBonusCorridor(gameInstance) {
    gameInstance.__bonusCorridorFrames = 0;
    gameInstance.__bonusCorridorLastGate = -1;
    gameInstance.pentagrams = [];
  }

  function prepareOrderedLevels(gameInstance, originalPrepareLevels) {
    originalPrepareLevels.call(gameInstance);
    const available = [...gameInstance.gameLevels];
    const selected = [];
    for (const band of BANDS) {
      const match = available.find(level => String(level.name).toUpperCase() === band.name);
      if (match) selected.push({ ...match, threshold: band.gateThreshold });
    }
    while (selected.length < BANDS.length && available[selected.length]) {
      selected.push({ ...available[selected.length], threshold: BANDS[selected.length].gateThreshold });
    }
    gameInstance.gameLevels = selected;
  }

  function updateOffer(gameInstance) {
    const offer = gameInstance.gateSliceOffer;
    if (!offer || offer.resolved) return;
    offer.x -= gameInstance.gameSpeed;
    const player = gameInstance.player;
    if (!player) return;
    const distance = Math.hypot(player.x - offer.x, player.y - offer.y);
    const entryRadius = finiteNumber(Number(offer.entryRadius), GATE_ENTRY_RADIUS);
    if (distance <= entryRadius) {
      offer.resolved = true;
      const entered = enterGateState(gameInstance.gateSliceState);
      gameInstance.gateSliceState = entered.state;
      gameInstance.gateSliceOffer = null;
      gameInstance.startVoidMode(entered.result.wager);
      return;
    }
    if (offer.x + offer.outerRadius < player.x - player.r) {
      offer.resolved = true;
      const banked = bankGateState(gameInstance.gateSliceState);
      gameInstance.gateSliceState = banked.state;
      gameInstance.gateSliceOffer = null;
      gameInstance.score += banked.result.reward;
      const scoreUi = document.getElementById('scoreUi');
      if (scoreUi) scoreUi.textContent = String(gameInstance.score);
      setTelegraph(`GNOSIS BANKED  +${banked.result.reward}`, 850, 'success');
      try { if (gameInstance.settings.sfx) SFX.collect(); } catch (_error) {}
      renderHud(gameInstance);
    }
  }

  function isSpawnFrame(gameInstance) {
    try {
      return Boolean(root.SexMagickObstacleGrammar?.isSpawnFrame?.(gameInstance, CONFIG));
    } catch (_error) {
      const rate = Math.max(20, Math.floor(CONFIG.PILLAR_SPAWN_BASE / (gameInstance.gameSpeed / 3)));
      return gameInstance.frames > 0 && gameInstance.frames % rate === 0;
    }
  }

  function withSpawnSuppressed(callback) {
    const previous = CONFIG.PILLAR_SPAWN_BASE;
    CONFIG.PILLAR_SPAWN_BASE = Number.MAX_SAFE_INTEGER;
    try { return callback(); } finally { CONFIG.PILLAR_SPAWN_BASE = previous; }
  }

  // Records, for every live pillar, the player's position at the frame of closest
  // horizontal approach. Must run every frame after the pillars and the player
  // have moved.
  //
  // Without this, `handleClearedPillars` classified a clear using `player.y` read
  // once the pillar was already marked passed. At fall speeds up to
  // CONFIG.MAX_FALL_SPEED that samples the player well below where they actually
  // threaded the gap, which misattributes the risk zone of every clear and was
  // the sole cause of the four phantom "unsafe crossings" in the 2026-08-12
  // pilot. Pillar geometry breathes too, so `top` and `gap` are captured in the
  // same instant as `playerY` rather than read live later.
  function samplePillarApproaches(gameInstance) {
    const player = gameInstance.player;
    if (!player) return;
    const playerX = finiteNumber(Number(player.x), 0);
    for (const pillar of gameInstance.obstacles || []) {
      const centre = finiteNumber(Number(pillar.x), 0) + finiteNumber(Number(pillar.w), 0) / 2;
      const dx = Math.abs(playerX - centre);
      const best = pillar.__gateSliceApproach;
      if (best && dx >= best.dx) continue;
      pillar.__gateSliceApproach = {
        dx,
        playerY: finiteNumber(Number(player.y), 0),
        gapTop: finiteNumber(Number(pillar.top), 0),
        gapSize: finiteNumber(Number(pillar.gap), 0)
      };
    }
  }

  function handleClearedPillars(gameInstance, previouslyMarked) {
    const state = gameInstance.gateSliceState;
    if (!state) return;
    for (const pillar of gameInstance.obstacles) {
      if (!pillar.marked || previouslyMarked.has(pillar)) continue;
      // Classify from the closest-approach snapshot. Live values are only a
      // fallback for a pillar that was somehow marked before it was ever sampled.
      const approach = pillar.__gateSliceApproach;
      const classification = classifyGateClear({
        playerY: approach ? approach.playerY : gameInstance.player?.y,
        gapTop: approach ? approach.gapTop : pillar.top,
        gapSize: approach ? approach.gapSize : pillar.gap,
        playerHalf: EFFECTIVE_PLAYER_HALF
      });
      const band = BANDS[state.bandIndex] || BANDS[0];
      const applied = applyGateClearState(gameInstance.gateSliceState, {
        classification,
        family: pillar.patternFamily || 'safe',
        riskActive: band.riskActive,
        nearMissThreshold: NEAR_MISS_PX
      });
      gameInstance.gateSliceState = applied.state;
      if (applied.result.bonusScore > 0) {
        gameInstance.score += applied.result.bonusScore;
        const scoreUi = document.getElementById('scoreUi');
        if (scoreUi) scoreUi.textContent = String(gameInstance.score);
      }
      if (applied.result.gnosisGained > 0) {
        try {
          if (gameInstance.settings.sfx && typeof SFX?.playTone === 'function') {
            const frequency = 280 + Math.round(gameInstance.gateSliceState.gnosis * 22);
            SFX.playTone(frequency, 'sine', 0.06, 0.035);
          }
        } catch (_error) {}
      }
      if (applied.result.nearMiss) {
        // The graze pass is HEX's whole risk model, and until now it had no visual
        // signature of its own beyond the score tick - a harder-edged tear than the
        // ambient rgbSplit, in hazard pink, so the edge itself reads as felt.
        const accessibility = root.__SEX_MAGICK_COLLISION__?.getAccessibility?.() || {};
        if (!accessibility.reducedMotion && (!gameInstance.screenFlash || !gameInstance.screenFlash.active)) {
          gameInstance.screenFlash = {
            active: true, duration: 8, color: '#ff2f6d',
            intensity: accessibility.lowFlash ? 0.08 : 0.14
          };
        }
        triggerHexGlitch(140, 'shear', '#ff2f6d');
      }
      if (applied.result.gateReady) setTelegraph('GNOSIS FULL  ·  THE GATE APPROACHES', 1050, 'progress');
      const nextBandIndex = getBandIndex(gameInstance.gateSliceState.gatesCleared);
      if (nextBandIndex !== state.bandIndex) {
        gameInstance.gateSliceState.bandIndex = nextBandIndex;
        applyBand(gameInstance, true);
      }
      renderHud(gameInstance);
    }
  }

  function finishRun(gameInstance, reason) {
    if (!gameInstance?.gateSliceState || gameInstance.gateSliceState.endedAt) return;
    const summary = cloneState(gameInstance.gateSliceState);
    summary.endedAt = new Date().toISOString();
    summary.endReason = reason;
    summary.finalScore = Number(gameInstance.score || 0);
    summary.gateEntryRate = gateEntryRate(summary);
    summary.inputBufferFrames = root.__SEX_MAGICK_COLLISION__?.getInputBufferFrames?.() ?? null;
    summary.inputStats = root.__SEX_MAGICK_COLLISION__?.getInputStats?.() || null;
    summary.events = summary.events.slice(-80);
    gameInstance.gateSliceState.endedAt = summary.endedAt;
    gameInstance.gateSliceState.endReason = reason;
    history.unshift(summary);
    history = history.slice(0, HISTORY_LIMIT);
    safeStorageWrite(history);
  }

  // `installLocalOnlyLeaderboard()` stood here. It overwrote `Leaderboard.submit`
  // to stop the LootLocker client shipping an arbitrary integer to a shared board
  // (D-004, M16). D-044 removed that client from index.html outright, so there is
  // nothing left to neuter - the object is inert at its source now, which is a
  // stronger guarantee than an override that only applied when this slice loaded.
  // The preflight in fixed-step-prototype.js still declares the invariant and still
  // owns the status line; the global board updates it when it is the one in play.

  function configureMenu() {
    const monas = document.getElementById('startMonasBtn');
    if (monas) {
      monas.disabled = false;
      monas.textContent = 'RITE OF MONAS — THE GLIDE';
      monas.title = 'Hold to rise, release to fall. Hold the centre to build Coherence.';
    }
    const hex = document.getElementById('startHexBtn');
    if (hex) {
      hex.textContent = 'RITE OF HEXAGRAM — THE GATE';
      hex.title = 'Sharp, precise, unforgiving. Court the edge to summon the Gate.';
    }
    // The board itself is no longer hidden - the Rite board fills it from local
    // run history (D-040). Only the network connection test stays gone, because
    // shared submission is still an open owner decision.
    const testButton = document.querySelector('button[onclick="testLeaderboardConnection()"]');
    if (testButton) testButton.hidden = true;
    const menuButtons = document.getElementById('menuButtons');
    if (menuButtons && !document.getElementById('gate-slice-local-note')) {
      const note = document.createElement('div');
      note.id = 'gate-slice-local-note';
      note.textContent = 'EXPERIMENTAL HEXAGRAM SLICE · LOCAL SCORE ONLY';
      menuButtons.appendChild(note);
    }
  }

  function install() {
    if (installed || Game.prototype.__gateSliceRuntimeInstalled) return root.__SEX_MAGICK_GATE_SLICE__;
    if (!queryEnabled()) return null;
    if (!dependenciesReady()) return null;

    installed = true;
    history = safeStorageRead();
    ensureHud();
    configureMenu();

    const originalPrepareLevels = Game.prototype.prepareLevels;
    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalReturnToMenu = Game.prototype.returnToMenu;
    const originalGameOver = Game.prototype.gameOver;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalDrawGameObjects = Game.prototype.drawGameObjects;
    const originalPillarDraw = Pillar.prototype.draw;
    const originalGetCurrentGap = Game.prototype.getCurrentGap;

    Game.prototype.prepareLevels = function prepareGateSliceLevels() {
      return prepareOrderedLevels(this, originalPrepareLevels);
    };

    Game.prototype.applyLevel = function applyGateSliceLevel() {
      if (!this.gateSliceState) return;
      applyBand(this, false);
    };

    Game.prototype.checkLevel = function checkGateSliceBand() {
      if (!this.gateSliceState) return;
      const nextBand = getBandIndex(this.gateSliceState.gatesCleared);
      if (nextBand !== this.gateSliceState.bandIndex) {
        this.gateSliceState.bandIndex = nextBand;
        const matching = applyBand(this, true);
        // The original score-based checkLevel() gave every level-up this
        // spectacle - shake, a freeze frame, an RGB-split glitch, a particle
        // burst, and haptics. Ascending a band replaced levelling as the visual
        // event, and it lost all of that in the rewrite; this restores it on the
        // one event the Gate slice actually has left. triggerLevelUpGlitch
        // already goes through the reduced-motion policy in
        // collision-runtime.js's installEffectPolicy, so nothing here needs to
        // re-check accessibility settings.
        this.shake = 12;
        this.hitStop = 3;
        this.triggerLevelUpGlitch();
        const burstColor = matching ? matching.accent : '#ffffff';
        for (let i = 0; i < 30; i += 1) {
          this.particles.push(new Particle(
            this.canvas.width / 2, this.canvas.height / 2,
            burstColor, 12,
            Math.random() > 0.5 ? 'hexagram' : 'triangle'
          ));
        }
        Haptics.levelUp();
      }
    };

    Game.prototype.getCurrentGap = function gateSliceGap() {
      const original = originalGetCurrentGap.call(this);
      if (!this.gateSliceState) return original;
      const band = BANDS[this.gateSliceState.bandIndex] || BANDS[0];
      const breathing = Math.sin(this.frames * 0.05) * 10;
      const base = band.gap + breathing;
      return this.__gateSliceVoidActive ? voidGapFor(base) : base;
    };

    Game.prototype.startGame = function startGateSlice(...args) {
      // MONAS was sealed here, and this line was the seal: returning without calling
      // the original meant pressing the button did nothing at all. The Gate slice
      // still owns HEX only - every override below guards on gateSliceState, which a
      // MONAS run never creates - so handing the other rite straight to the original
      // is all that unsealing takes. See D-041.
      if (this.gameMode !== 'HEX') return originalStartGame.apply(this, args);
      const result = originalStartGame.apply(this, args);
      currentRun = createSliceState({ runId: `gate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` });
      this.gateSliceState = currentRun;
      this.gateSliceOffer = null;
      this.__gateSliceVoidActive = false;
      this.__gateSliceVoidStartedAt = 0;
      // Reseed Gate placement from the new run id and forget the previous run's
      // last offer, so run N+1 does not inherit run N's separation constraint.
      this.__gateSliceRandom = null;
      this.__gateSlicePreviousOfferY = null;
      this.collectibles = [];
      // A fresh shuffle per run, so two runs do not walk the same picture order.
      buildGallery();
      resetBonusCorridor(this);
      applyBand(this, false);
      renderHud(this);
      return result;
    };

    Game.prototype.restartGame = function restartGateSlice(...args) {
      if (this.gateSliceState && !this.gateSliceState.endedAt) finishRun(this, 'retry');
      const result = originalRestartGame.apply(this, args);
      currentRun = createSliceState({ runId: `gate_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}` });
      this.gateSliceState = currentRun;
      this.gateSliceOffer = null;
      this.__gateSliceVoidActive = false;
      this.__gateSliceVoidStartedAt = 0;
      // Reseed Gate placement from the new run id and forget the previous run's
      // last offer, so run N+1 does not inherit run N's separation constraint.
      this.__gateSliceRandom = null;
      this.__gateSlicePreviousOfferY = null;
      this.collectibles = [];
      // A fresh shuffle per run, so two runs do not walk the same picture order.
      buildGallery();
      resetBonusCorridor(this);
      applyBand(this, false);
      renderHud(this);
      return result;
    };

    Game.prototype.startVoidMode = function startWageredVoid(wager = this.gateSliceState?.currentWager || 0) {
      if (!this.gateSliceState || this.__gateSliceVoidActive) return;
      this.__gateSliceVoidActive = true;
      this.__gateSliceVoidStartedAt = this.frames;
      this.voidMode = true;
      this.voidTimer = VOID_DURATION_STEPS;
      this.preVoidSpeed = (BANDS[this.gateSliceState.bandIndex] || BANDS[0]).speed;
      this.gameSpeed = voidSpeedFor(this.preVoidSpeed);
      this.gateSliceState.currentWager = roundHalf(wager);
      this.screenFlash = { active: true, duration: 16, color: '#00ffff', intensity: 0.32 };
      document.getElementById('game-container')?.classList.add('void-active');
      const levelUi = document.getElementById('levelUi');
      if (levelUi) {
        levelUi.textContent = 'THE VOID';
        levelUi.style.color = '#00ffff';
      }
      setTelegraph(`WAGER ACCEPTED  × ${this.gateSliceState.currentWager}`, 900, 'progress');
      try { if (this.settings.sfx) SFX.voidEnter(); } catch (_error) {}
      renderHud(this);
    };

    Game.prototype.endVoidMode = function endWageredVoid() {
      if (!this.gateSliceState || !this.__gateSliceVoidActive) return;
      const elapsed = Math.max(0, this.frames - this.__gateSliceVoidStartedAt);
      const completed = completeVoidState(this.gateSliceState, elapsed);
      this.gateSliceState = completed.state;
      this.score += completed.result.reward;
      const scoreUi = document.getElementById('scoreUi');
      if (scoreUi) scoreUi.textContent = String(this.score);
      this.__gateSliceVoidActive = false;
      this.voidMode = false;
      this.voidTimer = 0;
      this.gameSpeed = (BANDS[this.gateSliceState.bandIndex] || BANDS[0]).speed;
      document.getElementById('game-container')?.classList.remove('void-active');
      setTelegraph(`VOID SURVIVED  +${completed.result.reward}`, 1200, 'success');
      // The wager paying off deserves its own reading, distinct from an ordinary
      // band ascent - a bright sweep in the Hexagram's own reserved cyan.
      triggerHexGlitch(170, 'sweep', '#00e5ff');
      applyBand(this, false);
      renderHud(this);
    };

    Game.prototype.gameOver = function gameOverGateSlice(...args) {
      const wagerLost = Boolean(this.__gateSliceVoidActive && this.gateSliceState);
      if (wagerLost) {
        const elapsed = Math.max(0, this.frames - this.__gateSliceVoidStartedAt);
        const failed = failVoidState(this.gateSliceState, elapsed);
        this.gateSliceState = failed.state;
        this.__gateSliceVoidActive = false;
        this.voidMode = false;
        this.voidTimer = 0;
        this.gameSpeed = (BANDS[this.gateSliceState.bandIndex] || BANDS[0]).speed;
        document.getElementById('game-container')?.classList.remove('void-active');
        setTelegraph(`WAGER LOST  × ${failed.result.wager}`, 950, 'danger');
      }
      const previousState = this.state;
      const result = originalGameOver.apply(this, args);
      if (wagerLost) {
        // The original's own gameOver() just fired its generic 'death' rgbSplit via
        // triggerDeathGlitch - this fires after it specifically so the wager's own
        // harsher tear wins the frame instead of being overwritten by the generic one.
        triggerHexGlitch(190, 'shear', '#ff2f6d');
      }
      if (previousState !== GameState.GAME_OVER && this.state === GameState.GAME_OVER) {
        finishRun(this, 'death');
      }
      return result;
    };

    Game.prototype.returnToMenu = function returnGateSliceToMenu(...args) {
      if (this.gateSliceState && !this.gateSliceState.endedAt) finishRun(this, 'menu');
      const result = originalReturnToMenu.apply(this, args);
      this.gateSliceOffer = null;
      this.__gateSliceVoidActive = false;
      const hud = document.getElementById('gate-slice-hud');
      if (hud) hud.hidden = true;
      return result;
    };

    Game.prototype.updateGameObjects = function updateGateSliceObjects(...args) {
      if (!this.gateSliceState || this.gameMode !== 'HEX') return originalUpdateGameObjects.apply(this, args);

      const previouslyMarked = new Set(this.obstacles.filter(obstacle => obstacle.marked));
      const offerActive = Boolean(this.gateSliceOffer);
      const shouldSpawnOffer = this.gateSliceState.gateReady && !offerActive && !this.__gateSliceVoidActive && isSpawnFrame(this);
      const forceVoidSpawn = this.__gateSliceVoidActive;
      const bonusActive = tickBonusCorridor(this);
      // Held by reference: the original marks `collected` before splicing, so any
      // entry still flagged in this snapshot after the call was taken this frame.
      const pentagramsBefore = this.pentagrams?.length ? [...this.pentagrams] : null;
      const previousOrbChance = CONFIG.ORB_SPAWN_CHANCE;
      // Orbs are suppressed only where they would interfere: while a Gate offer is
      // on screen and inside the Void wager. Outside those, they are the original
      // game's constant source of glitch, hit-stop and gold particles, and killing
      // them everywhere is what made the effects feel absent.
      const suppressOrbs = offerActive || shouldSpawnOffer || forceVoidSpawn || bonusActive;
      if (suppressOrbs) CONFIG.ORB_SPAWN_CHANCE = 0;

      try {
        if (shouldSpawnOffer) createGateOffer(this);

        let result;
        if (this.gateSliceOffer || shouldSpawnOffer) {
          result = withSpawnSuppressed(() => originalUpdateGameObjects.apply(this, args));
        } else if (forceVoidSpawn) {
          const visibleVoid = this.voidMode;
          this.voidMode = false;
          try {
            result = originalUpdateGameObjects.apply(this, args);
          } finally {
            this.voidMode = visibleVoid;
          }
        } else if (bonusActive) {
          // The mirror image of the Void branch above. Pentagrams only spawn
          // inside the original's `if (this.voidMode ...)` arm, so the bonus
          // corridor borrows that flag for the spawn and suppresses pillars,
          // which is exactly the shape the original's between-levels bonus had.
          const visibleVoid = this.voidMode;
          this.voidMode = true;
          try {
            result = withSpawnSuppressed(() => originalUpdateGameObjects.apply(this, args));
          } finally {
            this.voidMode = visibleVoid;
          }
        } else {
          result = originalUpdateGameObjects.apply(this, args);
        }

        if (suppressOrbs) this.collectibles = [];

        // Orb pickup was the original's constant source of glitch and hit-stop.
        // Pentagrams award score, particles and sound but never had that punch,
        // because in the original they only appeared in a mode that had its own.
        // Giving it to them restores the cadence inside bonus corridors.
        if (pentagramsBefore && pentagramsBefore.some(pentagram => pentagram.collected)) {
          this.hitStop = 3;
          this.triggerOrbGlitch();
        }
        // Ordering matters: sample before classifying, so the pillar being marked
        // this frame already carries its closest-approach snapshot.
        samplePillarApproaches(this);
        handleClearedPillars(this, previouslyMarked);
        updateOffer(this);
        renderHud(this);
        return result;
      } finally {
        CONFIG.ORB_SPAWN_CHANCE = previousOrbChance;
      }
    };

    Game.prototype.drawGameObjects = function drawGateSliceObjects() {
      originalDrawGameObjects.call(this);
      if (this.gateSliceOffer) drawGateOffer(this.ctx, this.gateSliceOffer, this);
    };

    Pillar.prototype.draw = function drawGateSlicePillar(ctx, conf) {
      originalPillarDraw.call(this, ctx, conf);
      if (typeof game !== 'undefined' && game?.gateSliceState) drawRiskZones(ctx, this, game);
    };

    Game.prototype.__gateSliceRuntimeInstalled = true;

    root.__SEX_MAGICK_GATE_SLICE__ = Object.freeze({
      mode: 'hexagram-gate-vertical-slice',
      version: SLICE_VERSION,
      storageKey: STORAGE_KEY,
      query: 'gateSlice=1',
      /**
       * Identifies which build of this file is actually executing.
       *
       * The 2026-08-12 session reported cleanly while running a cached
       * pre-M16 copy of this module, and it took three separate inferences
       * from the event data to notice. Every value here is read live from the
       * constants above rather than written as a literal, so a playtest report
       * states its own provenance and that failure can never be silent again.
       */
      /**
       * The stored run history, newest first. Exposed so the Rite board can rank
       * runs without a second copy of the storage key to drift out of step.
       */
      getHistory() {
        return history.map(entry => JSON.parse(JSON.stringify(entry)));
      },
      getFingerprint() {
        return {
          sliceVersion: SLICE_VERSION,
          gateEntryRadius: GATE_ENTRY_RADIUS,
          gateOuterRadius: GATE_OUTER_RADIUS,
          bandCount: BANDS.length,
          bandNames: BANDS.map(band => band.name),
          maxValidatedSpeed: MAX_VALIDATED_SPEED,
          minValidatedGap: MIN_VALIDATED_GAP,
          gnosisCapacity: GNOSIS_CAPACITY
        };
      },
      getSnapshot() {
        if (typeof game === 'undefined' || !game) return null;
        return {
          active: Boolean(game.gateSliceState),
          state: game.gateSliceState ? cloneState(game.gateSliceState) : null,
          offer: game.gateSliceOffer ? { ...game.gateSliceOffer } : null,
          voidActive: Boolean(game.__gateSliceVoidActive),
          gateEntryRate: gateEntryRate(game.gateSliceState),
          band: game.gateSliceState ? { ...BANDS[game.gateSliceState.bandIndex] } : null,
          bufferFrames: root.__SEX_MAGICK_COLLISION__?.getInputBufferFrames?.() ?? null
        };
      },
      /**
       * The picture currently on screen, which is the background gallery's, not
       * the band's. Read by occult-field-runtime so the artwork, the tunnel
       * colour and the accent wash all follow the same rotation.
       */
      getBackgroundEntry() {
        if (typeof game === 'undefined' || !game) return null;
        return currentGalleryEntry(game);
      },
      getGalleryInfo() {
        return {
          size: gallery.length,
          advanceEveryGates: GALLERY_ADVANCE_GATES,
          names: gallery.slice(0, 12).map(entry => entry?.name ?? null)
        };
      },
      getHistory() { return cloneState(history); },
      clearHistory() {
        history = [];
        safeStorageWrite(history);
        return [];
      },
      forceGnosis(value = GNOSIS_CAPACITY) {
        if (typeof game === 'undefined' || !game?.gateSliceState) return null;
        game.gateSliceState.gnosis = roundHalf(clamp(value, 0, GNOSIS_CAPACITY));
        game.gateSliceState.gateReady = game.gateSliceState.gnosis >= GNOSIS_CAPACITY;
        renderHud(game);
        return game.gateSliceState.gnosis;
      },
      spawnGateNow() {
        if (typeof game === 'undefined' || !game?.gateSliceState || game.gateSliceOffer) return null;
        game.gateSliceState.gnosis = GNOSIS_CAPACITY;
        game.gateSliceState.gateReady = true;
        return createGateOffer(game);
      }
    });

    console.info('[SEX MAGICK] Hexagram Gate vertical slice installed', {
      version: SLICE_VERSION,
      query: 'gateSlice=1',
      gnosisCapacity: GNOSIS_CAPACITY,
      voidDurationSteps: VOID_DURATION_STEPS,
      storageKey: STORAGE_KEY
    });

    return root.__SEX_MAGICK_GATE_SLICE__;
  }

  function scheduleInstall() {
    if (!queryEnabled() || installed || installationTimer) return;
    const startedAt = Date.now();
    installationTimer = setInterval(() => {
      if (dependenciesReady()) {
        clearInterval(installationTimer);
        installationTimer = null;
        install();
        return;
      }
      if (Date.now() - startedAt > 12_000) {
        clearInterval(installationTimer);
        installationTimer = null;
        console.error('[SEX MAGICK] Gate slice dependencies did not become ready');
      }
    }, 20);
  }

  return Object.freeze({
    SLICE_VERSION,
    STORAGE_KEY,
    HISTORY_LIMIT,
    GNOSIS_CAPACITY,
    VOID_DURATION_STEPS,
    VOID_SPEED_MULTIPLIER,
    VOID_GAP_REDUCTION,
    BANK_MULTIPLIER,
    VOID_MULTIPLIER,
    NEAR_MISS_PX,
    EFFECTIVE_PLAYER_HALF,
    GATE_ENTRY_RADIUS,
    GATE_OUTER_RADIUS,
    GATE_MIN_RATIO,
    GATE_MAX_RATIO,
    GATE_EDGE_MARGIN_PX,
    GATE_MIN_SEPARATION_RATIO,
    GATE_VERTICAL_PX_PER_FRAME,
    BANDS,
    clamp,
    roundHalf,
    getBandIndex,
    getBand,
    familyWeight,
    streakBonus,
    sampleIntervals,
    chooseGateY,
    samplePillarApproaches,
    classifyGateClear,
    createSliceState,
    applyGateClearState,
    offerGateState,
    bankGateState,
    enterGateState,
    completeVoidState,
    failVoidState,
    gateEntryRate,
    queryEnabled,
    install,
    scheduleInstall
  });
});