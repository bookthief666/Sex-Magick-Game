#!/usr/bin/env node
'use strict';

/**
 * M42 — how much closer together can the walls actually come?
 *
 * The owner asked for two things that turn out to be one lever. "Walls should get
 * more frequent as the game progresses" and "sometimes two walls close together"
 * are both changes to the spacing between pillars, and spacing is
 * `computeSpawnRate(speed, PILLAR_SPAWN_BASE)` - shrink the base and the walls
 * arrive sooner.
 *
 * That framing is what makes them auditable at all. The solver models the pillar
 * timeline as `spawnFrame: index * spawnRate` - **uniform** spacing - so a "tight
 * pair" implemented as an off-cycle extra pillar would arrive in-game at a spacing
 * the audit never checked, and every verification of it would be meaningless.
 * Expressed as a *lower base for a stretch*, it is exactly what the solver already
 * models, and `pillarSpawnBase` is already an option it threads through.
 *
 * Difficulty is monotone in this parameter: more room between walls is never
 * harder than less. So verifying the **tightest** base a band can produce verifies
 * every looser one, and the whole ladder reduces to one number per rite.
 *
 * A coordinate is admissible only if every case comes back `verified` - one
 * `marginal` rejects it, for D-072's reason: marginal means the solver found a
 * path it could not replay as a witness.
 *
 *   node tools/run-m42-spawn-frontier.mjs [--json out.json]
 */

import process from 'node:process';
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const grammar = require('./obstacle-grammar.js');
const reachability = require('./player-reachability.js');
const policy = require('./reachability-policy.js');

const SHIPPED_BASE = 140;
const args = { json: null };
for (let i = 0; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--json') args.json = process.argv[i + 1];
}

// Each rite is audited at **its own** coordinates.
//
// The first version of this tool ran both rites over HEX's hard scenarios (speed
// 8.5, gap 110) and its control failed: 898 verified, 2 marginal. Both marginals
// were MONAS patterns - `monas.orbit-settle` and `monas.double-helix` - at a speed
// MONAS never reaches, since its ladder tops out at 4.9/210. That is D-072's
// finding recurring exactly: auditing MONAS against HEX's ladder over-constrains
// it and reports a fact about the harness as a fact about the game. The control
// caught it, which is the entire reason it exists.
const HEX_GEOMETRIES = reachability.DEFAULT_SCENARIOS
  .filter(scenario => scenario.id.endsWith('-hard'))
  .map(scenario => ({ ...scenario }));

// MONAS's crown band, from `monas-progression-runtime.js`: the hardest coordinate
// the rite actually ships.
const MONAS_GEOMETRIES = HEX_GEOMETRIES.map(scenario => ({ ...scenario, speed: 4.9, gap: 210 }));

const RITES = [
  { rite: 'HEX', geometries: HEX_GEOMETRIES, library: { HEX: grammar.PATTERN_LIBRARY.HEX, MONAS: [] } },
  { rite: 'MONAS', geometries: MONAS_GEOMETRIES, library: { HEX: [], MONAS: grammar.PATTERN_LIBRARY.MONAS } }
];

/**
 * Audit both rites at one spawn base, through the policy the product applies.
 *
 * `applyPatternOverride` is passed deliberately: D-072 recorded that omitting it
 * scored raw patterns instead of shipped ones, which made a whole grid's results
 * an artifact of the harness rather than a fact about the game.
 */
function auditAt(pillarSpawnBase, entry) {
  const scenarios = entry.geometries.map(geometry => ({ ...geometry, pillarSpawnBase }));
  const report = reachability.auditPatternLibrary(
    { ...grammar, PATTERN_LIBRARY: entry.library },
    {
      scenarios,
      patternResolver: (pattern, rite) => policy.applyPatternOverride(pattern, rite) || pattern
    });
  const counts = { verified: 0, marginal: 0, invalid: 0 };
  for (const entry of report.cases) counts[entry.classification] = (counts[entry.classification] || 0) + 1;
  const worst = report.cases
    .filter(entry => entry.classification !== 'verified')
    .slice(0, 4)
    .map(entry => `${entry.rite}/${entry.patternId}@${entry.scenarioId}:${entry.classification}`);
  return { total: report.cases.length, counts, clean: counts.marginal === 0 && counts.invalid === 0, worst };
}

const summary = {};

for (const entry of RITES) {
  console.log(`\n=== ${entry.rite} ===`);

  // Control one: today's spacing must be clean, or nothing below it means anything.
  const control = auditAt(SHIPPED_BASE, entry);
  console.log(`control  base ${SHIPPED_BASE} (shipped)  ->  ` +
    `${control.clean ? 'CLEAN' : 'DIRTY ' + JSON.stringify(control.counts)}  (${control.total} cases)` +
    `${control.worst.length ? '  ' + control.worst.join(', ') : ''}`);
  if (!control.clean) {
    console.error(`${entry.rite}'s shipped spacing does not audit clean; aborting rather than reporting a frontier against a broken control.`);
    process.exit(2);
  }

  // Control two, and the one that is easy to forget: the instrument must be able
  // to say no. A grid where everything verifies is otherwise indistinguishable
  // from a search that is not varying anything it measures.
  const absurd = auditAt(12, entry);
  console.log(`control  base 12 (absurd)      ->  ` +
    `${absurd.clean ? 'CLEAN' : 'REJECTED ' + JSON.stringify(absurd.counts)}  (expected: rejected)`);
  if (absurd.clean) {
    console.error('The solver verified walls almost on top of each other; it is not measuring spacing. Aborting.');
    process.exit(3);
  }

  const results = [];
  for (const base of [132, 124, 116, 108, 100, 92, 84]) {
    const outcome = auditAt(base, entry);
    results.push({ base, ...outcome });
    console.log(`base ${String(base).padStart(3)}  (${(100 - (base / SHIPPED_BASE) * 100).toFixed(0)}% tighter)  ->  ` +
      `${outcome.clean ? 'VERIFIED' : 'rejected'} ${JSON.stringify(outcome.counts)}` +
      `${outcome.worst.length ? '  e.g. ' + outcome.worst.join(', ') : ''}`);
  }

  const admissible = results.filter(item => item.clean);
  if (admissible.length === 0) {
    console.log(`No spacing below ${SHIPPED_BASE} verified for ${entry.rite}. Its walls stay as far apart as they are.`);
  } else {
    const tightest = admissible.reduce((a, b) => (b.base < a.base ? b : a));
    console.log(`${entry.rite} tightest proven spacing: base ${tightest.base} ` +
      `(${(100 - (tightest.base / SHIPPED_BASE) * 100).toFixed(0)}% tighter than shipped).`);
  }
  summary[entry.rite] = { control, absurd, results, admissible };
}

console.log('\nOnly a proven base, or looser, may be written into a ladder or used for a pair.');

if (args.json) {
  writeFileSync(args.json, JSON.stringify(summary, null, 2));
  console.log(`wrote ${args.json}`);
}
