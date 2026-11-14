import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateControls, score } from '../src/evidence/scoring.js';
import { loadControls } from '../src/knowledge/load.js';
import type { EvidenceItem } from '../src/domain/schemas.js';
import { analyseIntake, validateIntake } from '../src/intake/intake.js';
import { intake, NOW } from './helpers.js';

const catalog = loadControls();
const ev = (controlId: string, state: EvidenceItem['assertions'][number]['state'], collectedAt = '2026-11-10T00:00:00Z', extra: Partial<EvidenceItem['assertions'][number]> = {}, provenance: EvidenceItem['provenance'] = 'observed'): EvidenceItem => ({
  id: `ev-${controlId}-${state}`, kind: 'config_export', description: 'test', provenance, collectedAt, reference: 'x', assertions: [{ controlId, state, ...extra }],
});

test('unknown evidence never becomes a passed control', () => {
  const res = evaluateControls(catalog.controls, [], 'launch', NOW);
  const applicable = res.filter((r) => r.state !== 'not_applicable');
  assert.ok(applicable.length > 0);
  assert.ok(applicable.every((r) => r.state === 'unknown'));
  const s = score(res);
  assert.equal(s.readiness, 0);
  assert.equal(s.evidenceCoverage, 0);
});

test('stale evidence is treated as unknown, not met', () => {
  const [r] = evaluateControls(catalog.controls.filter((c) => c.id === 'IAM-01'), [ev('IAM-01', 'met', '2025-01-01T00:00:00Z')], 'launch', NOW);
  assert.equal(r!.state, 'unknown');
  assert.equal(r!.stale, true);
});

test('not_applicable requires a justification', () => {
  const ctl = catalog.controls.filter((c) => c.id === 'VUL-04');
  const [noJust] = evaluateControls(ctl, [ev('VUL-04', 'not_applicable')], 'growth', NOW);
  assert.equal(noJust!.state, 'unknown');
  const [withJust] = evaluateControls(ctl, [ev('VUL-04', 'not_applicable', undefined, { justification: 'No container images.' })], 'growth', NOW);
  assert.equal(withJust!.state, 'not_applicable');
});

test('readiness and evidence coverage are separate, and a high score does not hide blockers', () => {
  const evidence = catalog.controls.filter((c) => c.id !== 'IAM-01').map((c) => ev(c.id, 'met'));
  const s = score(evaluateControls(catalog.controls, evidence, 'enterprise_global', NOW));
  assert.ok(s.readiness > 0.85, `readiness ${s.readiness}`);
  assert.ok(s.blockers.includes('IAM-01'));
});

test('partial on a blocker control is still a blocker', () => {
  const s = score(evaluateControls(catalog.controls.filter((c) => c.id === 'RES-01'), [ev('RES-01', 'partial', undefined, { justification: 'db only' })], 'launch', NOW));
  assert.deepEqual(s.blockers, ['RES-01']);
  assert.equal(s.readiness, 0.5);
});

test('self-reported met is credited but labelled', () => {
  const [r] = evaluateControls(catalog.controls.filter((c) => c.id === 'IAM-02'), [ev('IAM-02', 'met', undefined, {}, 'self_reported')], 'launch', NOW);
  assert.equal(r!.state, 'met');
  assert.ok(r!.notes.some((n) => /self-report/.test(n)));
  assert.equal(score([r!]).observedCoverage, 0);
});

test('partial intake is accepted and produces the three first questions', () => {
  const a = analyseIntake(intake());
  const ids = a.questions.map((q) => q.id);
  assert.ok(ids.includes('Q1-model') && ids.includes('Q2-sensitive-data') && ids.includes('Q3-geography'));
  assert.ok(a.completeness.answered < a.completeness.total);
});

test('invalid intake reports paths', () => {
  const v = validateIntake({ business: { name: '', stage: 'someday', team: { size: 0 } } });
  assert.equal(v.ok, false);
  if (!v.ok) assert.ok(v.issues.some((i) => i.path.startsWith('business.stage')));
});
