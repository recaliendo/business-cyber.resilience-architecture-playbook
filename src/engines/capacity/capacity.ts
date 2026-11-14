// Capacity, storage-runway and cost-range calculator.
//
// Units are explicit in every field name: Rps = requests/second, Ms = milliseconds,
// Gb = gigabytes (GiB, 1024 MB), Usd = US dollars per month unless stated.
// Little's Law: L = lambda * W, with lambda in req/s and W in seconds, gives the mean number of
// requests in flight (required concurrency). MAU is never used as a capacity input.
import type { Finding, LoadTestResult, Stage, WorkloadProfile } from '../../domain/schemas.js';
import { makeFinding } from '../../domain/findings.js';

export const CAPACITY_RULES_VERSION = '1.0.0';
const SECONDS_PER_MONTH = 30 * 24 * 3600;
const DAYS_PER_MONTH = 30;
/** Utilisation above this is reported as a bottleneck (queueing delay grows sharply near 1.0). */
export const TARGET_UTILISATION = 0.7;

export interface Scenario { name: string; multiplier: number }
export const DEFAULT_SCENARIOS: Scenario[] = [
  { name: 'present', multiplier: 1 },
  { name: '10x', multiplier: 10 },
  { name: '100x', multiplier: 100 },
];

export interface ArrivalEstimate { peakRps: number; basis: string; measured: boolean }

export interface ScenarioResult {
  scenario: Scenario;
  peakRps: number;
  burstRps: number;
  avgRps: number;
  computeRps: number;
  weightedDurationMs: number;
  /** Little's Law at burst rate: concurrent requests in flight. */
  requiredComputeConcurrency: number;
  computeUtilisation?: number;
  /** Mean DB connections busy at burst (sum over classes of rate * queries * query time). */
  dbBusyConnections: number;
  dbPoolUtilisation?: number;
  /** Serverless without a pooler can open up to one connection per concurrent instance. */
  worstCaseDbConnectionsWithoutPooler: number;
  bottlenecks: string[];
  evidence: 'demonstrated' | 'projected';
  evidenceNote: string;
  monthlyCostUsd?: { low: number; high: number; lines: Array<{ item: string; usd?: number; note: string }> };
}

export interface StoragePoint { month: number; databaseGb: number; objectGbPhysical: number; backupGb: number; logGb: number }
export interface StorageForecast {
  scenario: Scenario;
  points: StoragePoint[];
  databaseExhaustionMonth?: number;
  objectExhaustionMonth?: number;
  notes: string[];
}

export interface CapacityReport {
  version: string;
  arrival?: ArrivalEstimate;
  scenarios: ScenarioResult[];
  storage: StorageForecast[];
  sensitivity: string[];
  missingMeasurements: string[];
  assumptions: string[];
}

export function estimateArrival(w: WorkloadProfile): ArrivalEstimate | undefined {
  const measured = w.measurements.find((m) => m.metric === 'peak_rps' && m.unit === 'req/s');
  if (measured) return { peakRps: measured.value, basis: `measured peak_rps at ${measured.measuredAt} (${measured.provenance})`, measured: measured.provenance === 'observed' };
  if (w.peakConcurrentActiveUsers !== undefined && w.requestsPerActiveUserPerMinute !== undefined) {
    return {
      peakRps: (w.peakConcurrentActiveUsers * w.requestsPerActiveUserPerMinute) / 60,
      basis: `${w.peakConcurrentActiveUsers} peak active users x ${w.requestsPerActiveUserPerMinute} req/min / 60`,
      measured: false,
    };
  }
  return undefined;
}

/** Highest sustained RPS from a passing load test (error rate <= 1% and p95 within SLO when one is set). */
export function demonstratedRps(tests: LoadTestResult[], sloP95Ms?: number): LoadTestResult | undefined {
  return tests
    .filter((t) => t.environment !== 'local' && t.errorRate <= 0.01 && (sloP95Ms === undefined || t.p95Ms <= sloP95Ms))
    .sort((a, b) => b.sustainedRps - a.sustainedRps)[0];
}

