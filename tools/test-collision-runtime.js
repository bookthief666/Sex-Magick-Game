'use strict';

const assert = require('node:assert/strict');
const {
  normalizeRect,
  rectsOverlap,
  buildPlayerRect,
  buildPillarRects,
  buildJaggedEdgePoints,
  dispatchPlayerJump,
  resolveJumpRequest,
  advanceBufferedJumpState,
  DEFAULT_INPUT_BUFFER_FRAMES,
  MAX_INPUT_BUFFER_FRAMES
} = require('./collision-runtime.js');
const riteReady = require('./rite-ready-runtime.js');
const leaderboardProfile = require('./leaderboard-profile-runtime.js');

function testNormalization() {
  assert.deepEqual(
    normalizeRect({ left: 20, right: 10, top: 40, bottom: 15 }),
    { left: 10, right: 20, top: 15, bottom: 40, width: 10, height: 25 }
  );
}

function testStrictOverlapPolicy() {
  const a = { left: 0, right: 10, top: 0, bottom: 10 };
  assert.equal(rectsOverlap(a, { left: 9, right: 20, top: 0, bottom: 10 }), true);
  assert.equal(rectsOverlap(a, { left: 10, right: 20, top: 0, bottom: 10 }), false, 'touching edges are not penetration');
  assert.equal(rectsOverlap(a, { left: 2, right: 8, top: 10, bottom: 20 }), false);
}

function testPlayerInset() {
  const player = buildPlayerRect({ x: 100, y: 200, r: 20 }, 4);
  assert.deepEqual(player, {
    left: 84,
    right: 116,
    top: 184,
    bottom: 216,
    width: 32,
    height: 32
  });

  const fullyInset = buildPlayerRect({ x: 5, y: 7, r: 10 }, 999);
  assert.deepEqual(fullyInset, {
    left: 5,
    right: 5,
    top: 7,
    bottom: 7,
    width: 0,
    height: 0
  });
}

function testPillarRects() {
  const rects = buildPillarRects({ x: 300, w: 80, top: 220, gap: 180 }, 800);
  assert.deepEqual(rects, {
    top: { left: 300, right: 380, top: 0, bottom: 220, width: 80, height: 220 },
    bottom: { left: 300, right: 380, top: 400, bottom: 800, width: 80, height: 400 },
    gap: { left: 300, right: 380, top: 220, bottom: 400, width: 80, height: 180 }
  });

  assert.equal(rectsOverlap({ left: 320, right: 340, top: 221, bottom: 399 }, rects.top), false);
  assert.equal(rectsOverlap({ left: 320, right: 340, top: 221, bottom: 399 }, rects.bottom), false);
  assert.equal(rectsOverlap({ left: 320, right: 340, top: 219, bottom: 230 }, rects.top), true);
  assert.equal(rectsOverlap({ left: 320, right: 340, top: 390, bottom: 401 }, rects.bottom), true);
}

function testViewportClamping() {
  const rects = buildPillarRects({ x: -20, w: 60, top: -10, gap: 2000 }, 600);
  assert.equal(rects.top.height, 0);
  assert.equal(rects.gap.top, 0);
  assert.equal(rects.gap.bottom, 600);
  assert.equal(rects.bottom.height, 0);
}

function testRenderedEdgeTruth() {
  const gapTop = 220;
  const gapBottom = 400;
  const topPoints = buildJaggedEdgePoints(80, gapTop, -1);
  const bottomPoints = buildJaggedEdgePoints(80, gapBottom, 1);

  assert.equal(topPoints.length, 6);
  assert.equal(bottomPoints.length, 6);
  assert.ok(topPoints.every(point => point.y <= gapTop - 2), 'top artwork must stay above its collision boundary');
  assert.ok(bottomPoints.every(point => point.y >= gapBottom + 2), 'bottom artwork must stay below its collision boundary');
  assert.deepEqual(topPoints.map(point => point.x), bottomPoints.map(point => point.x));
  assert.throws(() => buildJaggedEdgePoints(80, gapTop, 0), /direction must be/);
}

function testSingleFeedbackJumpDispatch() {
  let jumpCalls = 0;
  const gameLike = {
    state: 'playing',
    player: {
      jump() {
        jumpCalls += 1;
      }
    }
  };

  assert.equal(dispatchPlayerJump(gameLike), true);
  assert.equal(jumpCalls, 1, 'the dispatch layer must call Player.jump exactly once');

  gameLike.state = 'paused';
  assert.equal(dispatchPlayerJump(gameLike), false);
  assert.equal(jumpCalls, 1, 'paused input must not reach Player.jump');

  assert.equal(dispatchPlayerJump({ state: 'playing', player: null }), false);
}

function testBufferedInputClassification() {
  assert.equal(DEFAULT_INPUT_BUFFER_FRAMES, 3);
  assert.equal(MAX_INPUT_BUFFER_FRAMES, 6);
  assert.deepEqual(resolveJumpRequest(0, 3), {
    status: 'immediate', pendingFrames: 0, cooldown: 0, bufferFrames: 3
  });
  assert.deepEqual(resolveJumpRequest(1, 3), {
    status: 'buffered', pendingFrames: 1, cooldown: 1, bufferFrames: 3
  });
  assert.deepEqual(resolveJumpRequest(3, 3), {
    status: 'buffered', pendingFrames: 3, cooldown: 3, bufferFrames: 3
  });
  assert.deepEqual(resolveJumpRequest(4, 3), {
    status: 'rejected', pendingFrames: 0, cooldown: 4, bufferFrames: 3
  });
  assert.equal(resolveJumpRequest(1, 0).status, 'rejected');
  assert.equal(resolveJumpRequest(2, 999).bufferFrames, 6, 'runtime buffer must remain bounded');
}

