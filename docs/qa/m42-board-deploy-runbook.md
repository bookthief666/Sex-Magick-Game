# The global Rite board — deployment runbook

Everything in this file can be done from a phone in Termux. It takes about ten
minutes, most of which is Cloudflare's login page.

## What you are deploying

A single Cloudflare Worker (`worker/index.js` → `worker/board.js`) with one KV
namespace behind it. It issues a token when a run starts, validates the summary
when the run ends, and keeps a sorted top-100 per Rite. The validation rules are
`tools/rite-validation.js`, the same file the browser loads — one copy, so the
two cannot disagree (D-044).

**What it does not do, stated plainly:** this is server-validated *consistency*,
not anti-cheat. Anything able to construct an internally consistent record and
hold a valid token can still submit a lie. Real proof needs the server to replay
an input trace against a deterministic simulation, and gameplay RNG is unseeded
(`Math.random()` throughout `index.html`), so that is not possible today. The
board says `SERVER-VALIDATED · NOT ANTI-CHEAT` on its face and must keep saying
it.

## Cost

Free. Workers' free plan covers 100,000 requests a day and KV's covers 100,000
reads and 1,000 writes a day. A run costs two requests (`/run/start` and
`/run/submit`) and one KV write. D-044 recorded billing as the blocker; on these
volumes there is nothing to bill.

## Steps

### 1. Install wrangler and log in

```bash
npm install -D wrangler
npx wrangler login
```

`wrangler login` opens a browser page. If you are on a phone with no browser
handoff, use `npx wrangler login --browser false` and paste the URL manually.

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create BOARD --config worker/wrangler.toml
```

It prints something like:

```
[[kv_namespaces]]
binding = "BOARD"
id = "abc123def456..."
```

### 3. Paste the id into `worker/wrangler.toml`

Replace `REPLACE_WITH_KV_NAMESPACE_ID` with the `id` it printed. That is the only
edit needed in that file.

### 4. Deploy

```bash
npm run deploy:board
```

It prints the Worker URL, e.g. `https://sex-magick-rite-board.<you>.workers.dev`.

### 5. Check it is alive

```bash
curl https://sex-magick-rite-board.<you>.workers.dev/health
```

Expected: `{"ok":true,"validationVersion":1,"rites":["HEX","MONAS"]}`.

If `rites` does not list both, the deploy did not pick up this branch.

### 6. Wire the URL into the game

Set `DEFAULT_BOARD_URL` in `tools/global-board-runtime.js` to the URL from step 4
(no trailing slash). That is the one line that turns the board on for everybody;
until it is set, the board stays dark unless a player passes `?globalBoardUrl=`.

### 7. Try it before trusting it

```
http://127.0.0.1:8099/index.html?globalBoard=1
```

Play a short run of each Rite, die, and return to the menu. The global board
renders beneath the local one. Then confirm the two Rites are ranked separately:

```bash
curl https://<your-worker>/board/HEX
curl https://<your-worker>/board/MONAS
```

A HEX run must not appear on the MONAS board. D-004 requires that separation and
the boards measure different ladders, so a merged ranking would be meaningless.

## Rolling back

`npx wrangler rollback --config worker/wrangler.toml` reverts the Worker.
Clearing `DEFAULT_BOARD_URL` back to `''` disables the board client-side without
touching the deployment at all, which is the faster of the two and the one to
reach for during a launch.

## If it misbehaves

| symptom | cause |
|---|---|
| every submission refused, "token is only 0s old" | the device clock is wrong, or a run was submitted instantly by a test harness |
| `unsupported rite` | deployed from a branch before M42 added MONAS |
| board renders empty but `/health` is fine | `DEFAULT_BOARD_URL` unset, or the run had no `runId` |
| board never appears | the local board is what shows when the Worker is unreachable — that is the designed degradation, not a failure |
