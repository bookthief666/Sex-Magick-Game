'use strict';

const assert = require('node:assert/strict');
const monas = require('./monas-runtime.js');
const grammar = require('./obstacle-grammar.js');
const variety = require('./obstacle-variety-runtime.js');
const reach = require('./monas-reachability.js');

function approximately(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

// --- the solver advances the live hold/release law, not the old jump model -------
{
  const held = reach.advanceControlState(
    { y: 500, vy: 0, held: false, releaseAge: monas.HANG_FRAMES },
    { held: true, viewportHeight: 882 }
  );
  const released = reach.advanceControlState(
    { y: 500, vy: 0, held: false, releaseAge: monas.HANG_FRAMES },
    { held: false, viewportHeight: 882 }
  );
  assert.ok(held.y < 500 && held.vy < 0, 'HOLD must climb');
  assert.ok(released.y > 500 && released.vy > 0, 'RELEASE must sink');
  assert.equal(held.releaseAge, 0, 'holding resets release age exactly like Player.update');
}

{
  const firstRelease = reach.advanceControlState(
    { y: 500, vy: -2, held: true, releaseAge: 0 },
    { held: false, viewportHeight: 882 }
  );
  assert.equal(firstRelease.releaseAge, 1, 'the first real frame after HOLD uses release age 1');
  const expected = monas.advanceGlide({ y: 500, vy: -2 }, { held: false, framesSinceRelease: 1 });
  approximately(firstRelease.y, expected.y);
  approximately(firstRelease.vy, expected.vy);
}

// --- ordinary and Warp Surge conditions are represented independently ------------
{
  const ordinary = reach.resolveRunConditions({ baseSpeed: 4, nominalGap: 180, mode: 'ordinary' });
  const surge = reach.resolveRunConditions({ baseSpeed: 4, nominalGap: 180, mode: 'surge' });
  approximately(ordinary.speed, 4);
  approximately(ordinary.spawnGap, 170);
  approximately(surge.speed, 4 * monas.SURGE_SPEED_MULTIPLIER);
  approximately(surge.spawnGap, 170 * reach.SURGE_GAP_MULTIPLIER);
}

// --- moving pattern walls are converted into their phase-independent corridor -----
{
  const corridor = reach.conservativeGeometry({
    gap: 180,
    top: 200,
    gapScale: 0.9,
    motionAmplitude: 24
  });
  assert.equal(corridor.phaseIndependent, true);
  assert.ok(corridor.motionAmplitude > 0, 'a wide corridor should retain requested motion headroom');
  assert.ok(
    variety.motionRespectsVerifiedCorridor(corridor.runtimeGap, corridor.motionAmplitude),
    'the conservative corridor must satisfy the variety runtime invariant'
  );
  approximately(corridor.gap, corridor.runtimeGap - (2 * corridor.motionAmplitude));
}

// --- a simple real MONAS pattern produces an exact replayable witness -------------
{
  const stillPoint = grammar.PATTERN_LIBRARY.MONAS.find(pattern => pattern.id === 'monas.still-point');
  const ratios = grammar.materializePattern(stillPoint, 0.5, 1);
  const solved = reach.solveHoldSequence({
    ratios,
    viewportWidth: 374,
    viewportHeight: 882,
    baseSpeed: 2.9,
    nominalGap: 260,
    mode: 'ordinary',
    gapScale: stillPoint.gapScale,
    motionAmplitude: stillPoint.motion,
    margin: 8,
    beamWidth: 500
  });
  assert.equal(solved.witnessFound, true, 'the start-state still-point pattern should have a witness');
  assert.equal(solved.witnessValid, true, 'a found witness must replay exactly');
  assert.ok(solved.minimumClearance >= 8 - 1e-9, `expected >=8px clearance, got ${solved.minimumClearance}`);

  const replay = reach.replayHoldWitness({
    ratios,
    transitions: solved.transitions,
    viewportWidth: 374,
    viewportHeight: 882,
    baseSpeed: 2.9,
    nominalGap: 260,
    mode: 'ordinary',
    gapScale: stillPoint.gapScale,
    motionAmplitude: stillPoint.motion,
    margin: 8
  });
  assert.equal(replay.valid, true);
  approximately(replay.minimumClearance, solved.minimumClearance, 1e-6);
}

// --- classification never promotes search exhaustion to "impossible" ------------
{
  const stillPoint = grammar.PATTERN_LIBRARY.MONAS.find(pattern => pattern.id === 'monas.still-point');
  const ratios = grammar.materializePattern(stillPoint, 0.5, 1);
  const classification = reach.classifyHoldSequence({
    ratios,
    viewportWidth: 374,
    viewportHeight: 882,
    baseSpeed: 2.9,
    nominalGap: 260,
    gapScale: stillPoint.gapScale,
    motionAmplitude: stillPoint.motion,
    beamWidth: 500
  });
  assert.equal(classification.classification, 'verified');
  assert.equal(classification.verifiedMargin, 8);
  assert.equal(classification.result.witnessValid, true);
}

console.log('monas-reachability: all assertions passed');