export function computeScenario(w: WorkloadProfile, peakRps: number, scenario: Scenario): ScenarioResult {
  const mix = w.requestMix.length ? w.requestMix : [{ name: 'default', share: 1, avgDurationMs: 200, dbQueriesPerRequest: 2, avgDbQueryMs: 5, cacheHitRatio: 0 }];
  const peak = peakRps * scenario.multiplier;
  const burst = peak * w.burstMultiplier;
  const avg = peak / w.peakToAverageRatio;

  let computeRps = 0;
  let durationWeighted = 0;
  let dbBusy = 0;
  for (const c of mix) {
    const classRps = burst * c.share * (1 - c.cacheHitRatio);
    computeRps += classRps;
    durationWeighted += classRps * c.avgDurationMs;
    dbBusy += classRps * c.dbQueriesPerRequest * (c.avgDbQueryMs / 1000);
  }
  const weightedDurationMs = computeRps > 0 ? durationWeighted / computeRps : 0;
  const requiredComputeConcurrency = computeRps * (weightedDurationMs / 1000); // Little's Law
  const lim = w.limits;
  const bottlenecks: string[] = [];
  const computeUtilisation = lim.computeConcurrency ? requiredComputeConcurrency / lim.computeConcurrency : undefined;
  if (computeUtilisation !== undefined && computeUtilisation > TARGET_UTILISATION) {
    bottlenecks.push(`compute concurrency ${requiredComputeConcurrency.toFixed(1)} of ${lim.computeConcurrency} limit (${pct(computeUtilisation)} > ${pct(TARGET_UTILISATION)} target)`);
  }
  const pool = lim.dbPoolSize ?? lim.dbMaxConnections;
  const dbPoolUtilisation = pool ? dbBusy / pool : undefined;
  if (dbPoolUtilisation !== undefined && dbPoolUtilisation > TARGET_UTILISATION) {
    bottlenecks.push(`database connections ${dbBusy.toFixed(1)} busy of ${pool} (${pct(dbPoolUtilisation)})`);
  }
  const worstCase = Math.ceil(requiredComputeConcurrency);
  if (lim.dbMaxConnections && worstCase > lim.dbMaxConnections) {
    bottlenecks.push(`without a connection pooler, up to ${worstCase} concurrent function instances could each open a connection (> ${lim.dbMaxConnections} max)`);
  }
  if (lim.functionTimeoutMs) {
    const slow = mix.filter((c) => c.avgDurationMs > lim.functionTimeoutMs! * 0.5);
    if (slow.length) bottlenecks.push(`request classes near the ${lim.functionTimeoutMs} ms function timeout: ${slow.map((s) => s.name).join(', ')}`);
  }

  const demo = demonstratedRps(w.loadTests, w.slo.p95LatencyMs);
  const evidence = demo && demo.sustainedRps >= burst ? 'demonstrated' : 'projected';
  const evidenceNote = demo
    ? evidence === 'demonstrated'
      ? `Load test (${demo.scenario}, ${demo.environment}, ${demo.testedAt}) sustained ${demo.sustainedRps} req/s >= ${burst.toFixed(1)} req/s burst.`
      : `Best passing load test sustained ${demo.sustainedRps} req/s, below the ${burst.toFixed(1)} req/s burst for this scenario: projection only.`
    : 'No passing staging/production load test: projection only.';

  return {
    scenario, peakRps: round(peak), burstRps: round(burst), avgRps: round(avg), computeRps: round(computeRps),
    weightedDurationMs: round(weightedDurationMs), requiredComputeConcurrency: round(requiredComputeConcurrency),
    computeUtilisation: computeUtilisation === undefined ? undefined : round(computeUtilisation),
    dbBusyConnections: round(dbBusy), dbPoolUtilisation: dbPoolUtilisation === undefined ? undefined : round(dbPoolUtilisation),
    worstCaseDbConnectionsWithoutPooler: worstCase, bottlenecks, evidence, evidenceNote,
    monthlyCostUsd: estimateCost(w, avg, mix, scenario.multiplier),
  };
}

