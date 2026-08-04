(function attachSexMagickGateEvidence(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickGateEvidence = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.scheduleInstall();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGateEvidenceApi(root) {
  'use strict';

  const VERSION = 1;
  const DECISION_MOVE_THRESHOLD_PX = 6;
  const MAX_DECISIONS = 200;

  let installed = false;
  let installTimer = null;
  let sessionId = null;
  let sessionStartedAt = null;
  let sessionStoppedAt = null;
  let runSnapshots = new Map();
  let decisions = [];
  let activeDecision = null;
  let unsafeCrossings = [];

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
  }

  function uniqueRunRecords(records = []) {
    const map = new Map();
    for (const record of records) {
      const runId = String(record?.runId || '').trim();
      if (!runId) continue;
      const existing = map.get(runId);
      const existingEnded = Boolean(existing?.endedAt);
      const incomingEnded = Boolean(record?.endedAt);
      if (!existing || incomingEnded || !existingEnded) map.set(runId, clone(record));
    }
    return [...map.values()];
  }

  function aggregateRuns(records = []) {
    const unique = uniqueRunRecords(records);
    const totals = {
      runsObserved: unique.length,
      completedRuns: 0,
      gatesCleared: 0,
      gateOffers: 0,
      gateEntries: 0,
      gateBanks: 0,
      voidAttempts: 0,
      voidSurvivals: 0,
      voidDeaths: 0,
      unsafeCrossings: 0
    };

    for (const record of unique) {
      if (record.endedAt) totals.completedRuns += 1;
      for (const key of [
        'gatesCleared',
        'gateOffers',
        'gateEntries',
        'gateBanks',
        'voidAttempts',
        'voidSurvivals',
        'voidDeaths',
        'unsafeCrossings'
      ]) {
        totals[key] += Math.max(0, finiteNumber(record?.[key], 0));
      }
    }

    return {
      ...totals,
      gateEntryRate: totals.gateOffers > 0
        ? Number((totals.gateEntries / totals.gateOffers).toFixed(4))
        : null,
      gateBankRate: totals.gateOffers > 0
        ? Number((totals.gateBanks / totals.gateOffers).toFixed(4))
        : null,
      voidSurvivalRate: totals.voidAttempts > 0
        ? Number((totals.voidSurvivals / totals.voidAttempts).toFixed(4))
        : null
    };
  }

  function createDecisionRecord(offer, gameInstance) {
    const playerY = finiteNumber(gameInstance?.player?.y, 0);
    const offerY = finiteNumber(offer?.y, 0);
    const verticalError = Math.abs(playerY - offerY);
    const horizontalDistance = Math.abs(finiteNumber(offer?.x, 0) - finiteNumber(gameInstance?.player?.x, 0));
    return {
      serial: finiteNumber(offer?.serial, 0),
      offeredAtFrame: finiteNumber(offer?.offeredAtFrame, finiteNumber(gameInstance?.frames, 0)),
      resolvedAtFrame: null,
      framesVisible: 0,
      resolution: null,
      startPlayerY: playerY,
      gateY: offerY,
      startVerticalError: verticalError,
      minimumVerticalError: verticalError,
      startHorizontalDistance: horizontalDistance,
      minimumDistance: Math.hypot(horizontalDistance, verticalError),
      movementTowardPx: 0,
      movedTowardGate: false
    };
  }

  function updateDecisionRecord(record, offer, gameInstance) {
    if (!record || !offer) return record;
    const playerY = finiteNumber(gameInstance?.player?.y, 0);
    const playerX = finiteNumber(gameInstance?.player?.x, 0);
    const verticalError = Math.abs(playerY - finiteNumber(offer.y, 0));
    const horizontalDistance = Math.abs(finiteNumber(offer.x, 0) - playerX);
    const distance = Math.hypot(horizontalDistance, verticalError);
    record.framesVisible = Math.max(
      record.framesVisible,
      finiteNumber(gameInstance?.frames, 0) - record.offeredAtFrame
    );
    record.minimumVerticalError = Math.min(record.minimumVerticalError, verticalError);
    record.minimumDistance = Math.min(record.minimumDistance, distance);
    record.movementTowardPx = Number((record.startVerticalError - record.minimumVerticalError).toFixed(3));
    record.movedTowardGate = record.movementTowardPx >= DECISION_MOVE_THRESHOLD_PX;
    return record;
  }

  function finalizeDecision(record, resolution, gameInstance) {
    if (!record) return null;
    record.resolution = resolution || 'unknown';
    record.resolvedAtFrame = finiteNumber(gameInstance?.frames, record.offeredAtFrame + record.framesVisible);
    record.framesVisible = Math.max(record.framesVisible, record.resolvedAtFrame - record.offeredAtFrame);
    decisions.push(clone(record));
    if (decisions.length > MAX_DECISIONS) decisions.splice(0, decisions.length - MAX_DECISIONS);
    return record;
  }

  function recordRun(state) {
    if (!state?.runId) return;
    runSnapshots.set(String(state.runId), clone(state));
  }

  function captureGame(gameInstance) {
    if (!gameInstance?.gateSliceState) return;
    recordRun(gameInstance.gateSliceState);
  }

  function resetSession(options = {}) {
    sessionId = String(options.sessionId || `m9_${Date.now().toString(36)}`);
    sessionStartedAt = options.startedAt || new Date().toISOString();
    sessionStoppedAt = null;
    runSnapshots = new Map();
    decisions = [];
    activeDecision = null;
    unsafeCrossings = [];
    if (typeof game !== 'undefined' && game) captureGame(game);
    return getSessionSnapshot();
  }

  function getSessionSnapshot() {
    if (typeof game !== 'undefined' && game) captureGame(game);
    const runs = uniqueRunRecords([...runSnapshots.values()]);
    const aggregate = aggregateRuns(runs);
    const decisionSummary = {
      count: decisions.length,
      entries: decisions.filter(item => item.resolution === 'entry').length,
      banks: decisions.filter(item => item.resolution === 'bank').length,
      movedToward: decisions.filter(item => item.movedTowardGate).length,
      deliberateEntryProxy: decisions.filter(item => item.resolution === 'entry' && item.movedTowardGate).length,
      averageVisibleFrames: decisions.length
        ? Number((decisions.reduce((sum, item) => sum + finiteNumber(item.framesVisible, 0), 0) / decisions.length).toFixed(2))
        : null
    };

    return {
      version: VERSION,
      sessionId,
      startedAt: sessionStartedAt,
      stoppedAt: sessionStoppedAt,
      runs,
      aggregate: {
        ...aggregate,
        unsafeCrossings: unsafeCrossings.length
      },
      decisions: clone(decisions),
      decisionSummary,
      unsafeCrossings: clone(unsafeCrossings),
      activeDecision: clone(activeDecision)
    };
  }

  function stopSession() {
    sessionStoppedAt = new Date().toISOString();
    if (activeDecision && typeof game !== 'undefined' && game) {
      finalizeDecision(activeDecision, 'unresolved-at-session-end', game);
      activeDecision = null;
    }
    if (typeof game !== 'undefined' && game) captureGame(game);
    return getSessionSnapshot();
  }

  function dependenciesReady() {
    return (
      typeof Game !== 'undefined' &&
      typeof GameState !== 'undefined' &&
      Boolean(Game.prototype.__gateSliceRuntimeInstalled) &&
      Boolean(root.__SEX_MAGICK_GATE_SLICE__)
    );
  }

  function install() {
    if (installed || Game.prototype.__gateEvidenceRuntimeInstalled) return root.__SEX_MAGICK_GATE_EVIDENCE__;
    if (!dependenciesReady()) return null;
    installed = true;

    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalStartGame = Game.prototype.startGame;
    const originalRestartGame = Game.prototype.restartGame;
    const originalReturnToMenu = Game.prototype.returnToMenu;
    const originalGameOver = Game.prototype.gameOver;

    Game.prototype.updateGameObjects = function updateGameObjectsWithEvidence(...args) {
      const beforeState = clone(this.gateSliceState);
      const beforeScore = finiteNumber(this.score, 0);
      const beforeEntries = finiteNumber(beforeState?.gateEntries, 0);
      const beforeBanks = finiteNumber(beforeState?.gateBanks, 0);
      const beforeOffer = this.gateSliceOffer ? clone(this.gateSliceOffer) : null;

      const result = originalUpdateGameObjects.apply(this, args);

      const afterState = this.gateSliceState;
      const unsafeNewClear = Boolean(
        beforeState &&
        afterState?.lastClear?.zone === 'unsafe' &&
        finiteNumber(afterState.gatesCleared, 0) > finiteNumber(beforeState.gatesCleared, 0)
      );

      if (unsafeNewClear) {
        const unsafeRecord = {
          type: 'unsafe-crossing',
          runId: beforeState.runId,
          frame: finiteNumber(this.frames, 0),
          family: afterState.lastClear.family,
          minimumClearance: finiteNumber(afterState.lastClear.minimumClearance, 0),
          scoreBefore: beforeScore
        };
        unsafeCrossings.push(unsafeRecord);
        if (unsafeCrossings.length > 200) unsafeCrossings.splice(0, unsafeCrossings.length - 200);

        const restored = clone(beforeState);
        restored.unsafeCrossings = finiteNumber(restored.unsafeCrossings, 0) + 1;
        restored.events = Array.isArray(restored.events) ? restored.events : [];
        restored.events.push(unsafeRecord);
        if (restored.events.length > 120) restored.events.splice(0, restored.events.length - 120);
        this.gateSliceState = restored;
        this.score = beforeScore;
        const scoreUi = document.getElementById('scoreUi');
        if (scoreUi) scoreUi.textContent = String(this.score);
      }

      const currentOffer = this.gateSliceOffer;
      if (currentOffer) {
        if (!activeDecision || activeDecision.serial !== finiteNumber(currentOffer.serial, 0)) {
          if (activeDecision) finalizeDecision(activeDecision, 'superseded', this);
          activeDecision = createDecisionRecord(currentOffer, this);
        }
        updateDecisionRecord(activeDecision, currentOffer, this);
      } else if (activeDecision) {
        const currentState = this.gateSliceState;
        const entriesDelta = finiteNumber(currentState?.gateEntries, 0) - beforeEntries;
        const banksDelta = finiteNumber(currentState?.gateBanks, 0) - beforeBanks;
        const resolution = entriesDelta > 0 ? 'entry' : banksDelta > 0 ? 'bank' : 'unknown';
        if (beforeOffer) updateDecisionRecord(activeDecision, beforeOffer, this);
        finalizeDecision(activeDecision, resolution, this);
        activeDecision = null;
      }

      captureGame(this);
      return result;
    };

    Game.prototype.startGame = function startGameWithEvidence(...args) {
      if (this.gateSliceState) captureGame(this);
      const result = originalStartGame.apply(this, args);
      captureGame(this);
      return result;
    };

    Game.prototype.restartGame = function restartGameWithEvidence(...args) {
      if (this.gateSliceState) captureGame(this);
      const result = originalRestartGame.apply(this, args);
      captureGame(this);
      return result;
    };

    Game.prototype.returnToMenu = function returnToMenuWithEvidence(...args) {
      if (this.gateSliceState) captureGame(this);
      return originalReturnToMenu.apply(this, args);
    };

    Game.prototype.gameOver = function gameOverWithEvidence(...args) {
      const result = originalGameOver.apply(this, args);
      captureGame(this);
      return result;
    };

    Game.prototype.__gateEvidenceRuntimeInstalled = true;

    root.__SEX_MAGICK_GATE_EVIDENCE__ = Object.freeze({
      mode: 'session-scoped-gate-evidence',
      version: VERSION,
      resetSession,
      startSession: resetSession,
      stopSession,
      getSessionSnapshot,
      aggregateRuns,
      uniqueRunRecords
    });

    resetSession({ sessionId: new URLSearchParams(root.location?.search || '').get('session') || undefined });
    return root.__SEX_MAGICK_GATE_EVIDENCE__;
  }

  function scheduleInstall() {
    if (installTimer || installed) return;
    const started = Date.now();
    installTimer = setInterval(() => {
      if (dependenciesReady()) {
        clearInterval(installTimer);
        installTimer = null;
        install();
        return;
      }
      if (Date.now() - started > 12_000) {
        clearInterval(installTimer);
        installTimer = null;
        console.error('[SEX MAGICK] Gate evidence runtime dependencies did not become ready');
      }
    }, 20);
  }

  return Object.freeze({
    VERSION,
    DECISION_MOVE_THRESHOLD_PX,
    MAX_DECISIONS,
    clone,
    uniqueRunRecords,
    aggregateRuns,
    createDecisionRecord,
    updateDecisionRecord,
    finalizeDecision,
    install,
    scheduleInstall
  });
});