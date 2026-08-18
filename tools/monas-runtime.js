/**
 * The Rite of Monas — the opposite rite.
 *
 * HEX is a diver. Its whole risk model is courting the edge: near-misses pay,
 * grazing a pillar builds Gnosis, and a timid line through the middle of a gap is
 * explicitly worth less. MONAS inverts every part of that.
 *
 * **Hold to glide.** HEX taps. MONAS holds: lift applies while the input is held and
 * the glyph sinks when it is released, through a medium rather than through vacuum.
 * The original mode already used gravity 0.18 with 0.98 damping against HEX's 0.45
 * and no damping, so the floaty feel was there — it just had nothing to do with it.
 *
 * **Coherence, not risk.** Passing near the *centre* of a gap pays, and flying
 * smoothly pays; thrashing the input costs. The M17 reachability solver measures the
 * consequence of the physics directly: under an identical stress sequence MONAS fails
 * a band earlier than HEX, because 0.18 gravity cannot dive to a low gate in time.
 * That is not a defect to compensate for, it is the rite's character, and Coherence
 * is the scoring model that rewards flying the way the physics wants to be flown.
 *
 * **The Warp Surge.** A full Coherence meter spends itself on speed rather than on a
 * wager. The corridor widens, the warp starfield streaks and a gold bloom breathes
 * from the same point the stars radiate from - `WarpStar` has been in `index.html`
 * since 1.0, drawn only in MONAS and, until now, only reachable in a mode that could
 * not start.
 *
 * The Gate slice owns HEX and does not run here: every one of its overrides guards on
 * `gateSliceState`, which only exists for a HEX run, so MONAS falls through to the
 * original loop and this module layers on top of that.
 *
 * **The look.** Nothing ever moved `currentLevelIdx` for a MONAS run, so the photo,
 * the accent wash and the tunnel/warp-star colour were pinned to whichever picture
 * happened to be first, for the whole game. MONAS runs its own gallery and its own
 * colour rotation on `gatesPassed`, on the same pattern the Gate slice already uses
 * for HEX, plus a small set of visuals of its own - a fractal spark in place of
 * `WarpStar`'s flat dot, a gentler glitch signature for a perfect pass, and a rare
 * ambient glyph flicker - none of it borrowed from `voidMode`, which belongs to HEX's
 * Void and would otherwise arm its expensive vignette and paint its reserved cyan
 * over a rite that has nothing to do with either.
 */