function estimateCost(w: WorkloadProfile, avgRps: number, mix: WorkloadProfile['requestMix'], multiplier: number): ScenarioResult['monthlyCostUsd'] {
  const p = w.unitPrices;
  const lines: Array<{ item: string; usd?: number; note: string }> = [];
  const requestsPerMonth = avgRps * SECONDS_PER_MONTH;
  const computeShare = mix.reduce((s, c) => s + c.share * (1 - c.cacheHitRatio), 0);
  const avgDurS = mix.reduce((s, c) => s + c.share * (1 - c.cacheHitRatio) * c.avgDurationMs, 0) / Math.max(computeShare, 1e-9) / 1000;
  const gbSeconds = requestsPerMonth * computeShare * avgDurS * w.computeMemoryGb;
  const st = w.storage;
  const add = (item: string, qty: number | undefined, unit: { usd: number; sourceDate: string } | undefined, qtyLabel: string) => {
    if (qty === undefined) return lines.push({ item, note: 'not estimated: usage not supplied' });
    if (!unit) return lines.push({ item, note: `not estimated: no unit price supplied (${qtyLabel})` });
    lines.push({ item, usd: round(qty * unit.usd), note: `${qtyLabel} @ $${unit.usd} (price dated ${unit.sourceDate})` });
  };
  add('requests', requestsPerMonth / 1e6, p.perMillionRequests, `${round(requestsPerMonth / 1e6)}M requests`);
  add('compute', gbSeconds, p.perGbSecondCompute, `${Math.round(gbSeconds)} GB-s`);
  // Storage lines price today's stored volume; growth over time is in the storage forecast, not here.
  add('database storage', st.databaseGb, p.perGbMonthDatabase, `${st.databaseGb ?? '?'} GB stored today`);
  add('object storage', st.objectStorageGb === undefined ? undefined : st.objectStorageGb * st.replicaCount, p.perGbMonthObject, `${st.objectStorageGb ?? '?'} GB x ${st.replicaCount} copies stored today`);
  add('egress', st.egressGbPerMonth === undefined ? undefined : st.egressGbPerMonth * multiplier, p.perGbEgress, `${(st.egressGbPerMonth ?? 0) * multiplier} GB`);
  add('logs ingested', st.logsGbPerDay === undefined ? undefined : st.logsGbPerDay * DAYS_PER_MONTH * multiplier, p.perGbLogsIngested, `${round((st.logsGbPerDay ?? 0) * DAYS_PER_MONTH * multiplier)} GB`);
  if (p.fixedMonthly) lines.push({ item: 'fixed plan fees', usd: p.fixedMonthly.usd, note: `price dated ${p.fixedMonthly.sourceDate}` });
  const known = lines.reduce((s, l) => s + (l.usd ?? 0), 0);
  if (!lines.some((l) => l.usd !== undefined)) return undefined;
  // Band: -20% / +30% around the point estimate to reflect usage and pricing uncertainty. Not a quote.
  return { low: round(known * 0.8), high: round(known * 1.3), lines };
}

export function forecastStorage(w: WorkloadProfile, scenario: Scenario, months = 24): StorageForecast {
  const s = w.storage;
  const notes: string[] = [];
  const m = scenario.multiplier;
  const dbGrowth = (s.databaseGrowthGbPerMonth ?? 0) * m * (1 + s.indexOverheadRatio);
  const dailyUploadGb = ((s.uploadsPerDay ?? 0) * (s.avgUploadMb ?? 0) * m) / 1024;
  const versionFactor = s.objectVersioning ? 1 + s.versionOverheadRatio : 1;
  const fullCopies = s.backupFullCopiesRetained ?? (s.backupRetentionDays ? Math.max(1, Math.ceil(s.backupRetentionDays / 7)) : 0);
  if (s.backupFullCopiesRetained === undefined && s.backupRetentionDays) notes.push(`Backup copies estimated as one full copy per 7 days of the ${s.backupRetentionDays}-day retention (${fullCopies} copies).`);
  if (!s.backupRetentionDays && s.backupFullCopiesRetained === undefined) notes.push('No database backup retention supplied: backup storage not forecast.');
  if (s.databaseGrowthGbPerMonth === undefined) notes.push('Database growth not supplied: database size held flat.');
  if (s.uploadsPerDay === undefined || s.avgUploadMb === undefined) notes.push('Upload volume not supplied: object growth not forecast.');
  if (s.objectRetentionDays) notes.push(`Objects expire after ${s.objectRetentionDays} days (existing objects assumed uniformly aged).`);
  notes.push('Database backups do not include object storage; back up uploaded objects separately.');

  const points: StoragePoint[] = [];
  let dbExhaust: number | undefined;
  let objExhaust: number | undefined;
  for (let month = 0; month <= months; month++) {
    const days = month * DAYS_PER_MONTH;
    const databaseGb = (s.databaseGb ?? 0) + dbGrowth * month;
    let logicalObjects: number;
    if (s.objectRetentionDays) {
      const existing = (s.objectStorageGb ?? 0) * Math.max(0, 1 - days / s.objectRetentionDays);
      logicalObjects = existing + dailyUploadGb * Math.min(days, s.objectRetentionDays);
    } else {
      logicalObjects = (s.objectStorageGb ?? 0) + dailyUploadGb * days;
    }
    const objectGbPhysical = logicalObjects * versionFactor * s.replicaCount;
    const backupGb = databaseGb * fullCopies;
    const logGb = (s.logsGbPerDay ?? 0) * m * (s.logRetentionDays ?? 0);
    points.push({ month, databaseGb: round(databaseGb), objectGbPhysical: round(objectGbPhysical), backupGb: round(backupGb), logGb: round(logGb) });
    if (dbExhaust === undefined && w.limits.dbQuotaGb && databaseGb > w.limits.dbQuotaGb) dbExhaust = month;
    if (objExhaust === undefined && w.limits.objectStorageQuotaGb && objectGbPhysical > w.limits.objectStorageQuotaGb) objExhaust = month;
  }
  return { scenario, points, databaseExhaustionMonth: dbExhaust, objectExhaustionMonth: objExhaust, notes };
}

