import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { GeoPolicy, GeoRule, type ThreatSignal } from '../src/domain/schemas.js';
import { loadPolicy, loadApprovals, checkApproval, policyHash } from '../src/engines/geo/policy.js';
import { evaluateSignals, DEFAULT_THREAT_CONFIG, type ActiveOverride } from '../src/engines/geo/signals.js';
import { compile } from '../src/engines/geo/compiler.js';
import { processSanctionsFeed } from '../src/engines/geo/sanctions-feed.js';
import { deliverAlerts } from '../src/integrations/alerts.js';
import { example, NOW, tmp } from './helpers.js';

const policy = () => loadPolicy(example('geo', 'policy.yaml'));
const approvals = () => loadApprovals(example('geo', 'approvals.yaml'));
const approvedFor = (p: GeoPolicy) => checkApproval(p, [{ id: 'a', policyId: p.policyId, policyVersion: p.version, policyHash: policyHash(p), approver: 'x', approvedAt: '2026-11-14T00:00:00Z', changeRef: 'https://github.com/o/r/pull/1', method: 'github_pr_review' }]);
const signal = (over: Partial<ThreatSignal> = {}): ThreatSignal => ({
  country: 'QZ', windowStart: '2026-11-14T08:00:00Z', windowEnd: '2026-11-14T11:00:00Z', totalRequests: 50_000, maliciousRequests: 15_000,
  loginAttempts: 5000, failedLogins: 2500, baselineFailedLoginRate: 0.1, baselineComputedAt: '2026-11-07T00:00:00Z', source: 'test', clients: ['web'], ...over,
});
const auto = { ...DEFAULT_THREAT_CONFIG, autoEscalateToChallenge: true };

test('example approval is bound to the policy hash; any edit invalidates it', () => {
  const p = policy();
  assert.equal(checkApproval(p, approvals()).approved, true);
  const edited = structuredClone(p);
  edited.rules = edited.rules.filter((r) => r.id !== 'SAN-US-OFAC-XX'); // a relaxation
  const c = checkApproval(edited, approvals());
  assert.equal(c.approved, false);
  assert.match(c.reasons.join(' '), /hash does not match/);
  assert.equal(c.identityVerified, false, 'a typed approver name is never proof of identity');
});

test('unapproved or manual-record policies cannot be compiled for deployment', () => {
  const p = policy();
  const r = compile(p, { approved: false, reasons: ['none'], identityVerified: false }, [], 'cloudflare-waf', { allowSynthetic: true });
  assert.equal(r.refused, true);
  assert.equal(r.rules.length, 0);
  const manual = checkApproval(p, [{ ...approvals()[0]!, method: 'manual_record' }]);
  assert.equal(manual.approved, false);
  assert.equal(compile(p, checkApproval(p, approvals()), [], 'cloudflare-waf').refused, true, 'synthetic rules refused without --allow-synthetic');
});

test('regional restrictions never silently become whole-country blocks', () => {
  const p = policy();
  const a = checkApproval(p, approvals());
  const cf = compile(p, a, [], 'cloudflare-waf', { allowSynthetic: true });
  const crimea = cf.rules.find((r) => r.ruleId === 'SAN-US-OFAC-UA-CRIMEA')!;
  assert.match(crimea.expression!, /ip\.src\.subdivision_1_iso_code in \{"UA-43" "UA-40"\}/);
  assert.ok(!cf.rules.some((r) => /ip\.src\.country in \{[^}]*"UA"/.test(r.expression ?? '')), 'no country-level UA rule');
  assert.ok(cf.gaps.some((g) => g.ruleId === 'SAN-US-OFAC-UA-DNR-LNR' && g.manualSteps.some((s) => /Do NOT widen/.test(s))));
  const cfront = compile(p, a, [], 'aws-cloudfront', { allowSynthetic: true });
  assert.deepEqual((cfront.artifact as { Items: string[] }).Items, ['XX']);
  assert.ok(cfront.gaps.some((g) => g.ruleId === 'SAN-US-OFAC-UA-CRIMEA' && g.missing === 'subdivision matching'));
  const store = compile(p, a, [], 'app-store', { allowSynthetic: true });
  assert.ok(store.gaps.some((g) => g.ruleId === 'SAN-US-OFAC-UA-CRIMEA'));
  assert.equal(cf.dryRun, true);
  assert.equal(cf.liveProtection, false);
});

