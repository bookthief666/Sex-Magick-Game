/**
 * The global Rite board, as a request handler.
 *
 * Deliberately a plain function of `(request, env)` with no Cloudflare imports, so
 * the whole thing is exercised by `test-global-board-worker.js` in Node against a
 * fake KV, without `wrangler` or a network. `worker/index.js` is the thin Cloudflare
 * entry point that hands it the real bindings.
 *
 * ## What this does and does not establish
 *
 * D-004 refused to call the 1.0 board competitive because the browser submitted an
 * arbitrary integer with no server-side validation. This closes that specific hole:
 * a run cannot reach the board without a token this Worker issued, the summary is
 * re-judged here by the same rules the client uses, the claim is bounded against
 * this Worker's own clock rather than the client's, and submissions are rate
 * limited per identity.
 *
 * **It is still not anti-cheat, and must not be described as such.** The Worker
 * validates a self-reported summary. Anything that can construct an internally
 * consistent record and hold a valid token can still submit a lie. Real proof needs
 * the server to derive the result itself by replaying an input trace, which needs
 * deterministic gameplay - and gameplay RNG is currently unseeded (`Math.random()`
 * throughout index.html's spawn paths). D-044 records this; the board copy says
 * "verified" only in the sense these rules define.
 *
 * ## KV layout
 *
 *   token:{token}   -> { rite, issuedAt, identity }   TTL TOKEN_TTL_SECONDS, single use
 *   board:{rite}    -> { entries: [...] }             top BOARD_LIMIT, sorted
 *   rate:{identity} -> { windowStart, count }         TTL RATE_WINDOW_SECONDS
 */

const validation = require('../tools/rite-validation.js');

const BOARD_LIMIT = 20;
const TOKEN_TTL_SECONDS = 60 * 60;
const RATE_WINDOW_SECONDS = 60 * 10;
const RATE_MAX_SUBMISSIONS = 12;
const MAX_BODY_BYTES = 8 * 1024;
const MAX_NAME_LENGTH = 18;

// The token-age bound below compares the client's own clock against this Worker's.
// A run that legitimately fills its token's whole lifetime lands within round-trip
// latency of the limit, and the two clocks need not agree to the millisecond, so a
// strict comparison would reject honest runs at the boundary. The grace is wide
// enough to absorb skew and latency and far too small to matter as an exploit: an
// inflated duration only ever makes the pace rule *easier* to satisfy, and the pace
// rule is not what stops a forgery - see the header.
const CLOCK_GRACE_MS = 10_000;

// Only rites that actually record runs may be submitted. `finishRun` in
// gate-slice-runtime.js is HEX-only today; MONAS gets added here once it records
// runs of its own, and until then a MONAS submission is rejected rather than
// silently ranked on an empty board.
const SUPPORTED_RITES = Object.freeze(['HEX']);

// The game is served from a different origin to the Worker, so the browser needs
// these to read a response at all - and needs the preflight below to be willing to
// send a JSON POST in the first place.
const CORS_HEADERS = Object.freeze({
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-max-age': '86400'
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...CORS_HEADERS
    }
  });
}

/**
 * The CORS preflight. It must be bodyless: 204 is a null-body status, and
 * constructing a Response with a body and that status throws - which is how this
 * was found, when the browser suite sent the preflight a JSON POST requires and the
 * handler threw instead of answering.
 */
function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * A stable-enough identity for rate limiting, derived from the connecting IP and
 * user agent. This is a throttle, not authentication - it is intentionally not
 * stored alongside board entries, and it is hashed rather than kept in the clear.
 */
