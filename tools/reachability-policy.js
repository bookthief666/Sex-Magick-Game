(function attachSexMagickReachabilityPolicy(root, factory) {
  'use strict';

  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickReachabilityPolicy = api;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    api.installWhenReady();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createReachabilityPolicyApi(root) {
  'use strict';

  const POLICY_VERSION = 1;
  const VERIFIED_PATTERN_IDS = Object.freeze([
    'hex.axis-hold',
    'hex.gentle-step',
    'hex.staircase',
    'hex.ascending-triad',
    'hex.return-to-axis',
    'hex.square-breath',
    'hex.cross-quadrants',
    'hex.lightning-flash',
    'monas.soft-orbit',
    'monas.still-point',
    'monas.mercurial-wave',
    'monas.lunar-sweep',
    'monas.return-flow',
    'monas.orbit-settle',
    'monas.serpent-current',
    'monas.caduceus-wave'
  ]);

  const PATTERN_VERDICTS = Object.freeze(Object.fromEntries(
    VERIFIED_PATTERN_IDS.map(patternId => [patternId, 'verified'])
  ));

  const FALLBACK_PATTERN_IDS = Object.freeze({
    HEX: 'hex.return-to-axis',
    MONAS: 'monas.still-point'
  });

  const SAFE_PATTERN_OVERRIDES = Object.freeze({
    'monas.mercurial-wave': Object.freeze({ values: Object.freeze([0, -0.072, -0.128, -0.064, 0.032, 0.096, 0.048]) }),
    'monas.lunar-sweep': Object.freeze({ values: Object.freeze([0, -0.063, -0.126, -0.072, 0.018, 0.09, 0.036]) }),
    'monas.return-flow': Object.freeze({ values: Object.freeze([0, 0.08, 0.16, 0.24, 0.32, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]) }),
    'monas.serpent-current': Object.freeze({ values: Object.freeze([0, -0.072, -0.12, -0.048, 0.048, 0.108, 0.036, -0.036, 0]) }),
    'monas.caduceus-wave': Object.freeze({ values: Object.freeze([0, -0.07, -0.126, -0.042, 0.07, 0.112, 0.028, -0.056, 0]) })
  });

  function normalizeRite(value) {
    return value === 'MONAS' ? 'MONAS' : 'HEX';
  }

  function applyPatternOverride(pattern) {
    if (!pattern || typeof pattern !== 'object') return pattern;
    const override = SAFE_PATTERN_OVERRIDES[pattern.id];
    if (!override) return pattern;
    return Object.freeze({
      ...pattern,
      values: override.values
    });
  }

  function resolvePatternCandidate(options = {}) {
    const rite = normalizeRite(options.rite);
    const catalog = Array.isArray(options.catalog) ? options.catalog : [];
    const verdicts = options.verdicts || PATTERN_VERDICTS;
    const selected = options.selected || null;
    const selectedVerdict = selected ? verdicts[selected.id] : null;

    if (selected && selectedVerdict === 'verified') {
      return {
        pattern: selected,
        verdict: selectedVerdict,
        fallbackApplied: false,
        rejectedPatternId: null
      };
    }

    const fallbackId = FALLBACK_PATTERN_IDS[rite];
    const fallback = catalog.find(pattern => pattern.id === fallbackId)
      || catalog.find(pattern => pattern.family === 'recovery')
      || catalog[0]
      || null;

    return {
      pattern: fallback,
      verdict: fallback ? (verdicts[fallback.id] || 'fallback-unclassified') : 'missing',
      fallbackApplied: Boolean(fallback),
      rejectedPatternId: selected?.id || null
    };
  }

  function install(grammarApi = root.SexMagickObstacleGrammar, options = {}) {
    if (!grammarApi?.PatternScheduler || !grammarApi?.PATTERN_LIBRARY || !grammarApi?.materializePattern) {
      return null;
    }

    const prototype = grammarApi.PatternScheduler.prototype;
    if (prototype.__reachabilityPolicyInstalled) return root.__SEX_MAGICK_REACHABILITY_POLICY__;

    const verdicts = Object.freeze({ ...(options.verdicts || PATTERN_VERDICTS) });
    const originalChoosePattern = prototype.choosePattern;
    const originalNext = prototype.next;
    const originalSnapshot = prototype.snapshot;

    prototype.choosePattern = function chooseReachabilityGuardedPattern(...args) {
      const active = originalChoosePattern.apply(this, args);
      const direction = active.variant === 'mirror' ? -1 : 1;
      const catalog = grammarApi.PATTERN_LIBRARY[normalizeRite(this.rite)] || [];
      const selected = catalog.find(pattern => pattern.id === active.baseId) || null;
      const resolution = resolvePatternCandidate({
        rite: this.rite,
        selected,
        catalog,
        verdicts
      });

      if (!resolution.fallbackApplied || !resolution.pattern || resolution.pattern.id === active.baseId) {
        const adjustedPattern = applyPatternOverride(selected);
        if (adjustedPattern !== selected) {
          active.ratios = grammarApi.materializePattern(adjustedPattern, this.lastRatio, direction);
          active.reachabilityAdjusted = true;
          active.reachabilityOriginalLength = selected.values.length;
        }
        active.reachabilityVerdict = resolution.verdict || verdicts[active.baseId] || 'unclassified';
        active.reachabilityFallback = false;
        return active;
      }

      const fallback = resolution.pattern;
      const ratios = grammarApi.materializePattern(fallback, this.lastRatio, 1);
      this.reachabilityFallbackCount = (this.reachabilityFallbackCount || 0) + 1;
      this.lastBasePatternId = fallback.id;
      this.active = {
        id: `${fallback.id}.reachability-fallback`,
        baseId: fallback.id,
        family: fallback.family || 'recovery',
        variant: 'reachability-fallback',
        serial: active.serial,
        ratios,
        stepIndex: 0,
        reachabilityVerdict: verdicts[fallback.id] || 'fallback-unclassified',
        reachabilityFallback: true,
        rejectedPatternId: resolution.rejectedPatternId
      };
      return this.active;
    };

    prototype.next = function nextWithReachabilityEvidence(...args) {
      const result = originalNext.apply(this, args);
      const active = this.active;
      result.reachabilityPolicyVersion = POLICY_VERSION;
      result.reachabilityVerdict = active?.reachabilityVerdict
        || verdicts[result.basePatternId]
        || 'unclassified';
      result.reachabilityFallback = Boolean(active?.reachabilityFallback);
      result.reachabilityAdjusted = Boolean(active?.reachabilityAdjusted);
      result.rejectedPatternId = active?.rejectedPatternId || null;
      return result;
    };

    prototype.snapshot = function snapshotWithReachabilityPolicy(...args) {
      const snapshot = originalSnapshot.apply(this, args);
      snapshot.reachabilityPolicyVersion = POLICY_VERSION;
      snapshot.reachabilityFallbackCount = this.reachabilityFallbackCount || 0;
      snapshot.activeReachabilityVerdict = this.active?.reachabilityVerdict
        || (this.active ? verdicts[this.active.baseId] : null)
        || null;
      snapshot.activeReachabilityFallback = Boolean(this.active?.reachabilityFallback);
      snapshot.activeReachabilityAdjusted = Boolean(this.active?.reachabilityAdjusted);
      return snapshot;
    };

    const ledgerPrototype = grammarApi.PatternRunLedger?.prototype;
    if (ledgerPrototype && !ledgerPrototype.__reachabilityPolicyEvidenceInstalled) {
      const originalBegin = ledgerPrototype.begin;
      const originalRecordSpawn = ledgerPrototype.recordSpawn;

      ledgerPrototype.begin = function beginWithReachabilityPolicyVersion(...args) {
        const result = originalBegin.apply(this, args);
        if (this.current) this.current.reachabilityPolicyVersion = POLICY_VERSION;
        return this.snapshot().current || result;
      };

      ledgerPrototype.recordSpawn = function recordSpawnWithReachabilityEvidence(spec, game) {
        const recorded = originalRecordSpawn.call(this, spec, game);
        if (!recorded || !this.current) return recorded;
        this.current.reachabilityPolicyVersion = POLICY_VERSION;
        const event = this.current.patternEvents[this.current.patternEvents.length - 1];
        if (event) {
          event.reachabilityPolicyVersion = POLICY_VERSION;
          event.reachabilityVerdict = String(spec?.reachabilityVerdict || 'unclassified');
          event.reachabilityAdjusted = Boolean(spec?.reachabilityAdjusted);
          event.reachabilityFallback = Boolean(spec?.reachabilityFallback);
          event.rejectedPatternId = spec?.rejectedPatternId ? String(spec.rejectedPatternId) : null;
        }
        return recorded;
      };

      ledgerPrototype.__reachabilityPolicyEvidenceInstalled = true;
    }

    prototype.__reachabilityPolicyInstalled = true;

    root.__SEX_MAGICK_REACHABILITY_POLICY__ = Object.freeze({
      mode: 'verified-pattern-runtime-guard',
      version: POLICY_VERSION,
      verdicts,
      fallbackPatternIds: FALLBACK_PATTERN_IDS,
      safePatternOverrides: SAFE_PATTERN_OVERRIDES,
      verifiedPatternCount: Object.values(verdicts).filter(value => value === 'verified').length,
      resolvePatternCandidate(options = {}) {
        return resolvePatternCandidate({ ...options, verdicts: options.verdicts || verdicts });
      },
      getSnapshot() {
        const scheduler = typeof game !== 'undefined' ? game?.obstaclePatternScheduler : null;
        return {
          mode: 'verified-pattern-runtime-guard',
          version: POLICY_VERSION,
          verifiedPatternCount: Object.values(verdicts).filter(value => value === 'verified').length,
          fallbackPatternIds: { ...FALLBACK_PATTERN_IDS },
          scheduler: scheduler?.snapshot?.() || null
        };
      }
    });

    console.info('[SEX MAGICK] Reachability policy installed', {
      policyVersion: POLICY_VERSION,
      verifiedPatternCount: root.__SEX_MAGICK_REACHABILITY_POLICY__.verifiedPatternCount,
      fallbackPatternIds: FALLBACK_PATTERN_IDS
    });

    return root.__SEX_MAGICK_REACHABILITY_POLICY__;
  }

  function installWhenReady(options = {}) {
    const timeoutMs = Math.max(100, Number(options.timeoutMs) || 5000);
    const startedAt = Date.now();

    const attempt = () => {
      const installed = install(root.SexMagickObstacleGrammar, options);
      if (installed) return;
      if (Date.now() - startedAt >= timeoutMs) {
        console.error('[SEX MAGICK] Reachability policy could not find obstacle grammar runtime');
        return;
      }
      setTimeout(attempt, 10);
    };

    attempt();
  }

  return Object.freeze({
    POLICY_VERSION,
    VERIFIED_PATTERN_IDS,
    PATTERN_VERDICTS,
    FALLBACK_PATTERN_IDS,
    SAFE_PATTERN_OVERRIDES,
    applyPatternOverride,
    normalizeRite,
    resolvePatternCandidate,
    install,
    installWhenReady
  });
});