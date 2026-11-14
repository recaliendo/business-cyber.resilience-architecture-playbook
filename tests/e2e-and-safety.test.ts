import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runAssessment } from '../src/assess.js';
import { writeBundle } from '../src/reporting/render.js';
import { loadPolicy, loadApprovals } from '../src/engines/geo/policy.js';
import { redact, containsSecret } from '../src/lib/redact.js';
import { parseStructured } from '../src/lib/io.js';
import { loadSources } from '../src/knowledge/load.js';
import { sourceStatus, refreshSources, isPublicAddress } from '../src/sources/sources.js';
import { SourceRecord } from '../src/domain/schemas.js';
import { example, intakeFile, NOW, root, tmp } from './helpers.js';

test('offline end-to-end assessment works for every example, partial and complete', () => {
  for (const f of readdirSync(example('intake'))) {
    const r = runAssessment({ intake: intakeFile(f) });
    const out = tmp('bcr-e2e-');
    writeBundle(r, out, {});
    for (const file of ['report.md', 'report.json', 'report.html', 'prompts/index.md']) assert.ok(existsSync(join(out, file)), `${f}: ${file}`);
    assert.ok(r.roadmap.every((i) => i.ownerRole && i.completionCriteria.length && i.effortHours), `${f}: roadmap items complete`);
    const md = readFileSync(join(out, 'report.md'), 'utf8');
    for (let s = 1; s <= 10; s++) assert.match(md, new RegExp(`### ${s}\\. `), `${f}: section ${s}`);
    assert.doesNotMatch(md, /SOC 2 certified|is compliant\b/i, `${f}: never claims certification or compliance`);
  }
});

test('reports are reproducible from the same inputs', () => {
  const a = runAssessment({ intake: intakeFile('02-b2b-enterprise.yaml') });
  const b = runAssessment({ intake: intakeFile('02-b2b-enterprise.yaml') });
  assert.equal(a.meta.inputsHash, b.meta.inputsHash);
  assert.deepEqual(a.findings.map((f) => f.id), b.findings.map((f) => f.id));
  assert.ok(a.meta.ruleVersions.controls && a.meta.ruleVersions.scoring && a.meta.ruleVersions.applicability);
});

test('legal launch blockers outrank everything in the roadmap', () => {
  const r = runAssessment({ intake: intakeFile('02-b2b-enterprise.yaml') });
  const firstNonBlocker = r.findings.findIndex((f) => !f.launchBlocker);
  assert.ok(r.findings.slice(firstNonBlocker).every((f) => !f.launchBlocker), 'blockers sorted first');
  assert.equal(r.roadmap[0]!.horizon, 'next_day');
});

test('geo posture in a full assessment reports approval and dry-run status', () => {
  const r = runAssessment({ intake: intakeFile('01-solo-b2c-launch.yaml'), geo: { policy: loadPolicy(example('geo', 'policy.yaml')), approvals: loadApprovals(example('geo', 'approvals.yaml')), signals: [], overrides: [] }, now: NOW });
  assert.equal(r.geo!.approval.approved, true);
  assert.match(r.geo!.note, /Nothing here is live protection/);
});

