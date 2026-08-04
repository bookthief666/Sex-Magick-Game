'use strict';

const assert = require('node:assert/strict');
const {
  GRAMMAR_VERSION,
  STORAGE_KEY,
  DEFAULT_MAX_RUNS,
  MIN_TOP_RATIO,
  MAX_TOP_RATIO,
  MAX_RATIO_DELTA,
  FAMILY_CYCLE,
  PATTERN_LIBRARY,
  hashStringToSeed,
  createSeededRandom,
  materializePattern,
  validatePatternLibrary,
  computeTopFromRatio,
  computeSpawnRate,
  isSpawnFrame,
  PatternScheduler,
  createMemoryStorage,
  safeReadHistory,
  PatternRunLedger
} = require('./obstacle-grammar.js');

function simplify(sequence) {
  return sequence.map(item => ({
    patternId: item.patternId,
    family: item.family,
    patternStep: item.patternStep,
    topRatio: item.topRatio,
    top: item.top,
    orb: item.orb,
    innerPattern: item.innerPattern,
    warning: item.warning
  }));
}

function generate(seed, rite, count = 72) {
  const scheduler = new PatternScheduler({ seed, rite });
  return Array.from({ length: count }, () => scheduler.next({
    viewportHeight: 844,
    gap: 200,
    orbChance: 0.5
  }));
}

function testCatalogContracts() {
  assert.equal(validatePatternLibrary(PATTERN_LIBRARY).length, 0);
  for (const rite of ['HEX', 'MONAS']) {
    for (const family of new Set(FAMILY_CYCLE)) {
      assert.ok(PATTERN_LIBRARY[rite].some(pattern => pattern.family === family));
    }
  }
}

function testSeedDeterminism() {
  const seed = hashStringToSeed('run_example|HEX|grammar-1');
  assert.equal(seed, hashStringToSeed('run_example|HEX|grammar-1'));
  assert.notEqual(seed, hashStringToSeed('run_other|HEX|grammar-1'));

  const first = simplify(generate(seed, 'HEX'));
  const second = simplify(generate(seed, 'HEX'));
  assert.deepEqual(first, second, 'same seed and Rite must replay exactly');

  const differentSeed = simplify(generate(seed + 1, 'HEX'));
  assert.notDeepEqual(first, differentSeed, 'different seeds should change the sequence');

  const differentRite = simplify(generate(seed, 'MONAS'));
  assert.notDeepEqual(first, differentRite, 'Rites must have distinct pattern grammar');
}

function testRandomRange() {
  const random = createSeededRandom(1234);
  for (let index = 0; index < 1000; index += 1) {
    const value = random();
    assert.ok(value >= 0 && value < 1);
  }
}

function testTransitionEnvelope() {
  for (const rite of ['HEX', 'MONAS']) {
    const sequence = generate(0x12345678, rite, 300);
    for (let index = 0; index < sequence.length; index += 1) {
      const current = sequence[index];
      assert.ok(current.topRatio >= MIN_TOP_RATIO && current.topRatio <= MAX_TOP_RATIO);
      assert.ok(current.top >= 30);
      assert.ok(current.top + current.gap <= 844 - 50 + 0.001);
      if (index > 0) {
        const delta = Math.abs(current.topRatio - sequence[index - 1].topRatio);
        assert.ok(delta <= MAX_RATIO_DELTA + 1e-12, `${rite} transition ${delta} exceeded envelope`);
      }
    }
  }
}

function testFamilyPacing() {
  const sequence = generate(0x0badc0de, 'HEX', 180);
  const patternStarts = sequence.filter(item => item.patternStep === 0);
  assert.ok(patternStarts.length >= FAMILY_CYCLE.length * 2);

  for (let index = 0; index < patternStarts.length; index += 1) {
    assert.equal(patternStarts[index].family, FAMILY_CYCLE[index % FAMILY_CYCLE.length]);
    if (index > 0) {
      assert.ok(!(patternStarts[index - 1].family === 'climax' && patternStarts[index].family === 'climax'));
    }
  }
}

