'use strict';

const assert = require('node:assert/strict');
const monas = require('./monas-runtime.js');

function approximately(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}

// --- glide --------------------------------------------------------------------

{
  // Released, the glyph sinks: gravity applies and damping bleeds a little of it.
  const step = monas.advanceGlide({ y: 400, vy: 0 }, { held: false });
  approximately(step.vy, 0.18 * 0.98);
  approximately(step.y, 400 + (0.18 * 0.98));
}

{
  // Held, lift outweighs gravity and the glyph rises.
  const step = monas.advanceGlide({ y: 400, vy: 0 }, { held: true });
  assert.ok(step.vy < 0, `held flight must rise, got vy ${step.vy}`);
  approximately(step.vy, (0.18 - 0.62) * 0.98);
}

{
  // Holding does not accelerate without limit - the rise ceiling binds.
  let state = { y: 800, vy: 0 };
  for (let frame = 0; frame < 240; frame += 1) state = monas.advanceGlide(state, { held: true });
  assert.ok(state.vy >= monas.MAX_RISE - 1e-9, `rise must clamp at ${monas.MAX_RISE}, got ${state.vy}`);
  assert.ok(state.vy <= monas.MAX_RISE + 1.5, `rise must actually reach its ceiling, got ${state.vy}`);
}

{
  // And neither does falling.
  let state = { y: 0, vy: 0 };
  for (let frame = 0; frame < 600; frame += 1) state = monas.advanceGlide(state, { held: false });
  assert.ok(state.vy <= monas.MAX_FALL + 1e-9, `fall must clamp at ${monas.MAX_FALL}, got ${state.vy}`);
}

{
  // The defining property: altitude is controllable by holding, not by tapping. A
  // steady hold from rest gains height, a release from the same state loses it.
  let rising = { y: 500, vy: 0 };
  let sinking = { y: 500, vy: 0 };
  for (let frame = 0; frame < 60; frame += 1) {
    rising = monas.advanceGlide(rising, { held: true });
    sinking = monas.advanceGlide(sinking, { held: false });
  }
  assert.ok(rising.y < 500, 'a held second must gain height');
  assert.ok(sinking.y > 500, 'a released second must lose height');
}

{
  // Damping means a climb bleeds off rather than persisting forever once released,
  // which is what makes the medium feel like a medium.
  let state = { y: 500, vy: monas.MAX_RISE };
  const first = monas.advanceGlide(state, { held: false });
  assert.ok(first.vy > monas.MAX_RISE, 'releasing must begin to shed upward momentum');
}

// --- coherence ----------------------------------------------------------------

{
  // Dead centre, flown smoothly, is a full point.
  const result = monas.scoreCoherence({ gap: 200, offset: 0, reversals: 0 });
  approximately(result.centred, 1);
  approximately(result.smooth, 1);
  approximately(result.gained, 1);
}

{
  // The edge is worth nothing - the exact inverse of HEX, where the edge pays most.
  const result = monas.scoreCoherence({ gap: 200, offset: 100, reversals: 0 });
  approximately(result.centred, 0);
  approximately(result.gained, 0);
}

{
  // Half way out is worth less than centre but more than nothing.
  const result = monas.scoreCoherence({ gap: 200, offset: 40, reversals: 0 });
  assert.ok(result.gained > 0 && result.gained < 1, `mid-gap pass should partially pay, got ${result.gained}`);
}

{
  // A centred pass reached by thrashing pays less than a centred pass held steady.
  const steady = monas.scoreCoherence({ gap: 200, offset: 0, reversals: 0 });
  const thrashed = monas.scoreCoherence({ gap: 200, offset: 0, reversals: 8 });
  assert.ok(thrashed.gained < steady.gained, 'a sawtooth line must be worth less than a held one');
  assert.ok(thrashed.gained > 0, 'but it is still a centred pass and still pays something');
}

{
  // Ordinary control is not punished: a couple of corrections is free.
  const result = monas.scoreCoherence({ gap: 200, offset: 0, reversals: monas.SMOOTH_REVERSALS });
  approximately(result.smooth, 1);
}

