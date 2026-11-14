import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkloadProfile, type IntakeInput } from '../src/domain/schemas.js';
import { computeScenario, forecastStorage, runCapacity, estimateArrival } from '../src/engines/capacity/capacity.js';

const wl = (over: NonNullable<IntakeInput['workload']>) => WorkloadProfile.parse(over);

test("Little's Law: 100 req/s x 200 ms = 20 requests in flight", () => {
  const w = wl({ burstMultiplier: 1, requestMix: [{ name: 'a', share: 1, avgDurationMs: 200, dbQueriesPerRequest: 2, avgDbQueryMs: 10 }], limits: { computeConcurrency: 100, dbPoolSize: 10 } });
  const r = computeScenario(w, 100, { name: 'present', multiplier: 1 });
  assert.equal(r.requiredComputeConcurrency, 20);
  assert.equal(r.computeUtilisation, 0.2);
  // DB: 100 req/s x 2 queries x 0.010 s = 2 busy connections
  assert.equal(r.dbBusyConnections, 2);
  assert.equal(r.bottlenecks.length, 0);
});

test('peak rate derives from active users, not MAU', () => {
  const w = wl({ peakConcurrentActiveUsers: 600, requestsPerActiveUserPerMinute: 6 });
  assert.equal(estimateArrival(w)!.peakRps, 60);
  const mauOnly = runCapacity(wl({ mau: 5_000_000 }));
  assert.equal(mauOnly.arrival, undefined);
  assert.equal(mauOnly.scenarios.length, 0);
  assert.ok(mauOnly.assumptions.some((a) => /MAU .* not used/.test(a)));
  assert.ok(mauOnly.missingMeasurements.some((m) => /peak request rate/.test(m)));
});

test('cache hits reduce compute arrivals and bursts multiply them', () => {
  const w = wl({ burstMultiplier: 2, requestMix: [{ name: 'a', share: 1, avgDurationMs: 100, cacheHitRatio: 0.5 }] });
  const r = computeScenario(w, 100, { name: 'x', multiplier: 10 });
  assert.equal(r.burstRps, 2000);
  assert.equal(r.computeRps, 1000);
  assert.equal(r.requiredComputeConcurrency, 100);
});

test('bottleneck reported above 70% utilisation and connection amplification flagged', () => {
  const w = wl({ burstMultiplier: 1, requestMix: [{ name: 'a', share: 1, avgDurationMs: 1000 }], limits: { computeConcurrency: 100, dbMaxConnections: 50 } });
  const r = computeScenario(w, 80, { name: 'p', multiplier: 1 });
  assert.ok(r.bottlenecks.some((b) => /compute concurrency/.test(b)));
  assert.ok(r.bottlenecks.some((b) => /connection pooler/.test(b)));
});

test('storage forecast includes retention, versioning, replicas, backups and logs', () => {
  const w = wl({ storage: { databaseGb: 10, databaseGrowthGbPerMonth: 1, indexOverheadRatio: 0, objectStorageGb: 0, uploadsPerDay: 1024, avgUploadMb: 1, objectRetentionDays: 60, objectVersioning: true, versionOverheadRatio: 0.5, replicaCount: 2, backupRetentionDays: 30, logsGbPerDay: 2, logRetentionDays: 10 }, limits: { objectStorageQuotaGb: 150 } });
  const f = forecastStorage(w, { name: 'present', multiplier: 1 }, 6);
  // 1 GB/day of uploads, 60-day retention -> 60 GB steady state x 1.5 versions x 2 replicas = 180 GB
  assert.equal(f.points[3]!.objectGbPhysical, 180);
  assert.equal(f.points[6]!.objectGbPhysical, 180, 'retention caps growth');
  assert.equal(f.points[1]!.objectGbPhysical, 90);
  assert.equal(f.objectExhaustionMonth, 2);
  // 30-day backup retention -> 5 weekly full copies; DB at month 2 = 12 GB -> 60 GB backups
  assert.equal(f.points[2]!.backupGb, 60);
  assert.equal(f.points[0]!.logGb, 20);
  assert.ok(f.notes.some((n) => /do not include object storage/.test(n)));
});

test('projection is distinguished from load-test evidence', () => {
  const base = { burstMultiplier: 1, requestMix: [{ name: 'a', share: 1, avgDurationMs: 100 }], slo: { p95LatencyMs: 500 } };
  const tested = wl({ ...base, loadTests: [{ scenario: 'ramp', environment: 'staging', sustainedRps: 100, p95Ms: 300, errorRate: 0.001, testedAt: '2026-11-01T00:00:00Z', evidenceRef: 'x' }] });
  assert.equal(computeScenario(tested, 80, { name: 'p', multiplier: 1 }).evidence, 'demonstrated');
  assert.equal(computeScenario(tested, 80, { name: '10x', multiplier: 10 }).evidence, 'projected');
  const local = wl({ ...base, loadTests: [{ scenario: 'ramp', environment: 'local', sustainedRps: 10_000, p95Ms: 10, errorRate: 0, testedAt: '2026-11-01T00:00:00Z', evidenceRef: 'x' }] });
  assert.equal(computeScenario(local, 80, { name: 'p', multiplier: 1 }).evidence, 'projected', 'local tests do not demonstrate production capacity');
  const failing = wl({ ...base, loadTests: [{ scenario: 'ramp', environment: 'staging', sustainedRps: 1000, p95Ms: 900, errorRate: 0.001, testedAt: '2026-11-01T00:00:00Z', evidenceRef: 'x' }] });
  assert.equal(computeScenario(failing, 80, { name: 'p', multiplier: 1 }).evidence, 'projected', 'a test that missed the SLO does not count');
});

test('costs use supplied, dated unit prices only', () => {
  const w = wl({ peakConcurrentActiveUsers: 60, requestsPerActiveUserPerMinute: 60, peakToAverageRatio: 1, requestMix: [{ name: 'a', share: 1, avgDurationMs: 100 }], unitPrices: { perMillionRequests: { usd: 1, sourceDate: '2026-01-01' } } });
  const c = runCapacity(w).scenarios[0]!.monthlyCostUsd!;
  // 60 req/s x 2,592,000 s = 155.52M requests x $1 = $155.52 point estimate
  assert.equal(c.lines.find((l) => l.item === 'requests')!.usd, 155.52);
  assert.ok(c.lines.find((l) => l.item === 'compute')!.note.includes('no unit price'));
  assert.equal(runCapacity(wl({ peakConcurrentActiveUsers: 1, requestsPerActiveUserPerMinute: 1 })).scenarios[0]!.monthlyCostUsd, undefined);
});
