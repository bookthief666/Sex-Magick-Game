(function attachSexMagickMissions(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickMissions = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMissionsApi(root) {
  'use strict';

  const MISSIONS_VERSION = 1;
  const STORAGE_KEY = 'sex_magick_missions_v1';
  const ACTIVE_SLOTS = 3;
  // Rotation avoidance ring. Long enough that a replacement feels fresh, short
  // enough that a small catalogue never runs out of eligible draws.
  const RECENT_LIMIT = 5;
  const TIERS = Object.freeze(['light', 'steady', 'deep']);

  function finiteNumber(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function counter(state, key) {
    return Math.max(0, Math.floor(finiteNumber(state?.[key], 0)));
  }

  function bankScore(state) {
    return Math.max(0, Math.floor(finiteNumber(state?.scoreBreakdown?.bank, 0)));
  }

  /**
   * The catalogue.
   *
   * Every entry advances from state the Gate slice already tracks. `delta` reads
   * what changed between two consecutive observations of `gateSliceState` and
   * returns how much progress that step earned; `level` instead reports an
   * absolute high-water mark for objectives that are about reaching something
   * rather than accumulating it.
   *
   * A mission declares exactly one of `delta` or `level`, never both.
   *
   * `scope: 'cumulative'` carries progress across runs - that is what makes a bad
   * run still productive. `scope: 'run'` resets when a run starts.
   */
  const CATALOGUE = Object.freeze([
    Object.freeze({
      id: 'risk.courted',
      label: 'COURT THE EDGE',
      detail: 'Clear risk-zone gates',
      scope: 'cumulative',
      tier: 'steady',
      target: 40,
      delta(previous, next) {
        if (counter(next, 'gatesCleared') <= counter(previous, 'gatesCleared')) return 0;
        const clear = next?.lastClear;
        if (!clear || !clear.riskActive) return 0;
        return clear.zone === 'risk-top' || clear.zone === 'risk-bottom' ? 1 : 0;
      }
    }),
    Object.freeze({
      id: 'gates.total',
      label: 'WALK THE PATH',
      detail: 'Clear gates',
      scope: 'cumulative',
      tier: 'light',
      target: 150,
      delta: (previous, next) => counter(next, 'gatesCleared') - counter(previous, 'gatesCleared')
    }),
    Object.freeze({
      id: 'void.survived',
      label: 'SURVIVE THE VOID',
      detail: 'Survive Voids',
      scope: 'cumulative',
      tier: 'deep',
      target: 5,
      delta: (previous, next) => counter(next, 'voidSurvivals') - counter(previous, 'voidSurvivals')
    }),
    Object.freeze({
      id: 'gate.entered',
      label: 'ACCEPT THE WAGER',
      detail: 'Enter Gates',
      scope: 'cumulative',
      tier: 'steady',
      target: 10,
      delta: (previous, next) => counter(next, 'gateEntries') - counter(previous, 'gateEntries')
    }),
    Object.freeze({
      id: 'bank.total',
      label: 'HOARD THE GNOSIS',
      detail: 'Bank Gnosis',
      scope: 'cumulative',
      tier: 'steady',
      target: 200,
      delta: (previous, next) => bankScore(next) - bankScore(previous)
    }),
    Object.freeze({
      id: 'nearmiss.total',
      label: 'THREAD THE NEEDLE',
      detail: 'Clear gates by a hair',
      scope: 'cumulative',
      tier: 'deep',
      target: 8,
      delta(previous, next) {
        if (counter(next, 'gatesCleared') <= counter(previous, 'gatesCleared')) return 0;
        return next?.lastClear?.nearMiss ? 1 : 0;
      }
    }),
    Object.freeze({
      id: 'climax.cleared',
      label: 'ENDURE THE CLIMAX',
      detail: 'Clear climax-pattern gates',
      scope: 'cumulative',
      tier: 'steady',
      target: 30,
      delta(previous, next) {
        if (counter(next, 'gatesCleared') <= counter(previous, 'gatesCleared')) return 0;
        return next?.lastClear?.family === 'climax' ? 1 : 0;
      }
    }),
    Object.freeze({
      id: 'band.geburah',
      label: 'REACH GEBURAH',
      detail: 'Ascend to the fourth band in one run',
      scope: 'run',
      tier: 'steady',
      target: 1,
      level: next => (counter(next, 'bandIndex') >= 3 ? 1 : 0)
    }),
    Object.freeze({
      id: 'band.kether',
      label: 'ATTAIN KETHER',
      detail: 'Ascend to the crown in one run',
      scope: 'run',
      tier: 'deep',
      target: 1,
      level: next => (counter(next, 'bandIndex') >= 7 ? 1 : 0)
    }),
    Object.freeze({
      id: 'run.gates',
      label: 'FIFTY GATES',
      detail: 'Clear 50 gates in one run',
      scope: 'run',
      tier: 'steady',
      target: 50,
      level: next => counter(next, 'gatesCleared')
    }),
    Object.freeze({
      id: 'run.abstain',
      label: 'REFUSE THE GATE',
      detail: 'Bank 3 Gates in one run without entering any',
      scope: 'run',
      tier: 'light',
      target: 3,
      level: next => (counter(next, 'gateEntries') === 0 ? counter(next, 'gateBanks') : 0)
    }),
    Object.freeze({
      id: 'run.streak',
      label: 'UNBROKEN',
      detail: 'Reach a risk streak of 10 in one run',
      scope: 'run',
      tier: 'deep',
      target: 10,
      level: next => counter(next, 'riskStreak')
    }),
    Object.freeze({
      id: 'run.voids',
      label: 'UNSCATHED',
      detail: 'Survive 2 Voids in one run',
      scope: 'run',
      tier: 'deep',
      target: 2,
      level: next => counter(next, 'voidSurvivals')
    })
  ]);

  const BY_ID = Object.freeze(Object.fromEntries(CATALOGUE.map(mission => [mission.id, mission])));

  function getMission(id) {
    return BY_ID[String(id)] || null;
  }

  function validateCatalogue(catalogue = CATALOGUE) {
    const errors = [];
    const seen = new Set();
    for (const mission of catalogue) {
      if (seen.has(mission.id)) errors.push(`${mission.id} is declared twice`);
      seen.add(mission.id);
      if (mission.scope !== 'cumulative' && mission.scope !== 'run') {
        errors.push(`${mission.id} has an unknown scope ${mission.scope}`);
      }
      if (!TIERS.includes(mission.tier)) errors.push(`${mission.id} has an unknown tier ${mission.tier}`);
      if (!Number.isInteger(mission.target) || mission.target <= 0) {
        errors.push(`${mission.id} has a non-positive target`);
      }
      const hasDelta = typeof mission.delta === 'function';
      const hasLevel = typeof mission.level === 'function';
      if (hasDelta === hasLevel) {
        errors.push(`${mission.id} must declare exactly one of delta or level`);
      }
      if (!mission.label || !mission.detail) errors.push(`${mission.id} is missing display text`);
    }
    for (const tier of TIERS) {
      if (!catalogue.some(mission => mission.tier === tier)) {
        errors.push(`no mission occupies the ${tier} tier`);
      }
    }
    if (catalogue.length < ACTIVE_SLOTS + RECENT_LIMIT) {
      errors.push('catalogue is too small for the rotation ring to always find a draw');
    }
    return errors;
  }

  // --- state ---------------------------------------------------------------

  function createState() {
    return {
      version: MISSIONS_VERSION,
      active: [],
      progress: {},
      completed: {},
      recent: []
    };
  }

  function sanitizeState(raw) {
    const state = createState();
    if (!raw || typeof raw !== 'object' || raw.version !== MISSIONS_VERSION) return state;

    state.active = (Array.isArray(raw.active) ? raw.active : [])
      .map(String)
      .filter(id => Boolean(getMission(id)))
      .filter((id, index, list) => list.indexOf(id) === index)
      .slice(0, ACTIVE_SLOTS);

    for (const [id, value] of Object.entries(raw.progress || {})) {
      const mission = getMission(id);
      if (!mission) continue;
      state.progress[id] = Math.max(0, Math.min(mission.target, Math.floor(finiteNumber(value, 0))));
    }

    for (const [id, value] of Object.entries(raw.completed || {})) {
      if (!getMission(id)) continue;
      state.completed[id] = Math.max(0, Math.floor(finiteNumber(value, 0)));
    }

    state.recent = (Array.isArray(raw.recent) ? raw.recent : [])
      .map(String)
      .filter(id => Boolean(getMission(id)))
      .slice(0, RECENT_LIMIT);

    return state;
  }

  /**
   * Picks a replacement mission.
   *
   * Prefers a tier that is currently unrepresented among the active set, so the
   * player is never holding three deep objectives at once with nothing reachable.
   * Falls back through progressively weaker constraints rather than ever failing
   * to fill a slot.
   */
  function chooseMission(state, unitRandom = 0.5, catalogue = CATALOGUE) {
    const active = new Set(state.active);
    const recent = new Set(state.recent);
    const activeTiers = new Set(state.active.map(id => getMission(id)?.tier).filter(Boolean));

    const eligible = catalogue.filter(mission => !active.has(mission.id));
    if (eligible.length === 0) return null;

    const fresh = eligible.filter(mission => !recent.has(mission.id));
    const pool = fresh.length > 0 ? fresh : eligible;
    const balanced = pool.filter(mission => !activeTiers.has(mission.tier));
    const finalPool = balanced.length > 0 ? balanced : pool;

    const index = Math.min(
      finalPool.length - 1,
      Math.max(0, Math.floor(Math.max(0, Math.min(1, finiteNumber(unitRandom, 0.5))) * finalPool.length))
    );
    return finalPool[index];
  }

  function fillActive(state, random = Math.random, catalogue = CATALOGUE) {
    while (state.active.length < ACTIVE_SLOTS) {
      const mission = chooseMission(state, random(), catalogue);
      if (!mission) break;
      state.active.push(mission.id);
      if (!(mission.id in state.progress)) state.progress[mission.id] = 0;
    }
    return state;
  }

  function rotate(state, completedId, random = Math.random, catalogue = CATALOGUE) {
    const slot = state.active.indexOf(completedId);
    if (slot === -1) return state;
    state.completed[completedId] = (state.completed[completedId] || 0) + 1;
    state.progress[completedId] = 0;
    state.recent = [completedId, ...state.recent.filter(id => id !== completedId)].slice(0, RECENT_LIMIT);
    state.active.splice(slot, 1);
    const replacement = chooseMission(state, random(), catalogue);
    if (replacement) {
      state.active.splice(slot, 0, replacement.id);
      if (!(replacement.id in state.progress)) state.progress[replacement.id] = 0;
    }
    return state;
  }

  /**
   * Advances every active mission from one observation of the slice state to the
   * next, and returns the ids that completed on this step.
   *
   * `runBaseline` is the slice state as it stood when the current run began, so
   * run-scoped missions measure against this run rather than all time.
   */
  function advance(state, previous, next, options = {}) {
    const runBaseline = options.runBaseline || null;
    const completed = [];

    for (const id of [...state.active]) {
      const mission = getMission(id);
      if (!mission) continue;
      const current = Math.max(0, Math.floor(finiteNumber(state.progress[id], 0)));
      if (current >= mission.target) continue;

      let updated = current;
      if (typeof mission.delta === 'function') {
        const gained = Math.max(0, Math.floor(finiteNumber(mission.delta(previous, next), 0)));
        updated = current + gained;
      } else {
        // Run-scoped level missions report an absolute high-water mark, so a
        // reset run must not drag a completed-this-session bar back down.
        const level = Math.max(0, Math.floor(finiteNumber(mission.level(next, runBaseline), 0)));
        updated = Math.max(current, level);
      }

      state.progress[id] = Math.min(mission.target, updated);
      if (state.progress[id] >= mission.target) completed.push(id);
    }

    return completed;
  }

  function resetRunScoped(state) {
    for (const id of state.active) {
      const mission = getMission(id);
      if (mission?.scope === 'run') state.progress[id] = 0;
    }
    return state;
  }

  function describe(state) {
    return state.active.map(id => {
      const mission = getMission(id);
      const value = Math.max(0, Math.floor(finiteNumber(state.progress[id], 0)));
      return {
        id,
        label: mission?.label || id,
        detail: mission?.detail || '',
        scope: mission?.scope || 'cumulative',
        tier: mission?.tier || 'steady',
        target: mission?.target || 1,
        progress: Math.min(mission?.target || 1, value),
        complete: value >= (mission?.target || 1)
      };
    });
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
      const probe = '__sex_magick_missions_probe__';
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
      // Only ids and integers are ever persisted. No run content, no timestamps,
      // nothing that could identify a player or a session.
      storage.setItem(key, JSON.stringify({
        version: MISSIONS_VERSION,
        active: state.active,
        progress: state.progress,
        completed: state.completed,
        recent: state.recent
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
  let lastObserved = null;
  let announceTimer = null;

  // Mission progress is per-player persisted state, so a screenshot containing
  // "COURT THE EDGE 7/40" is inherently non-deterministic. The visual-state
  // harness locks other dynamic text for exactly this reason; the HUD opts out
  // of visual QA entirely rather than fight it, and cross-screen.spec.ts covers
  // its geometry structurally instead.
  function visualQaActive() {
    try {
      return new URLSearchParams(root.location?.search || '').get('visualQa') === '1';
    } catch (_error) {
      return false;
    }
  }

  function ensureStyle() {
    if (document.getElementById('sex-magick-missions-style')) return;
    const style = document.createElement('style');
    style.id = 'sex-magick-missions-style';
    // Width, font size and letter spacing come from the custom properties the
    // viewport runtime already publishes per Fold profile, so both postures are
    // handled by existing code rather than by new breakpoints here.
    style.textContent = `
      /* Sits above the bottom-left power-up readout, which is now two short lines
         of passive text rather than the button M19 shipped. The cross-screen suite
         asserts the two never overlap. */
      #sex-magick-missions {
        position: fixed;
        left: 50%;
        bottom: max(46px, calc(env(safe-area-inset-bottom) + 46px));
        transform: translateX(-50%);
        z-index: 27;
        width: var(--sm-hud-width, min(330px, calc(100vw - 120px)));
        pointer-events: none;
        font: var(--sm-hud-font-size, 10px)/1.35 'Orbitron', monospace;
        letter-spacing: var(--sm-hud-letter-spacing, 1.5px);
        color: #dff6ff;
        text-shadow: 0 0 7px rgba(0, 229, 255, .75);
      }
      #sex-magick-missions[hidden] { display: none !important; }
      .sm-mission {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        opacity: .82;
        margin-top: 3px;
      }
      .sm-mission-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .sm-mission-count { flex: 0 0 auto; opacity: .9; }
      .sm-mission.is-complete { opacity: 1; color: #b8ffe6; }
      #sex-magick-missions-announce {
        position: fixed;
        left: 50%;
        bottom: max(170px, calc(env(safe-area-inset-bottom) + 160px));
        transform: translateX(-50%);
        z-index: 29;
        padding: 7px 14px;
        border: 1px solid rgba(0, 229, 255, .7);
        background: rgba(0, 0, 0, .85);
        color: #eaffff;
        text-align: center;
        pointer-events: none;
        font: var(--sm-hud-font-size, 10px)/1.5 'Orbitron', monospace;
        letter-spacing: 2.4px;
        text-shadow: 0 0 10px #00e5ff;
      }
      #sex-magick-missions-announce[hidden] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function ensureHud() {
    ensureStyle();
    let hud = document.getElementById('sex-magick-missions');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'sex-magick-missions';
      hud.hidden = true;
      document.body.appendChild(hud);
    }
    let announce = document.getElementById('sex-magick-missions-announce');
    if (!announce) {
      announce = document.createElement('div');
      announce.id = 'sex-magick-missions-announce';
      announce.hidden = true;
      document.body.appendChild(announce);
    }
    return { hud, announce };
  }

  function renderHud() {
    if (!liveState) return;
    const { hud } = ensureHud();
    if (visualQaActive()) {
      hud.hidden = true;
      return;
    }
    hud.innerHTML = describe(liveState).map(entry => `
      <div class="sm-mission${entry.complete ? ' is-complete' : ''}">
        <span class="sm-mission-name">${entry.label}</span>
        <span class="sm-mission-count">${entry.progress}/${entry.target}</span>
      </div>
    `).join('');
    hud.hidden = false;
  }

  function announceCompletion(label) {
    if (visualQaActive()) return;
    const { announce } = ensureHud();
    announce.textContent = `RITE FULFILLED · ${label}`;
    announce.hidden = false;
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      announce.hidden = true;
      announceTimer = null;
    }, 1600);
  }

  function persist() {
    if (liveState) writeState(liveStorage, liveState);
  }

  function beginRun(gameInstance) {
    if (!liveState) return;
    resetRunScoped(liveState);
    lastObserved = gameInstance?.gateSliceState ? JSON.parse(JSON.stringify(gameInstance.gateSliceState)) : null;
    persist();
    renderHud();
  }

  function observe(gameInstance) {
    if (!liveState) return;
    const next = gameInstance?.gateSliceState;
    if (!next) return;
    const previous = lastObserved || next;
    const completed = advance(liveState, previous, next);
    lastObserved = JSON.parse(JSON.stringify(next));

    if (completed.length > 0) {
      for (const id of completed) {
        announceCompletion(getMission(id)?.label || id);
        rotate(liveState, id);
      }
      persist();
    }
    renderHud();
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_MISSIONS__;
    if (typeof Game === 'undefined' || typeof document === 'undefined') return null;

    liveStorage = safeBrowserStorage();
    liveState = readState(liveStorage);
    fillActive(liveState);
    persist();

    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalReturnToMenu = Game.prototype.returnToMenu;

    Game.prototype.startGame = function startGameWithMissions(...args) {
      const result = originalStartGame.apply(this, args);
      beginRun(this);
      return result;
    };

    Game.prototype.restartGame = function restartGameWithMissions(...args) {
      const result = originalRestartGame.apply(this, args);
      beginRun(this);
      return result;
    };

    Game.prototype.updateGameObjects = function updateGameObjectsWithMissions(...args) {
      const result = originalUpdateGameObjects.apply(this, args);
      observe(this);
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithMissions(...args) {
      persist();
      const hud = document.getElementById('sex-magick-missions');
      if (hud) hud.hidden = true;
      return originalReturnToMenu.apply(this, args);
    };

    installed = true;
    root.__SEX_MAGICK_MISSIONS__ = Object.freeze({
      version: MISSIONS_VERSION,
      mode: 'local-missions-no-network',
      getSnapshot: () => (liveState ? JSON.parse(JSON.stringify(liveState)) : null),
      getActive: () => (liveState ? describe(liveState) : []),
      hudSuppressed: () => visualQaActive(),
      // Test affordance: force a mission to the brink so rotation can be
      // exercised without playing to a real completion.
      forceProgress(id, value) {
        if (!liveState || !getMission(id)) return false;
        liveState.progress[id] = Math.max(0, Math.floor(finiteNumber(value, 0)));
        persist();
        renderHud();
        return true;
      },
      reset() {
        liveState = createState();
        fillActive(liveState);
        lastObserved = null;
        persist();
        renderHud();
        return true;
      }
    });
    return root.__SEX_MAGICK_MISSIONS__;
  }

  function scheduleInstall(timeoutMs = 5000) {
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
    MISSIONS_VERSION,
    STORAGE_KEY,
    ACTIVE_SLOTS,
    RECENT_LIMIT,
    TIERS,
    CATALOGUE,
    getMission,
    validateCatalogue,
    createState,
    sanitizeState,
    chooseMission,
    fillActive,
    rotate,
    advance,
    resetRunScoped,
    describe,
    createMemoryStorage,
    safeBrowserStorage,
    readState,
    writeState,
    install,
    scheduleInstall
  });
});