export function runCapacity(w: WorkloadProfile, scenarios: Scenario[] = DEFAULT_SCENARIOS): CapacityReport {
  const missing: string[] = [];
  const assumptions: string[] = [];
  const arrival = estimateArrival(w);
  if (!arrival) missing.push('peak request rate: supply measurements[metric=peak_rps, unit=req/s] or peakConcurrentActiveUsers + requestsPerActiveUserPerMinute');
  if (w.mau !== undefined && !arrival) assumptions.push('MAU was supplied but is not used to derive capacity: MAU says nothing about concurrency.');
  if (!w.requestMix.length) assumptions.push('No request mix supplied: assumed a single class of 200 ms with 2 DB queries of 5 ms (replace with measurements).');
  if (!w.limits.computeConcurrency) missing.push('compute concurrency limit (vendor/plan quota)');
  if (!w.limits.dbPoolSize && !w.limits.dbMaxConnections) missing.push('database pool size / max connections');
  if (!w.loadTests.length) missing.push('load-test results (baseline/ramp/spike/soak/recovery)');
  const mixTotal = w.requestMix.reduce((s, c) => s + c.share, 0);
  if (w.requestMix.length && Math.abs(mixTotal - 1) > 0.01) assumptions.push(`Request-mix shares sum to ${mixTotal.toFixed(2)}, not 1.0; rates are scaled as given.`);

  const results = arrival ? scenarios.map((s) => computeScenario(w, arrival.peakRps, s)) : [];
  const sensitivity: string[] = [];
  if (arrival && results[0]) {
    const base = results[0];
    const slower = computeScenario({ ...w, requestMix: (w.requestMix.length ? w.requestMix : []).map((c) => ({ ...c, avgDurationMs: c.avgDurationMs * 1.5 })) }, arrival.peakRps, base.scenario);
    sensitivity.push(`If average request duration is 50% higher, present-day concurrency rises from ${base.requiredComputeConcurrency} to ${slower.requiredComputeConcurrency}.`);
    const spikier = computeScenario({ ...w, burstMultiplier: w.burstMultiplier * 2 }, arrival.peakRps, base.scenario);
    sensitivity.push(`If bursts are twice as sharp (x${w.burstMultiplier * 2}), present-day burst concurrency is ${spikier.requiredComputeConcurrency}.`);
  }
  return {
    version: CAPACITY_RULES_VERSION,
    arrival,
    scenarios: results,
    storage: scenarios.map((s) => forecastStorage(w, s)),
    sensitivity,
    missingMeasurements: missing,
    assumptions,
  };
}

