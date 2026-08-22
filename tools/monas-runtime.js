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

  function whole(value, fallback = 0) {
    return Math.max(0, Math.floor(finite(value, fallback)));
  }

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

  // Smaller than HEX's 10: MONAS's walls come at a wider gap and a slower speed,
  // so an edge is cheaper to take, and matching HEX's capacity would have the
  // portal arriving constantly. Tuned so a portal lands roughly as often as the
  // Caduceus does rather than on top of it.
  const MONAS_GNOSIS_CAPACITY = 8;

  // The band index at which MONAS's risk zones open. MALKUTH's equivalent - the
  // first band - stays teachable: no Gnosis for edging and no decay for the
  // middle, so a new player learns the glide before being asked to gamble on it.
  const MONAS_RISK_FROM_BAND = 1;

  // The same 12px the Gate slice uses (`EFFECTIVE_PLAYER_HALF`): the avatar is the
  // same size in both rites, so the safe band is the same band. Named separately
  // rather than imported so a MONAS-only change here would not silently move
  // HEX's collision reasoning with it.
  const MONAS_PLAYER_HALF = 12;

  // Wider than HEX's graze window, because MONAS's corridors are wider and a
  // proportionally equal graze is a larger number of pixels.
  const MONAS_NEAR_MISS_PX = 16;

  function gnosisEdgeApi() {
    if (root.SexMagickGnosisEdge) return root.SexMagickGnosisEdge;
    try {
      if (typeof module === 'object' && module.exports && typeof require === 'function') {
        return require('./gnosis-edge.js');
      }
    } catch (_error) {}
    return null;
  }

  function gateSliceApi() {
    return root.SexMagickGateSlice || null;
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
      surgeActive: false,
      // M42: MONAS banks Gnosis by edging, exactly as HEX does. Coherence stays
      // its own layer - it measures how *smoothly* you fly and buys the Warp
      // Surge; Gnosis measures how *close* you fly and buys the portal. Two
      // meters that reward different things is the point: a run can be smooth and
      // timid, or ragged and brave, and they pay for different rewards.
      gnosis: 0,
      gnosisCapacity: MONAS_GNOSIS_CAPACITY,
      riskStreak: 0,
      timidGates: 0,
      portalReady: false,
      portalsEntered: 0,
      portalsSurvived: 0
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
      /* M42: the edge bank, beneath the coherence meter. Cyan-free by
         necessity - cyan is HEX's reserved colour (M7) - so Gnosis reads in a
         paler gold than coherence's, close enough to belong to the same rite and
         separate enough to be a second quantity at a glance. */
      #monas-gnosis { margin-top: 6px; opacity: .92; font-size: 10px; }
      #monas-gnosis-meter {
        height: 3px; margin-top: 4px; background: rgba(255, 246, 201, .16);
        border: 1px solid rgba(255, 246, 201, .38);
      }
      #monas-gnosis-fill {
        height: 100%; width: 0%;
        background: linear-gradient(90deg, #fff6c9, #ffffff);
      }
      #monas-hud.is-portal-ready #monas-gnosis-fill { background: #ffffff; }
      /* M43: risk-live bands tint the Gnosis row, so the HUD and the corridor say
         the same thing - the gold boundary rules drawn on the pillars appear on
         exactly the bands this class is on. */
      #monas-hud.is-risk-live #monas-gnosis { color: #ffd700; text-shadow: 0 0 8px rgba(255, 215, 0, .7); }
      #monas-hud.is-risk-live #monas-gnosis-meter { border-color: rgba(255, 215, 0, .62); }
      /* M43: MONAS's own transient line. It does not reach into the Gate slice's
         telegraph: that element belongs to a HEX-only HUD and is hidden with it, and
         a cross-rite reach would couple the two rites' shells for one string. Same
         D-065 notice band and D-066 edge-faded scrim as every other notice, so the
         slot arbitration keeps exactly one message on screen. Gold, not cyan. */
      #monas-telegraph {
        position: fixed;
        left: 50%;
        bottom: max(128px, calc(env(safe-area-inset-bottom) + 122px));
        transform: translateX(-50%);
        z-index: 29;
        padding: 7px 14px;
        border: none;
        background: linear-gradient(90deg,
          transparent, rgba(0,0,0,.72) 18%, rgba(0,0,0,.72) 82%, transparent);
        color: #fff6c9;
        text-align: center;
        pointer-events: none;
        white-space: nowrap;
        font: var(--sm-hud-font-size, 10px)/1.5 'Orbitron', monospace;
        letter-spacing: 2.4px;
        text-shadow: 0 0 10px #ffd700;
      }
      #monas-telegraph[hidden] { display: none !important; }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = 'monas-hud';
    hud.hidden = true;
    hud.innerHTML = '<div id="monas-status">COHERENCE</div>'
      + '<div id="monas-meter"><div id="monas-meter-fill"></div></div>'
      + '<div id="monas-gnosis">GNOSIS</div>'
      + '<div id="monas-gnosis-meter"><div id="monas-gnosis-fill"></div></div>';
    document.body.appendChild(hud);

    if (!document.getElementById('monas-telegraph')) {
      const telegraph = document.createElement('div');
      telegraph.id = 'monas-telegraph';
      telegraph.hidden = true;
      document.body.appendChild(telegraph);
    }
    return hud;
  }

  /** Suppressed under visual QA, since a timed message cannot be screenshot-compared. */
  function visualQaActive() {
    try {
      return new URLSearchParams(root.location?.search || '').get('visualQa') === '1';
    } catch (_error) {
      return false;
    }
  }

  let telegraphTimer = null;

  /**
   * MONAS's transient line, through the shared notice slot (D-065).
   */
  function setMonasTelegraph(text, durationMs = 1100) {
    if (visualQaActive()) return;
    ensureHud();
    const element = document.getElementById('monas-telegraph');
    if (!element) return;
    element.textContent = text;
    try {
      root.SexMagickNoticeSlot?.register('monas-telegraph');
      root.SexMagickNoticeSlot?.claim('monas-telegraph');
    } catch (_error) { /* never let slot arbitration break a notice */ }
    element.hidden = false;
    if (telegraphTimer) clearTimeout(telegraphTimer);
    telegraphTimer = setTimeout(() => {
      element.hidden = true;
      telegraphTimer = null;
    }, durationMs);
  }

  /**
   * Announce the band the run has just entered, and say whether the edge pays.
   *
   * M43: MONAS has banked Gnosis by edging since M42 and never said so. The band
   * that opens risk is the moment the gold boundary rules start being drawn on the
   * pillars, so it is the moment worth naming - the same reading HEX's
   * `THE EDGE AWAKENS` gives, in MONAS's own vocabulary.
   */
  function announceBandChange(gameInstance) {
    const state = gameInstance?.monasState;
    if (!state) return;
    const bandIndex = whole(state.progressionBandIndex, 0);
    const previous = gameInstance.__monasLastBandIndex;
    gameInstance.__monasLastBandIndex = bandIndex;
    if (!Number.isInteger(previous) || bandIndex <= previous) return;

    const riskLive = bandIndex >= MONAS_RISK_FROM_BAND;
    const opensRisk = riskLive && previous < MONAS_RISK_FROM_BAND;
    setMonasTelegraph(
      opensRisk ? 'THE EDGE AWAKENS  ·  HUG THE WALL TO BANK GNOSIS'
        : riskLive ? 'THE CURRENT QUICKENS  ·  THE EDGE STILL PAYS'
          : 'LEARN THE CURRENT',
      opensRisk ? 1500 : 950
    );
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
      renderGnosisRow(hud, state);
      return;
    }
    if (status) status.textContent = `COHERENCE ${state.coherence.toFixed(1).replace('.0', '')} / ${state.coherenceCapacity}`;
    if (fill) fill.style.width = `${clamp(state.coherence / state.coherenceCapacity, 0, 1) * 100}%`;
    renderGnosisRow(hud, state);
  }

  /**
   * The edge bank's own row.
   *
   * Split out rather than folded into `renderHud` because the surge branch above
   * returns early, and Gnosis must keep reading through a surge - a player edging
   * during a Warp Surge is still banking, and a meter that froze for the duration
   * would look broken at exactly the loudest moment.
   */
  function renderGnosisRow(hud, state) {
    const label = document.getElementById('monas-gnosis');
    const fill = document.getElementById('monas-gnosis-fill');
    const capacity = Math.max(1, finite(state.gnosisCapacity, 1));
    const gnosis = Math.max(0, finite(state.gnosis, 0));
    if (label) {
      label.textContent = state.portalReady
        ? 'THE PORTAL OPENS'
        : `GNOSIS ${gnosis.toFixed(1).replace('.0', '')} / ${capacity}`;
    }
    if (fill) fill.style.width = `${clamp(gnosis / capacity, 0, 1) * 100}%`;
    if (hud) {
      hud.classList.toggle('is-portal-ready', Boolean(state.portalReady));
      hud.classList.toggle(
        'is-risk-live',
        whole(state.progressionBandIndex, 0) >= MONAS_RISK_FROM_BAND
      );
    }
  }

  function trackHold() {
    /**
     * M43: the press that begins a glide sounds a note.
     *
     * `Player.prototype.jump` is a no-op in MONAS - it is a hold rite, not a tap
     * one - so MONAS made no input sound at all, and the tap melody added in M43
     * would have landed in HEX only. The press is MONAS's equivalent discrete
     * input, so the note goes there. Only on the *transition* into a hold: a held
     * finger fires no repeats, and holding is most of how MONAS is played.
     */
    const press = () => {
      const began = !held;
      held = true;
      if (!began) return;
      try {
        if (typeof game !== 'undefined' && isMonas(game)
          && game.state === GameState.PLAYING && game.settings?.sfx) {
          SFX.playMelodyNote();
        }
      } catch (_error) {}
    };
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

  // --- the Caduceus ------------------------------------------------------------
  //
  // M41: MONAS's answer to HEX's bonus corridor. Not a copy of it - see the essay
  // at the top of `monas-currents.js` for why a constellation caught by darting
  // would have made MONAS a worse version of the other rite rather than a second
  // one. Here the nodes lie on two intertwined strands and the payout scales on
  // unbroken glide, so the greedy line and the smooth line are different lines.

  const CADUCEUS_EVERY_GATES = 18;
  const CADUCEUS_BRAID_PERIOD = 150;

  function caduceusEveryGates() {
    // Reaching a section that arrives every 18 gates costs minutes of play, and
    // D-066/D-069 both record what that does: sections go unverified because
    // verifying them is expensive. Same override shape as `?bonusEvery=`.
    try {
      const raw = new URLSearchParams(root.location?.search || '').get('caduceusEvery');
      const parsed = Math.floor(Number(raw));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } catch (_error) {}
    return CADUCEUS_EVERY_GATES;
  }

  function currentsApi() {
    return root.SexMagickMonasCurrents || null;
  }

  /**
   * The braid: two sine strands in antiphase, so a node on one is at the other's
   * mirror. Amplitude is bounded to the middle of the screen rather than the full
   * height, because a node against the ceiling is not a glide target - it is a
   * wall the player has to slam into.
   */
  function braidY(gameInstance, index) {
    const height = Math.max(1, finite(gameInstance?.canvas?.height, 640));
    const phase = (finite(gameInstance?.frames, 0) / CADUCEUS_BRAID_PERIOD) * Math.PI * 2;
    const side = currentsApi()?.strandFor(index) === 'left' ? 1 : -1;
    const amplitude = height * 0.22;
    return (height / 2) + (Math.sin(phase) * amplitude * side);
  }

  function resetCaduceus(gameInstance) {
    gameInstance.__monasCaduceus = null;
    gameInstance.__monasCaduceusLastGate = -1;
    gameInstance.__monasCaduceusNextSpawn = 0;
  }

  /**
   * Open a section when the gate count lands on the interval, and only then.
   *
   * Guarded by `__monasCaduceusLastGate` for the same reason `tickBonusCorridor`
   * is: `gatesPassed` can hold the same value for many frames, and without the
   * guard the section would re-open every frame it sat on a multiple.
   */
  function maybeOpenCaduceus(gameInstance) {
    const api = currentsApi();
    if (!api || gameInstance.__monasCaduceus) return false;
    const gates = whole(gameInstance.monasState?.gatesPassed, 0);
    if (gates <= 0 || gates % caduceusEveryGates() !== 0) return false;
    if (gameInstance.__monasCaduceusLastGate === gates) return false;

    gameInstance.__monasCaduceusLastGate = gates;
    gameInstance.__monasCaduceus = api.createCaduceus(whole(gameInstance.monasState?.progressionBandIndex, 0));
    gameInstance.__monasCaduceusNextSpawn = 0;
    return true;
  }

  /**
   * Spawn pacing derived from the section's own countdown rather than a fixed
   * interval. D-069 recorded what a fixed interval did to HEX's corridor - the
   * smallest set finished in 120 of 300 frames and left three seconds of nothing -
   * and this is the same section shape, so it inherits the same correction rather
   * than the same bug.
   */
  function spawnCaduceusNodes(gameInstance) {
    const state = gameInstance.__monasCaduceus;
    const api = currentsApi();
    if (!state || !api || state.spawned >= state.total) return;
    if (gameInstance.__monasCaduceusNextSpawn > 0) {
      gameInstance.__monasCaduceusNextSpawn -= 1;
      return;
    }
    const remaining = Math.max(1, state.total - state.spawned);
    // Leave a tail so the last node is reachable before the section closes.
    const window = Math.max(1, state.framesRemaining - 60);
    gameInstance.__monasCaduceusNextSpawn = Math.max(12, Math.floor(window / remaining));

    try {
      if (typeof Pentagram !== 'function') return;
      const order = root.SexMagickPolygram?.BAND_ORDERS?.[
        Math.min(whole(gameInstance.monasState?.progressionBandIndex, 0),
          (root.SexMagickPolygram.BAND_ORDERS.length || 1) - 1)
      ];
      const node = new Pentagram(
        finite(root.innerWidth, gameInstance.canvas?.width || 800),
        braidY(gameInstance, state.spawned),
        order
      );
      node.__monasStrand = api.strandFor(state.spawned);
      gameInstance.pentagrams.push(node);
      state.spawned += 1;
    } catch (_error) { /* a node that fails to spawn costs points, not the run */ }
  }

  /**
   * Close out one Caduceus frame: score what was caught, count what was lost, and
   * end the section when its clock runs out.
   *
   * Misses are counted in both removal paths, not just the obvious one. D-069
   * recorded that the `frames % 60` compaction filter in `index.html` drops
   * off-screen stars silently, which was invisible before a streak existed and
   * would quietly forgive a miss at random once one did. `__missed` guards against
   * counting the same node twice when both paths see it.
   */
  function settleCaduceusFrame(gameInstance, state, nodesBefore, reversed) {
    const api = currentsApi();
    if (!api || !state) return;

    api.tickCaduceus(state, Boolean(reversed));

    if (nodesBefore) {
      for (const node of nodesBefore) {
        if (!node || node.__monasScored) continue;
        if (node.collected) {
          node.__monasScored = true;
          const result = api.catchNode(state);
          gameInstance.score = whole(gameInstance.score, 0) + result.awarded;
          try {
            if (root.GlitchFX?.trigger) {
              root.GlitchFX.trigger(result.smoothness > 0.5 ? 90 : 40,
                result.smoothness > 0.5 ? 'shearTear' : 'rgbSplit');
            }
          } catch (_error) {}
        } else if (!gameInstance.pentagrams.includes(node) && !node.__missed) {
          // Left the field uncaught, by either removal path.
          node.__missed = true;
          node.__monasScored = true;
          api.missNode(state);
        }
      }
    }

    const completion = api.claimCaduceusCompletion(state);
    if (completion > 0) {
      gameInstance.score = whole(gameInstance.score, 0) + completion;
      try { root.GlitchFX?.trigger?.(220, 'sweepBeam', '#7de3ff'); } catch (_error) {}
      try { if (gameInstance.settings?.sfx) SFX.levelUp(); } catch (_error) {}
    }

    if (state.framesRemaining <= 0) {
      gameInstance.__monasCaduceus = null;
      gameInstance.__monasCaduceusNextSpawn = 0;
    }
  }

  /**
   * Bank Gnosis for one cleared MONAS wall.
   *
   * The classification and the economy are both the Gate slice's - `classifyGateClear`
   * needs nothing but a height and a corridor, and `gnosis-edge.js` needs nothing
   * but a bank. What is MONAS's alone is *which* band opens the risk zones, since
   * MONAS runs its own six-band ladder and inheriting HEX's thresholds here is
   * precisely the error D-072 recorded.
   *
   * Silent on every failure: a missing module or a malformed pillar costs the
   * player a half-point of Gnosis, where a thrown error inside the update loop
   * costs them the run.
   */
  function bankMonasEdge(gameInstance, pillar) {
    const state = gameInstance?.monasState;
    const slice = gateSliceApi();
    const economy = gnosisEdgeApi();
    if (!state || !slice?.classifyGateClear || !economy) return null;

    try {
      const approach = pillar.__gateSliceApproach;
      const classification = slice.classifyGateClear({
        playerY: approach ? approach.playerY : gameInstance.player?.y,
        gapTop: approach ? approach.gapTop : pillar.top,
        gapSize: approach ? approach.gapSize : pillar.gap,
        playerHalf: MONAS_PLAYER_HALF
      });
      const bandIndex = whole(state.progressionBandIndex, 0);
      const applied = economy.applyEdgeClear(
        { gnosis: state.gnosis, gnosisCapacity: state.gnosisCapacity,
          riskStreak: state.riskStreak, timidGates: state.timidGates },
        {
          classification,
          family: pillar.patternFamily || 'safe',
          riskActive: bandIndex >= MONAS_RISK_FROM_BAND,
          nearMissThreshold: MONAS_NEAR_MISS_PX
        }
      );

      state.gnosis = applied.edge.gnosis;
      state.gnosisCapacity = applied.edge.gnosisCapacity;
      state.riskStreak = applied.edge.riskStreak;
      state.timidGates = applied.edge.timidGates;
      if (applied.full) state.portalReady = true;
      if (applied.bonusScore > 0) {
        gameInstance.score = whole(gameInstance.score, 0) + applied.bonusScore;
        const scoreUi = document.getElementById('scoreUi');
        if (scoreUi) scoreUi.textContent = String(gameInstance.score);
      }
      return applied;
    } catch (_error) {
      return null;
    }
  }

  // --- the portal ---------------------------------------------------------------
  //
  // MONAS's answer to HEX's wagered Void. The wager is the same currency in both
  // rites now (Gnosis, banked by edging), but what survives it is not: HEX's Void
  // is survived by not dying at speed, and the Undertow is survived by *gliding* -
  // `settleUndertow` scales the return by smoothness, so a player who thrashes
  // through it loses the stake without ever touching a wall.

  // How hard the portal is, and why those two numbers and not others.
  //
  // HEX's Void multiplies band speed by 1.5 and takes 20px off the gap, then
  // clamps to `MAX_VALIDATED_SPEED` / `MIN_VALIDATED_GAP` - "a sharp escalation at
  // low bands that saturates at the hardest provably clearable configuration
  // instead of running off into difficulty nobody has shown is survivable"
  // (gate-slice-runtime.js). MONAS uses the same shape and the same reasoning, with
  // its own envelope.
  //
  // That envelope is D-050's frontier and D-051's boundary job: every coordinate
  // from 2.9/260 through 5.7/190 is verified, and 5.7/190 was audited across the
  // complete scheduler-legal pattern-variant pair cross-product. So the clamp lands
  // the hardest possible portal exactly on the audited ceiling. Below it, the
  // portal is slower at a wider corridor than a verified pair, which is inside the
  // envelope by the same monotonicity argument D-058 used.
  const PORTAL_SPEED_MULTIPLIER = 1.5;
  const PORTAL_GAP_REDUCTION = 20;
  // M44: re-searched and raised from 5.7/190. See the BANDS comment in
  // `monas-progression-runtime.js` for why the old ceiling was never a
  // reachability limit. The live ladder stops at 6.5/170 so the portal always has
  // somewhere to escalate to.
  const MONAS_MAX_VERIFIED_SPEED = 7.0;
  const MONAS_MIN_VERIFIED_GAP = 160;

  // The ring the player flies into, and how long it waits before drifting off.
  const PORTAL_OUTER_RADIUS = 58;
  const PORTAL_ENTRY_RADIUS = 34;

  // How long the current holds you, by band.
  //
  // M44: the owner reported the portal "not long lasting at all once the player
  // enters", and asked for sections that start short and lengthen. The first band's
  // 300 frames is the length M43 shipped and is deliberately unchanged - a five
  // second wager is the right size for the first one a player ever meets. The top
  // band's 660 is a little over eleven seconds.
  //
  // Length is the escalation the Undertow can carry without new evidence: it is
  // more frames of a condition already clamped to the audited 5.7/190, not a harder
  // one. And it bites specifically: `settleUndertow` scales the return by
  // smoothness, so a longer current is more time to stay smooth, which is the thing
  // the section actually asks for.
  const PORTAL_FRAMES_FIRST = 300;
  const PORTAL_FRAMES_LAST = 660;

  function portalFramesForBand(bandIndex, bandCount) {
    const bands = Math.max(1, whole(bandCount, 7));
    const index = Math.min(Math.max(0, whole(bandIndex, 0)), bands - 1);
    const ratio = bands <= 1 ? 0 : index / (bands - 1);
    return Math.round(PORTAL_FRAMES_FIRST + ((PORTAL_FRAMES_LAST - PORTAL_FRAMES_FIRST) * ratio));
  }

  function portalSpeedFor(bandSpeed) {
    const base = Math.max(0, finite(bandSpeed, 0));
    return Math.min(MONAS_MAX_VERIFIED_SPEED, base * PORTAL_SPEED_MULTIPLIER);
  }

  function portalGapFor(baseGap) {
    const base = finite(baseGap, MONAS_MIN_VERIFIED_GAP);
    return Math.max(MONAS_MIN_VERIFIED_GAP, base - PORTAL_GAP_REDUCTION);
  }

  function resetPortal(gameInstance) {
    gameInstance.__monasPortalOffer = null;
    closePortal(gameInstance);
  }

  /**
   * Offer the portal as an object in the corridor rather than as an event.
   *
   * M42 opened the section the instant the meter filled, which meant the player
   * never saw the thing they were entering - the owner's word for what was missing
   * was that "the portal appears and the player enters". This spawns a ring at the
   * right edge on a pillar spawn frame, so it arrives on the corridor's own rhythm
   * and sits in a gap rather than inside a wall.
   *
   * Missing it is not a decision and does not bank: `portalReady` stays true and
   * the next spawn frame offers again. HEX's Gate is the rite with an accept/decline
   * choice; MONAS's meter has already been filled by the edging that earned it.
   */
  function maybeOfferPortal(gameInstance) {
    const state = gameInstance?.monasState;
    if (!state || gameInstance.__monasPortal || gameInstance.__monasPortalOffer) return false;
    if (gameInstance.__monasCaduceus) return false;
    if (!state.portalReady || state.gnosis <= 0) return false;

    const grammar = root.SexMagickObstacleGrammar;
    const spawnFrame = typeof grammar?.isSpawnFrame === 'function'
      ? grammar.isSpawnFrame(gameInstance, typeof CONFIG !== 'undefined' ? CONFIG : null)
      // No grammar (a bare diagnostic page): fall back to the raw cadence rather
      // than never offering at all.
      : finite(gameInstance.frames, 0) > 0 && finite(gameInstance.frames, 0) % 90 === 0;
    if (!spawnFrame) return false;

    const height = finite(gameInstance?.canvas?.height, 0);
    const width = finite(gameInstance?.canvas?.width, 0);
    if (height <= 0 || width <= 0) return false;

    // Placed against the newest pillar's gap when there is one, so the ring is
    // reachable by construction rather than by luck. Without a pillar - the first
    // frames of a run - the centre line is the only defensible guess.
    const newest = Array.isArray(gameInstance.obstacles) && gameInstance.obstacles.length
      ? gameInstance.obstacles[gameInstance.obstacles.length - 1]
      : null;
    const y = newest && finite(newest.gap, 0) > 0
      ? finite(newest.top, 0) + (finite(newest.gap, 0) / 2)
      : height / 2;

    gameInstance.__monasPortalOffer = {
      x: width + PORTAL_OUTER_RADIUS,
      y: clamp(y, PORTAL_OUTER_RADIUS, height - PORTAL_OUTER_RADIUS),
      outerRadius: PORTAL_OUTER_RADIUS,
      entryRadius: PORTAL_ENTRY_RADIUS,
      offeredAtFrame: finite(gameInstance.frames, 0),
      resolved: false
    };
    setMonasTelegraph('THE PORTAL OPENS  ·  FLY INTO IT', 1400);
    try {
      if (gameInstance.settings?.sfx && typeof SFX?.playTone === 'function') {
        SFX.playTone(196, 'sine', 0.2, 0.05);
        setTimeout(() => SFX.playTone(294, 'sine', 0.18, 0.045), 120);
      }
    } catch (_error) {}
    return true;
  }

  /**
   * Drift the offered ring left and resolve it on contact.
   *
   * Runs before the delegated update so entry and the section's first frame land
   * together - a one-frame gap here would show the corridor at ordinary speed
   * inside a portal that had already been entered.
   */
  function updatePortalOffer(gameInstance) {
    const offer = gameInstance?.__monasPortalOffer;
    if (!offer || offer.resolved) return;
    offer.x -= finite(gameInstance.gameSpeed, 0);

    const player = gameInstance.player;
    if (player) {
      const distance = Math.hypot(finite(player.x, 0) - offer.x, finite(player.y, 0) - offer.y);
      if (distance <= finite(offer.entryRadius, PORTAL_ENTRY_RADIUS)) {
        offer.resolved = true;
        gameInstance.__monasPortalOffer = null;
        openPortal(gameInstance);
        return;
      }
      // Passed without touching it. The meter is untouched, so the next spawn
      // frame offers again.
      if (offer.x + finite(offer.outerRadius, PORTAL_OUTER_RADIUS) < finite(player.x, 0) - finite(player.r, 0)) {
        offer.resolved = true;
        gameInstance.__monasPortalOffer = null;
      }
    }
  }

  /**
   * The ring itself: gold, counter-rotating, brightening as it closes.
   *
   * Drawn from the frame counter rather than `Math.random()` so a visual baseline
   * capture lands on the same ring for the same frame.
   */
  function drawPortalOffer(ctx, gameInstance) {
    const offer = gameInstance?.__monasPortalOffer;
    if (!ctx || !offer) return;
    const player = gameInstance.player;
    const span = Math.max(1, finite(gameInstance?.canvas?.width, 1));
    const closeness = player
      ? clamp(1 - ((offer.x - finite(player.x, 0)) / span), 0, 1)
      : 0;
    const frames = finite(gameInstance.frames, 0);
    const outer = finite(offer.outerRadius, PORTAL_OUTER_RADIUS);
    const entry = finite(offer.entryRadius, PORTAL_ENTRY_RADIUS);

    ctx.save();
    ctx.translate(offer.x, offer.y);
    ctx.globalCompositeOperation = 'lighter';

    // Two rings turning against each other, so it reads as an aperture being held
    // open rather than a decal.
    for (const direction of [1, -1]) {
      ctx.save();
      ctx.rotate(frames * 0.02 * direction);
      ctx.strokeStyle = 'rgba(255, 215, 0, ' + (0.3 + closeness * 0.5).toFixed(3) + ')';
      ctx.lineWidth = direction > 0 ? 3 : 1.5;
      ctx.beginPath();
      const radius = direction > 0 ? outer : outer * 0.78;
      for (let i = 0; i <= 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // The aperture proper - the circle the collision test actually uses, so what
    // the player aims at is what the code measures.
    ctx.strokeStyle = 'rgba(255, 246, 201, ' + (0.5 + closeness * 0.45).toFixed(3) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, entry + (Math.sin(frames * 0.12) * 2), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Enter the portal. Called only from `updatePortalOffer`, on contact.
   *
   * Two sections at once would be unreadable, and the Caduceus already suppresses
   * pillars - a portal inside it would be a wager on a corridor with nothing in
   * it, which is not a wager. The offer is not made inside one, so this is a guard
   * against a Caduceus opening while a ring was already in flight.
   */
  function openPortal(gameInstance) {
    const api = currentsApi();
    const state = gameInstance?.monasState;
    if (!api || !state || gameInstance.__monasPortal || gameInstance.__monasCaduceus) return false;
    if (!state.portalReady || state.gnosis <= 0) return false;

    const bandCount = root.__SEX_MAGICK_MONAS_PROGRESSION__?.getFingerprint?.().bands?.length;
    const portal = api.createUndertow(
      state.gnosis,
      portalFramesForBand(state.progressionBandIndex, bandCount)
    );
    if (portal.stake <= 0) return false;

    state.gnosis = Math.max(0, Math.round((state.gnosis - portal.stake) * 10) / 10);
    state.portalReady = false;
    state.portalsEntered = whole(state.portalsEntered, 0) + 1;
    gameInstance.__monasPortal = portal;

    // The Warp Surge is suppressed for the duration. Two escalations at once is
    // unreadable, and it keeps the portal's clamped speed from being multiplied by
    // 1.45 on top - the compounding case nothing has audited.
    gameInstance.__monasPortalSuppressedSurge = Boolean(state.surgeActive);
    state.surgeActive = false;

    gameInstance.screenFlash = { active: true, duration: 18, color: '#ffd700', intensity: 0.34 };
    gameInstance.shake = 10;
    document.getElementById('game-container')?.classList.add('monas-portal-active');
    setMonasTelegraph(`THE CURRENT TAKES YOU  ·  STAKED ${portal.stake}`, 1400);

    try { root.GlitchFX?.trigger?.(180, 'sweepBeam', '#fff6c9'); } catch (_error) {}
    try { if (gameInstance.settings?.sfx) SFX.voidEnter(); } catch (_error) {}
    try { Haptics.levelUp(); } catch (_error) {}
    return true;
  }

  /**
   * The portal's own speed and corridor, applied per frame.
   *
   * Written as a bracket around the delegated update - multiply before, restore
   * after - for the same reason the surge is: `applyProgression` is the sole writer
   * of `gameSpeed` since M43, and a section that assigned it outright would be the
   * exact defect M43.1 removed, one milestone later.
   */
  function portalSpeedBracket(gameInstance) {
    if (!gameInstance?.__monasPortal) {
      gameInstance.__monasSectionGap = null;
      return null;
    }
    const base = finite(gameInstance.gameSpeed, 0);
    gameInstance.gameSpeed = portalSpeedFor(base);
    // The corridor the section owns, read by `monas-progression-runtime.js`'s
    // `getCurrentGap` wrap - see its `__monasSectionGap` note for why it is a
    // number on the instance rather than another wrapper.
    const bandGap = finite(gameInstance.monasState?.progressionGap, NaN);
    gameInstance.__monasSectionGap = Number.isFinite(bandGap)
      ? portalGapFor(bandGap)
      : null;
    return base;
  }

  /**
   * Advance a live portal and settle it once its clock runs out.
   *
   * `settleUndertow` is once-only by construction, which matters because the
   * closing frame can be observed twice - by the tick that ended it and by the
   * teardown that clears it - and a caller-side guard has to be right in both.
   */
  function tickPortal(gameInstance, reversed) {
    const api = currentsApi();
    const portal = gameInstance?.__monasPortal;
    const state = gameInstance?.monasState;
    if (!api || !portal || !state) return;

    api.tickUndertow(portal, Boolean(reversed));
    if (!api.isUndertowOver(portal)) return;

    const settled = api.settleUndertow(portal);
    if (settled.settled && settled.returned > 0) {
      state.gnosis = Math.min(
        finite(state.gnosisCapacity, 0),
        Math.round((finite(state.gnosis, 0) + settled.returned) * 10) / 10
      );
      state.portalsSurvived = whole(state.portalsSurvived, 0) + 1;
      try { root.GlitchFX?.trigger?.(220, 'sweepBeam', '#ffffff'); } catch (_error) {}
      setMonasTelegraph(`THE CURRENT RETURNS  +${settled.returned}`, 1300);
    } else {
      setMonasTelegraph('THE CURRENT SCATTERS YOU', 1300);
    }
    closePortal(gameInstance);
  }

  /**
   * Put the field back exactly as it was.
   *
   * Separate from `tickPortal` because death, retry and a rite change all have to
   * take this path too. A section left half-open would keep the container class -
   * and therefore the darkened field - through the whole of the next run, which is
   * the shape of teardown bug MONAS has now produced twice.
   */
  function closePortal(gameInstance) {
    if (!gameInstance) return;
    gameInstance.__monasPortal = null;
    gameInstance.__monasPortalBaseSpeed = null;
    gameInstance.__monasSectionGap = null;
    document.getElementById('game-container')?.classList.remove('monas-portal-active');
    // The surge is not resumed. It was mid-flight when the portal took it and its
    // clock kept running down while suppressed; handing back a surge with an
    // unknown remainder is worse than ending it, and `surgeFramesRemaining` is the
    // authority either way.
    gameInstance.__monasPortalSuppressedSurge = false;
  }

  // --- the run record -----------------------------------------------------------
  //
  // M42: MONAS records runs now. It could not before, and `rite-validation.js`
  // said so in a comment - "the rite is a parameter rather than a constant so a
  // MONAS board needs a recorder, not a rewrite of these rules". This is that
  // recorder. D-004 requires the two Rites rank separately and they do: the board
  // key is `board:{rite}` and MONAS runs are stamped `MONAS`.
  //
  // Kept in memory rather than persisted. HEX's history is its *local* leaderboard
  // and has to survive a reload; MONAS has no local board of its own yet, and this
  // exists solely so the newest finished run can be handed to the global board on
  // the way to the menu. Writing it to storage would imply a durability nothing
  // reads.

  const MONAS_HISTORY_LIMIT = 20;
  let monasHistory = [];

  function beginMonasRun(gameInstance) {
    const state = gameInstance?.monasState;
    if (!state) return;
    state.runId = `monas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    state.startedAt = new Date().toISOString();
    state.endedAt = null;
  }

  /**
   * Close a MONAS run and record it in the shape the shared validator expects.
   *
   * The mapping is not cosmetic - each field has to mean the same thing it means
   * for HEX or the server's consistency checks reject an honest run. MONAS's
   * portal opens on a full meter rather than being offered and declined, so
   * `gateBanks` is genuinely zero and `gateOffers` equals the entries; claiming
   * offers that never happened would fail `entries + banks > offers` the moment
   * the numbers were anything else.
   */
  function finishMonasRun(gameInstance, reason) {
    const state = gameInstance?.monasState;
    if (!state || state.endedAt) return null;

    const entered = whole(state.portalsEntered, 0);
    const survived = Math.min(entered, whole(state.portalsSurvived, 0));
    const endedAt = new Date().toISOString();
    state.endedAt = endedAt;

    const summary = {
      rite: 'MONAS',
      runId: state.runId || `monas_${Date.now().toString(36)}`,
      startedAt: state.startedAt || endedAt,
      endedAt,
      endReason: reason,
      finalScore: Number(gameInstance.score || 0),
      gatesCleared: whole(state.gatesPassed, 0),
      bandIndex: whole(state.progressionBandIndex, 0),
      gnosis: Math.max(0, finite(state.gnosis, 0)),
      gnosisCapacity: Math.max(0, finite(state.gnosisCapacity, 0)),
      gateOffers: entered,
      gateEntries: entered,
      gateBanks: 0,
      voidAttempts: entered,
      voidSurvivals: survived,
      voidDeaths: Math.max(0, entered - survived),
      coherence: Math.max(0, finite(state.coherence, 0)),
      surges: whole(state.surges, 0)
    };

    monasHistory.unshift(summary);
    monasHistory = monasHistory.slice(0, MONAS_HISTORY_LIMIT);
    return summary;
  }

  function getMonasHistory() {
    return monasHistory.map(entry => ({ ...entry }));
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
      // Nothing needs telling that this changed: `monas-progression-runtime.js`
      // re-applies the ladder on every frame and reads this capture when it does,
      // so a posture change is picked up by the next frame without a notification
      // that could be missed. An earlier M43 draft used an explicit resync hook
      // here and it went stale exactly where it mattered - on a run that started
      // before the canvas had settled into portrait.
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
        resetCaduceus(this);
        resetPortal(this);
        // Seeded to the opening band rather than left undefined, so a fresh run
        // does not announce band 0 as if it had just been reached.
        this.__monasLastBandIndex = whole(this.monasState?.progressionBandIndex, 0);
        beginMonasRun(this);
        renderHud(this);
      } else {
        this.monasState = null;
        // Clear the section too, and for the same reason the meter is re-rendered
        // below: `monasUpdate` returns early once the rite is not MONAS, so a
        // section left open here never ticks down and never closes - it simply
        // sits on the instance through the whole HEX run. The browser suite
        // caught exactly that, which is the second time in this milestone a
        // MONAS teardown has turned out to be one-sided.
        resetCaduceus(this);
        resetPortal(this);
        this.__monasLastBandIndex = null;
        // Also render on the way out. `renderHud` computes `active` as false
        // without a MONAS state and hides the meter, and nothing else will do it:
        // `updateGameObjects` returns early for non-MONAS, so the only other
        // caller never runs again once the rite changes. Without this line the
        // coherence meter stayed on screen through an entire HEX run, pinned over
        // the top of the play field, for anyone who played MONAS first.
        renderHud(this);
      }
      return result;
    };

    // The meter hides only through `renderHud`, and `updateGameObjects` - its only
    // other caller - returns early once the rite is not MONAS. So every exit from a
    // MONAS run has to say so explicitly, or the meter outlives the run it belongs
    // to. `startGame` covers switching rites; this covers going back to the menu.
    const originalReturnToMenu = Game.prototype.returnToMenu;
    if (typeof originalReturnToMenu === 'function') {
      Game.prototype.returnToMenu = function monasReturnToMenu(...args) {
        // Close the run *before* delegating: `returnToMenu` clears the state this
        // reads, and the global board submits from the menu render that follows.
        if (isMonas(this)) finishMonasRun(this, 'menu');
        // Every exit from a run has to take the portal down with it. The section
        // holds a container class and a corridor override, and a run that ended
        // inside one would leave the menu - and then the next run - wearing a
        // darkened field and a narrowed gap it never entered. This is the third
        // one-sided MONAS teardown found in as many milestones, so all three exits
        // are covered explicitly rather than by whichever one was noticed.
        resetPortal(this);
        const result = originalReturnToMenu.apply(this, args);
        renderHud(this);
        return result;
      };
    }

    // Every way a MONAS run can end has to record it, for the same reason
    // `finishRun` is called from three places in the Gate slice: a run that ends
    // by dying is the common case, and one that ends by retrying still happened.
    const originalGameOverForMonas = Game.prototype.gameOver;
    if (typeof originalGameOverForMonas === 'function') {
      Game.prototype.gameOver = function monasGameOver(...args) {
        if (isMonas(this)) {
          finishMonasRun(this, 'death');
          // Dying inside the portal forfeits the stake, which is what a wager
          // means. `settleUndertow` is never reached, so the banked Gnosis simply
          // stays spent.
          resetPortal(this);
        }
        return originalGameOverForMonas.apply(this, args);
      };
    }

    const originalRestartForMonas = Game.prototype.restartGame;
    if (typeof originalRestartForMonas === 'function') {
      Game.prototype.restartGame = function monasRestart(...args) {
        if (isMonas(this)) finishMonasRun(this, 'retry');
        const result = originalRestartForMonas.apply(this, args);
        if (isMonas(this)) {
          resetPortal(this);
          this.__monasLastBandIndex = whole(this.monasState?.progressionBandIndex, 0);
          beginMonasRun(this);
        }
        return result;
      };
    }

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
      const reversedThisFrame = previousVy !== 0
        && Math.sign(currentVy) !== Math.sign(previousVy)
        && currentVy !== 0;
      if (reversedThisFrame) {
        this.__monasReversals = finite(this.__monasReversals, 0) + 1;
      }
      this.__monasPreviousVy = currentVy;

      // The Caduceus runs *around* the delegated update, because the nodes are
      // caught inside it: `pentagrams` entries are marked `collected` and then
      // spliced, so the only way to see a catch is to hold the array by reference
      // across the call and read the flags afterwards. Same technique the Gate
      // slice uses for its own corridor, and for the same reason.
      maybeOpenCaduceus(this);
      // Offer, then advance the offer. Entry happens inside `updatePortalOffer`, so
      // the section's first frame is the frame the ring was touched - a one-frame
      // gap here would show the corridor at ordinary speed inside a portal that
      // had already been entered.
      maybeOfferPortal(this);
      updatePortalOffer(this);
      const caduceus = this.__monasCaduceus;
      const nodesBefore = caduceus && this.pentagrams?.length ? [...this.pentagrams] : null;
      if (caduceus) spawnCaduceusNodes(this);

      // Pillars stop for the section. `PILLAR_SPAWN_BASE` is pushed out of reach
      // rather than `voidMode` being borrowed as HEX's corridor does, because
      // `voidMode` also arms the Void vignette and the warp starfield - MONAS
      // already learned that lesson once, in the surge (see the note above), and
      // the nodes here are spawned by this module rather than by the original's
      // `if (this.voidMode)` arm, so the flag buys nothing.
      const previousSpawnBase = caduceus && typeof CONFIG !== 'undefined'
        ? CONFIG.PILLAR_SPAWN_BASE : null;
      if (caduceus && typeof CONFIG !== 'undefined') {
        CONFIG.PILLAR_SPAWN_BASE = Number.MAX_SAFE_INTEGER;
      }

      // M43: this frame does *not* assign `gameSpeed`, and that absence is the fix.
      //
      // It used to, from `monasSpeedForGatesPassed` - a flat
      // `base + floor(gates / 5) * 0.035` ramp. `applyProgression` in
      // `monas-progression-runtime.js` assigns the six-band ladder D-053 designed,
      // but only on the frames a gate is crossed, and it runs *inside* this wrap.
      // So the band value survived part of one frame and this line overwrote it on
      // the next: MONAS ran 2.61 rising to 3.17 across the whole ladder where D-058
      // specifies 2.61 to 4.41, climbing 0.007 per gate for ever.
      //
      // That is the exact shortfall D-057 measured and D-058 was written to remove.
      // D-058's fix went into `applyProgression` and never took effect, because the
      // clobber was one call-frame further out. It survived a green suite because
      // `browser-m32-monas-progression-test.mjs` stops the game loop before calling
      // `forceGatesForTest`, so it asserted what `applyProgression` writes without
      // ever letting a frame run. That suite now runs frames and asserts afterwards.
      //
      // D-053 already says gate count is the sole MONAS progression clock;
      // `applyProgression` is therefore the sole writer of `gameSpeed`, and
      // `monasSpeedForGatesPassed` survives as an exported pure function for the
      // unit tests that cover it rather than as a live input.

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
      // Read from `gameSpeed` rather than from a locally recomputed value, so the
      // bracket multiplies whatever the ladder last decided and restores exactly
      // that. This is what keeps `applyProgression` the only writer.
      const surgeSpeed = this.monasState.surgeActive ? SURGE_SPEED_MULTIPLIER : 1;
      const baseSpeed = finite(this.gameSpeed, 0);
      if (surgeSpeed !== 1) this.gameSpeed = baseSpeed * surgeSpeed;
      // The portal brackets on top of the surge bracket, but the two can never
      // both be live: `openPortal` clears `surgeActive` for the duration.
      const portalBase = portalSpeedBracket(this);

      const result = originalUpdateGameObjects.apply(this, args);

      if (portalBase !== null) this.gameSpeed = portalBase;
      if (surgeSpeed !== 1) this.gameSpeed = baseSpeed;

      // Borrowed wholesale from the Gate slice, which is safe because it is
      // entirely state-free: it reads the player and the pillars and records, per
      // pillar, the player's height at the frame of closest horizontal approach.
      // M16.3 established why that matters and it is no less true here - at MONAS
      // fall speeds, reading `player.y` once the pillar is already marked samples
      // the player well below where they actually threaded the gap, which would
      // misattribute the risk zone of every single clear.
      try { gateSliceApi()?.samplePillarApproaches?.(this); } catch (_error) {}

      for (const record of before) {
        if (!record.marked && record.pillar.marked) {
          const gap = finite(record.pillar.gap, 200);
          const centre = finite(record.pillar.top, 0) + (gap / 2);
          bankMonasEdge(this, record.pillar);
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

      if (previousSpawnBase !== null && typeof CONFIG !== 'undefined') {
        CONFIG.PILLAR_SPAWN_BASE = previousSpawnBase;
      }
      if (caduceus) settleCaduceusFrame(this, caduceus, nodesBefore, reversedThisFrame);
      tickPortal(this, reversedThisFrame);

      // After the inner update, so the gate that was cleared this frame has already
      // moved the band through `applyProgression`.
      announceBandChange(this);

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
        // Behind the pillars, like the Gate's summoning ring - the player flies
        // *into* it, so it must not be painted over the walls they are dodging.
        drawPortalOffer(this.ctx, this);
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
      /**
       * Finished MONAS runs, newest first - the same contract the Gate slice's
       * `getHistory()` offers, so `global-board-runtime.js` can read both rites
       * through one shape rather than special-casing either.
       */
      getHistory() {
        return getMonasHistory();
      },
      /** Test seam: end the current run without going through a death. */
      finishRunForTest(reason = 'test') {
        return typeof game !== 'undefined' && game ? finishMonasRun(game, reason) : null;
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
    // M43: read by occult-field-runtime.js so the risk-zone boundaries it draws are
    // the ones `classifyGateClear` actually scores against, rather than a second
    // copy of the same numbers that could drift away from them.
    MONAS_PLAYER_HALF, MONAS_RISK_FROM_BAND, MONAS_NEAR_MISS_PX,
    // M43: the portal's difficulty claim. Exported because a ceiling is worth
    // asserting directly against the function that enforces it, rather than
    // inferring it from a frame - and because the progression contract test needs
    // to check every live band still escalates when a portal opens on it.
    PORTAL_SPEED_MULTIPLIER, PORTAL_GAP_REDUCTION,
    MONAS_MAX_VERIFIED_SPEED, MONAS_MIN_VERIFIED_GAP,
    portalSpeedFor, portalGapFor,
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
