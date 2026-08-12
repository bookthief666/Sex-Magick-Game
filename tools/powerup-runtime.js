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
  const GATES_PER_CHARGE = 25;

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
      detail: 'Absorbs one crash. Not inside the Void.',
      glyph: '◈',
      unlockBand: 1,
      capAt: bandIndex => (bandIndex >= 6 ? 3 : bandIndex >= 3 ? 2 : 1)
    }),
    Object.freeze({
      id: 'dissolution',
      label: 'DISSOLUTION',
      detail: 'Dissolves the next wall. Grants no gate credit.',
      glyph: '◇',
      unlockBand: 3,
      capAt: bandIndex => (bandIndex >= 6 ? 2 : 1)
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
      #sex-magick-aegis-status { opacity: .85; }
      #sex-magick-aegis-status[hidden] { display: none !important; }
      /* A real <button>, which CONTROL_SELECTOR already exempts from the
         full-screen jump handler, at the 44px the touch-target policy requires. */
      #sex-magick-dissolve {
        width: 46px;
        height: 46px;
        pointer-events: auto;
        cursor: pointer;
        background: rgba(0, 0, 0, .58);
        border: 1px solid rgba(0, 229, 255, .8);
        border-radius: 50%;
        color: #dff6ff;
        font: 15px/1 'Orbitron', monospace;
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
        text-shadow: 0 0 8px #00e5ff;
      }
      #sex-magick-dissolve[hidden] { display: none !important; }
      #sex-magick-dissolve:disabled { opacity: .3; cursor: default; }
      #sex-magick-powerups-announce {
        position: fixed;
        left: 50%;
        bottom: max(120px, calc(env(safe-area-inset-bottom) + 110px));
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
        <div id="sex-magick-aegis-status" hidden></div>
        <button id="sex-magick-dissolve" type="button" aria-label="Dissolve the next wall" hidden>◇</button>
      `;
      document.body.appendChild(hud);
      hud.querySelector('#sex-magick-dissolve').addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        useDissolution();
      });
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
    const dissolution = describe(liveState).find(entry => entry.id === 'dissolution');

    const status = document.getElementById('sex-magick-aegis-status');
    if (aegis.unlocked) {
      status.textContent = `${'◈'.repeat(aegis.charges) || '·'} AEGIS`;
      status.hidden = false;
    } else {
      status.hidden = true;
    }

    const button = document.getElementById('sex-magick-dissolve');
    if (dissolution.unlocked) {
      button.hidden = false;
      button.disabled = dissolution.charges <= 0;
      button.textContent = dissolution.charges > 0 ? String(dissolution.charges) : '◇';
    } else {
      button.hidden = true;
    }

    hud.hidden = !(aegis.unlocked || dissolution.unlocked);
  }

  function announce(text) {
    if (visualQaActive()) return;
    const { announce: element } = ensureHud();
    element.textContent = text;
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
      for (let count = 0; count < 18; count += 1) {
        gameInstance.particles.push(new Particle(centreX, pillar.top + pillar.gap / 2, '#00e5ff', 9));
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

  function useDissolution(gameInstance = typeof game !== 'undefined' ? game : null) {
    if (!liveState || !gameInstance) return false;
    if (gameInstance.state !== GameState.PLAYING) return false;
    if (chargesOf(liveState, 'dissolution') <= 0) return false;
    const pillar = nextPillarAhead(gameInstance);
    if (!pillar || !dissolvePillar(gameInstance, pillar)) return false;
    spendCharge(liveState, 'dissolution');
    // No gate-clear credit: the wall was skipped, not cleared. This also stops
    // the button being used to farm the M18 missions that count gates.
    try { if (gameInstance.settings?.sfx) SFX.collect(); } catch (_error) {}
    announce('DISSOLUTION · THE WAY OPENS');
    renderHud(gameInstance);
    return true;
  }

  /**
   * Pillars the player's collision rect currently overlaps. Dissolving these on a
   * shield absorb is what stops the very next frame killing them again.
   */
  function overlappingPillars(gameInstance) {
    const player = gameInstance?.player;
    if (!player) return [];
    const inset = finiteNumber(CONFIG?.HITBOX_OFFSET, 0);
    const left = player.x - player.r + inset;
    const right = player.x + player.r - inset;
    const top = player.y - player.r + inset;
    const bottom = player.y + player.r - inset;
    return (gameInstance.obstacles || []).filter(pillar => {
      try { return pillar.collides(left, right, top, bottom); } catch (_error) { return false; }
    });
  }

  function tryAbsorb(gameInstance) {
    if (!liveState || !gameInstance) return false;
    if (gameInstance.state === GameState.GAME_OVER) return false;
    // The Void is the wager. Letting a shield cover it would remove the stakes
    // the 2026-08-12 pilot showed are working, so AEGIS declines there.
    if (gameInstance.__gateSliceVoidActive) return false;
    if (chargesOf(liveState, 'aegis') <= 0) return false;

    const blocking = overlappingPillars(gameInstance);
    if (blocking.length === 0) return false;

    spendCharge(liveState, 'aegis');
    for (const pillar of blocking) dissolvePillar(gameInstance, pillar);
    gameInstance.hitStop = 3;
    gameInstance.shake = Math.max(finiteNumber(gameInstance.shake, 0), 8);
    try { if (gameInstance.settings?.sfx) SFX.levelUp(); } catch (_error) {}
    announce('AEGIS HOLDS');
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
      for (const id of unlockedNow) announce(`${getPowerup(id)?.label} UNSEALED`);
    }

    const survivals = wholeNumber(slice.voidSurvivals, 0);
    if (survivals > lastVoidSurvivals) {
      for (let count = lastVoidSurvivals; count < survivals; count += 1) {
        if (awardCharge(liveState)) announce('CHALLENGE MET · CHARGE EARNED');
      }
      lastVoidSurvivals = survivals;
    }

    if (applyGateMilestones(liveState, slice.gatesCleared).length > 0) {
      announce('ASCENT · CHARGE EARNED');
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
      getPowerups: () => (liveState ? describe(liveState) : []),
      hudSuppressed: () => visualQaActive(),
      useDissolution: () => useDissolution(),
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
    createMemoryStorage,
    safeBrowserStorage,
    readState,
    writeState,
    install,
    scheduleInstall
  });
});
