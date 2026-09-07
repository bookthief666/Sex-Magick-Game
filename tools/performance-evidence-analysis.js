(function attachSexMagickPerformanceEvidence(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SexMagickPerformanceEvidence = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPerformanceEvidenceApi() {
  'use strict';

  const VERSION = 1;
  const REPORT_MODE = 'local-opt-in-performance-budget-probe';
  const PROTOCOL = 'm12-fold6-performance-v1';
  const PRESETS = Object.freeze({
    'closed-css': Object.freeze({ profile: 'fold-closed', tier: 'css', requestedDpr: 'css', rank: 1 }),
    'closed-2x': Object.freeze({ profile: 'fold-closed', tier: '2x', requestedDpr: '2', rank: 2 }),
    'closed-native': Object.freeze({ profile: 'fold-closed', tier: 'native', requestedDpr: 'native', rank: 3 }),
    'open-css': Object.freeze({ profile: 'fold-open', tier: 'css', requestedDpr: 'css', rank: 1 }),
    'open-2x': Object.freeze({ profile: 'fold-open', tier: '2x', requestedDpr: '2', rank: 2 }),
    'open-native': Object.freeze({ profile: 'fold-open', tier: 'native', requestedDpr: 'native', rank: 3 })
  });
  const DEFAULT_POLICY = Object.freeze({
    protocol: PROTOCOL,
    minSamplesPerRun: 1800,
    minRepeats: 3,
    preferredRepeats: 5,
    requireOfflineAssets: true,
    maxSuspensionGaps: 0,
    maxTransitionFramesIgnored: 5,
    maxFrameP95Ms: 20,
    maxFrameP99Ms: 28,
    maxCriticalFrameRate: 0.005,
    maxDroppedSimulationMsPerMinute: 50,
    maxRepeatP95MadMs: 2.5
  });

  function finiteNumber(value, fallback = null) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function round(value, digits = 3) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function median(values) {
    const clean = Array.from(values || []).map(value => finiteNumber(value)).filter(Number.isFinite).sort((a, b) => a - b);
    if (!clean.length) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }

  function medianAbsoluteDeviation(values) {
    const center = median(values);
    if (!Number.isFinite(center)) return null;
    return median(Array.from(values || []).map(value => Math.abs(finiteNumber(value, center) - center)));
  }

  function canonicalStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
  }

  function fnv1a32(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  function fingerprintReport(report) {
    return fnv1a32(canonicalStringify(report));
  }

  function presetDefinition(name) {
    return PRESETS[String(name || '')] || null;
  }

  function normalizePolicy(policy = {}) {
    const merged = { ...DEFAULT_POLICY, ...policy };
    return Object.freeze({
      protocol: String(merged.protocol || PROTOCOL),
      minSamplesPerRun: Math.max(1, Math.floor(finiteNumber(merged.minSamplesPerRun, DEFAULT_POLICY.minSamplesPerRun))),
      minRepeats: Math.max(1, Math.floor(finiteNumber(merged.minRepeats, DEFAULT_POLICY.minRepeats))),
      preferredRepeats: Math.max(1, Math.floor(finiteNumber(merged.preferredRepeats, DEFAULT_POLICY.preferredRepeats))),
      requireOfflineAssets: Boolean(merged.requireOfflineAssets),
      maxSuspensionGaps: Math.max(0, Math.floor(finiteNumber(merged.maxSuspensionGaps, DEFAULT_POLICY.maxSuspensionGaps))),
      maxTransitionFramesIgnored: Math.max(0, Math.floor(finiteNumber(merged.maxTransitionFramesIgnored, DEFAULT_POLICY.maxTransitionFramesIgnored))),
      maxFrameP95Ms: Math.max(1, finiteNumber(merged.maxFrameP95Ms, DEFAULT_POLICY.maxFrameP95Ms)),
      maxFrameP99Ms: Math.max(1, finiteNumber(merged.maxFrameP99Ms, DEFAULT_POLICY.maxFrameP99Ms)),
      maxCriticalFrameRate: Math.max(0, finiteNumber(merged.maxCriticalFrameRate, DEFAULT_POLICY.maxCriticalFrameRate)),
      maxDroppedSimulationMsPerMinute: Math.max(0, finiteNumber(merged.maxDroppedSimulationMsPerMinute, DEFAULT_POLICY.maxDroppedSimulationMsPerMinute)),
      maxRepeatP95MadMs: Math.max(0, finiteNumber(merged.maxRepeatP95MadMs, DEFAULT_POLICY.maxRepeatP95MadMs))
    });
  }

  function validateReport(report) {
    const errors = [];
    const warnings = [];
    if (!report || typeof report !== 'object' || Array.isArray(report)) errors.push('report-not-object');
    if (report?.mode !== REPORT_MODE) errors.push('unsupported-report-mode');
    if (report?.version !== 1) errors.push('unsupported-report-version');
    if (!Array.isArray(report?.segments) || report.segments.length === 0) errors.push('missing-segments');
    if (!report?.measurement) warnings.push('missing-m12-measurement-provenance');
    if (report?.environment?.visibilityState && report.environment.visibilityState !== 'visible') warnings.push('report-exported-while-hidden');
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), warnings: Object.freeze(warnings) });
  }

  function durationMsForSegment(report, segment) {
    const start = finiteNumber(segment?.startedAtMs);
    const end = finiteNumber(segment?.endedAtMs, finiteNumber(report?.generatedAtMs));
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      const count = finiteNumber(segment?.frameIntervals?.count, 0);
      const p50 = finiteNumber(segment?.frameIntervals?.p50);
      return Number.isFinite(p50) && count > 0 ? count * p50 : null;
    }
    return end - start;
  }

  function buildRun(report, segment, sourceLabel, policy) {
    const measurement = report.measurement || {};
    const preset = String(measurement.preset || '');
    const definition = presetDefinition(preset);
    const context = segment?.context || {};
    const reasons = [];
    const warnings = [];
    const sampleCount = Math.max(0, Math.floor(finiteNumber(segment?.frameIntervals?.count, 0)));
    const durationMs = durationMsForSegment(report, segment);
    const durationMinutes = Number.isFinite(durationMs) && durationMs > 0 ? durationMs / 60_000 : null;
    const droppedSimulationMs = Math.max(0, finiteNumber(segment?.droppedSimulationMs, 0));
    const droppedPerMinute = Number.isFinite(durationMinutes) && durationMinutes > 0
      ? droppedSimulationMs / durationMinutes
      : null;

    if (measurement.protocol !== policy.protocol) reasons.push('protocol-mismatch');
    if (!definition) reasons.push('unknown-preset');
    if (!measurement.sessionId) reasons.push('missing-session-id');
    if (!Number.isInteger(measurement.repeat) || measurement.repeat < 1) reasons.push('missing-repeat-index');
    if (definition && context.profile !== definition.profile) reasons.push('preset-profile-mismatch');
    if (definition && String(measurement.requestedDpr || '') !== definition.requestedDpr) reasons.push('preset-requested-dpr-mismatch');
    if (sampleCount < policy.minSamplesPerRun) reasons.push('too-few-frame-samples');
    if (policy.requireOfflineAssets && context.assetMode !== 'offline') reasons.push('asset-mode-not-offline');
    if (Math.max(0, finiteNumber(segment?.suspensionGaps, 0)) > policy.maxSuspensionGaps) reasons.push('suspension-gap-detected');
    if (Math.max(0, finiteNumber(segment?.contextTransitionFramesIgnored, 0)) > policy.maxTransitionFramesIgnored) reasons.push('excessive-context-transition');
    if (report?.environment?.visibilityState && report.environment.visibilityState !== 'visible') reasons.push('page-not-visible-at-export');
    if (!Number.isFinite(segment?.frameIntervals?.p95) || !Number.isFinite(segment?.frameIntervals?.p99)) reasons.push('missing-frame-percentiles');
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) warnings.push('duration-estimated-or-unavailable');
    if (report.active) warnings.push('report-exported-before-explicit-stop');

    return Object.freeze({
      sourceLabel: String(sourceLabel || 'report'),
      fingerprint: fingerprintReport(report),
      protocol: String(measurement.protocol || ''),
      sessionId: String(measurement.sessionId || ''),
      preset,
      repeat: Number.isInteger(measurement.repeat) ? measurement.repeat : null,
      profile: String(context.profile || 'unknown'),
      tier: definition?.tier || 'unknown',
      rank: definition?.rank || 0,
      requestedDpr: String(measurement.requestedDpr || ''),
      effectiveDpr: finiteNumber(context.effectiveDpr),
      logicalWidth: finiteNumber(context.logicalWidth),
      logicalHeight: finiteNumber(context.logicalHeight),
      backingWidth: finiteNumber(context.backingWidth),
      backingHeight: finiteNumber(context.backingHeight),
      backingPixels: finiteNumber(context.backingPixels),
      assetMode: String(context.assetMode || 'unknown'),
      sampleCount,
      durationMs: round(durationMs),
      durationMinutes: round(durationMinutes, 5),
      frameP50Ms: finiteNumber(segment?.frameIntervals?.p50),
      frameP95Ms: finiteNumber(segment?.frameIntervals?.p95),
      frameP99Ms: finiteNumber(segment?.frameIntervals?.p99),
      drawP95Ms: finiteNumber(segment?.drawDurations?.p95),
      callbackP95Ms: finiteNumber(segment?.callbackDurations?.p95),
      longFrameRate: finiteNumber(segment?.longFrameRate),
      criticalFrameRate: finiteNumber(segment?.criticalFrameRate),
      droppedSimulationMs,
      droppedSimulationMsPerMinute: round(droppedPerMinute),
      suspensionGaps: Math.max(0, finiteNumber(segment?.suspensionGaps, 0)),
      suspensionResets: Math.max(0, finiteNumber(segment?.suspensionResets, 0)),
      longTaskCount: Math.max(0, finiteNumber(segment?.longTasks?.count, 0)),
      longTaskDurationMs: Math.max(0, finiteNumber(segment?.longTasks?.totalDurationMs, 0)),
      eligible: reasons.length === 0,
      exclusionReasons: Object.freeze(reasons),
      warnings: Object.freeze(warnings)
    });
  }

  function metricSummary(runs, selector) {
    const values = runs.map(selector).filter(Number.isFinite);
    return Object.freeze({
      count: values.length,
      median: round(median(values)),
      mad: round(medianAbsoluteDeviation(values)),
      min: values.length ? round(Math.min(...values)) : null,
      max: values.length ? round(Math.max(...values)) : null
    });
  }

  function aggregateGroup(preset, runs, policy) {
    const definition = presetDefinition(preset);
    const eligibleRuns = runs.filter(run => run.eligible);
    const frameP95 = metricSummary(eligibleRuns, run => run.frameP95Ms);
    const frameP99 = metricSummary(eligibleRuns, run => run.frameP99Ms);
    const criticalRate = metricSummary(eligibleRuns, run => run.criticalFrameRate);
    const droppedPerMinute = metricSummary(eligibleRuns, run => run.droppedSimulationMsPerMinute);
    const drawP95 = metricSummary(eligibleRuns, run => run.drawP95Ms);
    const callbackP95 = metricSummary(eligibleRuns, run => run.callbackP95Ms);
    const repeats = new Set(eligibleRuns.map(run => run.repeat));
    const enoughRepeats = repeats.size >= policy.minRepeats;
    const thresholdChecks = Object.freeze({
      enoughRepeats,
      frameP95: Number.isFinite(frameP95.median) && frameP95.median <= policy.maxFrameP95Ms,
      frameP99: Number.isFinite(frameP99.median) && frameP99.median <= policy.maxFrameP99Ms,
      criticalRate: Number.isFinite(criticalRate.median) && criticalRate.median <= policy.maxCriticalFrameRate,
      droppedSimulation: Number.isFinite(droppedPerMinute.median) && droppedPerMinute.median <= policy.maxDroppedSimulationMsPerMinute,
      repeatStability: Number.isFinite(frameP95.mad) && frameP95.mad <= policy.maxRepeatP95MadMs
    });
    const sustainable = Object.values(thresholdChecks).every(Boolean);
    return Object.freeze({
      preset,
      profile: definition?.profile || 'unknown',
      tier: definition?.tier || 'unknown',
      rank: definition?.rank || 0,
      totalReports: runs.length,
      eligibleReports: eligibleRuns.length,
      uniqueRepeats: repeats.size,
      enoughRepeats,
      preferredRepeatDepth: repeats.size >= policy.preferredRepeats,
      effectiveDpr: metricSummary(eligibleRuns, run => run.effectiveDpr),
      sampleCount: metricSummary(eligibleRuns, run => run.sampleCount),
      frameP50: metricSummary(eligibleRuns, run => run.frameP50Ms),
      frameP95,
      frameP99,
      drawP95,
      callbackP95,
      longFrameRate: metricSummary(eligibleRuns, run => run.longFrameRate),
      criticalFrameRate: criticalRate,
      droppedSimulationMsPerMinute: droppedPerMinute,
      thresholdChecks,
      sustainable,
      status: enoughRepeats ? (sustainable ? 'sustainable-candidate' : 'over-provisional-budget') : 'insufficient-repeats'
    });
  }

  function recommendationForProfile(profile, groups, policy) {
    const expected = Object.keys(PRESETS).filter(name => PRESETS[name].profile === profile);
    const relevant = expected.map(name => groups.find(group => group.preset === name) || aggregateGroup(name, [], policy));
    const missing = relevant.filter(group => !group.enoughRepeats).map(group => group.preset);
    if (missing.length) {
      return Object.freeze({
        profile,
        status: 'insufficient-evidence',
        recommendation: null,
        missingPresets: Object.freeze(missing),
        rationale: `Need at least ${policy.minRepeats} eligible repeats for every DPR preset.`
      });
    }
    const sustainable = relevant.filter(group => group.sustainable).sort((a, b) => b.rank - a.rank);
    if (!sustainable.length) {
      return Object.freeze({
        profile,
        status: 'no-sustainable-candidate',
        recommendation: null,
        missingPresets: Object.freeze([]),
        rationale: 'Every tested DPR preset exceeded at least one provisional physical-performance threshold.'
      });
    }
    const selected = sustainable[0];
    return Object.freeze({
      profile,
      status: 'provisional-recommendation',
      recommendation: selected.preset,
      tier: selected.tier,
      effectiveDprMedian: selected.effectiveDpr.median,
      confidence: selected.preferredRepeatDepth ? 'moderate' : 'limited',
      missingPresets: Object.freeze([]),
      rationale: 'Highest-DPR preset that passed all provisional thresholds with complete cross-preset evidence.'
    });
  }

  function analyzeReports(inputs, policyOverrides = {}) {
    const policy = normalizePolicy(policyOverrides);
    const acceptedReports = [];
    const rejectedReports = [];
    const allRuns = [];
    const fingerprints = new Set();
    const measurementKeys = new Set();

    for (const input of Array.from(inputs || [])) {
      const report = input?.report ?? input;
      const sourceLabel = input?.sourceLabel || input?.name || 'report';
      const validation = validateReport(report);
      if (!validation.valid) {
        rejectedReports.push(Object.freeze({ sourceLabel, errors: validation.errors, warnings: validation.warnings }));
        continue;
      }
      const fingerprint = fingerprintReport(report);
      const measurement = report.measurement || {};
      const measurementKey = [measurement.protocol, measurement.sessionId, measurement.preset, measurement.repeat].join('|');
      if (fingerprints.has(fingerprint) || (measurement.sessionId && measurementKeys.has(measurementKey))) {
        rejectedReports.push(Object.freeze({ sourceLabel, errors: Object.freeze(['duplicate-report']), warnings: validation.warnings }));
        continue;
      }
      fingerprints.add(fingerprint);
      if (measurement.sessionId) measurementKeys.add(measurementKey);
      acceptedReports.push(Object.freeze({ sourceLabel, fingerprint, warnings: validation.warnings }));
      for (const segment of report.segments) allRuns.push(buildRun(report, segment, sourceLabel, policy));
    }

    const groups = Object.keys(PRESETS).map(preset => aggregateGroup(
      preset,
      allRuns.filter(run => run.preset === preset),
      policy
    ));
    const recommendations = ['fold-closed', 'fold-open'].map(profile => recommendationForProfile(profile, groups, policy));
    return Object.freeze({
      mode: 'local-physical-performance-evidence-analysis',
      version: VERSION,
      protocol: policy.protocol,
      policy,
      acceptedReports: Object.freeze(acceptedReports),
      rejectedReports: Object.freeze(rejectedReports),
      runs: Object.freeze(allRuns),
      groups: Object.freeze(groups),
      recommendations: Object.freeze(recommendations),
      summary: Object.freeze({
        acceptedReportCount: acceptedReports.length,
        rejectedReportCount: rejectedReports.length,
        runCount: allRuns.length,
        eligibleRunCount: allRuns.filter(run => run.eligible).length,
        excludedRunCount: allRuns.filter(run => !run.eligible).length,
        completeRecommendationCount: recommendations.filter(item => item.status === 'provisional-recommendation').length
      })
    });
  }

  return Object.freeze({
    VERSION,
    REPORT_MODE,
    PROTOCOL,
    PRESETS,
    DEFAULT_POLICY,
    median,
    medianAbsoluteDeviation,
    canonicalStringify,
    fnv1a32,
    fingerprintReport,
    presetDefinition,
    normalizePolicy,
    validateReport,
    buildRun,
    metricSummary,
    aggregateGroup,
    recommendationForProfile,
    analyzeReports
  });
});