export function capacityFindings(report: CapacityReport, stage: Stage): Finding[] {
  const out: Finding[] = [];
  const base = { ruleVersion: CAPACITY_RULES_VERSION, domains: ['capacity' as const], applicableStage: stage, ownerRole: 'Engineering lead', provenance: 'inferred' as const };
  for (const r of report.scenarios) {
    if (!r.bottlenecks.length) continue;
    const sev = r.scenario.multiplier === 1 ? 'high' : r.scenario.multiplier <= 10 ? 'medium' : 'low';
    out.push(makeFinding({
      ...base, key: r.scenario.name, ruleId: 'CAP-BOTTLENECK', title: `Projected bottleneck at ${r.scenario.name} traffic`,
      category: 'capacity', affected: { assets: [], controls: [], files: [] }, severity: sev, confidence: 'medium',
      status: 'requires_verification', evidenceLevel: 'self_reported',
      observed: r.bottlenecks.join('; '), expected: `Utilisation at or below ${pct(TARGET_UTILISATION)} at burst load.`,
      scenario: `At ${r.burstRps} req/s burst, ${r.bottlenecks[0]}.`,
      businessImpact: 'Requests queue, then time out or error during peaks: failed checkouts, sign-ups, or API calls.',
      insights: [`Concurrency via Little's Law: ${r.computeRps} req/s x ${r.weightedDurationMs} ms = ${r.requiredComputeConcurrency} in flight.`, r.evidenceNote],
      limitations: ['Projection from supplied assumptions, not demonstrated capacity.'],
      remediation: {
        summary: 'Confirm with a bounded load test, then apply the least complex fix that removes the measured bottleneck.',
        steps: ['Run the ramp and spike k6 scenarios against staging (templates/load-tests).', 'If confirmed: reduce per-request duration (indexes, caching), add a connection pooler, or raise the plan quota before re-architecting.'],
        alternatives: ['Queue and process expensive work asynchronously.'],
      },
      effortHours: { low: 4, high: 24 }, validation: 'Load test at this scenario’s burst rate passes with error rate <= 1% and p95 within SLO.',
      acceptanceCriteria: ['Passing load-test evidence recorded in workload.loadTests.'],
      reassessWhen: 'Traffic, request mix, or vendor plan changes.',
    }));
  }
  for (const f of report.storage) {
    for (const [what, month] of [['database', f.databaseExhaustionMonth], ['object storage', f.objectExhaustionMonth]] as const) {
      if (month === undefined) continue;
      const sev = f.scenario.multiplier === 1 ? (month <= 6 ? 'high' : 'medium') : 'low';
      out.push(makeFinding({
        ...base, key: `${f.scenario.name}:${what}`, ruleId: 'CAP-STORAGE-RUNWAY', title: `${what} quota exhausted in ~${month} months (${f.scenario.name})`,
        category: 'storage', affected: { assets: [what], controls: [], files: [] }, severity: sev, confidence: 'medium',
        status: 'requires_verification', evidenceLevel: 'self_reported',
        observed: `Forecast exceeds the configured ${what} quota at month ${month}.`, expected: 'At least 12 months of runway at present growth.',
        scenario: `Writes fail or the vendor throttles/upgrades the plan when the quota is reached around month ${month}.`,
        businessImpact: 'Uploads or writes fail; unplanned cost increases.',
        insights: f.notes, limitations: ['Forecast uses supplied growth and retention assumptions.'],
        remediation: { summary: 'Set retention/lifecycle rules, budget the next plan tier, and alert at 70% of quota.', steps: ['Add a quota alert at 70%.', 'Apply object lifecycle/retention rules.', 'Schedule the plan upgrade before month ' + Math.max(0, month - 2) + '.'] },
        effortHours: { low: 2, high: 8 }, validation: 'Quota alert configured; revised forecast shows >= 12 months runway.', acceptanceCriteria: ['Alert evidence captured.'],
        reassessWhen: 'Monthly, or when upload volume changes.',
      }));
    }
  }
  if (report.missingMeasurements.length) {
    out.push(makeFinding({
      ...base, key: 'missing', ruleId: 'CAP-MISSING-MEASUREMENTS', title: 'Capacity conclusions limited by missing measurements',
      category: 'capacity', affected: { assets: [], controls: [], files: [] }, severity: 'info', confidence: 'high',
      status: 'confirmed', evidenceLevel: 'none', provenance: 'unknown',
      observed: `Missing: ${report.missingMeasurements.join('; ')}.`, expected: 'Measured peak rate, limits, and at least one load test.',
      scenario: 'Capacity limits are unknown until measured.', businessImpact: 'Scaling decisions would rest on guesses.',
      remediation: { summary: 'Collect the listed measurements (monitoring dashboards and a baseline load test).' },
      effortHours: { low: 2, high: 6 }, validation: 'Re-run `bcr forecast` with measurements; this finding disappears.', reassessWhen: 'After measurements are added.',
    }));
  }
  return out;
}

const round = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${Math.round(n * 100)}%`;
