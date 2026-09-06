(function attachSexMagickObstacleVariety(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickObstacleVariety = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') api.scheduleInstall();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createObstacleVarietyApi(root) {
  'use strict';

  const VARIETY_VERSION = 1;

  // The shipped pattern library is proven clearable, every case at margin 8, at
  // speed 8.5 against a static gap of VERIFIED_STATIC_GAP. Everything below
  // exists to keep the moving and rescaled walls inside that proof rather than
  // beside it.
  //
  // 110 is measured, not chosen for roundness. Re-running the audit at tighter
  // gaps drops six cases to marginal at 105 (minimum clearance 4.63 against the
  // required 8), so this is the genuine floor of the verified envelope and also
  // equals CONFIG.MIN_PILLAR_GAP.
  const VERIFIED_STATIC_GAP = 110;

  // A gap of width G whose top oscillates by +/-A always contains the static
  // corridor [top + A, top + G - A], of width G - 2A, at every instant. So if the
  // solver can clear a static corridor of G - 2A, the moving gap is clearable at
  // any amplitude up to A and at any phase - the guarantee is phase-independent,
  // which matters because each pillar now carries its own phase.
  const MOTION_DEFAULT_AMPLITUDE_PX = 5;
  const MOTION_MAX_AMPLITUDE_PX = 26;
  const MOTION_FREQUENCY = 0.05;

  // Gap rescaling gives patterns their own character - some run tight, some run
  // open. Narrowing is clamped against VERIFIED_STATIC_GAP rather than forbidden,
  // so it is freely available in the wide early bands and simply stops being
  // applied once a band's gap has nothing left to give.
  const GAP_SCALE_MIN = 0.88;
  const GAP_SCALE_MAX = 1.18;

  let installed = false;
  let installTimer = null;

  function finiteNumber(value, fallback = 0) {
    const resolved = Number(value);
    return Number.isFinite(resolved) ? resolved : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeGapScale(value) {
    return clamp(finiteNumber(value, 1), GAP_SCALE_MIN, GAP_SCALE_MAX);
  }

  /**
   * The single invariant this module exists to hold: whatever amplitude a pattern
   * asks for, the corridor left after subtracting motion from both sides is never
   * narrower than the gap the solver has verified.
   *
   * Because the bound scales with the gap, motion is dramatic in the wide early
   * bands and settles toward stillness as the gap tightens near KETHER. That
   * falls out of the safety rule rather than being tuned in separately.
   */
  function resolveMotionAmplitude(requestedAmplitude, gap) {
    const requested = Math.max(0, finiteNumber(requestedAmplitude, MOTION_DEFAULT_AMPLITUDE_PX));
    const resolvedGap = Math.max(0, finiteNumber(gap, 0));
    const headroom = (resolvedGap - VERIFIED_STATIC_GAP) / 2;
    if (!(headroom > 0)) return 0;
    return clamp(Math.min(requested, headroom), 0, MOTION_MAX_AMPLITUDE_PX);
  }

  // True when a pillar's motion leaves a corridor the solver has verified. Used
  // by the tests as an executable statement of the invariant.
  function motionRespectsVerifiedCorridor(gap, amplitude) {
    return finiteNumber(gap, 0) - (2 * Math.max(0, finiteNumber(amplitude, 0))) >= VERIFIED_STATIC_GAP - 1e-9;
  }

  /**
   * Vertical offset of a pillar's gap at a given frame.
   *
   * A pillar with no motion fields resolves to amplitude 5, phase 0 and the same
   * frequency the stock game used, so an unannotated pillar - including every
   * pillar the M14 visual-state controller builds by hand - moves exactly as it
   * did before this module existed.
   */
  function pillarVerticalOffset(pillar, frame) {
    const amplitude = finiteNumber(pillar?.motionAmplitude, MOTION_DEFAULT_AMPLITUDE_PX);
    if (amplitude === 0) return 0;
    const phase = finiteNumber(pillar?.motionPhase, 0);
    const frequency = finiteNumber(pillar?.motionFrequency, MOTION_FREQUENCY);
    return Math.sin((finiteNumber(frame, 0) + phase) * frequency) * amplitude;
  }

  /**
   * Resolves the seeded spec fields into concrete pillar geometry.
   *
   * Returns the scaled gap, the top that keeps the gap's centre where the pattern
   * placed it, and the motion amplitude that the scaled gap can safely carry.
   * Rescaling has to move `top` as well - holding `top` fixed while changing `gap`
   * would silently shift the corridor the pattern was solved against.
   */
  function resolvePillarGeometry(options = {}) {
    const baseGap = Math.max(0, finiteNumber(options.gap, 0));
    const baseTop = finiteNumber(options.top, 0);
    const gapScale = normalizeGapScale(options.gapScale);
    const minimumGap = Math.max(0, finiteNumber(options.minimumGap, VERIFIED_STATIC_GAP));

    const scaledGap = Math.max(minimumGap, baseGap * gapScale);
    const centre = baseTop + (baseGap / 2);
    const top = centre - (scaledGap / 2);
    const motionAmplitude = resolveMotionAmplitude(options.motionAmplitude, scaledGap);

    return {
      gap: scaledGap,
      top,
      gapScale,
      motionAmplitude,
      motionPhase: finiteNumber(options.motionPhase, 0),
      motionFrequency: MOTION_FREQUENCY
    };
  }

  function applyPillarGeometry(pillar, geometry) {
    if (!pillar || !geometry) return pillar;
    pillar.gap = geometry.gap;
    pillar.top = geometry.top;
    pillar.baseTop = geometry.top;
    pillar.gapScale = geometry.gapScale;
    pillar.motionAmplitude = geometry.motionAmplitude;
    pillar.motionPhase = geometry.motionPhase;
    pillar.motionFrequency = geometry.motionFrequency;
    return pillar;
  }

  function install() {
    if (installed) return root.__SEX_MAGICK_OBSTACLE_VARIETY__;
    if (typeof Pillar === 'undefined' || typeof game === 'undefined') return null;

    const originalUpdate = Pillar.prototype.update;

    Pillar.prototype.update = function updateWithVariety(speed) {
      this.x -= speed;
      this.pulse += 0.05;
      this.rotation += 0.005;
      if (this.hasWarning) { this.warningAlpha -= 0.01; }
      this.top = this.baseTop + pillarVerticalOffset(this, game.frames);
    };

    installed = true;
    root.__SEX_MAGICK_OBSTACLE_VARIETY__ = Object.freeze({
      version: VARIETY_VERSION,
      verifiedStaticGap: VERIFIED_STATIC_GAP,
      restore() {
        Pillar.prototype.update = originalUpdate;
        installed = false;
      }
    });
    return root.__SEX_MAGICK_OBSTACLE_VARIETY__;
  }

  function scheduleInstall(timeoutMs = 5000) {
    if (installTimer) return;
    const startedAt = Date.now();
    installTimer = setInterval(() => {
      if (install() || Date.now() - startedAt >= timeoutMs) {
        clearInterval(installTimer);
        installTimer = null;
      }
    }, 50);
  }

  return Object.freeze({
    VARIETY_VERSION,
    VERIFIED_STATIC_GAP,
    MOTION_DEFAULT_AMPLITUDE_PX,
    MOTION_MAX_AMPLITUDE_PX,
    MOTION_FREQUENCY,
    GAP_SCALE_MIN,
    GAP_SCALE_MAX,
    normalizeGapScale,
    resolveMotionAmplitude,
    motionRespectsVerifiedCorridor,
    pillarVerticalOffset,
    resolvePillarGeometry,
    applyPillarGeometry,
    install,
    scheduleInstall
  });
});
