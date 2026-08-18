/**
 * The global board Worker, driven in Node against a fake KV.
 *
 * `worker/board.js` is deliberately a plain `(request, env)` handler with no
 * Cloudflare imports, so every route and every rejection path is exercised here
 * without `wrangler`, without a network, and without a deployed account. That
 * matters for this milestone specifically: the Worker cannot be deployed until the
 * owner's billing clears, and a change that could not be verified until then would
 * be a change nobody could trust.
 *
 * The last section is the one that earns its keep: the same fixtures judged by the
 * client module and by the Worker must produce identical verdicts. That is what
 * makes "one copy of the rules" true rather than merely intended.
 */
const assert = require('node:assert');
const worker = require('../worker/board.js');
const validation = require('./rite-validation.js');

// --- fake KV ------------------------------------------------------------------
// Enough of the Workers KV surface for board.js: get(key,'json'), put with an
// optional expirationTtl, and delete. TTL is recorded rather than enforced, and
// expiry is simulated explicitly where a test needs it.

function createKV() {
  const store = new Map();
  return {
    store,
    async get(key, type) {
      const record = store.get(key);
      if (record === undefined) return null;
      return type === 'json' ? JSON.parse(record.value) : record.value;
    },
    async put(key, value, options = {}) {
      store.set(key, { value, expirationTtl: options.expirationTtl ?? null });
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

function createEnv() {
  return { BOARD: createKV() };
}

const BASE = 'https://board.example.workers.dev';

function post(path, body, headers = {}) {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'test', ...headers },
    body: JSON.stringify(body)
  });
}

