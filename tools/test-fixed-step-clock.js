'use strict';

const assert = require('node:assert/strict');
const { FixedStepClock } = require('./fixed-step-clock.js');

function runForRefreshRate(refreshRate, durationMs = 10_000) {
  const clock = new FixedStepClock();
  let simulatedSteps = 0;
  const frameMs = 1000 / refreshRate;

  clock.advance(0, () => { simulatedSteps += 1; });
  for (let now = frameMs; now <= durationMs + 1e-6; now += frameMs) {
    clock.advance(now, () => { simulatedSteps += 1; });
  }

  return { simulatedSteps, snapshot: clock.snapshot() };
}

for (const refreshRate of [60, 90, 120, 144]) {
  const result = runForRefreshRate(refreshRate);
  assert.ok(
    Math.abs(result.simulatedSteps - 600) <= 1,
    `${refreshRate} Hz produced ${result.simulatedSteps} steps instead of approximately 600`
  );
}

{
  const clock = new FixedStepClock();
  let steps = 0;
  clock.advance(0, () => { steps += 1; });
  clock.advance(16.7, () => { steps += 1; });
  const result = clock.advance(5_016.7, () => { steps += 1; });

  assert.equal(result.suspensionReset, true);
  assert.equal(result.steps, 0);
  assert.equal(steps, 1);
  assert.equal(result.suspensionResets, 1);
}

{
  const clock = new FixedStepClock({ maxStepsPerFrame: 5 });
  let steps = 0;
  clock.advance(0, () => { steps += 1; });
  const result = clock.advance(150, () => { steps += 1; });

  assert.equal(result.steps, 5);
  assert.equal(steps, 5);
  assert.ok(result.droppedMs >= 49, `Expected dropped time, got ${result.droppedMs}`);
  assert.ok(result.alpha >= 0 && result.alpha < 1);
}

{
  const clock = new FixedStepClock();
  clock.advance(100, () => {});
  const result = clock.advance(90, () => {
    throw new Error('A backwards timestamp must not step the simulation');
  });
  assert.equal(result.rawDeltaMs, 0);
  assert.equal(result.steps, 0);
}

console.log('fixed-step-clock: all tests passed');