test('feed outage, malformed or empty feeds do not clear approved sanctions rules', () => {
  const p = policy();
  const before = JSON.stringify(p);
  const prev = JSON.parse(readFileSync(example('geo', 'sanctions-snapshot-previous.json'), 'utf8'));
  const stored = { snapshot: prev, sha256: '', storedAt: '' };
  const outage = processSanctionsFeed(undefined, 'ETIMEDOUT', stored, p, NOW);
  assert.equal(outage.status, 'failed');
  const malformed = processSanctionsFeed('{"regime":"US-OFAC","entries":"nope"}', undefined, stored, p, NOW);
  assert.equal(malformed.status, 'failed');
  const empty = processSanctionsFeed(JSON.stringify({ ...prev, asOf: '2026-11-14', entries: [] }), undefined, stored, p, NOW);
  assert.equal(empty.status, 'failed');
  assert.match(empty.message, /not as all restrictions being lifted/);
  const stale = processSanctionsFeed(JSON.stringify({ ...prev, asOf: '2026-10-01' }), undefined, stored, p, NOW);
  assert.equal(stale.status, 'stale');
  assert.equal(JSON.stringify(p), before, 'approved policy untouched');
});

test('feed changes produce a proposal that requires approval and never edits the policy', () => {
  const p = policy();
  const prev = JSON.parse(readFileSync(example('geo', 'sanctions-snapshot-previous.json'), 'utf8'));
  const res = processSanctionsFeed(readFileSync(example('geo', 'sanctions-snapshot-new.json'), 'utf8'), undefined, { snapshot: prev, sha256: '', storedAt: '' }, p, NOW);
  assert.equal(res.status, 'changed');
  if (res.status !== 'changed') return;
  assert.deepEqual(res.diff.added, ['XY']);
  assert.equal(res.proposal.requiresApproval, true);
  assert.equal(res.proposal.basePolicyVersion, p.version);
  const again = processSanctionsFeed(readFileSync(example('geo', 'sanctions-snapshot-new.json'), 'utf8'), undefined, { snapshot: prev, sha256: '', storedAt: '' }, p, NOW);
  assert.equal(again.status === 'changed' && again.proposal.proposalId, res.proposal.proposalId, 'duplicate proposals share an id');
  const compiled = compile(p, checkApproval(p, approvals()), [], 'cloudflare-waf', { allowSynthetic: true });
  assert.ok(!compiled.rules.some((r) => r.description.includes('XY')));
});

test('threat signals can only produce temporary, expiring web challenges, never blocks', () => {
  const r = evaluateSignals([signal()], policy(), [], NOW, auto);
  assert.equal(r.decisions[0]!.outcome, 'apply_challenge');
  const o = r.overrides[0]!;
  assert.equal(o.action, 'CHALLENGE');
  assert.deepEqual(o.clients, ['web']);
  assert.equal(Date.parse(o.expiresAt) - NOW.getTime(), 72 * 3_600_000);
  assert.ok(r.decisions.every((d) => !/BLOCK/.test(d.outcome)));
  const manual = evaluateSignals([signal()], policy(), [], NOW);
  assert.equal(manual.decisions[0]!.outcome, 'propose_challenge');
  assert.equal(manual.overrides.length, 0, 'without auto-escalation nothing is applied');
});