(function attachSexMagickMonas(root) {
  'use strict';

  const MONAS_VERSION = 1;
  const INSTALL_TIMEOUT_MS = 12_000;

  // --- glide -------------------------------------------------------------------
  // Tuned against the original MONAS profile rather than replacing it: gravity and
  // damping stay as they were, and lift is what the hold adds.
  const GRAVITY = 0.18;
  const DAMPING = 0.98;
  const LIFT = -0.62;
  const MAX_RISE = -6.4;
  const MAX_FALL = 8.2;
  // On release, gravity ramps in over this many frames rather than applying in full
  // on the very next frame - the "slight lag" before the fall properly starts, so a
  // quick tap-and-release reads as a hover rather than an instant reversal.
  const HANG_FRAMES = 5;

  // --- coherence ---------------------------------------------------------------
  const COHERENCE_CAPACITY = 10;
  // A pass dead centre is worth a full point; the reward falls away toward the edge
  // and is worth nothing in the outer fifth of the gap.
  const CENTRE_TOLERANCE = 0.8;
  // Thrash is measured as reversals of vertical direction per gate. Two is ordinary
  // control; beyond that the line is not smooth and the bonus decays.
  const SMOOTH_REVERSALS = 2;
  const SMOOTHNESS_SHARE = 0.35;

  // --- warp surge --------------------------------------------------------------
  const SURGE_FRAMES = 6 * 60;
  const SURGE_SPEED_MULTIPLIER = 1.45;
  const SURGE_SCORE_MULTIPLIER = 2;

  /**
   * The look, in place of HEX's bands.
   *
   * MONAS had no way to change its own backdrop at all. `activeLevel()` in
   * occult-field-runtime.js falls back to `gameLevels[currentLevelIdx]` when no
   * gallery claims the frame, and nothing ever moved `currentLevelIdx` for a MONAS
   * run - `checkLevel()` is the Gate slice's, and it no-ops for anything that is not
   * HEX. The photo, the accent wash and the tunnel/warp-star stroke colour were all
   * pinned to whatever `gameLevels[0]` happened to be, for the entire run.
   *
   * Two independent rotations replace that, on different beats so the picture and
   * the colour do not always turn over on the same gate and start to feel like one
   * event: the photo every `GALLERY_ADVANCE_GATES` gates (parity with HEX's own
   * gallery cadence), the colour identity - accent wash, tunnel stroke, warp-star
   * tint - every `COLOR_ADVANCE_GATES`. Both are driven by `gatesPassed`, which is
   * the Coherence system's own counter, so nothing new has to be tracked.
   */
  const GALLERY_ADVANCE_GATES = 4;
  const COLOR_ADVANCE_GATES = 6;

  /**
   * Difficulty, which the base game ramps through the same `checkLevel()` /
   * `applyLevel()` pair MONAS's own gate clears still call - but
   * `gate-slice-runtime.js` overrides both to guard on `gateSliceState` and no-op
   * for anything that is not HEX. Whenever `?gateSlice=1` is loaded, that silently
   * froze `gameSpeed` at whatever `startGame()` set it to for the entire run, and
   * left `getCurrentGap()` reading `currentLevelIdx` for its narrowing - the value
   * M28 repurposed as a small modulo-wrapping colour index, so the gap floor a
   * real run could reach was capped after the third gate ever cleared. Both are
   * computed here instead, off `gatesPassed` directly - unbounded, and specific to
   * MONAS's own run rather than borrowed from a value something else now means.
   * The step size intentionally matches the pace `GALLERY_ADVANCE_GATES` already
   * uses, so difficulty escalates on the same rhythm as the backdrop rather than
   * introducing a third, uncoordinated cadence.
   */
  const DIFFICULTY_ADVANCE_GATES = 5;

  // --- ambient effects -----------------------------------------------------------
  // A rare atmospheric stutter during ordinary flight, distinct from the surge and
  // from HEX's RGB-split. Interval is randomised per occurrence so it never reads
  // as a metronome.
  const AMBIENT_GLYPH_MIN_FRAMES = 260;
  const AMBIENT_GLYPH_JITTER_FRAMES = 200;
  const AMBIENT_GLYPH_DURATION_FRAMES = 14;

  // A pixel-square dot reads as nothing at the tiny sizes warp stars are drawn at,
  // so the sprite is drawn larger than the original footprint specifically so the
  // fractal shape has a chance to be seen, not just implied.
  const SPARK_SIZE_SCALE = 2.1;
  const SPARK_SPRITE_PX = 32;

  let installed = false;
  let installTimer = null;
  let held = false;
  let monasGallery = [];

  function finite(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function isMonas(gameInstance) {
    return gameInstance?.gameMode === 'MONAS';
  }

  function art() {
    return root.SexMagickOccultArt || null;
  }

  /**
   * Which gallery picture a run's progress points to.
   *
   * Same arithmetic as the Gate slice's `galleryEntryFor` - a step every
   * `advanceEvery` gates, wrapped around whatever pool was shuffled for the run -
   * kept here as a pure function so the rotation can be asserted without a browser.
   */
  function galleryEntryFor(gatesPassed, gallery, advanceEvery = GALLERY_ADVANCE_GATES) {
    if (!Array.isArray(gallery) || gallery.length === 0) return null;
    const step = Math.floor(Math.max(0, finite(gatesPassed, 0)) / Math.max(1, advanceEvery));
    return gallery[step % gallery.length] || null;
  }

  /**
   * Which of the (band-sized) `gameLevels` slots the accent wash and tunnel stroke
   * should read this run. Bounded to whatever the array actually holds, since
   * `prepareOrderedLevels` reduces `gameLevels` to the band count regardless of mode.
   */
  function levelIdxForGatesPassed(gatesPassed, levelCount, advanceEvery = COLOR_ADVANCE_GATES) {
    const count = Math.max(1, Math.floor(finite(levelCount, 1)));
    const step = Math.floor(Math.max(0, finite(gatesPassed, 0)) / Math.max(1, advanceEvery));
    return step % count;
  }

  /**
   * The speed the original's `applyLevel()` would set - `INITIAL_GAME_SPEED +
   * level * SPEED_INCREASE_PER_LEVEL`, clamped to `MAX_GAME_SPEED` - with `level`
   * replaced by a `gatesPassed`-driven step of MONAS's own, since `currentLevelIdx`
   * belongs to the colour rotation now. Defaults reproduce `CONFIG`'s own values so
   * a caller (a test) that omits `options` still gets the shipped tuning.
   */
  function monasSpeedForGatesPassed(gatesPassed, options = {}) {
    const initial = finite(options.initial, 2.9);
    const perStep = finite(options.perStep, 0.035);
    const max = finite(options.max, 8.5);
    const steps = Math.floor(Math.max(0, finite(gatesPassed, 0)) / DIFFICULTY_ADVANCE_GATES);
    return Math.min(max, initial + (steps * perStep));
  }

  /**
   * The gap the original's `getCurrentGap()` would narrow to - the same
   * `floor(level / 5) * PILLAR_GAP_DECREASE_PER_5_LEVELS` shape, `level` replaced
   * the same way as above. The breathing wobble (`sin(frames * 0.05) * 10`) is
   * applied by the caller, same as the original, since it depends on `frames`
   * rather than progress.
   */
  function monasGapForGatesPassed(gatesPassed, options = {}) {
    const baseGap = finite(options.baseGap, 200);
    const decreasePerFiveSteps = finite(options.decreasePerFiveSteps, 10);
    const minGap = finite(options.minGap, 110);
    const steps = Math.floor(Math.max(0, finite(gatesPassed, 0)) / DIFFICULTY_ADVANCE_GATES);
    const fiveStepGroups = Math.floor(steps / 5);
    return Math.max(minGap, baseGap - (fiveStepGroups * decreasePerFiveSteps));
  }

  function shuffled(list, random = Math.random) {
    const copy = Array.isArray(list) ? [...list] : [];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  /**
   * A small self-similar sparkle: four cardinal spikes, each forking into two
   * shorter sub-spikes at its tip, plus four shorter unforked diagonal rays and a
   * diamond core. One level of branching is a real fractal, not just a decorated
   * star, and it is what makes MONAS's warp field read as its own shape rather than
   * a recoloured copy of HEX's line-work.
   *
   * Returned as line segments in a -1..1 space, independent of any canvas, so the
   * geometry can be asserted directly. `sparkSprite` is what rasterises it.
   */
  function buildFractalSpark() {
    const segments = [];
    const cardinals = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    const diagonals = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
    const point = (angle, radius) => [Math.cos(angle) * radius, Math.sin(angle) * radius];

    for (const angle of cardinals) {
      const inner = point(angle, 0.16);
      const forkAt = point(angle, 0.6);
      const tip = point(angle, 1);
      segments.push([...inner, ...forkAt]);
      segments.push([...forkAt, ...tip]);
      for (const spread of [-0.42, 0.42]) {
        const branchTip = point(angle + spread, 0.86);
        segments.push([...forkAt, ...branchTip]);
      }
    }

    for (const angle of diagonals) {
      segments.push([...point(angle, 0.14), ...point(angle, 0.5)]);
    }

    const diamond = [0, -0.12, 0.12, 0, 0, 0.12, -0.12, 0];
    for (let index = 0; index < diamond.length; index += 2) {
      const next = (index + 2) % diamond.length;
      segments.push([diamond[index], diamond[index + 1], diamond[next], diamond[next + 1]]);
    }

    return segments;
  }

  /**
   * Rasterise the spark once per colour and hand back the cached bitmap - the same
   * `getCachedLayer` primitive `wallStrip` uses in occult-field-runtime.js, so fifty
   * warp stars a frame cost fifty `drawImage` calls, not fifty stroked paths.
   */
  function sparkSprite(color) {
    const artApi = art();
    if (!artApi) return null;
    const key = artApi.cacheKey(['monas-spark', color, SPARK_SPRITE_PX]);
    return artApi.getCachedLayer(key, SPARK_SPRITE_PX, SPARK_SPRITE_PX, (ctx, width, height) => {
      ctx.translate(width / 2, height / 2);
      ctx.scale(width / 2, height / 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.09;
      ctx.lineCap = 'round';
      for (const [x1, y1, x2, y2] of buildFractalSpark()) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    });
  }

  /**
   * One frame of glide.
   *
   * Pure, so the feel can be reasoned about and tested without a browser: gravity
   * pulls, lift opposes it while held, damping bleeds momentum so neither a climb nor
   * a dive runs away, and the result is clamped to a rise and fall ceiling.
   *
   * `framesSinceRelease` ramps gravity in linearly over `HANG_FRAMES` after the hold
   * ends, rather than applying it in full on the very next frame - the moment of
   * lag the glyph should hang for before it properly starts to fall. It defaults to
   * `HANG_FRAMES` (i.e. already fully ramped in), not 0, so a caller that omits it -
   * every existing test - gets exactly the old immediate-gravity behaviour.
   */
  function advanceGlide(state, options = {}) {
    const lifting = Boolean(options.held);
    const gravity = finite(options.gravity, GRAVITY);
    const damping = finite(options.damping, DAMPING);
    const lift = finite(options.lift, LIFT);
    const maxRise = finite(options.maxRise, MAX_RISE);
    const maxFall = finite(options.maxFall, MAX_FALL);
    const framesSinceRelease = finite(options.framesSinceRelease, HANG_FRAMES);

    const releaseRamp = lifting ? 1 : clamp(framesSinceRelease / HANG_FRAMES, 0, 1);

    let vy = finite(state?.vy, 0);
    vy += gravity * releaseRamp;
    if (lifting) vy += lift;
    vy *= damping;
    vy = clamp(vy, maxRise, maxFall);

    return { y: finite(state?.y, 0) + vy, vy, held: lifting };
  }

  /**
   * What a gate pass was worth.
   *
   * `offset` is the distance from the gap's centre line, so 0 is a perfect pass.
   * `reversals` is how many times vertical direction changed while approaching, which
   * is what separates a held line from a sawtooth that happens to end up centred.
   */
  function scoreCoherence(pass = {}) {
    const gap = Math.max(1, finite(pass.gap, 200));
    const offset = Math.abs(finite(pass.offset, 0));
    const half = gap / 2;

    // 1 at the centre line, 0 once the pass is within the outer fifth of the gap.
    const centred = clamp(1 - (offset / (half * CENTRE_TOLERANCE)), 0, 1);

    const reversals = Math.max(0, finite(pass.reversals, 0));
    const smooth = clamp(1 - Math.max(0, reversals - SMOOTH_REVERSALS) / 4, 0, 1);

    const gained = (centred * (1 - SMOOTHNESS_SHARE)) + (centred * smooth * SMOOTHNESS_SHARE);
    return {
      centred: Math.round(centred * 1000) / 1000,
      smooth: Math.round(smooth * 1000) / 1000,
      gained: Math.round(gained * 1000) / 1000
    };
  }

  function createMonasState() {
    return {
      version: MONAS_VERSION,
      rite: 'MONAS',
      coherence: 0,
      coherenceCapacity: COHERENCE_CAPACITY,
      gatesPassed: 0,
      perfectPasses: 0,
      bestCentred: 0,
      surges: 0,
      surgeFramesRemaining: 0,
      surgeActive: false
    };
  }

  /**
   * Add a gate pass to the run, and open a Warp Surge when the meter fills.
   */
  function applyCoherence(state, pass) {
    const next = { ...state };
    const result = scoreCoherence(pass);
    next.gatesPassed += 1;
    next.bestCentred = Math.max(finite(next.bestCentred, 0), result.centred);
    if (result.centred >= 0.999) next.perfectPasses += 1;

    let surgeStarted = false;
    if (!next.surgeActive) {
      next.coherence = clamp(next.coherence + result.gained, 0, next.coherenceCapacity);
      if (next.coherence >= next.coherenceCapacity) {
        next.coherence = 0;
        next.surgeActive = true;
        next.surgeFramesRemaining = SURGE_FRAMES;
        next.surges += 1;
        surgeStarted = true;
      }
    }

    return { state: next, result, surgeStarted };
  }

  function tickSurge(state) {
    if (!state.surgeActive) return { state, surgeEnded: false };
    const remaining = Math.max(0, finite(state.surgeFramesRemaining, 0) - 1);
    if (remaining > 0) return { state: { ...state, surgeFramesRemaining: remaining }, surgeEnded: false };
    return { state: { ...state, surgeActive: false, surgeFramesRemaining: 0 }, surgeEnded: true };
  }

  /**
   * The Warp Surge's own visual, distinct from HEX's channel-split glitch: a soft
   * gold bloom breathing outward from the same centre point the warp starfield
   * radiates from, widening as the surge runs down toward its climax. Chained onto
   * `drawHyperspaceTunnel` (see `install()`) so it layers over the field and under
   * the pillars and HUD, matching where the Void's own vignette sits for HEX.
   */
  /**
   * `createRadialGradient` + a full-canvas `fillRect` evaluates the gradient
   * function per pixel, every frame - measured, that alone cost most of an 18-19ms
   * frame during a surge on a mobile UA, over budget in a 16.6ms frame. Rasterising
   * it once into a small cached sprite and blitting that instead - the same trick
   * `sparkSprite` uses - moves the per-pixel cost to the first surge only; every
   * frame after that is a single scaled `drawImage`. The pulse becomes an alpha
   * multiplier on the blit rather than a new gradient, so it stays free to animate.
   */
  const BLOOM_SPRITE_PX = 256;

  function bloomSprite() {
    const artApi = art();
    if (!artApi) return null;
    const key = artApi.cacheKey(['monas-bloom', BLOOM_SPRITE_PX]);
    return artApi.getCachedLayer(key, BLOOM_SPRITE_PX, BLOOM_SPRITE_PX, (ctx, width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, width / 2);
      gradient.addColorStop(0, 'rgba(255, 215, 0, 1)');
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });
  }

  function drawSurgeBloom(ctx, gameInstance) {
    const state = gameInstance.monasState;
    if (!state?.surgeActive) return;
    const sprite = bloomSprite();
    if (!sprite) return;

    const progress = 1 - clamp(finite(state.surgeFramesRemaining, 0) / SURGE_FRAMES, 0, 1);
    const pulse = 0.75 + (Math.sin(finite(gameInstance.frames, 0) * 0.2) * 0.25);
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.max(width, height) * (0.3 + (progress * 0.2));

    ctx.save();
    ctx.globalAlpha = clamp(0.24 * pulse, 0, 1);
    ctx.drawImage(sprite, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  /**
   * A brief flicker of invented sigil-script near the avatar, at a random interval
   * roughly every 4-8 seconds of ordinary flight. This is the "something is not
   * quite right with reality" reading of a glitch rather than HEX's hard RGB split -
   * appropriate to a rite whose whole character is holding a steady line rather than
   * reacting to a shock. Reuses `buildGlyphRun`/`drawGlyphRun`, the same primitives
   * the Void's falling script is built from, so no new drawing code is needed for
   * the mark itself - only for when and where it appears.
   */
  function tickAmbientGlyph(ctx, gameInstance) {
    const artApi = art();
    if (!artApi) return;
    const frames = finite(gameInstance.frames, 0);

    if (!Number.isFinite(gameInstance.__monasNextGlyphAt)) {
      gameInstance.__monasNextGlyphAt = frames + AMBIENT_GLYPH_MIN_FRAMES;
    }
    if (frames >= gameInstance.__monasNextGlyphAt && !(frames < finite(gameInstance.__monasGlyphActiveUntil, -1))) {
      gameInstance.__monasGlyphActiveUntil = frames + AMBIENT_GLYPH_DURATION_FRAMES;
      gameInstance.__monasGlyphSeedX = Math.random();
      gameInstance.__monasGlyphSeedY = Math.random();
      gameInstance.__monasNextGlyphAt = frames + AMBIENT_GLYPH_MIN_FRAMES
        + Math.floor(Math.random() * AMBIENT_GLYPH_JITTER_FRAMES);
    }

    const activeUntil = finite(gameInstance.__monasGlyphActiveUntil, -1);
    if (frames >= activeUntil) return;

    const remaining = activeUntil - frames;
    const alpha = clamp(remaining / AMBIENT_GLYPH_DURATION_FRAMES, 0, 1) * 0.55;
    const x = finite(gameInstance.__monasGlyphSeedX, 0.5) * ctx.canvas.width;
    const y = ctx.canvas.height * (0.2 + (finite(gameInstance.__monasGlyphSeedY, 0.5) * 0.5));
    const random = artApi.seededRandom(artApi.hashSeed(`monas-glyph-${activeUntil}`));
    const run = artApi.buildGlyphRun({ random, count: 3, size: 14 });

    ctx.save();
    ctx.translate(x, y);
    artApi.drawGlyphRun(ctx, run, { color: '#ffd700', alpha, lineWidth: 1 });
    ctx.restore();
  }

  // --- DOM / runtime installation ------------------------------------------------

  function ensureHud() {
    if (document.getElementById('monas-hud')) return document.getElementById('monas-hud');
    const style = document.createElement('style');
    style.id = 'monas-hud-style';
    style.textContent = `
      #monas-hud {
        position: fixed; left: 50%; top: 12px; transform: translateX(-50%);
        z-index: 28; width: min(320px, calc(100vw - 40px));
        font: 11px/1.5 'Orbitron', monospace; letter-spacing: 2px;
        color: #ffd700; text-align: center; pointer-events: none;
        text-shadow: 0 0 10px rgba(255, 215, 0, .6);
      }
      #monas-hud[hidden] { display: none !important; }
      #monas-meter {
        height: 4px; margin-top: 5px; background: rgba(255, 215, 0, .18);
        border: 1px solid rgba(255, 215, 0, .45);
      }
      #monas-meter-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #ffd700, #fff6c9);
      }
      html.sex-magick-reduced-motion #monas-meter-fill { transition: none; }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'monas-hud';
    hud.hidden = true;
    hud.innerHTML = '<div id="monas-status">COHERENCE</div><div id="monas-meter"><div id="monas-meter-fill"></div></div>';
    document.body.appendChild(hud);
    return hud;
  }

  function renderHud(gameInstance) {
    const hud = ensureHud();
    const state = gameInstance?.monasState;
    const active = Boolean(state) && isMonas(gameInstance) && gameInstance.state !== GameState.START;
    hud.hidden = !active;
    if (!active) return;

    const status = document.getElementById('monas-status');
    const fill = document.getElementById('monas-meter-fill');
    if (state.surgeActive) {
      const seconds = Math.ceil(state.surgeFramesRemaining / 60);
      if (status) status.textContent = `WARP SURGE · ${seconds}s`;
      if (fill) fill.style.width = `${clamp(state.surgeFramesRemaining / SURGE_FRAMES, 0, 1) * 100}%`;
      return;
    }
    if (status) status.textContent = `COHERENCE ${state.coherence.toFixed(1).replace('.0', '')} / ${state.coherenceCapacity}`;
    if (fill) fill.style.width = `${clamp(state.coherence / state.coherenceCapacity, 0, 1) * 100}%`;
  }

  function trackHold() {
    const press = () => { held = true; };
    const release = () => { held = false; };
    root.addEventListener('pointerdown', press, { passive: true });
    root.addEventListener('pointerup', release, { passive: true });
    root.addEventListener('pointercancel', release, { passive: true });
    root.addEventListener('blur', release);
    root.addEventListener('keydown', event => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.key === 'w') press();
    });
    root.addEventListener('keyup', event => {
      if (event.code === 'Space' || event.code === 'ArrowUp' || event.key === 'w') release();
    });
  }

  function dependenciesReady() {
    return (
      typeof game !== 'undefined' && Boolean(game) &&
      typeof Game !== 'undefined' && Boolean(Game?.prototype) &&
      typeof GameState !== 'undefined' &&
      typeof Player !== 'undefined' && Boolean(Player?.prototype)
    );
  }

  function install() {
    if (installed || Game.prototype.__monasRuntimeInstalled) return root.__SEX_MAGICK_MONAS__ || null;
    if (!dependenciesReady()) return null;
    installed = true;
    Game.prototype.__monasRuntimeInstalled = true;

    ensureHud();
    trackHold();

    const originalStartGame = Game.prototype.startGame;
    const originalUpdateGameObjects = Game.prototype.updateGameObjects;
    const originalGetCurrentGap = Game.prototype.getCurrentGap;
    const originalAdjustForScreenSize = Game.prototype.adjustForScreenSize;
    const originalPlayerUpdate = Player.prototype.update;
    const originalPlayerJump = Player.prototype.jump;
    const originalTunnel = Game.prototype.drawHyperspaceTunnel;
    const originalWarpStarDraw = typeof WarpStar !== 'undefined' ? WarpStar.prototype.draw : null;
    const originalWarpStarUpdate = typeof WarpStar !== 'undefined' ? WarpStar.prototype.update : null;

    /**
     * Capture whatever geometry base the original decides, without copying its rule.
     *
     * `adjustForScreenSize()` in index.html adapts the game to the screen it is on:
     * a portrait phone gets a wider corridor and a slower scroll
     * (`baseGap` 200 -> 260, `gameSpeed` 2.9 -> 2.61). M26's escalation computed
     * from `CONFIG` constants instead, and assigned `gameSpeed` every frame, so it
     * overwrote that accommodation immediately after every resize - including a Fold
     * posture change. MONAS was harder than its own tuning intends on exactly the
     * device it is played on.
     *
     * The fix asks the original what it decides rather than re-implementing the
     * portrait test here, because a second copy of that rule would drift the first
     * time index.html's breakpoints moved. Probing from a pristine
     * `INITIAL_GAME_SPEED` matters: the original only assigns `gameSpeed` on its
     * portrait branch, so probing from an already-escalated value would ratchet the
     * captured base upward on every landscape resize.
     *
     * `currentBaseGap` is set by the same call, so the gap base needs no capture of
     * its own - `getCurrentGap` below reads it exactly as the original does.
     */
    Game.prototype.adjustForScreenSize = function monasAdjustForScreenSize(...args) {
      if (!isMonas(this)) return originalAdjustForScreenSize.apply(this, args);

      const live = this.gameSpeed;
      this.gameSpeed = typeof CONFIG !== 'undefined' ? CONFIG.INITIAL_GAME_SPEED : live;
      const result = originalAdjustForScreenSize.apply(this, args);
      this.__monasGeometryBaseSpeed = this.gameSpeed;
      this.gameSpeed = live;
      return result;
    };

    /** The geometry base for this run, falling back to the shipped tuning. */
    function geometryBaseSpeed(gameInstance) {
      const fallback = typeof CONFIG !== 'undefined' ? CONFIG.INITIAL_GAME_SPEED : 2.9;
      return finite(gameInstance?.__monasGeometryBaseSpeed, fallback);
    }

    Game.prototype.startGame = function startMonasRun(...args) {
      const result = originalStartGame.apply(this, args);
      if (isMonas(this)) {
        this.monasState = createMonasState();
        this.voidMode = false;
        this.currentLevelIdx = 0;
        // `gameMode` is only set when the rite button is clicked, which is after the
        // initial resizeCanvas(), so the wrap above has never run for this mode yet.
        // Seed it here so a run that never resizes still starts from its screen's
        // own base rather than the desktop default.
        try { this.adjustForScreenSize(); } catch (_error) {}
        this.__monasNextGlyphAt = null;
        this.__monasGlyphActiveUntil = -1;
        // A fresh shuffle per run, mirroring the Gate slice's own gallery, so two
        // MONAS runs in the same session do not walk the same picture order.
        const pool = typeof MASTER_POOL !== 'undefined' && Array.isArray(MASTER_POOL)
          ? MASTER_POOL
          : this.gameLevels;
        monasGallery = shuffled(pool);
        renderHud(this);
      } else {
        this.monasState = null;
      }
      return result;
    };

    /**
     * Glide replaces the flap, and only in MONAS. The original update still runs for
     * everything else it does - trail, squash, clamping - with the vertical
     * integration handed to `advanceGlide` first and the original's own gravity step
     * neutralised by restoring the velocity it would have applied.
     *
     * The avatar rises only while held and falls only while released, with no
     * discrete kick either way: `Player.prototype.jump` (below) is a no-op for
     * MONAS now, so this is the *only* thing moving the glyph vertically. `rot` is
     * zeroed after the original runs to remove its constant per-frame spin - the
     * original already applies a velocity-based bank (`this.vy * 0.05`) at draw
     * time regardless of `rot`, so banking still reads the movement, it just no
     * longer spins independent of it.
     */
    Player.prototype.update = function monasPlayerUpdate(...args) {
      if (this.mode !== 'MONAS') return originalPlayerUpdate.apply(this, args);

      const framesSinceRelease = held ? 0 : finite(this.__monasFramesSinceRelease, HANG_FRAMES) + 1;
      const glided = advanceGlide({ y: this.y, vy: this.vy }, { held, framesSinceRelease });
      // Hand the original the velocity that glide decided on, then undo the gravity
      // and damping it applies itself so the step is not integrated twice.
      this.vy = (glided.vy - GRAVITY) / DAMPING;
      const result = originalPlayerUpdate.apply(this, args);
      this.rot = 0;
      this.__monasFramesSinceRelease = framesSinceRelease;
      this.__monasHeld = held;
      return result;
    };

    /**
     * The base game's tap-to-flap input (`playerJump()` in index.html, and
     * `dispatchPlayerJump` in collision-runtime.js - both call `Player.prototype.jump`
     * and nothing else) fires on every click/touchstart/keydown regardless of mode.
     * For MONAS that used to land a discrete `vy = -7.2` kick, its own SFX, haptic
     * and particle burst, on top of the hold-driven glide above - the "bounce" this
     * was built to remove. MONAS is a hold rite, not a tap one, so the tap kick is a
     * no-op here; every caller routes through this one method, so no other call site
     * needs to know MONAS exists.
     */
    Player.prototype.jump = function monasPlayerJump(...args) {
      if (this.mode === 'MONAS') return undefined;
      return originalPlayerJump.apply(this, args);
    };

    Game.prototype.getCurrentGap = function monasGap(...args) {
      if (!isMonas(this) || !this.monasState) return originalGetCurrentGap.apply(this, args);
      // Computed directly rather than through the original - see the block comment
      // above DIFFICULTY_ADVANCE_GATES for why `currentLevelIdx` is off limits here.
      const narrowed = monasGapForGatesPassed(this.monasState.gatesPassed, {
        // `currentBaseGap` is what adjustForScreenSize() decided for this screen -
        // 260 on a portrait phone against CONFIG.PILLAR_GAP's 200 - and it is
        // exactly what the original getCurrentGap reads. Narrowing from the CONFIG
        // constant instead handed a portrait player a corridor 23% tighter than the
        // base game intends for their geometry.
        baseGap: finite(this.currentBaseGap, typeof CONFIG !== 'undefined' ? CONFIG.PILLAR_GAP : 200),
        decreasePerFiveSteps: typeof CONFIG !== 'undefined' ? CONFIG.PILLAR_GAP_DECREASE_PER_5_LEVELS : undefined,
        minGap: typeof CONFIG !== 'undefined' ? CONFIG.MIN_PILLAR_GAP : undefined
      });
      const breathing = narrowed + (Math.sin(this.frames * 0.05) * 10);
      if (!this.monasState.surgeActive) return breathing;
      // The surge opens the corridor rather than tightening it: this is the reward,
      // not the wager. HEX's Void is the one that closes in.
      return breathing * 1.18;
    };

    Game.prototype.updateGameObjects = function monasUpdate(...args) {
      if (!isMonas(this) || !this.monasState) return originalUpdateGameObjects.apply(this, args);

      const before = this.obstacles.map(pillar => ({ pillar, marked: pillar.marked }));
      const playerY = this.player?.y ?? 0;

      // Vertical direction reversals are the smoothness signal, sampled per frame.
      const previousVy = finite(this.__monasPreviousVy, 0);
      const currentVy = finite(this.player?.vy, 0);
      if (previousVy !== 0 && Math.sign(currentVy) !== Math.sign(previousVy) && currentVy !== 0) {
        this.__monasReversals = finite(this.__monasReversals, 0) + 1;
      }
      this.__monasPreviousVy = currentVy;

      // Difficulty escalation: speed increases on a 5-gate rhythm independent from
      // colour cycling (currentLevelIdx), following `monasSpeedForGatesPassed`. The
      // base game's `applyLevel()` would set `gameSpeed = INITIAL_GAME_SPEED +
      // level * SPEED_INCREASE_PER_LEVEL`, clamped to MAX - here `level` is replaced
      // by a step of the MONAS run's own, since `currentLevelIdx` now belongs to
      // colour rotation. The surge then multiplies this escalated speed if active.
      const escalatedSpeed = monasSpeedForGatesPassed(this.monasState.gatesPassed, {
        // Escalate *from* the screen's own base, not from the desktop constant. On a
        // portrait phone that base is 2.61, and assigning the 2.9 constant here every
        // frame is what silently undid the portrait slow-down after every resize.
        initial: geometryBaseSpeed(this),
        perStep: typeof CONFIG !== 'undefined' ? CONFIG.SPEED_INCREASE_PER_LEVEL : undefined,
        max: typeof CONFIG !== 'undefined' ? CONFIG.MAX_GAME_SPEED : undefined
      });
      this.gameSpeed = escalatedSpeed;

      // An earlier version of the surge set `this.voidMode = true` to reach the warp
      // starfield's existing fast-streak branch in drawScene(), which reads that flag
      // for both the star speed and the tunnel colour. That was two bugs at once:
      // `occult-field-runtime.js`'s `voidActive` check is `voidMode ||
      // __gateSliceVoidActive`, so it also armed HEX's Void vignette and falling
      // glyph rain - a second full field pass every frame, which is where the
      // 49ms-a-frame draw cost measured below came from. And drawScene's own
      // `tunnelColor = this.voidMode ? '#00ffff' : lvl.accent` would have painted
      // the Hexagram's reserved cyan - inviolable per M7 - over a MONAS event that
      // has nothing to do with HEX. `WarpStar.prototype.update` is wrapped below
      // instead, so the streak speeds up without touching `voidMode` at all.
      const surgeSpeed = this.monasState.surgeActive ? SURGE_SPEED_MULTIPLIER : 1;
      const baseSpeed = escalatedSpeed;
      if (surgeSpeed !== 1) this.gameSpeed = baseSpeed * surgeSpeed;

      const result = originalUpdateGameObjects.apply(this, args);

      if (surgeSpeed !== 1) this.gameSpeed = baseSpeed;

      for (const record of before) {
        if (!record.marked && record.pillar.marked) {
          const gap = finite(record.pillar.gap, 200);
          const centre = finite(record.pillar.top, 0) + (gap / 2);
          const galleryStepBefore = Math.floor(Math.max(0, finite(this.monasState.gatesPassed, 0)) / GALLERY_ADVANCE_GATES);
          const applied = applyCoherence(this.monasState, {
            gap,
            offset: playerY - centre,
            reversals: finite(this.__monasReversals, 0)
          });
          this.monasState = applied.state;
          this.__monasReversals = 0;

          // The look advances on the same event Coherence does, on its own two
          // beats (see the constants above) rather than on the Gate slice's bands,
          // which a MONAS run never has.
          if (Array.isArray(this.gameLevels) && this.gameLevels.length > 0) {
            this.currentLevelIdx = levelIdxForGatesPassed(this.monasState.gatesPassed, this.gameLevels.length);
          }

          // The original's whole level-up spectacle - shake, a freeze frame, an
          // RGB-split glitch, a particle burst - fired every time the picture
          // changed, because score threshold and level index moved together. Here
          // the photo and the colour deliberately advance on different beats (see
          // the block comment above GALLERY_ADVANCE_GATES), so the picture itself,
          // not the colour or the gate count, is what the burst is tied to -
          // `triggerLevelUpGlitch` already runs through installEffectPolicy's
          // reduced-motion/low-flash gate, so nothing here needs to re-check it.
          const galleryStepAfter = Math.floor(Math.max(0, finite(this.monasState.gatesPassed, 0)) / GALLERY_ADVANCE_GATES);
          if (galleryStepAfter !== galleryStepBefore) {
            this.shake = 12;
            this.hitStop = 3;
            this.triggerLevelUpGlitch();
            for (let i = 0; i < 30; i += 1) {
              this.particles.push(new Particle(
                this.canvas.width / 2, this.canvas.height / 2,
                '#ffd700', 12,
                Math.random() > 0.5 ? 'hexagram' : 'triangle'
              ));
            }
            try { Haptics.levelUp(); } catch (_error) {}
          }

          if (this.monasState.surgeActive && SURGE_SCORE_MULTIPLIER > 1) {
            this.score += SURGE_SCORE_MULTIPLIER - 1;
            const scoreUi = document.getElementById('scoreUi');
            if (scoreUi) scoreUi.textContent = String(this.score);
          }

          if (applied.result.centred >= 0.999) {
            for (let i = 0; i < 8; i += 1) {
              this.particles.push(new Particle(this.player.x, this.player.y, '#ffd700', 8, 'triangle'));
            }
            // Coherence's own glitch signature: a short, gentle pulse rather than
            // HEX's hard RGB split, reusing the same screen-flash and GlitchFX
            // engines the base game already renders every frame, so a perfect pass
            // gets a felt visual with no new renderer.
            if (!this.screenFlash || !this.screenFlash.active) {
              this.screenFlash = { active: true, duration: 8, color: '#ffd700', intensity: 0.16 };
            }
            try { if (Math.random() > 0.5) GlitchFX.trigger(30, 'coherence'); } catch (_error) {}
          }
          if (applied.surgeStarted) {
            this.shake = 10;
            this.hitStop = 3;
            this.triggerLevelUpGlitch();
            for (let i = 0; i < 24; i += 1) {
              this.particles.push(new Particle(this.canvas.width / 2, this.canvas.height / 2, '#ffd700', 12, 'triangle'));
            }
            try { Haptics.levelUp(); } catch (_error) {}
          }
        }
      }

      if (this.monasState.surgeActive) {
        const ticked = tickSurge(this.monasState);
        this.monasState = ticked.state;
      }

      renderHud(this);
      return result;
    };

    /**
     * Chained onto whatever `drawHyperspaceTunnel` already is - the original for a
     * build without the aesthetic pass, or occult-field-runtime's field-drawing
     * wrap when it is present. Either way this runs after the backdrop and before
     * pillars and HUD, which is where the Void's own vignette sits for HEX.
     */
    Game.prototype.drawHyperspaceTunnel = function monasOverlay(color) {
      const result = originalTunnel.call(this, color);
      if (isMonas(this) && this.monasState) {
        drawSurgeBloom(this.ctx, this);
        if (!this.monasState.surgeActive) tickAmbientGlyph(this.ctx, this);
      }
      return result;
    };

    /**
     * The surge's streak speed, read from `monasState.surgeActive` directly instead
     * of from `drawScene`'s `this.voidMode ? this.gameSpeed : this.gameSpeed*0.05` -
     * see the comment above `updateGameObjects` for why that flag is off limits.
     * `speed*20` reproduces the same jump `voidMode` used to buy (its branch fed the
     * full `gameSpeed` in instead of the slow `gameSpeed*0.05`), and `isVoid || true`
     * reproduces the steeper 25-vs-10 z-speed factor the original reserves for it -
     * same visual payoff, nothing borrowed from HEX.
     */
    if (originalWarpStarUpdate) {
      WarpStar.prototype.update = function monasWarpStarUpdate(speed, isVoid) {
        const surging = Boolean(typeof game !== 'undefined' && game?.monasState?.surgeActive);
        const effectiveSpeed = surging ? speed * 20 : speed;
        return originalWarpStarUpdate.call(this, effectiveSpeed, isVoid || surging);
      };
    }

    /**
     * The fractal spark, in place of a bare filled square. Position, depth-alpha and
     * the perspective/rotation projection are reproduced exactly from the original -
     * only the render step changes, so the warp field's motion is unaffected and
     * only its shape is. Falls back to the original flat dot if the art module is
     * unavailable, matching the rest of this codebase's degrade-gracefully style.
     */
    if (originalWarpStarDraw) {
      WarpStar.prototype.draw = function monasWarpStarDraw(ctx, cx, cy, color) {
        const sprite = sparkSprite(color);
        if (!sprite) return originalWarpStarDraw.call(this, ctx, cx, cy, color);

        const sx = (this.x / this.z) * 100;
        const sy = (this.y / this.z) * 100;
        const rx = (sx * Math.cos(this.rotation)) - (sy * Math.sin(this.rotation));
        const ry = (sx * Math.sin(this.rotation)) + (sy * Math.cos(this.rotation));
        const finalX = rx + cx;
        const finalY = ry + cy;

        const alpha = (window.innerWidth - this.z) / window.innerWidth;
        const size = (1 - (this.z / window.innerWidth)) * (3 * SPARK_SIZE_SCALE);
        if (size <= 0.05) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(finalX, finalY);
        ctx.rotate(this.rotation);
        ctx.drawImage(sprite, -size, -size, size * 2, size * 2);
        ctx.restore();
      };
    }

    root.__SEX_MAGICK_MONAS__ = Object.freeze({
      mode: 'rite-of-monas',
      version: MONAS_VERSION,
      getFingerprint() {
        return {
          monasVersion: MONAS_VERSION,
          gravity: GRAVITY,
          damping: DAMPING,
          lift: LIFT,
          maxRise: MAX_RISE,
          maxFall: MAX_FALL,
          hangFrames: HANG_FRAMES,
          coherenceCapacity: COHERENCE_CAPACITY,
          surgeFrames: SURGE_FRAMES,
          surgeSpeedMultiplier: SURGE_SPEED_MULTIPLIER,
          galleryAdvanceGates: GALLERY_ADVANCE_GATES,
          colorAdvanceGates: COLOR_ADVANCE_GATES
        };
      },
      getSnapshot() {
        if (typeof game === 'undefined' || !game?.monasState) return null;
        return { ...game.monasState, held, currentLevelIdx: game.currentLevelIdx };
      },
      /**
       * The picture MONAS's own gallery currently points to, read by
       * occult-field-runtime.js's `activeLevel()` the same way it already reads the
       * Gate slice's `getBackgroundEntry()` for HEX. Scoped to the photograph only -
       * colour identity is `currentLevelIdx`, advanced separately above - matching
       * the split HEX already draws between the two.
       */
      getBackgroundEntry() {
        if (typeof game === 'undefined' || !game || !isMonas(game) || !game.monasState) return null;
        return galleryEntryFor(game.monasState.gatesPassed, monasGallery);
      },
      getGalleryInfo() {
        return {
          size: monasGallery.length,
          advanceEveryGates: GALLERY_ADVANCE_GATES
        };
      },
      setHeldForTest(value) { held = Boolean(value); return held; },
      renderHud() { renderHud(typeof game !== 'undefined' ? game : null); }
    });

    return root.__SEX_MAGICK_MONAS__;
  }

  function scheduleInstall(timeoutMs = INSTALL_TIMEOUT_MS) {
    if (installed || installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  const api = Object.freeze({
    MONAS_VERSION,
    GRAVITY, DAMPING, LIFT, MAX_RISE, MAX_FALL, HANG_FRAMES,
    COHERENCE_CAPACITY, CENTRE_TOLERANCE, SMOOTH_REVERSALS, SMOOTHNESS_SHARE,
    SURGE_FRAMES, SURGE_SPEED_MULTIPLIER, SURGE_SCORE_MULTIPLIER,
    GALLERY_ADVANCE_GATES, COLOR_ADVANCE_GATES, DIFFICULTY_ADVANCE_GATES,
    AMBIENT_GLYPH_MIN_FRAMES, AMBIENT_GLYPH_JITTER_FRAMES, AMBIENT_GLYPH_DURATION_FRAMES,
    clamp,
    advanceGlide,
    scoreCoherence,
    createMonasState,
    applyCoherence,
    tickSurge,
    galleryEntryFor,
    levelIdxForGatesPassed,
    // Written to be assertable without a browser, but never exported until now -
    // which is why M26 could ship escalating from the wrong base unnoticed.
    monasSpeedForGatesPassed,
    monasGapForGatesPassed,
    shuffled,
    buildFractalSpark,
    install,
    scheduleInstall
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SexMagickMonas = api;

  if (typeof document !== 'undefined') scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this);