function testPatternMaterialization() {
  const pattern = PATTERN_LIBRARY.HEX.find(item => item.id === 'hex.staircase');
  const base = materializePattern(pattern, 0.5, 1);
  const mirror = materializePattern(pattern, 0.5, -1);
  assert.equal(base[0], 0.5);
  assert.equal(mirror[0], 0.5);
  assert.equal(base[1], 0.42);
  assert.equal(mirror[1], 0.58);
}

function testResponsiveTopMapping() {
  const phoneTop = computeTopFromRatio(844, 200, 0.5);
  const foldTop = computeTopFromRatio(1104, 200, 0.5);
  assert.ok(foldTop > phoneTop);
  assert.equal(computeTopFromRatio(844, 200, -100), computeTopFromRatio(844, 200, MIN_TOP_RATIO));
  assert.equal(computeTopFromRatio(844, 200, 100), computeTopFromRatio(844, 200, MAX_TOP_RATIO));
}

function testSpawnCadencePreservation() {
  assert.equal(computeSpawnRate(2.9, 140), Math.max(20, Math.floor(140 / (2.9 / 3))));
  const config = { PILLAR_SPAWN_BASE: 140 };
  const game = { gameSpeed: 2.9, frames: 0, voidMode: false };
  const rate = computeSpawnRate(game.gameSpeed, config.PILLAR_SPAWN_BASE);
  assert.equal(isSpawnFrame(game, config), false);
  game.frames = rate - 1;
  assert.equal(isSpawnFrame(game, config), false);
  game.frames = rate;
  assert.equal(isSpawnFrame(game, config), true);
  game.voidMode = true;
  assert.equal(isSpawnFrame(game, config), false);
}

function testLedgerRetentionAndPrivacy() {
  let now = 1_700_000_000_000;
  const storage = createMemoryStorage();
  const ledger = new PatternRunLedger({
    storage,
    maxRuns: 2,
    maxSpawns: 10,
    now: () => now++
  });

  for (let run = 0; run < 3; run += 1) {
    ledger.begin({ runId: `run_${run}`, seed: run + 1, rite: run % 2 ? 'MONAS' : 'HEX' });
    const scheduler = new PatternScheduler({ seed: run + 1, rite: run % 2 ? 'MONAS' : 'HEX' });
    for (let spawn = 0; spawn < 12; spawn += 1) {
      ledger.recordSpawn(scheduler.next({ viewportHeight: 844, gap: 200, orbChance: 0.5 }), {
        frames: spawn * 140,
        score: spawn
      });
    }
    ledger.end('menu');
  }

  const snapshot = ledger.snapshot();
  assert.equal(snapshot.recent.length, 2);
  assert.equal(snapshot.recent[0].runId, 'run_2');
  assert.equal(snapshot.recent[0].patternEvents.length, 10);
  assert.equal(safeReadHistory(storage, STORAGE_KEY, DEFAULT_MAX_RUNS).length, 2);

  const persisted = storage.getItem(STORAGE_KEY);
  for (const forbidden of ['player_identifier', 'session_token', 'userAgent', 'ipAddress', 'deviceId', 'email']) {
    assert.equal(persisted.includes(forbidden), false);
  }
}

function testMalformedHistoryFallback() {
  const storage = createMemoryStorage({ [STORAGE_KEY]: '{broken' });
  assert.deepEqual(safeReadHistory(storage), []);
}

testCatalogContracts();
testSeedDeterminism();
testRandomRange();
testTransitionEnvelope();
testFamilyPacing();
testPatternMaterialization();
testResponsiveTopMapping();
testSpawnCadencePreservation();
testLedgerRetentionAndPrivacy();
testMalformedHistoryFallback();

console.log(`obstacle-grammar v${GRAMMAR_VERSION}: all deterministic contracts passed`);