test('challenge expires at TTL, restores the approved policy, and renewal is capped', () => {
  const ov: ActiveOverride = { country: 'QZ', action: 'CHALLENGE', clients: ['web'], createdAt: '2026-11-10T00:00:00Z', expiresAt: '2026-11-13T00:00:00Z', renewals: 0, reason: 'r', signalRef: 's' };
  const expired = evaluateSignals([], policy(), [ov], NOW, auto);
  assert.equal(expired.overrides.length, 0);
  assert.match(expired.decisions[0]!.reasons[0]!, /approved policy applies again/);
  const live = { ...ov, expiresAt: '2026-11-15T00:00:00Z' };
  const renewed = evaluateSignals([signal()], policy(), [live], NOW, auto);
  assert.equal(renewed.decisions[0]!.outcome, 'renew_challenge');
  const capped = evaluateSignals([signal()], policy(), [{ ...live, renewals: 1 }], NOW, auto);
  assert.equal(capped.decisions[0]!.outcome, 'human_review_required');
  assert.equal(capped.overrides[0]!.renewals, 1, 'no automatic indefinite renewal');
});

test('small samples, zero or stale baselines, and stale signals do not escalate', () => {
  const p = policy();
  const cases: Array<[string, Partial<ThreatSignal>]> = [
    ['small sample', { totalRequests: 100, maliciousRequests: 90, loginAttempts: 50, failedLogins: 49 }],
    ['zero baseline', { maliciousRequests: 100, baselineFailedLoginRate: 0, failedLogins: 4000 }],
    ['stale baseline', { maliciousRequests: 100, baselineComputedAt: '2026-08-01T00:00:00Z', failedLogins: 4000 }],
    ['stale signal', { windowStart: '2026-11-10T00:00:00Z', windowEnd: '2026-11-10T03:00:00Z' }],
    ['too-short window', { windowStart: '2026-11-14T10:55:00Z', windowEnd: '2026-11-14T11:00:00Z' }],
  ];
  for (const [name, over] of cases) {
    const d = evaluateSignals([signal(over)], p, [], NOW, auto).decisions[0]!;
    assert.ok(['insufficient_evidence', 'monitor'].includes(d.outcome), `${name}: got ${d.outcome}`);
  }
});

test('hysteresis keeps an active challenge until metrics fall well below threshold', () => {
  const live: ActiveOverride = { country: 'QZ', action: 'CHALLENGE', clients: ['web'], createdAt: '2026-11-14T00:00:00Z', expiresAt: '2026-11-16T00:00:00Z', renewals: 0, reason: 'r', signalRef: 's' };
  const slightlyBelow = signal({ maliciousRequests: 9000, failedLogins: 600 }); // 18% < 20% but >= 16%
  assert.notEqual(evaluateSignals([slightlyBelow], policy(), [live], NOW, auto).decisions[0]!.outcome, 'no_action');
});

test('EU guardrail: no discretionary BLOCK for EU B2C, sanctions take precedence', () => {
  const base = policy();
  const rule = GeoRule.parse({ id: 'THR-DE', track: 'threat', selector: { type: 'country', code: 'DE' }, action: 'BLOCK', reason: 'abuse spike', confidence: 'medium', dateAdded: '2026-11-01', effectiveDate: '2026-11-01', reviewDate: '2027-01-01', counselReviewed: true });
  const p = GeoPolicy.parse({ ...base, rules: [rule] });
  const r = compile(p, approvedFor(p), [], 'cloudflare-waf');
  assert.equal(r.rules.length, 0);
  assert.match(r.conflicts[0]!, /EU guardrail/);
  assert.throws(() => GeoRule.parse({ ...rule, counselReviewed: false }), /counselReviewed/);
  const b2b = GeoPolicy.parse({ ...base, businessModel: 'b2b', rules: [rule] });
  assert.equal(compile(b2b, approvedFor(b2b), [], 'cloudflare-waf').rules.length, 1);
});

test('native and API clients are not given browser challenges', () => {
  const d = evaluateSignals([signal({ clients: ['api'] })], policy(), [], NOW, auto).decisions[0]!;
  assert.equal(d.outcome, 'human_review_required');
  assert.match(d.nativeClientAdvice!, /rate limits and step-up/);
  const mixed = evaluateSignals([signal({ clients: ['web', 'ios'] })], policy(), [], NOW, auto);
  assert.deepEqual(mixed.overrides[0]!.clients, ['web']);
  const p = GeoPolicy.parse({ ...policy(), rules: [] });
  const r = compile(p, approvedFor(p), mixed.overrides, 'cloudflare-waf');
  assert.match(r.rules[0]!.expression!, /not starts_with\(http\.request\.uri\.path, "\/api\/"\)/);
});

