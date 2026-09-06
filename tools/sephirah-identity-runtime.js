(function attachSexMagickSephirahIdentity(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickSephirahIdentity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSephirahIdentityApi(root) {
  'use strict';

  const VERSION = 1;
  const DEFAULT_BAND = 'MALKUTH';
  const BASE_SCANLINE_OPACITY = 0.4;

  /**
   * M35 does not create eight new mechanics. It gives the eight existing HEX
   * bands eight distinct sensory identities while leaving the verified Gate,
   * collision and progression envelope untouched.
   *
   * Visual values only retune already-existing DOM overlays and the 25 ambient
   * particles the base game already owns. Audio values drive a very low-level
   * procedural undertone beneath the user's existing playlist. No sample fetch,
   * analyser, FFT or per-frame oscillator construction is used.
   */
  const PROFILES = Object.freeze({
    MALKUTH: Object.freeze({
      name: 'MALKUTH', meaning: 'KINGDOM', temperament: 'material / dense / grounded',
      visual: Object.freeze({
        particleSpeed: 0.62, particleOpacity: 1.15, particleSize: 1.15,
        particleColors: Object.freeze(['#8a6747', '#b08a62', '#66503a']),
        particleShapes: Object.freeze([2, 0, 2, 1]),
        scanlineOpacity: 0.52, scanlinePx: 4, vignetteOpacity: 0.86
      }),
      audio: Object.freeze({
        rootHz: 55.00, ratios: Object.freeze([1, 1.5, 2]),
        waveforms: Object.freeze(['triangle', 'sine', 'sine']),
        cutoffHz: 520, pulseHz: 0.42, gain: 0.014,
        transitionRatios: Object.freeze([1, 1.25, 1.5])
      })
    }),
    YESOD: Object.freeze({
      name: 'YESOD', meaning: 'FOUNDATION', temperament: 'lunar / reflective / tidal',
      visual: Object.freeze({
        particleSpeed: 0.48, particleOpacity: 0.82, particleSize: 0.92,
        particleColors: Object.freeze(['#8292c9', '#a8b4df', '#53618f']),
        particleShapes: Object.freeze([1, 1, 2, 1]),
        scanlineOpacity: 0.28, scanlinePx: 5, vignetteOpacity: 0.68
      }),
      audio: Object.freeze({
        rootHz: 61.74, ratios: Object.freeze([1, 1.498, 2.004]),
        waveforms: Object.freeze(['sine', 'sine', 'triangle']),
        cutoffHz: 780, pulseHz: 0.31, gain: 0.013,
        transitionRatios: Object.freeze([1, 1.333, 2])
      })
    }),
    TIPHARETH: Object.freeze({
      name: 'TIPHARETH', meaning: 'BEAUTY', temperament: 'solar / balanced / radiant',
      visual: Object.freeze({
        particleSpeed: 0.82, particleOpacity: 1.08, particleSize: 1.0,
        particleColors: Object.freeze(['#e0b45c', '#ffd98a', '#9d7423']),
        particleShapes: Object.freeze([1, 0, 1, 0]),
        scanlineOpacity: 0.16, scanlinePx: 6, vignetteOpacity: 0.44
      }),
      audio: Object.freeze({
        rootHz: 65.41, ratios: Object.freeze([1, 1.25, 1.5]),
        waveforms: Object.freeze(['sine', 'triangle', 'sine']),
        cutoffHz: 1180, pulseHz: 0.50, gain: 0.015,
        transitionRatios: Object.freeze([1, 1.25, 1.5, 2])
      })
    }),
    GEBURAH: Object.freeze({
      name: 'GEBURAH', meaning: 'SEVERITY', temperament: 'martial / cut / pressure',
      visual: Object.freeze({
        particleSpeed: 1.32, particleOpacity: 1.18, particleSize: 0.86,
        particleColors: Object.freeze(['#d9707a', '#a93845', '#6b1721']),
        particleShapes: Object.freeze([0, 2, 0, 2]),
        scanlineOpacity: 0.58, scanlinePx: 3, vignetteOpacity: 0.91
      }),
      audio: Object.freeze({
        rootHz: 73.42, ratios: Object.freeze([1, 1.189, 1.5]),
        waveforms: Object.freeze(['sawtooth', 'triangle', 'sine']),
        cutoffHz: 920, pulseHz: 0.92, gain: 0.012,
        transitionRatios: Object.freeze([1, 1.189, 1.498])
      })
    }),
    CHESED: Object.freeze({
      name: 'CHESED', meaning: 'MERCY', temperament: 'expansive / spacious / benefic',
      visual: Object.freeze({
        particleSpeed: 0.68, particleOpacity: 0.72, particleSize: 1.28,
        particleColors: Object.freeze(['#63c2d4', '#7fd7e5', '#2f8797']),
        particleShapes: Object.freeze([1, 1, 0, 1]),
        scanlineOpacity: 0.18, scanlinePx: 6, vignetteOpacity: 0.38
      }),
      audio: Object.freeze({
        rootHz: 49.00, ratios: Object.freeze([1, 1.5, 2.25]),
        waveforms: Object.freeze(['sine', 'sine', 'triangle']),
        cutoffHz: 1420, pulseHz: 0.38, gain: 0.015,
        transitionRatios: Object.freeze([1, 1.5, 2])
      })
    }),
    BINAH: Object.freeze({
      name: 'BINAH', meaning: 'UNDERSTANDING', temperament: 'saturnine / formative / grave',
      visual: Object.freeze({
        particleSpeed: 0.40, particleOpacity: 0.68, particleSize: 1.05,
        particleColors: Object.freeze(['#a385d6', '#665082', '#3a2b50']),
        particleShapes: Object.freeze([2, 2, 1, 2]),
        scanlineOpacity: 0.38, scanlinePx: 5, vignetteOpacity: 0.96
      }),
      audio: Object.freeze({
        rootHz: 46.25, ratios: Object.freeze([1, 1.414, 2]),
        waveforms: Object.freeze(['triangle', 'sine', 'sine']),
        cutoffHz: 430, pulseHz: 0.24, gain: 0.013,
        transitionRatios: Object.freeze([1, 1.414, 2])
      })
    }),
    CHOKMAH: Object.freeze({
      name: 'CHOKMAH', meaning: 'WISDOM', temperament: 'electric / kinetic / overflowing',
      visual: Object.freeze({
        particleSpeed: 1.55, particleOpacity: 0.90, particleSize: 0.74,
        particleColors: Object.freeze(['#7fb6c4', '#a4dce8', '#417785']),
        particleShapes: Object.freeze([0, 1, 0, 1, 2]),
        scanlineOpacity: 0.42, scanlinePx: 3, vignetteOpacity: 0.58
      }),
      audio: Object.freeze({
        rootHz: 82.41, ratios: Object.freeze([1, 1.333, 1.778]),
        waveforms: Object.freeze(['triangle', 'sine', 'triangle']),
        cutoffHz: 1860, pulseHz: 1.18, gain: 0.012,
        transitionRatios: Object.freeze([1, 1.333, 1.778, 2.667])
      })
    }),
    KETHER: Object.freeze({
      name: 'KETHER', meaning: 'CROWN', temperament: 'lucid / sparse / transcendent',
      visual: Object.freeze({
        particleSpeed: 0.24, particleOpacity: 0.24, particleSize: 0.64,
        particleColors: Object.freeze(['#e8dcbd', '#fff8df', '#bcb49d']),
        particleShapes: Object.freeze([1, 1, 1, 2]),
        scanlineOpacity: 0.07, scanlinePx: 8, vignetteOpacity: 0.26
      }),
      audio: Object.freeze({
        rootHz: 110.00, ratios: Object.freeze([1, 2, 3]),
        waveforms: Object.freeze(['sine', 'sine', 'sine']),
        cutoffHz: 2600, pulseHz: 0.14, gain: 0.008,
        transitionRatios: Object.freeze([1, 2, 4])
      })
    })
  });

  const BAND_ORDER = Object.freeze(Object.keys(PROFILES));

  let activeBand = null;
  let activeVoid = false;
  let activeMusic = null;
  let activeSfx = null;
  let graph = null;
  let particleBaseline = null;
  let overlayBaseline = null;

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, finite(value, minimum)));
  }

  function profileFor(name) {
    const key = String(name || '').trim().toUpperCase();
    return PROFILES[key] || PROFILES[DEFAULT_BAND];
  }

  function visualProfileFor(name) {
    return profileFor(name).visual;
  }

  function audioPlanFor(name) {
    const profile = profileFor(name);
    const audio = profile.audio;
    return Object.freeze({
      band: profile.name,
      rootHz: audio.rootHz,
      frequencies: Object.freeze(audio.ratios.map(ratio => Number((audio.rootHz * ratio).toFixed(3)))),
      waveforms: audio.waveforms,
      cutoffHz: audio.cutoffHz,
      pulseHz: audio.pulseHz,
      gain: audio.gain,
      transitionFrequencies: Object.freeze(audio.transitionRatios.map(ratio => Number((audio.rootHz * ratio * 4).toFixed(3))))
    });
  }

  function validateProfiles(bands = []) {
    const errors = [];
    const expected = Array.isArray(bands) && bands.length
      ? bands.map(band => String(band?.name || '').toUpperCase())
      : BAND_ORDER;
    if (expected.join('|') !== BAND_ORDER.join('|')) {
      errors.push(`band order mismatch: ${expected.join(',')} != ${BAND_ORDER.join(',')}`);
    }

    const visualSignatures = new Set();
    const audioRoots = new Set();
    for (const name of BAND_ORDER) {
      const profile = PROFILES[name];
      if (!profile) {
        errors.push(`missing ${name}`);
        continue;
      }
      const visual = profile.visual;
      const audio = profile.audio;
      for (const key of ['particleSpeed', 'particleOpacity', 'particleSize', 'scanlineOpacity', 'vignetteOpacity']) {
        if (!Number.isFinite(visual[key]) || visual[key] < 0) errors.push(`${name}.${key} invalid`);
      }
      if (!Array.isArray(visual.particleColors) || visual.particleColors.length < 2) errors.push(`${name}.particleColors sparse`);
      if (!Array.isArray(visual.particleShapes) || visual.particleShapes.length < 2) errors.push(`${name}.particleShapes sparse`);
      if (!Number.isFinite(audio.rootHz) || audio.rootHz < 30 || audio.rootHz > 220) errors.push(`${name}.rootHz invalid`);
      if (!Array.isArray(audio.ratios) || audio.ratios.length !== 3) errors.push(`${name}.ratios invalid`);
      if (!Number.isFinite(audio.cutoffHz) || audio.cutoffHz < 200 || audio.cutoffHz > 4000) errors.push(`${name}.cutoff invalid`);
      visualSignatures.add([
        visual.particleSpeed, visual.particleOpacity, visual.particleSize,
        visual.scanlineOpacity, visual.vignetteOpacity
      ].join(':'));
      audioRoots.add(audio.rootHz);
    }
    if (visualSignatures.size !== BAND_ORDER.length) errors.push('visual profiles are not all distinct');
    if (audioRoots.size !== BAND_ORDER.length) errors.push('audio roots are not all distinct');
    return errors;
  }

  function bandNameFor(gameInstance) {
    const state = gameInstance?.gateSliceState;
    const bands = root.SexMagickGateSlice?.BANDS || [];
    const index = Math.max(0, Math.min(
      Math.max(0, bands.length - 1),
      Math.floor(finite(state?.bandIndex, 0))
    ));
    return String(bands[index]?.name || DEFAULT_BAND).toUpperCase();
  }

  function captureParticleBaseline(gameInstance) {
    const particles = Array.isArray(gameInstance?.backgroundParticles) ? gameInstance.backgroundParticles : [];
    if (particleBaseline && particleBaseline.length === particles.length) return;
    particleBaseline = particles.map(particle => ({
      speed: finite(particle?.speed, 0.25),
      opacity: finite(particle?.opacity, 0.25),
      size: finite(particle?.size, 2.5),
      color: particle?.color,
      shape: particle?.shape
    }));
  }

  function captureOverlayBaseline() {
    if (typeof document === 'undefined' || overlayBaseline) return;
    const scanlines = document.querySelector('.scanlines');
    const vignette = document.querySelector('.vignette');
    overlayBaseline = {
      scanlineOpacity: scanlines?.style.opacity || '',
      scanlineBackgroundSize: scanlines?.style.backgroundSize || '',
      vignetteOpacity: vignette?.style.opacity || ''
    };
  }

  function applyWorldProfile(gameInstance, profile) {
    if (!gameInstance || !profile) return null;
    captureParticleBaseline(gameInstance);
    captureOverlayBaseline();

    const visual = profile.visual;
    const particles = Array.isArray(gameInstance.backgroundParticles) ? gameInstance.backgroundParticles : [];
    particles.forEach((particle, index) => {
      const base = particleBaseline?.[index] || {};
      particle.speed = Math.max(0.01, finite(base.speed, particle.speed) * visual.particleSpeed);
      particle.opacity = clamp(finite(base.opacity, particle.opacity) * visual.particleOpacity, 0.03, 0.82);
      particle.size = clamp(finite(base.size, particle.size) * visual.particleSize, 0.8, 8);
      particle.color = visual.particleColors[index % visual.particleColors.length];
      particle.shape = visual.particleShapes[index % visual.particleShapes.length];
    });

    if (typeof document !== 'undefined') {
      const scanlines = document.querySelector('.scanlines');
      const vignette = document.querySelector('.vignette');
      if (scanlines) {
        scanlines.style.opacity = String(visual.scanlineOpacity);
        scanlines.style.backgroundSize = `100% ${Math.max(2, Math.round(visual.scanlinePx))}px`;
      }
      if (vignette) vignette.style.opacity = String(visual.vignetteOpacity);
      document.documentElement.dataset.sephirah = profile.name;
      document.documentElement.style.setProperty('--sm-sephirah-temperament', `'${profile.temperament}'`);
    }

    return Object.freeze({ band: profile.name, visual });
  }

  function restoreWorld(gameInstance) {
    const particles = Array.isArray(gameInstance?.backgroundParticles) ? gameInstance.backgroundParticles : [];
    if (particleBaseline && particleBaseline.length === particles.length) {
      particles.forEach((particle, index) => Object.assign(particle, particleBaseline[index]));
    }
    if (typeof document !== 'undefined') {
      const scanlines = document.querySelector('.scanlines');
      const vignette = document.querySelector('.vignette');
      if (scanlines) {
        scanlines.style.opacity = overlayBaseline?.scanlineOpacity || '';
        scanlines.style.backgroundSize = overlayBaseline?.scanlineBackgroundSize || '';
      }
      if (vignette) vignette.style.opacity = overlayBaseline?.vignetteOpacity || '';
      delete document.documentElement.dataset.sephirah;
      document.documentElement.style.removeProperty('--sm-sephirah-temperament');
    }
  }

  function audioConstructor() {
    return root.AudioContext || root.webkitAudioContext || null;
  }

  function audioEnabled(gameInstance) {
    return Boolean(gameInstance?.settings?.music || gameInstance?.settings?.sfx);
  }

  function ensureAudioGraph(gameInstance) {
    if (graph || !audioEnabled(gameInstance)) return graph;
    const AudioContextCtor = audioConstructor();
    if (!AudioContextCtor) return null;

    try {
      const context = new AudioContextCtor();
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.7;

      const ambient = context.createGain();
      ambient.gain.value = 0.0001;
      const musicGate = context.createGain();
      musicGate.gain.value = gameInstance?.settings?.music ? 1 : 0;
      const fxGain = context.createGain();
      fxGain.gain.value = gameInstance?.settings?.sfx ? 1 : 0;

      filter.connect(ambient);
      ambient.connect(musicGate);
      musicGate.connect(context.destination);
      fxGain.connect(context.destination);

      const voices = [0, 1, 2].map(() => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        gain.gain.value = 0.28;
        oscillator.connect(gain);
        gain.connect(filter);
        oscillator.start();
        return { oscillator, gain };
      });

      const lfo = context.createOscillator();
      const lfoDepth = context.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.4;
      lfoDepth.gain.value = 0.002;
      lfo.connect(lfoDepth);
      lfoDepth.connect(ambient.gain);
      lfo.start();

      graph = { context, filter, ambient, musicGate, fxGain, voices, lfo, lfoDepth };
      if (context.state === 'suspended') context.resume().catch(() => {});
      return graph;
    } catch (_error) {
      graph = null;
      return null;
    }
  }

  function cancelAndSet(param, value, when, rampSeconds = 0.7, exponential = false) {
    if (!param) return;
    const safeValue = exponential ? Math.max(0.0001, value) : value;
    try {
      param.cancelScheduledValues(when);
      const current = Math.max(0.0001, finite(param.value, safeValue));
      param.setValueAtTime(current, when);
      if (rampSeconds <= 0) param.setValueAtTime(safeValue, when);
      else if (exponential) param.exponentialRampToValueAtTime(safeValue, when + rampSeconds);
      else param.linearRampToValueAtTime(safeValue, when + rampSeconds);
    } catch (_error) {
      try { param.value = safeValue; } catch (_ignored) {}
    }
  }

  function applyAudioProfile(gameInstance, profile, options = {}) {
    const audioGraph = ensureAudioGraph(gameInstance);
    if (!audioGraph) return null;
    const plan = audioPlanFor(profile.name);
    const now = audioGraph.context.currentTime;
    const ramp = options.immediate ? 0.05 : 0.8;

    audioGraph.voices.forEach((voice, index) => {
      voice.oscillator.type = plan.waveforms[index] || 'sine';
      cancelAndSet(voice.oscillator.frequency, plan.frequencies[index], now, ramp, true);
    });
    cancelAndSet(audioGraph.filter.frequency, plan.cutoffHz, now, ramp, true);
    cancelAndSet(audioGraph.ambient.gain, Math.max(0.0001, plan.gain), now, ramp, true);
    cancelAndSet(audioGraph.lfo.frequency, plan.pulseHz, now, ramp, true);
    cancelAndSet(audioGraph.lfoDepth.gain, Math.max(0.0001, plan.gain * 0.22), now, ramp, true);
    cancelAndSet(audioGraph.musicGate.gain, gameInstance?.settings?.music ? (options.voidActive ? 0.20 : 1) : 0, now, 0.18);
    cancelAndSet(audioGraph.fxGain.gain, gameInstance?.settings?.sfx ? 1 : 0, now, 0.08);

    return plan;
  }

  function playTransitionMotif(gameInstance, profile) {
    if (!gameInstance?.settings?.sfx) return false;
    const audioGraph = ensureAudioGraph(gameInstance);
    if (!audioGraph) return false;
    const plan = audioPlanFor(profile.name);
    const now = audioGraph.context.currentTime;

    plan.transitionFrequencies.slice(0, 4).forEach((frequency, index) => {
      try {
        const oscillator = audioGraph.context.createOscillator();
        const gain = audioGraph.context.createGain();
        const start = now + index * 0.075;
        const stop = start + 0.58;
        oscillator.type = profile.audio.waveforms[index % profile.audio.waveforms.length] || 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.032, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, stop);
        oscillator.connect(gain);
        gain.connect(audioGraph.fxGain);
        oscillator.start(start);
        oscillator.stop(stop + 0.02);
      } catch (_error) {}
    });
    return true;
  }

  function setVoidState(gameInstance, voidActive, profile) {
    const audioGraph = graph;
    if (!audioGraph) return;
    const now = audioGraph.context.currentTime;
    if (voidActive) {
      cancelAndSet(audioGraph.musicGate.gain, gameInstance?.settings?.music ? 0.20 : 0, now, 0.14);
      cancelAndSet(audioGraph.filter.frequency, Math.min(320, profile.audio.cutoffHz), now, 0.20, true);
      cancelAndSet(audioGraph.lfo.frequency, Math.max(0.08, profile.audio.pulseHz * 0.5), now, 0.20, true);
    } else {
      applyAudioProfile(gameInstance, profile);
    }
  }

  function silenceAudio() {
    if (!graph) return;
    const now = graph.context.currentTime;
    cancelAndSet(graph.musicGate.gain, 0, now, 0.18);
  }

  function sync(gameInstance, options = {}) {
    const active = Boolean(gameInstance?.gateSliceState && gameInstance?.gameMode === 'HEX');
    if (!active) {
      if (activeBand !== null) restoreWorld(gameInstance);
      activeBand = null;
      activeVoid = false;
      silenceAudio();
      return Object.freeze({ active: false, band: null, audio: null });
    }

    const bandName = bandNameFor(gameInstance);
    const profile = profileFor(bandName);
    const voidActive = Boolean(gameInstance?.voidMode || gameInstance?.__gateSliceVoidActive);
    const musicEnabled = Boolean(gameInstance?.settings?.music);
    const sfxEnabled = Boolean(gameInstance?.settings?.sfx);
    const bandChanged = bandName !== activeBand;
    const voidChanged = voidActive !== activeVoid;
    const settingsChanged = musicEnabled !== activeMusic || sfxEnabled !== activeSfx;

    if (bandChanged) {
      applyWorldProfile(gameInstance, profile);
      applyAudioProfile(gameInstance, profile, { immediate: activeBand === null, voidActive });
      if (options.transition === 'band') playTransitionMotif(gameInstance, profile);
      activeBand = bandName;
    } else if (settingsChanged) {
      applyAudioProfile(gameInstance, profile, { voidActive });
    }

    if (voidChanged) setVoidState(gameInstance, voidActive, profile);

    activeVoid = voidActive;
    activeMusic = musicEnabled;
    activeSfx = sfxEnabled;

    return Object.freeze({
      active: true,
      band: bandName,
      profile,
      voidActive,
      audio: audioPlanFor(bandName),
      audioState: graph?.context?.state || 'unavailable'
    });
  }

  function getSnapshot(gameInstance) {
    const active = activeBand !== null;
    return Object.freeze({
      mode: 'm35-living-sephiroth',
      version: VERSION,
      active,
      band: activeBand,
      voidActive: activeVoid,
      profile: activeBand ? profileFor(activeBand) : null,
      audio: activeBand ? audioPlanFor(activeBand) : null,
      audioState: graph?.context?.state || 'unavailable',
      datasetBand: typeof document !== 'undefined' ? document.documentElement.dataset.sephirah || null : null,
      gameMode: gameInstance?.gameMode || null
    });
  }

  root.__SEX_MAGICK_SEPHIRAH_IDENTITY__ = Object.freeze({
    mode: 'm35-living-sephiroth',
    version: VERSION,
    profiles: PROFILES,
    bandOrder: BAND_ORDER,
    profileFor,
    visualProfileFor,
    audioPlanFor,
    validateProfiles,
    applyWorldProfile,
    restoreWorld,
    sync,
    getSnapshot
  });

  return Object.freeze({
    VERSION,
    DEFAULT_BAND,
    BASE_SCANLINE_OPACITY,
    PROFILES,
    BAND_ORDER,
    finite,
    clamp,
    profileFor,
    visualProfileFor,
    audioPlanFor,
    validateProfiles,
    bandNameFor,
    applyWorldProfile,
    restoreWorld,
    sync,
    getSnapshot
  });
});