async function identityFor(request) {
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
  const agent = request.headers.get('user-agent') || 'unknown';
  const data = new TextEncoder().encode(`${ip}|${agent}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('');
}

async function readJsonBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) throw new Error('body too large');
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error('body is not JSON');
  }
}

function sanitiseName(value) {
  if (typeof value !== 'string') return 'ANON';
  // Collapse to a small printable set: the board is rendered into HTML, and a name
  // is the one field a submitter controls the text of.
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9 .'-]/g, '').trim();
  return cleaned.slice(0, MAX_NAME_LENGTH) || 'ANON';
}

async function checkRateLimit(env, identity, now) {
  const key = `rate:${identity}`;
  const existing = await env.BOARD.get(key, 'json');
  const windowStart = existing?.windowStart ?? now;
  const withinWindow = now - windowStart < RATE_WINDOW_SECONDS * 1000;
  const count = withinWindow ? (existing?.count ?? 0) : 0;

  if (withinWindow && count >= RATE_MAX_SUBMISSIONS) {
    return { allowed: false, retryAfterMs: (windowStart + RATE_WINDOW_SECONDS * 1000) - now };
  }

  await env.BOARD.put(
    key,
    JSON.stringify({ windowStart: withinWindow ? windowStart : now, count: count + 1 }),
    { expirationTtl: RATE_WINDOW_SECONDS }
  );
  return { allowed: true };
}

/**
 * Insert one entry into a rite's board and keep it sorted and trimmed.
 *
 * Ordering matches `rankRuns` exactly - gates, then band, then score, then the
 * earlier run - so a player's local board and the global board never disagree
 * about which of two runs is better.
 */
function insertEntry(board, entry) {
  const entries = Array.isArray(board?.entries) ? [...board.entries, entry] : [entry];
  entries.sort((a, b) => {
    if (b.gatesCleared !== a.gatesCleared) return b.gatesCleared - a.gatesCleared;
    if (b.bandIndex !== a.bandIndex) return b.bandIndex - a.bandIndex;
    if (b.score !== a.score) return b.score - a.score;
    return (Date.parse(a.endedAt) || 0) - (Date.parse(b.endedAt) || 0);
  });
  return { entries: entries.slice(0, BOARD_LIMIT) };
}

async function handleRunStart(request, env) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const rite = typeof body?.rite === 'string' ? body.rite : validation.DEFAULT_RITE;
  if (!SUPPORTED_RITES.includes(rite)) {
    return json({ error: `unsupported rite: ${rite}` }, 400);
  }

  const identity = await identityFor(request);
  const token = randomToken();
  const issuedAt = Date.now();

  await env.BOARD.put(
    `token:${token}`,
    JSON.stringify({ rite, issuedAt, identity }),
    { expirationTtl: TOKEN_TTL_SECONDS }
  );

  return json({ token, issuedAt, expiresInSeconds: TOKEN_TTL_SECONDS });
}

async function handleRunSubmit(request, env) {
  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }

  const token = typeof body?.token === 'string' ? body.token : null;
  const summary = body?.summary;
  if (!token) return json({ accepted: false, error: 'missing run token' }, 400);

  const issued = await env.BOARD.get(`token:${token}`, 'json');
  // Covers both a token this Worker never issued and one already spent: the record
  // is deleted on first use, so a replayed payload lands here.
  if (!issued) return json({ accepted: false, error: 'run token is unknown or already used' }, 403);

  const identity = await identityFor(request);
  const rate = await checkRateLimit(env, identity, Date.now());
  if (!rate.allowed) {
    return json({ accepted: false, error: 'too many submissions', retryAfterMs: rate.retryAfterMs }, 429);
  }

  // Spend the token before judging, so a rejected submission cannot be retried
  // with a tweaked summary until it passes.
  await env.BOARD.delete(`token:${token}`);

  const verdict = validation.validateRun(summary, { rite: issued.rite });
  if (!verdict.valid) {
    return json({ accepted: false, rejected: true, reasons: verdict.reasons }, 422);
  }

  // The client's clock decides `startedAt`/`endedAt`, so a forged pair could claim
  // any duration. The token's issue time is this Worker's own, and a run cannot
  // have taken longer than the token has existed - which bounds the claim against
  // a clock the submitter does not control.
  const now = Date.now();
  const tokenAgeMs = now - issued.issuedAt;
  const claimedMs = Date.parse(summary.endedAt) - Date.parse(summary.startedAt);
  if (claimedMs > tokenAgeMs + CLOCK_GRACE_MS) {
    return json({
      accepted: false,
      rejected: true,
      reasons: [`run claims ${Math.round(claimedMs / 1000)}s but its token is only ${Math.round(tokenAgeMs / 1000)}s old`]
    }, 422);
  }

  const entry = {
    name: sanitiseName(body?.name),
    gatesCleared: summary.gatesCleared,
    bandIndex: summary.bandIndex,
    bandName: validation.FALLBACK_BANDS[summary.bandIndex] || '—',
    score: validation.isFiniteNumber(summary.finalScore) ? summary.finalScore : 0,
    endedAt: summary.endedAt,
    rite: issued.rite
  };

  const boardKey = `board:${issued.rite}`;
  const board = await env.BOARD.get(boardKey, 'json');
  const updated = insertEntry(board, entry);
  await env.BOARD.put(boardKey, JSON.stringify(updated));

  const rank = updated.entries.findIndex(candidate =>
    candidate.endedAt === entry.endedAt && candidate.name === entry.name && candidate.gatesCleared === entry.gatesCleared
  );

  return json({
    accepted: true,
    // -1 means the run was valid but did not make the top BOARD_LIMIT.
    rank: rank === -1 ? null : rank + 1,
    boardSize: updated.entries.length
  });
}

async function handleBoardRead(rite, env) {
  if (!SUPPORTED_RITES.includes(rite)) return json({ error: `unsupported rite: ${rite}` }, 404);
  const board = await env.BOARD.get(`board:${rite}`, 'json');
  return json({
    rite,
    entries: Array.isArray(board?.entries) ? board.entries : [],
    // Stated in the payload so the UI cannot accidentally present this as more
    // than it is - see the header comment and D-044.
    verification: 'server-validated-consistency'
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (request.method === 'OPTIONS') return preflight();

  if (request.method === 'POST' && path === '/run/start') return handleRunStart(request, env);
  if (request.method === 'POST' && path === '/run/submit') return handleRunSubmit(request, env);

  const boardMatch = path.match(/^\/board\/([A-Za-z]+)$/);
  if (request.method === 'GET' && boardMatch) return handleBoardRead(boardMatch[1].toUpperCase(), env);

  if (request.method === 'GET' && path === '/health') {
    return json({ ok: true, validationVersion: validation.VALIDATION_VERSION, rites: SUPPORTED_RITES });
  }

  return json({ error: 'not found' }, 404);
}

module.exports = {
  handleRequest,
  insertEntry,
  sanitiseName,
  BOARD_LIMIT,
  TOKEN_TTL_SECONDS,
  RATE_WINDOW_SECONDS,
  RATE_MAX_SUBMISSIONS,
  SUPPORTED_RITES
};