function testBufferedInputAdvance() {
  assert.deepEqual(advanceBufferedJumpState({ cooldown: 0, pendingFrames: 0 }), {
    status: 'idle', fire: false, pendingFrames: 0
  });
  assert.deepEqual(advanceBufferedJumpState({ cooldown: 2, pendingFrames: 3 }), {
    status: 'pending', fire: false, pendingFrames: 2
  });
  assert.deepEqual(advanceBufferedJumpState({ cooldown: 1, pendingFrames: 2 }), {
    status: 'pending', fire: false, pendingFrames: 1
  });
  assert.deepEqual(advanceBufferedJumpState({ cooldown: 0, pendingFrames: 1 }), {
    status: 'fire', fire: true, pendingFrames: 0
  });
  assert.deepEqual(advanceBufferedJumpState({ cooldown: 2, pendingFrames: 1 }), {
    status: 'expired', fire: false, pendingFrames: 0
  });
}

function testRiteReadyLifecycle() {
  const monas = {
    state: 'playing',
    gameMode: 'MONAS',
    canvas: { height: 1000 },
    player: {
      y: 132,
      vy: 4.5,
      jumpCooldown: 3,
      __sexMagickPendingJumpFrames: 2
    },
    frames: 222,
    tunnelOffset: 77,
    monasState: {
      startedAt: '2026-09-05T00:00:00.000Z',
      endedAt: null
    },
    resetFixedStepTiming() { this.fixedStepResets = (this.fixedStepResets || 0) + 1; }
  };

  riteReady.prepareRiteReadyState(monas);
  assert.equal(riteReady.isReady(monas), true, 'selecting a rite must arm a suspended threshold');

  const activation = riteReady.activateRiteReadyState(monas, '2026-09-05T03:00:00.000Z');
  assert.equal(activation.activated, true);
  assert.equal(activation.rite, 'MONAS');
  assert.equal(riteReady.isReady(monas), false, 'first gameplay input must release the threshold');
  assert.equal(monas.player.y, 500, 'ready activation starts from the viewport centre');
  assert.equal(monas.player.vy, 0, 'no gravity or stale velocity may leak across the threshold');
  assert.equal(monas.player.jumpCooldown, 0);
  assert.equal(monas.player.__sexMagickPendingJumpFrames, 0);
  assert.equal(monas.frames, 0, 'presentation-only ready frames are not gameplay frames');
  assert.equal(monas.tunnelOffset, 0);
  assert.equal(monas.monasState.startedAt, '2026-09-05T03:00:00.000Z',
    'MONAS duration begins on deliberate input, not the rite-selection click');
  assert.equal(monas.fixedStepResets, 1, 'fixed-step accumulation must be cleared at activation');

  const hex = {
    state: 'playing',
    gameMode: 'HEX',
    canvas: { height: 800 },
    player: { y: 300, vy: 2, jumpCooldown: 1 },
    frames: 9,
    tunnelOffset: 18,
    gateSliceState: {
      startedAt: '2026-09-05T00:00:00.000Z',
      endedAt: null
    }
  };
  riteReady.prepareRiteReadyState(hex);
  const hexActivation = riteReady.activateRiteReadyState(hex, '2026-09-05T03:01:00.000Z');
  assert.equal(hexActivation.rite, 'HEX');
  assert.equal(hex.player.y, 400);
  assert.equal(hex.gateSliceState.startedAt, '2026-09-05T03:01:00.000Z',
    'HEX duration begins on deliberate input too');

  assert.deepEqual(riteReady.activateRiteReadyState(hex, '2026-09-05T03:02:00.000Z'), { activated: false },
    'a second input must not rebase an already-active run');
  assert.equal(hex.gateSliceState.startedAt, '2026-09-05T03:01:00.000Z');
}

function testLeaderboardHandleSanitisation() {
  assert.equal(leaderboardProfile.MAX_HANDLE_LENGTH, 18);
  assert.equal(leaderboardProfile.sanitiseHandle('Nuit 93'), 'NUIT 93');
  assert.equal(leaderboardProfile.sanitiseHandle("  nuit!93/a-a  "), 'NUIT93A-A');
  assert.equal(leaderboardProfile.sanitiseHandle("A.B C-D'E"), "A.B C-D'E");
  assert.equal(leaderboardProfile.sanitiseHandle(''), 'ANON');
  assert.equal(leaderboardProfile.sanitiseHandle('', ''), '', 'live editing may keep an empty field without inventing ANON');
  assert.equal(leaderboardProfile.sanitiseHandle('abcdefghijklmnopqrstuvwxyz'), 'ABCDEFGHIJKLMNOPQR',
    'the browser profile must enforce the same 18-character ceiling as the Worker');
}

testNormalization();
testStrictOverlapPolicy();
testPlayerInset();
testPillarRects();
testViewportClamping();
testRenderedEdgeTruth();
testSingleFeedbackJumpDispatch();
testBufferedInputClassification();
testBufferedInputAdvance();
testRiteReadyLifecycle();
testLeaderboardHandleSanitisation();

console.log('collision-runtime: all geometry, input, rite-ready, and board-profile contracts passed');
