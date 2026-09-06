#!/usr/bin/env node
'use strict';

/**
 * M40 §2b — how fast can the Rite of Hexagram actually go?
 *
 * `MAX_VALIDATED_SPEED = 8.5` is not a discovered maximum. It is the speed the
 * reachability audit *runs at*: `DEFAULT_SCENARIOS`' hard cases are all pinned
 * to `speed: 8.5, gap: 110`, so 8.5 is the fastest the solver has been asked
 * about, not the fastest it would allow. Raising the ceiling is therefore a
 * search rather than a constant edit - which is what the name has meant all
 * along, and what this script finally performs.
 *
 * The method is the audit itself, re-run on a grid of (speed, gap) coordinates
 * above the current ceiling, against the whole HEX library at every anchor,
 * direction and breath phase the shipped audit uses. A coordinate is admissible
 * only if **every case comes back `verified`** - one `marginal` is enough to
 * reject it, because marginal means the solver found a path it could not also
 * replay as a witness, and a ceiling built on that is a ceiling built on hope.
 *
 * The gap matters as much as the speed. Faster walls with a wider corridor may
 * well be clearable where faster walls with today's corridor are not, so the
 * grid varies both rather than pushing speed alone into a wall.
 *
 * **Returning nothing is a real outcome.** If no coordinate above 8.5 verifies,
 * the ceiling does not move, and that is evidence rather than failure.
 *
 *   node tools/run-m40-speed-frontier.mjs [--max-speed 11] [--json out.json]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const grammar = require('./obstacle-grammar.js');
const reachability = require('./player-reachability.js');
const policy = require('./reachability-policy.js');

function parseArgs(argv) {
  const args = { maxSpeed: 10.5, step: 0.5, json: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--max-speed') args.maxSpeed = Number(argv[++index]);
    else if (flag === '--step') args.step = Number(argv[++index]);
    else if (flag === '--json') args.json = argv[++index];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const CURRENT_CEILING = 8.5;

// The shipped hard scenarios, minus their speed and gap: the geometries are what
// make a coordinate trustworthy, so the search varies only the two numbers under
// test and keeps every viewport the audit already covers.
const GEOMETRIES = reachability.DEFAULT_SCENARIOS
  .filter(scenario => scenario.id.endsWith('-hard'))
  .map(scenario => ({
    id: scenario.id,
    width: scenario.width,
    height: scenario.height,
    mobile: scenario.mobile,
    breathPhases: scenario.breathPhases
  }));

// Only patterns the policy already trusts. A speed ceiling proven with patterns
// that are themselves not allowlisted would be proven against walls no player
// ever meets.
const verifiedOnly = (pattern, rite) =>
  (policy.VERIFIED_PATTERN_IDS.includes(pattern.id) ? pattern : null);

// HEX only. MAX_VALIDATED_SPEED governs the Rite of Hexagram's ladder; MONAS
// has its own progression and its own frontier tooling, and auditing it here
// would double a 95-second coordinate to answer a question nobody asked.
const HEX_ONLY = {
  ...grammar,
  PATTERN_LIBRARY: { HEX: grammar.PATTERN_LIBRARY.HEX, MONAS: [] }
};

function auditAt(speed, gap) {
  const scenarios = GEOMETRIES.map(geometry => ({ ...geometry, speed, gap }));
  const report = reachability.auditPatternLibrary(HEX_ONLY, {
    scenarios,
    patternResolver: (pattern, rite) => verifiedOnly(pattern, rite) || pattern
  });
  const cases = report.cases.filter(entry => entry.rite === 'HEX');
  const counts = { verified: 0, marginal: 0, invalid: 0 };
  for (const entry of cases) counts[entry.classification] = (counts[entry.classification] || 0) + 1;
  const worst = cases
    .filter(entry => entry.classification !== 'verified')
    .slice(0, 3)
    .map(entry => `${entry.patternId}@${entry.scenarioId}:${entry.classification}`);
  return { total: cases.length, counts, clean: counts.marginal === 0 && counts.invalid === 0, worst };
}

// Today's coordinate, as the control. If this does not come back clean the
// search is measuring something other than what it thinks it is, and every
// result below is meaningless.
const control = auditAt(CURRENT_CEILING, 110);
console.log(`control  speed ${CURRENT_CEILING.toFixed(1)} gap 110  ->  ` +
  `${control.clean ? 'CLEAN' : 'DIRTY ' + JSON.stringify(control.counts)} (${control.total} HEX cases)`);
if (!control.clean) {
  console.error('The shipped coordinate does not audit clean; aborting rather than reporting a frontier against a broken control.');
  process.exit(2);
}

// The other half of the control, and the more easily forgotten one. A clean
// baseline shows the instrument can say yes; this shows it can say no. Without
// it, a grid where every coordinate comes back VERIFIED is indistinguishable
// from a search that is not actually varying anything it measures - and a
// ceiling raised on that is worse than no ceiling change at all.
const absurd = auditAt(20, 110);
console.log(`control  speed 20.0 gap 110  ->  ` +
  `${absurd.clean ? 'CLEAN' : 'REJECTED ' + JSON.stringify(absurd.counts)} (expected: rejected)`);
if (absurd.clean) {
  console.error('The solver verified an impossible coordinate; it is not measuring speed. Aborting.');
  process.exit(3);
}

const results = [];
const gaps = [110, 118, 126, 134];
for (let speed = CURRENT_CEILING + args.step; speed <= args.maxSpeed + 1e-9; speed += args.step) {
  for (const gap of gaps) {
    const outcome = auditAt(speed, gap);
    results.push({ speed: Number(speed.toFixed(2)), gap, ...outcome });
    console.log(`speed ${speed.toFixed(1)}  gap ${gap}  ->  ` +
      `${outcome.clean ? 'VERIFIED' : 'rejected'} ` +
      `${JSON.stringify(outcome.counts)}${outcome.worst.length ? '  e.g. ' + outcome.worst.join(', ') : ''}`);
  }
}

const admissible = results.filter(entry => entry.clean);
console.log('');
if (admissible.length === 0) {
  console.log(`No coordinate above ${CURRENT_CEILING} verified. The ceiling does not move.`);
} else {
  const best = admissible.reduce((a, b) => (b.speed > a.speed || (b.speed === a.speed && b.gap < a.gap) ? b : a));
  console.log(`${admissible.length} admissible coordinate(s). Fastest proven: speed ${best.speed} at gap ${best.gap}.`);
  console.log('Only these may be written into BANDS.');
}

if (args.json) {
  writeFileSync(args.json, JSON.stringify({ control, results, admissible }, null, 2));
  console.log(`wrote ${args.json}`);
}
