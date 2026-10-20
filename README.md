# SEX MAGICK 2.0

An esoteric erotic flappy-style game. Two rites, one ascent up the Tree of Life: tap to flap through gates in **Rite of Hexagram**, or hold-and-release through currents in **Rite of Monas**, climbing from Malkuth toward Kether across 75 pieces of gallery art.

Live build: a single `index.html` plus the `tools/` modules it bootstraps. No build step, no framework, no CDN dependencies at runtime — fonts are inlined, art ships in `assets/gallery/`.

## Run it

```bash
npx http-server . -p 8099 -c-1   # or: python3 -m http.server 8099
# open http://localhost:8099/index.html
```

`index.html` is the shipped game. `tools/*.html` are QA harnesses (not player-facing).

## Architecture

- **index.html** — game shell, canvas renderer, base physics, audio synth (`AudioSys`), menus, settings. State machine: START → PLAYING → GAME_OVER.
- **tools/fixed-step-clock.js + fixed-step-prototype.js** — frame-rate-independent simulation; the prototype file also bootstraps every runtime module the game needs (dynamic `<script>` injection, `async=false` so load order is deterministic).
- **Runtime modules** (live): `collision-runtime` (canonical hitboxes), `obstacle-grammar` + `obstacle-variety` (gate patterns), `missions-runtime`, `powerup-runtime`, `gate-slice-runtime` (HEX ascent bands), `monas-runtime` + `monas-progression-runtime` (MONAS glide), `ritual-ascent-runtime` (realm banners), `sephirah-identity-runtime` (per-Sephirah visuals + audio undertone), `occult-field`/`occult-art` (background FX), `leaderboard-runtime` + `global-board-runtime`, `run-telemetry`, `viewport-runtime`, `canvas-render-runtime`.
- **worker/** — Cloudflare Worker ("sex-magick-rite-board") backing the global rite board. Deploy: `npm run deploy:board` (needs the owner's Cloudflare credentials).

Not wired into the live page: `tools/test-*.js` (Node unit suites), reachability/QA audit tooling, `playwright` specs.

## QA

- Node unit suites: `node tools/test-<name>.js` (deterministic contracts for every runtime).
- Browser specs: `npm run test:cross-screen` (Playwright).
- `docs/` — 80+ decision records, playtests, and audits. Read `docs/decisions/decision-log.md` before changing anything player-facing.

## Branches

- `main` — shipped build (deployed to itch.io via `node tools/build-itch.mjs`).
- Evolution work happens on feature branches (e.g. `iamblichus/evolution`); keep `main` untouched until release gates pass.