test('unsupported provider capabilities produce explicit gaps', () => {
  const p = GeoPolicy.parse({ ...policy(), rules: [] });
  const ov: ActiveOverride = { country: 'QZ', action: 'CHALLENGE', clients: ['web'], createdAt: NOW.toISOString(), expiresAt: '2026-11-16T00:00:00Z', renewals: 0, reason: 'r', signalRef: 's' };
  const r = compile(p, approvedFor(p), [ov], 'aws-cloudfront');
  assert.equal(r.rules.length, 0);
  assert.equal(r.gaps[0]!.missing, 'challenge action');
});

test('alerts are dry-run by default, redacted, and deduplicated', async () => {
  let calls = 0;
  const fakeFetch = (async () => { calls++; return new Response('ok', { status: 200 }); }) as typeof fetch;
  const secret = 'sk_live_' + 'abcdefghijklmnop1234';
  const alerts = [{ dedupeKey: 'k1', severity: 'warning' as const, title: 't', body: `leaked ${secret}` }, { dedupeKey: 'k1', severity: 'warning' as const, title: 't', body: 'dup' }];
  const dry = await deliverAlerts(alerts, { transport: 'slack', send: false, env: {} });
  assert.equal(dry[0]!.status, 'dry_run');
  assert.ok(!JSON.stringify(dry).includes(secret));
  assert.equal(dry[1]!.status, 'duplicate_suppressed');
  const state = join(tmp(), 'sent.json');
  const env = { BCR_SLACK_WEBHOOK_URL: 'https://hooks.example.test/x' };
  const first = await deliverAlerts([alerts[0]!], { transport: 'slack', send: true, stateFile: state, fetchImpl: fakeFetch, env });
  assert.equal(first[0]!.status, 'sent');
  const second = await deliverAlerts([alerts[0]!], { transport: 'slack', send: true, stateFile: state, fetchImpl: fakeFetch, env });
  assert.equal(second[0]!.status, 'duplicate_suppressed');
  assert.equal(calls, 1);
  const email = await deliverAlerts([{ ...alerts[0]!, dedupeKey: 'k2' }], { transport: 'email', send: true, env });
  assert.equal(email[0]!.status, 'not_implemented');
});

test('AWS WAF regions compile to a labeler rule plus label matching; CloudFront warns it fails open', () => {
  const p = policy();
  const a = checkApproval(p, approvals());
  const aws = compile(p, a, [], 'aws-waf', { allowSynthetic: true });
  const art = aws.artifact as { rules: Array<{ Name: string; Action: object; Statement: unknown }> };
  assert.equal(art.rules[0]!.Name, 'bcr-geo-region-labels');
  assert.deepEqual(art.rules[0]!.Action, { Count: {} });
  assert.deepEqual((art.rules[0]!.Statement as { GeoMatchStatement: { CountryCodes: string[] } }).GeoMatchStatement.CountryCodes, ['UA']);
  const crimea = JSON.stringify(art.rules.find((r) => r.Name === 'SAN-US-OFAC-UA-CRIMEA')!.Statement);
  assert.match(crimea, /awswaf:clientip:geo:region:UA-43/);
  assert.doesNotMatch(crimea, /GeoMatchStatement/, 'the region rule itself never matches the whole country');
  assert.ok(aws.rules.find((r) => r.ruleId === 'SAN-US-OFAC-XX')!.warnings.some((w) => /unknown/.test(w)), 'XX collides with the AWS unknown-location label');
  assert.ok(aws.gaps.some((g) => g.ruleId === 'SAN-US-OFAC-UA-DNR-LNR' && g.manualSteps.some((m) => /FAQ 1009/.test(m))));
  const cf = compile(p, a, [], 'aws-cloudfront', { allowSynthetic: true });
  assert.ok(cf.warnings.some((w) => /fails open/.test(w)));
});