{
  // Gap size is relative, not absolute: the same fraction of a tighter gap is worth
  // the same, so later bands are not quietly harder to score in.
  const wide = monas.scoreCoherence({ gap: 220, offset: 22, reversals: 0 });
  const tight = monas.scoreCoherence({ gap: 120, offset: 12, reversals: 0 });
  approximately(wide.gained, tight.gained, 1e-9);
}

// --- run state and the surge ----------------------------------------------------

{
  const state = monas.createMonasState();
  assert.equal(state.rite, 'MONAS');
  assert.equal(state.coherence, 0);
  assert.equal(state.surgeActive, false);
  assert.equal(state.coherenceCapacity, monas.COHERENCE_CAPACITY);
}

{
  // Ten perfect passes fill the meter and open a surge, which spends it back to zero.
  let state = monas.createMonasState();
  let started = 0;
  for (let pass = 0; pass < monas.COHERENCE_CAPACITY; pass += 1) {
    const applied = monas.applyCoherence(state, { gap: 200, offset: 0, reversals: 0 });
    state = applied.state;
    if (applied.surgeStarted) started += 1;
  }
  assert.equal(started, 1, 'the meter opens exactly one surge when it fills');
  assert.equal(state.surgeActive, true);
  assert.equal(state.coherence, 0, 'the surge spends the meter');
  assert.equal(state.surges, 1);
  assert.equal(state.perfectPasses, monas.COHERENCE_CAPACITY);
  assert.equal(state.gatesPassed, monas.COHERENCE_CAPACITY);
}

{
  // Edge passes never fill the meter, however many of them there are.
  let state = monas.createMonasState();
  for (let pass = 0; pass < 50; pass += 1) {
    state = monas.applyCoherence(state, { gap: 200, offset: 100, reversals: 0 }).state;
  }
  assert.equal(state.coherence, 0, 'flying the edges earns no Coherence at all');
  assert.equal(state.surgeActive, false);
  assert.equal(state.gatesPassed, 50, 'though the passes still count as passes');
}

{
  // Coherence does not accumulate during a surge - the surge is the spending of it.
  let state = { ...monas.createMonasState(), surgeActive: true, surgeFramesRemaining: 60 };
  const applied = monas.applyCoherence(state, { gap: 200, offset: 0, reversals: 0 });
  assert.equal(applied.state.coherence, 0);
  assert.equal(applied.surgeStarted, false);
  assert.equal(applied.state.gatesPassed, 1);
}

{
  // The surge runs down frame by frame and ends exactly once.
  let state = { ...monas.createMonasState(), surgeActive: true, surgeFramesRemaining: 3 };
  let ended = 0;
  for (let frame = 0; frame < 5; frame += 1) {
    const ticked = monas.tickSurge(state);
    state = ticked.state;
    if (ticked.surgeEnded) ended += 1;
  }
  assert.equal(ended, 1, 'a surge ends once and stays ended');
  assert.equal(state.surgeActive, false);
  assert.equal(state.surgeFramesRemaining, 0);
}

{
  // The meter cannot be pushed past its capacity by an over-generous pass.
  let state = { ...monas.createMonasState(), coherence: monas.COHERENCE_CAPACITY - 0.1 };
  const applied = monas.applyCoherence(state, { gap: 200, offset: 0, reversals: 0 });
  assert.equal(applied.surgeStarted, true);
  assert.equal(applied.state.coherence, 0);
}

// --- the rite is genuinely inverted ---------------------------------------------

{
  // Stated as an assertion rather than a comment: the pass that HEX pays most for -
  // a graze at the very edge of the gap - is the pass MONAS pays least for.
  const graze = monas.scoreCoherence({ gap: 160, offset: 78, reversals: 0 });
  const centre = monas.scoreCoherence({ gap: 160, offset: 0, reversals: 0 });
  assert.ok(graze.gained < 0.05, `a graze must be near-worthless in MONAS, got ${graze.gained}`);
  assert.ok(centre.gained > 0.95, `the centre must be worth most, got ${centre.gained}`);
}

console.log('monas-runtime: all assertions passed');