function get(path, headers = {}) {
  return new Request(`${BASE}${path}`, { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.7', 'user-agent': 'test', ...headers } });
}

const RUN_DURATION_MS = 300_000; // 300s for 20 gates = 15s/gate, well clear of the pace floor

/**
 * A run that passes every consistency rule. Individual tests break exactly one
 * field, so a failure names the rule that fired rather than a soup of them.
 *
 * Timestamps are relative to now rather than fixed calendar dates, because the
 * Worker bounds a claimed duration against the age of the token it issued - a
 * fixture pinned to 2026 dates would be rejected for claiming more play than its
 * freshly minted token could account for.
 */
function validSummary(overrides = {}) {
  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - RUN_DURATION_MS);
  return {
    runId: 'run-1',
    rite: 'HEX',
    gatesCleared: 20,
    bandIndex: validation.bandIndexFor(20, validation.FALLBACK_THRESHOLDS),
    gateOffers: 10,
    gateEntries: 6,
    gateBanks: 4,
    voidAttempts: 6,
    voidSurvivals: 4,
    voidDeaths: 2,
    gnosis: 30,
    gnosisCapacity: 100,
    finalScore: 420,
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    endReason: 'death',
    ...overrides
  };
}

/**
 * Issue a token and age it, standing in for a player who actually sat there for
 * the duration the run claims. Backdating the stored record is the honest
 * simulation: the Worker's own bound is what is under test, so the test must not
 * quietly widen it.
 */
async function issueToken(env, rite = 'HEX', ageMs = RUN_DURATION_MS) {
  const response = await worker.handleRequest(post('/run/start', { rite }), env);
  assert.equal(response.status, 200, 'run start should issue a token');
  const { token } = await response.json();

  if (ageMs > 0) {
    const record = await env.BOARD.get(`token:${token}`, 'json');
    await env.BOARD.put(`token:${token}`, JSON.stringify({ ...record, issuedAt: Date.now() - ageMs }));
  }
  return token;
}

let failures = 0;
async function section(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}: ${error.message}`);
  }
}

(async () => {
  // --- routing ----------------------------------------------------------------

  await section('health reports the validation version and supported rites', async () => {
    const env = createEnv();
    const response = await worker.handleRequest(get('/health'), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.validationVersion, validation.VALIDATION_VERSION);
    assert.deepEqual(body.rites, ['HEX']);
  });

  await section('an unknown route is a 404', async () => {
    const env = createEnv();
    const response = await worker.handleRequest(get('/nope'), env);
    assert.equal(response.status, 404);
  });

  await section('the CORS preflight answers without a body', async () => {
    // A JSON POST from another origin is preceded by an OPTIONS preflight, so this
    // runs before every real submission. 204 is a null-body status and Response
    // throws if given one, which is exactly how the first version of this failed -
    // invisibly to the unit suite, and only when a browser actually sent it.
    const env = createEnv();
    const response = await worker.handleRequest(
      new Request(`${BASE}/run/submit`, { method: 'OPTIONS' }), env
    );
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
    assert.equal(await response.text(), '', 'a 204 must carry no body');
  });

  await section('a rite with no recorder is refused rather than ranked empty', async () => {
    const env = createEnv();
    const start = await worker.handleRequest(post('/run/start', { rite: 'MONAS' }), env);
    assert.equal(start.status, 400, 'MONAS does not record runs yet, so it cannot be submitted');
    const read = await worker.handleRequest(get('/board/MONAS'), env);
    assert.equal(read.status, 404);
  });

  // --- the happy path ---------------------------------------------------------

  await section('a valid run is accepted, ranked, and readable from the board', async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const response = await worker.handleRequest(post('/run/submit', { token, summary: validSummary(), name: 'owner' }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.accepted, true);
    assert.equal(body.rank, 1);

    const board = await (await worker.handleRequest(get('/board/HEX'), env)).json();
    assert.equal(board.entries.length, 1);
    assert.equal(board.entries[0].gatesCleared, 20);
    assert.equal(board.entries[0].name, 'OWNER', 'names are normalised to the board\'s own casing');
    assert.equal(board.verification, 'server-validated-consistency',
      'the payload must state what verification means, so the UI cannot overclaim');
  });

  // --- tokens -----------------------------------------------------------------

  await section('a submission with no token is refused', async () => {
    const env = createEnv();
    const response = await worker.handleRequest(post('/run/submit', { summary: validSummary() }), env);
    assert.equal(response.status, 400);
  });

  await section('a token this Worker never issued is refused', async () => {
    const env = createEnv();
    const response = await worker.handleRequest(post('/run/submit', { token: 'made-up', summary: validSummary() }), env);
    assert.equal(response.status, 403);
  });

  await section('a token cannot be spent twice', async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const first = await worker.handleRequest(post('/run/submit', { token, summary: validSummary() }), env);
    assert.equal(first.status, 200);

    const replay = await worker.handleRequest(post('/run/submit', { token, summary: validSummary() }), env);
    assert.equal(replay.status, 403, 'a replayed payload must not land twice');
  });

  await section('a rejected submission still spends its token', async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const rejected = await worker.handleRequest(
      post('/run/submit', { token, summary: validSummary({ gatesCleared: 99999 }) }), env
    );
    assert.equal(rejected.status, 422);

    const retry = await worker.handleRequest(post('/run/submit', { token, summary: validSummary() }), env);
    assert.equal(retry.status, 403,
      'otherwise a submitter could grind one token until a tampered summary passed');
  });

  // --- validation -------------------------------------------------------------

  await section('a tampered gate total is rejected with its reasons', async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const response = await worker.handleRequest(
      post('/run/submit', { token, summary: validSummary({ gatesCleared: 99999 }) }), env
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.accepted, false);
    assert.ok(body.reasons.length > 0, 'a rejection must say why');
    assert.ok(
      body.reasons.some(reason => reason.includes('band')),
      `raising gates alone must fail the band that no longer matches it, got: ${body.reasons.join('; ')}`
    );

    const board = await (await worker.handleRequest(get('/board/HEX'), env)).json();
    assert.equal(board.entries.length, 0, 'a rejected run must never reach the board');
  });

  await section('more Gate decisions than offers is rejected', async () => {
    const env = createEnv();
    const token = await issueToken(env);
    const response = await worker.handleRequest(
      post('/run/submit', { token, summary: validSummary({ gateEntries: 9, gateBanks: 9 }) }), env
    );
    assert.equal(response.status, 422);
  });

  await section('a run claiming longer than its token has existed is rejected', async () => {
    const env = createEnv();
    // A token issued moments ago, against a run claiming six hours of play.
    const token = await issueToken(env, 'HEX', 0);
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - (6 * 60 * 60 * 1000));
    const response = await worker.handleRequest(
      post('/run/submit', {
        token,
        summary: validSummary({ startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString() })
      }), env
    );
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.ok(
      body.reasons.some(reason => reason.includes('token')),
      `the Worker's own clock must bound the claim, got: ${body.reasons.join('; ')}`
    );
  });

  await section('a run that fills its token\'s whole lifetime is still accepted', async () => {
    const env = createEnv();
    // The boundary case the clock grace exists for: an honest run submitted the
    // instant it ends, where claimed duration and token age are the same number
    // give or take round-trip latency.
    const token = await issueToken(env, 'HEX', RUN_DURATION_MS);
    const response = await worker.handleRequest(post('/run/submit', { token, summary: validSummary() }), env);
    assert.equal(response.status, 200, 'clock skew at the boundary must not reject an honest run');
  });

  // --- rate limiting ----------------------------------------------------------

  await section('submissions are rate limited per identity', async () => {
    const env = createEnv();
    let sawLimit = false;

    for (let attempt = 0; attempt < worker.RATE_MAX_SUBMISSIONS + 3; attempt += 1) {
      const token = await issueToken(env);
      const response = await worker.handleRequest(
        post('/run/submit', { token, summary: validSummary({ runId: `run-${attempt}` }) }), env
      );
      if (response.status === 429) { sawLimit = true; break; }
    }

    assert.ok(sawLimit, `the limiter must trip within ${worker.RATE_MAX_SUBMISSIONS + 3} submissions`);
  });

  // --- ranking ----------------------------------------------------------------

  await section('the board ranks by gates, then band, then score, then the earlier run', async () => {
    const board = worker.insertEntry(
      worker.insertEntry(
        worker.insertEntry(null, { gatesCleared: 10, bandIndex: 2, score: 50, endedAt: '2026-08-17T10:00:00.000Z', name: 'A' }),
        { gatesCleared: 40, bandIndex: 4, score: 10, endedAt: '2026-08-17T11:00:00.000Z', name: 'B' }
      ),
      { gatesCleared: 40, bandIndex: 4, score: 10, endedAt: '2026-08-17T09:00:00.000Z', name: 'C' }
    );

    assert.deepEqual(board.entries.map(entry => entry.name), ['C', 'B', 'A'],
      'equal gates/band/score must break toward whoever got there first');
  });

  await section('the board trims to its limit', async () => {
    let board = null;
    for (let index = 0; index < worker.BOARD_LIMIT + 8; index += 1) {
      board = worker.insertEntry(board, {
        gatesCleared: index, bandIndex: 0, score: 0,
        endedAt: new Date(Date.UTC(2026, 7, 17, 10, index)).toISOString(), name: `P${index}`
      });
    }
    assert.equal(board.entries.length, worker.BOARD_LIMIT);
    assert.equal(board.entries[0].gatesCleared, worker.BOARD_LIMIT + 7, 'the best run must survive the trim');
  });

  // --- name handling ----------------------------------------------------------

  await section('a submitted name cannot carry markup onto the board', async () => {
    assert.equal(worker.sanitiseName('<img src=x onerror=alert(1)>'), 'IMG SRCX ONERRORAL');
    assert.equal(worker.sanitiseName(''), 'ANON');
    assert.equal(worker.sanitiseName(null), 'ANON');
    assert.ok(worker.sanitiseName('A'.repeat(200)).length <= 18);
    assert.doesNotMatch(worker.sanitiseName('<script>'), /[<>]/, 'angle brackets must not survive');
  });

  // --- client / Worker parity -------------------------------------------------
  //
  // The point of extracting rite-validation.js. If these ever disagree, one side is
  // running rules the other is not, which is exactly the drift the extraction was
  // meant to make impossible.

  await section('the Worker and the client reach identical verdicts on the same runs', async () => {
    const fixtures = [
      validSummary(),
      validSummary({ gatesCleared: 99999 }),
      validSummary({ gateEntries: 9, gateBanks: 9 }),
      validSummary({ voidAttempts: 1, voidSurvivals: 5, voidDeaths: 5 }),
      validSummary({ gnosis: -4 }),
      validSummary({ startedAt: 'not a date' }),
      validSummary({ rite: 'MONAS' }),
      validSummary({ gatesCleared: 300, bandIndex: 7, startedAt: '2026-08-17T10:00:00.000Z', endedAt: '2026-08-17T10:00:05.000Z' })
    ];

    for (const [index, summary] of fixtures.entries()) {
      const clientVerdict = validation.validateRun(summary, { rite: 'HEX' });
      const env = createEnv();
      const token = await issueToken(env);
      const response = await worker.handleRequest(post('/run/submit', { token, summary }), env);
      const workerAccepted = response.status === 200;

      assert.equal(
        workerAccepted, clientVerdict.valid,
        `fixture ${index}: client says valid=${clientVerdict.valid} but the Worker returned ${response.status}`
      );

      if (!clientVerdict.valid) {
        const body = await response.json();
        assert.deepEqual(
          body.reasons, clientVerdict.reasons,
          `fixture ${index}: both sides must give the same reasons, not merely the same verdict`
        );
      }
    }
  });

  if (failures > 0) {
    console.error(`\nglobal-board-worker: ${failures} section(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\nglobal-board-worker: all assertions passed');
  }
})();