test('redaction covers common secret formats and leaves ordinary text alone', () => {
  const samples: Array<[string, string]> = [
    ['sk_live_' + 'a'.repeat(24), 'a'.repeat(24)], ['whsec_' + 'b'.repeat(20), 'b'.repeat(20)], ['ghp_' + 'c'.repeat(36), 'c'.repeat(36)], ['AKIA' + 'ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOP'],
    ['-----BEGIN PRIVATE KEY-----\nabcsecretkeybody\n-----END PRIVATE KEY-----', 'abcsecretkeybody'], ['postgres://admin:hunter2pass@db.example.test/x', 'hunter2pass'],
    ['password = "correct-horse-battery"', 'correct-horse-battery'], ['Authorization: Bearer ' + 'x'.repeat(30), 'x'.repeat(30)], ['4242 4242 4242 4242', '4242 4242 4242 4242'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop', 'abcdefghijklmnop'],
  ];
  for (const [s, secret] of samples) { assert.ok(containsSecret(s), s.slice(0, 12)); assert.ok(!redact(s).includes(secret), `${s.slice(0, 12)} still contains the secret`); }
  for (const ok of ['Order 1234 5678 shipped', 'The quick brown fox', 'timestamp 2026-11-14T12:00:00Z', 'process.env.STRIPE_SECRET_KEY']) assert.equal(redact(ok), ok);
});

test('YAML parsing is safe: alias bombs and custom tags are refused or neutral', () => {
  const bomb = 'a: &a ["x","x","x","x","x","x","x","x","x"]\n' + Array.from({ length: 60 }, (_, i) => `b${i}: [*a,*a,*a,*a,*a,*a,*a,*a,*a]`).join('\n');
  assert.throws(() => parseStructured(bomb, 'x.yaml'));
  const tagged = parseStructured('x: !!js/function "function(){}"\n', 'x.yaml') as { x: unknown };
  assert.notEqual(typeof tagged.x, 'function');
});

test('source verification is honest about method; refresh is a dry run by default and never verifies', async () => {
  const reg = loadSources();
  const st = sourceStatus(reg, NOW);
  assert.ok(st.every((s) => s.state !== 'human_verified'), 'automated checks never count as human sign-off');
  assert.ok(reg.sources.every((s) => !s.verifiedAt || (s.verificationMethod === 'automated' && /not human sign-off/.test(s.verifiedBy ?? ''))));
  assert.ok(reg.sources.filter((s) => s.verifiedAt).every((s) => s.claims.length > 0), 'every verified source records the claims checked');
  for (const s of st.filter((x) => x.state === 'partially_verified')) assert.ok(s.openClaims.length > 0, s.id);
  assert.ok(st.filter((s) => s.state === 'machine_verified').length >= 30);
  const later = sourceStatus(reg, new Date('2028-01-01T00:00:00Z'));
  assert.ok(later.some((s) => s.state === 'stale'), 'verification expires after the review cadence');
  let fetched = 0;
  const res = await refreshSources(reg, { allowNetwork: false, fetchImpl: (async () => { fetched++; return new Response(''); }) as typeof fetch });
  assert.equal(fetched, 0);
  assert.ok(res.every((r) => r.action === 'would_fetch'));
  const blocked = await refreshSources(reg, { allowNetwork: true, ids: ['SRC-GDPR'], resolve: async () => ['10.0.0.5'], fetchImpl: (async () => { fetched++; return new Response(''); }) as typeof fetch });
  assert.equal(blocked[0]!.action, 'refused');
  assert.equal(fetched, 0, 'SSRF guard blocks private addresses before fetching');
  const changed = await refreshSources({ ...reg, sources: [{ ...reg.sources[0]!, contentHash: 'old' }] }, { allowNetwork: true, resolve: async () => ['93.184.215.14'], fetchImpl: (async () => new Response('new content')) as typeof fetch });
  assert.equal(changed[0]!.action, 'fetched_changed');
  assert.equal(loadSources().sources[0]!.verifiedAt, reg.sources[0]!.verifiedAt, 'refresh never changes verification fields');
  for (const ip of ['127.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fd00::1', '::ffff:10.0.0.1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('8.8.8.8'), true);
});

test('CLI: clean-checkout commands run offline and refuse unsafe operations', () => {
  const cli = join(root, 'dist', 'src', 'cli', 'index.js');
  const run = (...args: string[]) => { try { return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { const x = e as { status: number; stdout: string; stderr: string }; return { code: x.status, out: x.stdout + x.stderr }; } };
  assert.equal(run('validate', 'intake', 'examples/intake/01-solo-b2c-launch.yaml').code, 0);
  const plan = run('enforce', 'plan', '--policy', 'examples/geo/policy.yaml', '--approvals', 'examples/geo/approvals.yaml', '--provider', 'cloudflare-waf', '--dry-run');
  assert.equal(plan.code, 3, 'synthetic policy refused without --allow-synthetic');
  assert.notEqual(run('enforce', 'plan', '--policy', 'examples/geo/policy.yaml', '--approvals', 'examples/geo/approvals.yaml', '--provider', 'cloudflare-waf').code, 0, '--dry-run is mandatory');
  assert.notEqual(run('sources', 'refresh').code, 0, 'refresh requires an explicit mode');
  const feed = run('geo', 'feed', '--policy', 'examples/geo/policy.yaml', '--now', '2026-11-14T12:00:00Z');
  assert.equal(feed.code, 5);
  assert.match(feed.out, /stays in force/);
});

test('source records cannot claim verification without method, verifier and checked claims', () => {
  const base = { id: 'SRC-X', publisher: 'p', title: 't', url: 'https://example.test/x', topic: 't', jurisdiction: 'j', official: true, reviewCadenceDays: 30 };
  assert.equal(SourceRecord.safeParse(base).success, true);
  assert.equal(SourceRecord.safeParse({ ...base, verifiedAt: '2026-11-14T00:00:00Z', verifiedBy: 'me', verificationMethod: 'human' }).success, false, 'no claims recorded');
  assert.equal(SourceRecord.safeParse({ ...base, verifiedAt: '2026-11-14T00:00:00Z', claims: [{ id: 'a', claim: 'something', status: 'confirmed' }] }).success, false, 'no verifier or method');
  assert.equal(SourceRecord.safeParse({ ...base, verifiedAt: '2026-11-14T00:00:00Z', verifiedBy: 'me', verificationMethod: 'human', claims: [{ id: 'a', claim: 'something', status: 'confirmed' }] }).success, true);
});
