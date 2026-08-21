(function attachSexMagickPowerups(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickPowerups = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPowerupApi(root) {
  'use strict';

  const POWERUP_VERSION = 1;
  const STORAGE_KEY = 'sex_magick_powerups_v1';

  // Charges are earned, never found. Both paths mean "you took on something and
  // came through it": the Void is the explicit challenge section, and a long
  // clean stretch is the implicit one. The second path exists because the
  // 2026-08-12 pilot recorded under one Void survival per run - without it,
  // charges would be too rare to feel like a system.
  // D-062: was 25, which on the owner's device meant the first shield arrived
  // long after the runs they were actually playing ended. A shield nobody ever
  // holds cannot be judged, and the owner reported it as simply not working.
  const GATES_PER_CHARGE = 10;

  // One ring drawn per charge, so this is also how many rings can appear.
  const MAX_AEGIS_CHARGES = 3;

  // Ward violet. Must avoid all three reserved colours - hazard #ff2f6d/#ff003c,
  // Hexagram #00e5ff and Monas #ffd700 - so protection can never be mistaken for
  // danger, and the Rite auras stay legible for the later in-run transformation.
  const WARD_COLOR = '#c9b4ff';

  // How far ahead a wall may be before the doom projection is trusted. The gap
  // breathes and walls move, so a long-range projection would condemn walls that
  // are still perfectly survivable.
  const UNAVOIDABLE_LOOKAHEAD_FRAMES = 70;


  /**
   * The unlock ladder.
   *
   * `unlockBand` is the band index at which the power-up begins to exist for the
   * player at all. `capAt` maps a band index to how many charges they may hold.
   *
   * DISSOLUTION is deliberately gated to GEBURAH. A new player meets the Gate,
   * the Void and the risk bands before they are handed a tool that skips walls,
   * so the curve M17 built stays intact on a first encounter.
   */
  const POWERUPS = Object.freeze([
    Object.freeze({
      id: 'aegis',
      label: 'AEGIS',
      detail: 'Breaks the wall you crash into. Three held at most.',
      glyph: '◈',
      // D-062: available from the first band. Gating the only power-up behind
      // YESOD meant a new player met the shield as a HUD label long before they
      // could ever hold one, which is most of why it read as broken.
      unlockBand: 0,
      capAt: () => MAX_AEGIS_CHARGES
    })
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(POWERUPS.map(powerup => [powerup.id, powerup])));

  function getPowerup(id) {
    return BY_ID[String(id)] || null;
  }

  function finiteNumber(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function wholeNumber(value, fallback = 0) {
    return Math.max(0, Math.floor(finiteNumber(value, fallback)));
  }

  function validateLadder(ladder = POWERUPS) {
    const errors = [];
    const seen = new Set();
    for (const powerup of ladder) {
      if (seen.has(powerup.id)) errors.push(`${powerup.id} is declared twice`);
      seen.add(powerup.id);
      if (!Number.isInteger(powerup.unlockBand) || powerup.unlockBand < 0) {
        errors.push(`${powerup.id} has an invalid unlockBand`);
      }
      if (typeof powerup.capAt !== 'function') {
        errors.push(`${powerup.id} has no capAt function`);
        continue;
      }
      let previous = 0;
      for (let bandIndex = 0; bandIndex <= 7; bandIndex += 1) {
        const cap = powerup.capAt(bandIndex);
        if (!Number.isInteger(cap) || cap < 1) errors.push(`${powerup.id} cap at band ${bandIndex} is not a positive integer`);
        if (cap < previous) errors.push(`${powerup.id} cap shrinks between bands ${bandIndex - 1} and ${bandIndex}`);
        previous = cap;
      }
      if (!powerup.label || !powerup.detail || !powerup.glyph) errors.push(`${powerup.id} is missing display text`);
    }
    return errors;
  }

  // --- state ---------------------------------------------------------------

  /**
   * `highestBand` is the only thing that persists. Charges are per-run by design:
   * banking them across sessions would let a patient player hoard six shields and
   * flatten the difficulty entirely.
   */
  function createState() {
    return {
      version: POWERUP_VERSION,
      highestBand: 0,
      charges: { aegis: 0, dissolution: 0 },
      earned: 0,
      spent: { aegis: 0, dissolution: 0 },
      gateChargeMarker: 0
    };
  }

  function sanitizeState(raw) {
    const state = createState();
    if (!raw || typeof raw !== 'object' || raw.version !== POWERUP_VERSION) return state;
    state.highestBand = Math.min(7, wholeNumber(raw.highestBand, 0));
    return state;
  }

  function isUnlocked(state, id) {
    const powerup = getPowerup(id);
    if (!powerup) return false;
    return wholeNumber(state?.highestBand, 0) >= powerup.unlockBand;
  }

  function capacityFor(state, id) {
    const powerup = getPowerup(id);
    if (!powerup || !isUnlocked(state, id)) return 0;
    return Math.max(0, Math.floor(powerup.capAt(wholeNumber(state.highestBand, 0))));
  }

  function chargesOf(state, id) {
    return Math.min(capacityFor(state, id), wholeNumber(state?.charges?.[id], 0));
  }

  /**
   * Records the band a run has reached. Unlocks only ever move forward - a bad
   * run can never revoke a power-up the player has already earned the right to.
   * Returns the ids that became available on this call.
   */
  function recordBand(state, bandIndex) {
    const reached = Math.min(7, wholeNumber(bandIndex, 0));
    if (reached <= state.highestBand) return [];
    const before = POWERUPS.filter(powerup => isUnlocked(state, powerup.id)).map(powerup => powerup.id);
    state.highestBand = reached;
    const after = POWERUPS.filter(powerup => isUnlocked(state, powerup.id)).map(powerup => powerup.id);
    return after.filter(id => !before.includes(id));
  }

  /**
   * Awards one charge to the unlocked power-up with the most room, so a player
   * who is sitting on a full shield starts accumulating breakers instead of
   * wasting the reward. Ties break toward the earlier entry in the ladder.
   *
   * Returns the id awarded, or null when everything is full or nothing is
   * unlocked - the caller must treat null as "nothing happened", not as an error.
   */
  function awardCharge(state) {
    let best = null;
    let bestRoom = 0;
    for (const powerup of POWERUPS) {
      if (!isUnlocked(state, powerup.id)) continue;
      const room = capacityFor(state, powerup.id) - chargesOf(state, powerup.id);
      if (room > bestRoom) {
        best = powerup.id;
        bestRoom = room;
      }
    }
    if (!best) return null;
    state.charges[best] = chargesOf(state, best) + 1;
    state.earned += 1;
    return best;
  }

  function spendCharge(state, id) {
    if (chargesOf(state, id) <= 0) return false;
    state.charges[id] = chargesOf(state, id) - 1;
    state.spent[id] = wholeNumber(state.spent[id], 0) + 1;
    return true;
  }

  /**
   * The in-run gate milestone. Fires once per threshold crossed rather than once
   * per frame, and survives a jump of several gates in a single observation by
   * awarding for each threshold passed.
   */
  function applyGateMilestones(state, gatesCleared) {
    const cleared = wholeNumber(gatesCleared, 0);
    const reachedMarker = Math.floor(cleared / GATES_PER_CHARGE);
    const awarded = [];
    while (state.gateChargeMarker < reachedMarker) {
      state.gateChargeMarker += 1;
      const id = awardCharge(state);
      if (id) awarded.push(id);
    }
    return awarded;
  }

  function beginRunState(state) {
    state.charges = { aegis: 0, dissolution: 0 };
    state.spent = { aegis: 0, dissolution: 0 };
    state.earned = 0;
    state.gateChargeMarker = 0;
    return state;
  }

  function describe(state) {
    return POWERUPS.map(powerup => ({
      id: powerup.id,
      label: powerup.label,
      detail: powerup.detail,
      glyph: powerup.glyph,
      unlocked: isUnlocked(state, powerup.id),
      unlockBand: powerup.unlockBand,
      charges: chargesOf(state, powerup.id),
      capacity: capacityFor(state, powerup.id)
    }));
  }

  // --- persistence ---------------------------------------------------------

  function createMemoryStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem: key => (values.has(key) ? values.get(key) : null),
      setItem: (key, value) => { values.set(key, String(value)); },
      removeItem: key => { values.delete(key); },
      snapshot: () => Object.fromEntries(values.entries())
    };
  }

  function safeBrowserStorage() {
    try {
      const storage = root.localStorage;
      const probe = '__sex_magick_powerups_probe__';
      storage.setItem(probe, '1');
      storage.removeItem(probe);
      return storage;
    } catch (_error) {
      return createMemoryStorage();
    }
  }

  function readState(storage, key = STORAGE_KEY) {
    if (!storage || typeof storage.getItem !== 'function') return createState();
    try {
      const raw = storage.getItem(key);
      if (!raw) return createState();
      return sanitizeState(JSON.parse(raw));
    } catch (_error) {
      return createState();
    }
  }

  function writeState(storage, state, key = STORAGE_KEY) {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
      // Only the ascent persists. Charges are per-run and are never written.
      storage.setItem(key, JSON.stringify({
        version: POWERUP_VERSION,
        highestBand: wholeNumber(state?.highestBand, 0)
      }));
      return true;
    } catch (_error) {
      return false;
    }
  }

  // --- browser runtime -----------------------------------------------------

  let installed = false;
  let installTimer = null;
  let liveState = null;
  let liveStorage = null;
  let lastVoidSurvivals = 0;
  let announceTimer = null;
  let wardPulse = 0;

  /**
   * Session-level totals, in memory only and never persisted.
   *
   * The per-run counters on the state object reset with every run, so at the end
   * of a playtest they only describe the final run. These accumulate across the
   * whole session, which is what the V2 playtest report needs in order to say
   * anything about whether power-ups were actually earned and used.
   */
  let sessionTotals = null;

  function resetSessionTotals() {
    sessionTotals = {
      earnedFromVoid: 0,
      earnedFromGates: 0,
      absorbs: 0,
      dissolves: 0,
      dissolveAttemptsWithoutCharge: 0,
      unlocksSeen: []
    };
  }

  function visualQaActive() {
    try {
      return new URLSearchParams(root.location?.search || '').get('visualQa') === '1';
    } catch (_error) {
      return false;
    }
  }

  function dependenciesReady() {
    return (
      typeof Game !== 'undefined' &&
      typeof GameState !== 'undefined' &&
      typeof Player !== 'undefined' &&
      typeof document !== 'undefined' &&
      // Power-ups are meaningless without bands, Gates and the Void, and the
      // shield hook must wrap the slice's gameOver from the outside.
      Boolean(root.__SEX_MAGICK_GATE_SLICE__)
    );
  }

  function ensureStyle() {
    if (document.getElementById('sex-magick-powerups-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-powerups-style';
    style.textContent = `
      #sex-magick-powerups {
        position: fixed;
        left: max(10px, env(safe-area-inset-left));
        bottom: max(10px, env(safe-area-inset-bottom));
        z-index: 28;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        pointer-events: none;
        font: var(--sm-hud-font-size, 10px)/1.3 'Orbitron', monospace;
        letter-spacing: var(--sm-hud-letter-spacing, 1.5px);
        color: #dff6ff;
        text-shadow: 0 0 7px rgba(0, 229, 255, .75);
      }
      #sex-magick-powerups[hidden] { display: none !important; }
      /* Both readouts are passive text. There is no control here and there must
         never be one: the whole screen is the jump surface, and the 2026-08-12
         session showed a button in this corner simply never gets pressed. */
      .sm-powerup-row { opacity: .85; white-space: nowrap; }
      .sm-powerup-row[hidden] { display: none !important; }
      .sm-powerup-row.is-ward { color: #c9b4ff; text-shadow: 0 0 7px rgba(201, 180, 255, .8); }
      #sex-magick-powerups-announce {
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
        z-index: 29;
        padding: 7px 14px;
        border: 1px solid rgba(0, 229, 255, .7);
        background: rgba(0, 0, 0, .85);
        color: #eaffff;
        text-align: center;
        pointer-events: none;
        white-space: nowrap;
        font: var(--sm-hud-font-size, 10px)/1.5 'Orbitron', monospace;
        letter-spacing: 2.4px;
        text-shadow: 0 0 10px #00e5ff;
      }
      #sex-magick-powerups-announce[hidden] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function ensureHud() {
    ensureStyle();
    let hud = document.getElementById('sex-magick-powerups');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'sex-magick-powerups';
      hud.hidden = true;
      hud.innerHTML = `
        <div id="sex-magick-aegis-status" class="sm-powerup-row is-ward" hidden></div>
        <div id="sex-magick-dissolve-status" class="sm-powerup-row" hidden></div>
      `;
      document.body.appendChild(hud);
    }
    let announce = document.getElementById('sex-magick-powerups-announce');
    if (!announce) {
      announce = document.createElement('div');
      announce.id = 'sex-magick-powerups-announce';
      announce.hidden = true;
      document.body.appendChild(announce);
    }
    return { hud, announce };
  }

  function renderHud(gameInstance) {
    if (!liveState) return;
    const { hud } = ensureHud();
    const playing = Boolean(gameInstance) && gameInstance.state === GameState.PLAYING;
    if (visualQaActive() || !playing) {
      hud.hidden = true;
      return;
    }

    const aegis = describe(liveState).find(entry => entry.id === 'aegis');
    const status = document.getElementById('sex-magick-aegis-status');
    if (aegis.unlocked) {
      // D-062: the count is the message. Filled diamonds for shields held,
      // an explicit EMPTY for none - a player must never have to infer from
      // an absent glyph whether they are protected.
      status.textContent = aegis.charges > 0
        ? `${'◈'.repeat(aegis.charges)} AEGIS ${aegis.charges}/${MAX_AEGIS_CHARGES}`
        : '◇ AEGIS EMPTY';
      status.classList.toggle('is-armed', aegis.charges > 0);
      status.hidden = false;
    } else {
      status.hidden = true;
    }

    // D-062 retired DISSOLUTION; its row is left in the DOM but never shown so
    // an older cached page cannot leave a stale label behind.
    const dissolveRow = document.getElementById('sex-magick-dissolve-status');
    if (dissolveRow) dissolveRow.hidden = true;

    hud.hidden = !aegis.unlocked;
  }


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

  function announce(text) {
    if (visualQaActive()) return;
    const { announce: element } = ensureHud();
    element.textContent = text;
    claimNoticeSlot('sex-magick-powerups-announce');
    element.hidden = false;
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      element.hidden = true;
      announceTimer = null;
    }, 1500);
  }

  function dissolvePillar(gameInstance, pillar) {
    const index = gameInstance.obstacles.indexOf(pillar);
    if (index === -1) return false;
    gameInstance.obstacles.splice(index, 1);
    try {
      const centreX = pillar.x + (pillar.w / 2);
      // Ward violet, so a dissolving wall is unmistakably the power-up acting and
      // not the Gate, whose ring is Hexagram cyan.
      for (let count = 0; count < 26; count += 1) {
        const spread = (count / 26) * Math.max(1, pillar.gap);
        gameInstance.particles.push(new Particle(centreX, pillar.top + spread, WARD_COLOR, 10));
      }
    } catch (_error) {}
    return true;
  }

  /**
   * The nearest wall the player has not yet passed. Deliberately excludes marked
   * pillars, so the button always removes something still ahead of them.
   */
  function nextPillarAhead(gameInstance) {
    const playerX = finiteNumber(gameInstance?.player?.x, 0);
    let best = null;
    for (const pillar of gameInstance.obstacles || []) {
      if (pillar.marked) continue;
      const right = finiteNumber(pillar.x, 0) + finiteNumber(pillar.w, 0);
      if (right < playerX) continue;
      if (!best || pillar.x < best.x) best = pillar;
    }
    return best;
  }

  /**
   * The band of heights the player could still occupy `frames` from now.
   *
   * Lower bound: jump on every frame the cooldown allows. Upper bound: never jump
   * and fall, clamped to terminal velocity. Anything the player can actually do
   * lands between the two, so if the gap falls outside this band no input saves
   * them. Mirrors index.html's Player.update exactly - gravity, then the terminal
   * clamp, then the position step.
   */
  function reachableBand(options = {}) {
    const gravity = finiteNumber(options.gravity, 0.45);
    const maxFall = finiteNumber(options.maxFallSpeed, 11);
    const jumpForce = finiteNumber(options.jumpForce, -7.5);
    const cooldownFrames = Math.max(1, Math.floor(finiteNumber(options.cooldownFrames, 8)));
    const frames = Math.max(0, Math.floor(finiteNumber(options.frames, 0)));
    const startY = finiteNumber(options.y, 0);
    const startVy = finiteNumber(options.vy, 0);
    const startCooldown = Math.max(0, Math.floor(finiteNumber(options.cooldown, 0)));

    let lowY = startY, lowVy = startVy, cooldown = startCooldown;
    let highY = startY, highVy = startVy;

    for (let frame = 0; frame < frames; frame += 1) {
      // Highest reachable: jump the instant the cooldown permits.
      if (cooldown <= 0) {
        lowVy = jumpForce;
        cooldown = cooldownFrames;
      } else {
        lowVy += gravity;
        cooldown -= 1;
      }
      if (lowVy > maxFall) lowVy = maxFall;
      lowY += lowVy;

      // Lowest reachable: never jump.
      highVy += gravity;
      if (highVy > maxFall) highVy = maxFall;
      highY += highVy;
    }

    return { minY: Math.min(lowY, highY), maxY: Math.max(lowY, highY) };
  }

  /**
   * True when the player cannot clear `pillar` by any sequence of taps.
   *
   * The bar is deliberately "no input can save them" rather than "this looks
   * hard". A looser test would steal saves the player would have made themselves,
   * which is the difference between a rescue and the game playing itself.
   */
  function isPillarUnavoidable(gameInstance, pillar) {
    const player = gameInstance?.player;
    if (!player || !pillar) return false;
    const speed = Math.max(0.1, finiteNumber(gameInstance.gameSpeed, 1));
    const half = Math.max(0, finiteNumber(player.r, 16) - finiteNumber(CONFIG?.HITBOX_OFFSET, 0));

    // Frames until the pillar's trailing edge clears the player's leading edge -
    // the last instant a collision is still possible.
    const frames = Math.floor(
      ((finiteNumber(pillar.x, 0) + finiteNumber(pillar.w, 0)) - (finiteNumber(player.x, 0) - half)) / speed
    );
    if (frames <= 0) return false;
    // Too far out to judge: the gap breathes and the wall may move, so committing
    // a charge on a long-range projection would fire on walls that are still fine.
    if (frames > UNAVOIDABLE_LOOKAHEAD_FRAMES) return false;

    // Evaluate at the moment of closest approach, where the corridor is tightest.
    const arrival = Math.max(0, Math.floor(
      (finiteNumber(pillar.x, 0) + (finiteNumber(pillar.w, 0) / 2) - finiteNumber(player.x, 0)) / speed
    ));
    const band = reachableBand({
      y: player.y,
      vy: player.vy,
      cooldown: player.jumpCooldown,
      frames: arrival,
      gravity: finiteNumber(CONFIG?.GRAVITY, 0.45),
      maxFallSpeed: finiteNumber(CONFIG?.MAX_FALL_SPEED, 11),
      jumpForce: finiteNumber(CONFIG?.PLAYER_JUMP_FORCE, -7.5),
      cooldownFrames: gameInstance.isMobile ? 8 : 5
    });

    const safeTop = finiteNumber(pillar.top, 0) + half;
    const safeBottom = finiteNumber(pillar.top, 0) + finiteNumber(pillar.gap, 0) - half;
    if (safeBottom <= safeTop) return false;

    // Doomed only when the whole reachable band sits outside the corridor.
    return band.maxY < safeTop || band.minY > safeBottom;
  }

  /**
   * Fires DISSOLUTION when, and only when, the next wall is already lost.
   *
   * Resolves before AEGIS on a doomed approach, so the shield is kept back for a
   * hit that could not be seen coming. Declines inside the Void for the same
   * reason AEGIS does - the Void is the wager.
   */
  function tryDissolve(gameInstance) {
    if (!liveState || !gameInstance) return false;
    if (gameInstance.state !== GameState.PLAYING) return false;
    if (gameInstance.__gateSliceVoidActive) return false;
    if (chargesOf(liveState, 'dissolution') <= 0) return false;

    const pillar = nextPillarAhead(gameInstance);
    if (!pillar || !isPillarUnavoidable(gameInstance, pillar)) return false;
    if (!dissolvePillar(gameInstance, pillar)) return false;

    spendCharge(liveState, 'dissolution');
    if (sessionTotals) sessionTotals.dissolves += 1;
    // No gate-clear credit: the wall was skipped, not cleared. That also stops it
    // inflating the M18 missions that count gates.
    try { if (gameInstance.settings?.sfx) SFX.collect(); } catch (_error) {}
    announce('DISSOLUTION · THE WALL UNMAKES ITSELF');
    renderHud(gameInstance);
    return true;
  }

  /**
   * Pillars the player's collision rect currently overlaps. Dissolving these on a
   * shield absorb is what stops the very next frame killing them again.
   */
  /**
   * Not `CONFIG?.x` - optional chaining does not stop an *undeclared*
   * identifier throwing, and this is reached from inside `gameOver`, where a
   * ReferenceError takes the whole death path down with it. D-061 introduced
   * this guard and then deleted it by accident while reverting the floor save,
   * which left `overlappingPillars` calling a function that no longer existed:
   * every absorb threw, and the shield stopped working entirely. The browser
   * suite caught it; the unit suite could not, because it never enters this
   * code path.
   */
  function configOf() {
    try { if (typeof CONFIG !== 'undefined' && CONFIG) return CONFIG; }
    catch (_error) {}
    return root.CONFIG || {};
  }

  function overlappingPillars(gameInstance) {
    const player = gameInstance?.player;
    if (!player) return [];
    const inset = finiteNumber(configOf().HITBOX_OFFSET, 0);
    const left = player.x - player.r + inset;
    const right = player.x + player.r - inset;
    const top = player.y - player.r + inset;
    const bottom = player.y + player.r - inset;
    return (gameInstance.obstacles || []).filter(pillar => {
      try { return pillar.collides(left, right, top, bottom); } catch (_error) { return false; }
    });
  }

  /**
   * Ward rings around the player, one per held AEGIS charge.
   *
   * This is the change the owner actually asked for: "the avatar should maybe
   * start glowing or generate an actual visual thin neon shield". A count in the
   * corner was not read during play - protection has to live where the eyes
   * already are, on the sigil itself.
   */
  function drawWardRings(ctx, player) {
    if (!liveState || visualQaActive()) return;
    const charges = chargesOf(liveState, 'aegis');
    if (charges <= 0) return;

    const reduced = Boolean(root.__SEX_MAGICK_COLLISION__?.getAccessibility?.().reducedMotion);
    const radius = Math.max(1, finiteNumber(player?.r, 16));
    wardPulse += reduced ? 0 : 0.07;

    ctx.save();
    ctx.translate(finiteNumber(player?.x, 0), finiteNumber(player?.y, 0));
    for (let index = 0; index < charges; index += 1) {
      const breathe = reduced ? 0 : Math.sin(wardPulse + index * 0.9) * 1.6;
      const ringRadius = radius + 10 + index * 7 + breathe;

      // D-062: the owner repeatedly read the avatar's own outline as a shield
      // and concluded AEGIS was broken. A thin violet circle concentric with a
      // round avatar is not a distinguishable signal. Each charge is now a
      // heavy dashed ring that visibly counter-rotates - a texture and a motion
      // the avatar never has - so "armed" and "empty" cannot be confused.
      ctx.beginPath();
      ctx.strokeStyle = WARD_COLOR;
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.95 - index * 0.14;
      ctx.setLineDash([ringRadius * 0.42, ringRadius * 0.30]);
      ctx.lineDashOffset = reduced ? 0 : (index % 2 === 0 ? -wardPulse * 9 : wardPulse * 9);
      if (!reduced) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = WARD_COLOR;
      }
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  // The ward coming apart. Shown at the moment of absorb so the save is legible
  // as the shield doing its job rather than as an unexplained survival.
  function shatterWard(gameInstance) {
    if (visualQaActive()) return;
    const player = gameInstance?.player;
    if (!player) return;
    try {
      for (let index = 0; index < 22; index += 1) {
        gameInstance.particles.push(new Particle(player.x, player.y, WARD_COLOR, 9));
      }
    } catch (_error) {}
  }


  function tryAbsorb(gameInstance) {
    if (!liveState || !gameInstance) return false;
    if (gameInstance.state === GameState.GAME_OVER) return false;
    // D-062 removes the Void exception. It was defensible - the Void is the
    // wager - but it was invisible: a player crashing inside a Gate run saw a
    // shield decline for a reason nothing on screen ever stated, which is a
    // large part of why AEGIS read as broken. A wall is a wall.
    if (chargesOf(liveState, 'aegis') <= 0) return false;

    // AEGIS is a wall shield and nothing else. D-060 briefly extended it to cover
    // falls; playing that (D-061) showed the premise was wrong - the owner had
    // never actually held a charge, and what looked like a shield being ignored
    // was the avatar's own outline. A fall is the player's own altitude
    // management and stays fatal, which also keeps the charge for the hit that
    // could not be seen coming.
    const blocking = overlappingPillars(gameInstance);
    if (blocking.length === 0) return false;

    spendCharge(liveState, 'aegis');
    if (sessionTotals) sessionTotals.absorbs += 1;
    shatterWard(gameInstance);
    for (const pillar of blocking) dissolvePillar(gameInstance, pillar);
    gameInstance.hitStop = 3;
    gameInstance.shake = Math.max(finiteNumber(gameInstance.shake, 0), 8);
    try { if (gameInstance.settings?.sfx) SFX.levelUp(); } catch (_error) {}
    announce('AEGIS SHATTERS · THE WALL IS REFUSED');
    renderHud(gameInstance);
    return true;
  }

  function observe(gameInstance) {
    if (!liveState) return;
    const slice = gameInstance?.gateSliceState;
    if (!slice) return;

    const unlockedNow = recordBand(liveState, slice.bandIndex);
    if (unlockedNow.length > 0) {
      writeState(liveStorage, liveState);
      for (const id of unlockedNow) {
        if (sessionTotals) sessionTotals.unlocksSeen.push(id);
        const powerup = getPowerup(id);
        announce(`${powerup?.label} UNSEALED · ${powerup?.detail}`);
      }
    }

    const survivals = wholeNumber(slice.voidSurvivals, 0);
    if (survivals > lastVoidSurvivals) {
      for (let count = lastVoidSurvivals; count < survivals; count += 1) {
        const earned = awardCharge(liveState);
        if (earned) {
          if (sessionTotals) sessionTotals.earnedFromVoid += 1;
          announce(`VOID SURVIVED · ${getPowerup(earned)?.label} +1`);
        }
      }
      lastVoidSurvivals = survivals;
    }

    // Pre-emptive, so it must run before the frame's collision test can land.
    tryDissolve(gameInstance);

    const milestoneAwards = applyGateMilestones(liveState, slice.gatesCleared);
    if (milestoneAwards.length > 0) {
      if (sessionTotals) sessionTotals.earnedFromGates += milestoneAwards.length;
      announce(`ASCENT · ${getPowerup(milestoneAwards[0])?.label} +${milestoneAwards.length}`);
    }

    renderHud(gameInstance);
  }

  function beginRun(gameInstance) {
    if (!liveState) return;
    beginRunState(liveState);
    lastVoidSurvivals = wholeNumber(gameInstance?.gateSliceState?.voidSurvivals, 0);
    renderHud(gameInstance);
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_POWERUPS__;
    if (!dependenciesReady()) return null;

    liveStorage = safeBrowserStorage();
    liveState = readState(liveStorage);
    resetSessionTotals();

    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalGameOver = Game.prototype.gameOver;
    const originalReturnToMenu = Game.prototype.returnToMenu;

    Game.prototype.startGame = function startGameWithPowerups(...args) {
      const result = originalStartGame.apply(this, args);
      beginRun(this);
      return result;
    };

    Game.prototype.restartGame = function restartGameWithPowerups(...args) {
      const result = originalRestartGame.apply(this, args);
      beginRun(this);
      return result;
    };

    Game.prototype.updateGameObjects = function updateGameObjectsWithPowerups(...args) {
      const result = originalUpdateGameObjects.apply(this, args);
      observe(this);
      return result;
    };

    // Installed last, so this wrapper is the outermost one and still sees
    // __gateSliceVoidActive before the slice's own gameOver clears it.
    Game.prototype.gameOver = function gameOverWithAegis(...args) {
      if (tryAbsorb(this)) return undefined;
      return originalGameOver.apply(this, args);
    };

    // Installed last, so this wraps collision-runtime's drawTruthfulPlayer without
    // that file needing to know power-ups exist.
    const originalPlayerDraw = Player.prototype.draw;
    Player.prototype.draw = function drawPlayerWithWard(ctx, ...rest) {
      const result = originalPlayerDraw.call(this, ctx, ...rest);
      try { drawWardRings(ctx, this); } catch (_error) {}
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithPowerups(...args) {
      const hud = document.getElementById('sex-magick-powerups');
      if (hud) hud.hidden = true;
      return originalReturnToMenu.apply(this, args);
    };

    installed = true;
    root.__SEX_MAGICK_POWERUPS__ = Object.freeze({
      version: POWERUP_VERSION,
      mode: 'local-powerups-no-network',
      gatesPerCharge: GATES_PER_CHARGE,
      getSnapshot: () => (liveState ? JSON.parse(JSON.stringify(liveState)) : null),
      getSessionTotals: () => (sessionTotals ? JSON.parse(JSON.stringify(sessionTotals)) : null),
      getPowerups: () => (liveState ? describe(liveState) : []),
      hudSuppressed: () => visualQaActive(),
      // No public activation: DISSOLUTION fires itself. Exposed only so tests can
      // drive the predictive check directly.
      tryDissolve: () => tryDissolve(typeof game !== 'undefined' ? game : null),
      isPillarUnavoidable: pillar => isPillarUnavoidable(typeof game !== 'undefined' ? game : null, pillar),
      // Test affordances. Nothing in normal play calls these.
      grant(id, count = 1) {
        if (!liveState || !getPowerup(id)) return false;
        liveState.charges[id] = Math.min(capacityFor(liveState, id), chargesOf(liveState, id) + wholeNumber(count, 1));
        renderHud(typeof game !== 'undefined' ? game : null);
        return true;
      },
      forceBand(bandIndex) {
        if (!liveState) return false;
        recordBand(liveState, bandIndex);
        writeState(liveStorage, liveState);
        renderHud(typeof game !== 'undefined' ? game : null);
        return true;
      },
      reset() {
        liveState = createState();
        resetSessionTotals();
        lastVoidSurvivals = 0;
        writeState(liveStorage, liveState);
        renderHud(typeof game !== 'undefined' ? game : null);
        return true;
      }
    });
    return root.__SEX_MAGICK_POWERUPS__;
  }

  function scheduleInstall(timeoutMs = 12_000) {
    if (installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  return Object.freeze({
    POWERUP_VERSION,
    STORAGE_KEY,
    GATES_PER_CHARGE,
    MAX_AEGIS_CHARGES,
    POWERUPS,
    getPowerup,
    validateLadder,
    createState,
    sanitizeState,
    isUnlocked,
    capacityFor,
    chargesOf,
    recordBand,
    awardCharge,
    spendCharge,
    applyGateMilestones,
    beginRunState,
    describe,
    reachableBand,
    WARD_COLOR,
    UNAVOIDABLE_LOOKAHEAD_FRAMES,
    createMemoryStorage,
    safeBrowserStorage,
    readState,
    writeState,
    install,
    scheduleInstall
  });
});
