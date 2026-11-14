#!/usr/bin/env node
// bcr: Business Cyber Resilience consultant CLI. Run `bcr help` for usage.
import { parseArgs } from 'node:util';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { loadStructured, readTextBounded, writeText, InputError } from '../lib/io.js';
import { redact } from '../lib/redact.js';
import { validateIntake, loadIntakeFile } from '../intake/intake.js';
import { runAssessment, TOOL_VERSION, type GeoInput } from '../assess.js';
import { writeBundle, renderMarkdown } from '../reporting/render.js';
import { runCapacity, type Scenario, DEFAULT_SCENARIOS } from '../engines/capacity/capacity.js';
import { loadPolicy, loadApprovals, checkApproval, policyHash } from '../engines/geo/policy.js';
import { evaluateSignals, DEFAULT_THREAT_CONFIG, type ActiveOverride } from '../engines/geo/signals.js';
import { compile, type ProviderId } from '../engines/geo/compiler.js';
import { processSanctionsFeed, type StoredSnapshot } from '../engines/geo/sanctions-feed.js';
import { deliverAlerts, type TransportName } from '../integrations/alerts.js';
import { ThreatSignal } from '../domain/schemas.js';
import { loadSources } from '../knowledge/load.js';
import { sourceStatus, refreshSources } from '../sources/sources.js';
import { reviewRepository, checkFreshness } from '../review/review.js';
import { cloneGithubRepository } from '../review/github.js';

const HELP = `bcr ${TOOL_VERSION}: Business Cyber Resilience consultant (local-first, offline by default)

Usage:
  bcr validate intake <file>                         Validate an intake and list follow-up questions
  bcr assess --intake <file> [--repo <path>] [--geo-policy <f> --approvals <f> [--signals <f>] [--overrides <f>]] --out <dir>
                                                     Full assessment -> report bundle (md, json, html, prompts/)
  bcr forecast --intake <file> [--scenario name=multiplier ...] [--json]
                                                     Capacity, storage runway and cost ranges
  bcr compliance --intake <file> [--json]            Obligation applicability + SOC 2 / ISO positioning
  bcr geo evaluate --policy <f> --approvals <f> --signals <f> [--overrides <f>] [--now <iso>] [--auto-challenge] [--write-overrides <f>]
                                                     Evaluate threat signals (dry run; never creates blocks)
  bcr geo feed --policy <f> --snapshot <new.json> [--previous <stored.json>] [--store <stored.json>] [--now <iso>]
                                                     Process a sanctions snapshot into a PROPOSED change
  bcr sources status [--json]                        Verification backlog and stale sources
  bcr sources refresh --dry-run | --allow-network [--id SRC-..]
                                                     Check sources for changes (never marks them verified)
  bcr enforce plan --policy <f> --approvals <f> --provider <cloudflare-waf|aws-waf|aws-cloudfront|app-store> --dry-run
                    [--overrides <f>] [--previous <artifact.json>] [--out <file>] [--allow-synthetic]
                                                     Compile an approved policy to a dry-run artifact + diff
  bcr alerts test [--transport dry-run|slack|pagerduty|email] [--send]
                                                     Exercise alert transports (dry run unless --send)
  bcr review --repo <path|https://github.com/o/r> --out <dir> [--intake <file>] [--ref <branch>]
                                                     Read-only repository review -> report bundle with prompts
  bcr review verify --bundle <dir> --repo <path>     Is the checkout still at the reviewed commit?
  bcr prompt show --bundle <dir> --finding <id>      Print a remediation prompt to copy into Claude Code
  bcr render --from <report.json> --out <file.md>    Re-render Markdown from a saved JSON report

Nothing is sent, deployed or fetched unless a flag explicitly allows it.
`;

const KV = { type: 'string' as const };
const BOOL = { type: 'boolean' as const };

function out(s: string) { process.stdout.write(redact(s) + (s.endsWith('\n') ? '' : '\n')); }
function fail(msg: string, code = 1): never { process.stderr.write(redact(msg) + '\n'); process.exit(code); }

async function main(argv: string[]): Promise<void> {
  const [cmd, sub, ...rest] = argv;
  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h': return out(HELP);
    case '--version': return out(TOOL_VERSION);
    case 'validate': {
      if (sub !== 'intake' || !rest[0]) fail('Usage: bcr validate intake <file>');
      const v = validateIntake(loadStructured(rest[0]!));
      if (!v.ok) { out(`INVALID: ${rest[0]}`); v.issues.forEach((i) => out(`  - ${i.path}: ${i.message}`)); process.exitCode = 2; return; }
      const a = loadIntakeFile(rest[0]!);
      out(`VALID: ${rest[0]} (${a.completeness.answered}/${a.completeness.total} key areas answered)`);
      if (a.questions.length) { out('\nFollow-up questions:'); a.questions.forEach((q) => out(`  [${q.priority}] ${q.question}\n      unblocks: ${q.blocks.join(', ')}`)); }
      if (a.assumptions.length) { out('\nAssumptions:'); a.assumptions.forEach((x) => out(`  - ${x}`)); }
      return;
    }
    case 'assess': {
      const { values } = parseArgs({ args: [sub, ...rest].filter((x): x is string => x !== undefined), options: { intake: KV, repo: KV, 'geo-policy': KV, approvals: KV, signals: KV, overrides: KV, out: KV, now: KV } });
      if (!values.intake && !values.repo) fail('assess needs --intake and/or --repo');
      if (!values.out) fail('assess needs --out <dir>');
      const intake = values.intake ? loadIntakeFile(values.intake).intake : undefined;
      const review = values.repo ? reviewRepository(resolve(values.repo), intake?.business.stage) : undefined;
      const geo = values['geo-policy'] ? loadGeo(values['geo-policy'], values.approvals, values.signals, values.overrides) : undefined;
      const r = runAssessment({ intake, review, geo, now: values.now ? new Date(values.now) : undefined });
      const b = writeBundle(r, resolve(values.out), { repository: review?.github ? `https://github.com/${review.github.owner}/${review.github.repo}` : review?.path, commit: review?.commit, businessContext: intake ? `${intake.business.model} business at ${intake.business.stage} stage, team of ${intake.business.team.size}` : undefined });
      return summary(r, b.dir);
    }
    case 'forecast': {
      const { values } = parseArgs({ args: [sub, ...rest].filter(Boolean) as string[], options: { intake: KV, scenario: { type: 'string', multiple: true }, json: BOOL } });
      if (!values.intake) fail('forecast needs --intake');
      const w = loadIntakeFile(values.intake).intake.workload;
      if (!w) fail('The intake has no workload section; add one to forecast capacity.');
      const scenarios: Scenario[] = values.scenario?.length ? values.scenario.map((s) => { const [name, m] = s.split('='); const n = Number(m); if (!name || !Number.isFinite(n) || n <= 0) fail(`Bad --scenario ${s}; use name=multiplier`); return { name, multiplier: n }; }) : DEFAULT_SCENARIOS;
      const c = runCapacity(w!, scenarios);
      if (values.json) return out(JSON.stringify(c, null, 2));
      out(c.arrival ? `Peak arrival: ${c.arrival.peakRps.toFixed(2)} req/s (${c.arrival.basis})` : 'Peak arrival rate unknown.');
      for (const s of c.scenarios) out(`  ${s.scenario.name.padEnd(8)} peak ${s.peakRps} req/s, burst ${s.burstRps} req/s, concurrency ${s.requiredComputeConcurrency}, DB busy ${s.dbBusyConnections} [${s.evidence}]${s.monthlyCostUsd ? `, $${s.monthlyCostUsd.low}-${s.monthlyCostUsd.high}/mo` : ''}${s.bottlenecks.length ? `\n           bottlenecks: ${s.bottlenecks.join('; ')}` : ''}`);
      for (const f of c.storage) out(`  storage ${f.scenario.name}: DB exhaustion month ${f.databaseExhaustionMonth ?? '-'}, object exhaustion month ${f.objectExhaustionMonth ?? '-'}`);
      if (c.missingMeasurements.length) out(`Missing: ${c.missingMeasurements.join('; ')}`);
      return;
    }
    case 'compliance': {
      const { values } = parseArgs({ args: [sub, ...rest].filter(Boolean) as string[], options: { intake: KV, json: BOOL } });
      if (!values.intake) fail('compliance needs --intake');
      const r = runAssessment({ intake: loadIntakeFile(values.intake).intake });
      if (values.json) return out(JSON.stringify({ obligations: r.compliance!.results.map((o) => ({ id: o.obligation.id, status: o.status, reasoning: o.reasoning })), soc2: r.compliance!.soc2 }, null, 2));
      for (const o of r.compliance!.results) out(`  ${o.status.padEnd(15)} ${o.obligation.id.padEnd(28)} ${o.reasoning[0] ?? ''}`);
      out(`\nSOC 2: ${r.compliance!.soc2.recommendation}: ${r.compliance!.soc2.reasoning.join(' ')}`);
      out('Screening only: confirm "applicable" and "uncertain" items with counsel.');
      return;
    }
    case 'geo': return geoCmd(sub, rest);
    case 'sources': {
      const { values } = parseArgs({ args: rest, options: { json: BOOL, 'dry-run': BOOL, 'allow-network': BOOL, id: { type: 'string', multiple: true } } });
      const reg = loadSources();
      if (sub === 'status') {
        const st = sourceStatus(reg, new Date());
        if (values.json) return out(JSON.stringify(st, null, 2));
        out(`${st.filter((s) => s.state === 'verified').length} verified, ${st.filter((s) => s.state === 'stale').length} stale, ${st.filter((s) => s.state === 'unverified').length} unverified`);
        st.filter((s) => s.state !== 'verified').forEach((s) => out(`  ${s.state.padEnd(10)} ${s.id.padEnd(28)} ${s.url}`));
        return;
      }
      if (sub === 'refresh') {
        if (!values['dry-run'] && !values['allow-network']) fail('Pass --dry-run, or --allow-network to actually fetch.');
        const res = await refreshSources(reg, { allowNetwork: Boolean(values['allow-network']) && !values['dry-run'], ids: values.id });
        res.forEach((r) => out(`  ${r.action.padEnd(17)} ${r.id.padEnd(28)} ${r.detail}`));
        out('No source was marked verified. A person must read changed sources and update verifiedAt in knowledge/sources/registry.yaml.');
        return;
      }
      return fail('Usage: bcr sources status | refresh --dry-run');
    }
    case 'enforce': {
      if (sub !== 'plan') fail('Usage: bcr enforce plan ...');
      const { values } = parseArgs({ args: rest, options: { policy: KV, approvals: KV, provider: KV, overrides: KV, previous: KV, out: KV, 'dry-run': BOOL, 'allow-synthetic': BOOL } });
      if (!values['dry-run']) fail('Only --dry-run planning is supported. Deploy artifacts through your reviewed pipeline.');
      if (!values.policy || !values.approvals || !values.provider) fail('enforce plan needs --policy, --approvals and --provider');
      const policy = loadPolicy(values.policy);
      const approval = checkApproval(policy, loadApprovals(values.approvals));
      const overrides = values.overrides ? loadOverrides(values.overrides) : [];
      const prev = values.previous && existsSync(values.previous) ? (JSON.parse(readTextBounded(values.previous)) as { artifact?: { rules?: Array<{ description: string }> } }).artifact?.rules : undefined;
      const res = compile(policy, approval, overrides.filter((o) => Date.parse(o.expiresAt) > Date.now()), values.provider as ProviderId, { allowSynthetic: values['allow-synthetic'], previousArtifactRules: prev });
      if (values.out) writeText(values.out, JSON.stringify(res, null, 2));
      out(JSON.stringify(res, null, 2));
      out('\nDRY RUN: this artifact is not live protection. Apply it only through an approved, protected deployment.');
      if (res.refused) process.exitCode = 3;
      return;
    }
    case 'alerts': {
      if (sub !== 'test') fail('Usage: bcr alerts test');
      const { values } = parseArgs({ args: rest, options: { transport: KV, send: BOOL } });
      const r = await deliverAlerts([{ dedupeKey: `test:${new Date().toISOString().slice(0, 13)}`, severity: 'info', title: 'bcr test alert', body: 'Test alert from bcr. No action needed.' }], { transport: (values.transport ?? 'dry-run') as TransportName, send: Boolean(values.send) });
      return out(JSON.stringify(r, null, 2));
    }
    case 'review': {
      if (sub === 'verify') {
        const { values } = parseArgs({ args: rest, options: { bundle: KV, repo: KV } });
        if (!values.bundle || !values.repo) fail('Usage: bcr review verify --bundle <dir> --repo <path>');
        const rep = JSON.parse(readTextBounded(join(values.bundle, 'report.json'), 50_000_000)) as { review?: { commit?: string } };
        const f = checkFreshness(rep.review?.commit, resolve(values.repo));
        out(f.message);
        if (!f.fresh) process.exitCode = 4;
        return;
      }
      const { values } = parseArgs({ args: [sub, ...rest].filter(Boolean) as string[], options: { repo: KV, out: KV, intake: KV, ref: KV } });
      if (!values.repo || !values.out) fail('Usage: bcr review --repo <path|github url> --out <dir>');
      let path = values.repo;
      let cleanup: string | undefined;
      if (/^https?:\/\//.test(values.repo)) {
        out('Cloning (read-only, shallow, hooks disabled)...');
        const c = cloneGithubRepository(values.repo, { ref: values.ref, token: process.env.GITHUB_TOKEN });
        path = c.dir; cleanup = c.dir;
      }
      try {
        const intake = values.intake ? loadIntakeFile(values.intake).intake : undefined;
        const review = reviewRepository(resolve(path), intake?.business.stage);
        const r = runAssessment({ intake, review });
        const b = writeBundle(r, resolve(values.out), { repository: review.github ? `https://github.com/${review.github.owner}/${review.github.repo}` : values.repo, commit: review.commit });
        return summary(r, b.dir);
      } finally {
        if (cleanup) rmSync(cleanup, { recursive: true, force: true });
      }
    }
    case 'prompt': {
      const { values } = parseArgs({ args: rest, options: { bundle: KV, finding: KV } });
      if (sub !== 'show' || !values.bundle || !values.finding) fail('Usage: bcr prompt show --bundle <dir> --finding <id>');
      if (!/^[A-Za-z0-9._-]+$/.test(values.finding!)) fail('Invalid finding id.');
      const p = join(values.bundle!, 'prompts', `${values.finding}.md`);
      if (!existsSync(p)) fail(`No prompt for ${values.finding} in ${values.bundle} (info-level findings have none).`);
      return out(readTextBounded(p));
    }
    case 'render': {
      const { values } = parseArgs({ args: [sub, ...rest].filter(Boolean) as string[], options: { from: KV, out: KV } });
      if (!values.from || !values.out) fail('Usage: bcr render --from <report.json> --out <file.md>');
      const data = JSON.parse(readTextBounded(values.from, 50_000_000)) as Parameters<typeof renderMarkdown>[0];
      // report.json omits loaded catalogs; render what is present.
      writeText(values.out, renderMarkdown({ ...data, intake: undefined, security: undefined, compliance: undefined, infrastructure: undefined } as Parameters<typeof renderMarkdown>[0]));
      return out(`Wrote ${values.out} (findings, roadmap, capacity and geo sections; re-run assess for the full narrative).`);
    }
    default:
      fail(`Unknown command "${cmd}".\n\n${HELP}`);
  }
}

function summary(r: ReturnType<typeof runAssessment>, dir: string) {
  const blockers = r.findings.filter((f) => f.launchBlocker);
  out(`Report bundle: ${dir}`);
  out(`  report.md, report.json, report.html, prompts/index.md (${r.findings.filter((f) => f.prompt).length} prompts)`);
  out(`  ${r.findings.length} findings: ${['critical', 'high', 'medium', 'low', 'info'].map((s) => `${r.findings.filter((f) => f.severity === s).length} ${s}`).join(', ')}`);
  if (blockers.length) { out(`  ${blockers.length} BLOCKER(S):`); blockers.slice(0, 8).forEach((f) => out(`    - ${f.id}: ${f.title}`)); }
  if (r.security) out(`  Control readiness ${Math.round(r.security.score.readiness * 100)}%, evidence coverage ${Math.round(r.security.score.evidenceCoverage * 100)}% (reported separately; not an audit opinion)`);
  if (r.sources.unverified) out(`  ${r.sources.unverified} knowledge sources are unverified: see \`bcr sources status\`.`);
}

const OverridesFile = z.object({ overrides: z.array(z.object({ country: z.string(), action: z.enum(['CHALLENGE', 'MONITOR']), clients: z.array(z.enum(['web', 'ios', 'api'])), createdAt: z.string(), expiresAt: z.string(), renewals: z.number().int(), reason: z.string(), signalRef: z.string() })) });
function loadOverrides(p: string): ActiveOverride[] {
  if (!existsSync(p)) return [];
  return OverridesFile.parse(loadStructured(p)).overrides;
}
function loadSignals(p: string) { return z.object({ signals: z.array(ThreatSignal) }).parse(loadStructured(p)).signals; }
function loadGeo(policy: string, approvals?: string, signals?: string, overrides?: string): GeoInput {
  return { policy: loadPolicy(policy), approvals: approvals ? loadApprovals(approvals) : [], signals: signals ? loadSignals(signals) : [], overrides: overrides ? loadOverrides(overrides) : [] };
}

async function geoCmd(sub: string | undefined, rest: string[]) {
  if (sub === 'evaluate') {
    const { values } = parseArgs({ args: rest, options: { policy: KV, approvals: KV, signals: KV, overrides: KV, now: KV, 'auto-challenge': BOOL, 'write-overrides': KV, 'alert-transport': KV, send: BOOL } });
    if (!values.policy || !values.signals) fail('geo evaluate needs --policy and --signals');
    const policy = loadPolicy(values.policy);
    const now = values.now ? new Date(values.now) : new Date();
    const approval = values.approvals ? checkApproval(policy, loadApprovals(values.approvals)) : undefined;
    const res = evaluateSignals(loadSignals(values.signals), policy, values.overrides ? loadOverrides(values.overrides) : [], now, { ...DEFAULT_THREAT_CONFIG, autoEscalateToChallenge: Boolean(values['auto-challenge']) });
    out(`Policy ${policy.policyId} v${policy.version} hash ${policyHash(policy).slice(0, 12)}: ${approval ? (approval.approved ? 'approved for this content' : `NOT approved (${approval.reasons.join(' ')})`) : 'approval not checked'}`);
    for (const d of res.decisions) out(`  ${d.country} ${d.outcome}: ${d.reasons.join(' ')}${d.nativeClientAdvice ? ` ${d.nativeClientAdvice}` : ''}${d.override ? ` [override expires ${d.override.expiresAt}]` : ''}`);
    if (values['write-overrides']) writeText(values['write-overrides'], JSON.stringify({ overrides: res.overrides }, null, 2));
    const alerts = res.decisions.filter((d) => d.alert).map((d) => ({ ...d.alert!, body: d.reasons.join(' ') }));
    if (alerts.length) {
      const r = await deliverAlerts(alerts, { transport: (values['alert-transport'] ?? 'dry-run') as TransportName, send: Boolean(values.send), stateFile: '.bcr/alerts-sent.json' });
      r.forEach((x) => out(`  alert ${x.status}: ${x.dedupeKey}`));
    }
    out('Dry-run evaluation: no edge rule was changed. Signals can never create a permanent block.');
    return;
  }
  if (sub === 'feed') {
    const { values } = parseArgs({ args: rest, options: { policy: KV, snapshot: KV, previous: KV, store: KV, now: KV } });
    if (!values.policy) fail('geo feed needs --policy');
    const policy = loadPolicy(values.policy);
    let raw: string | undefined; let err: string | undefined;
    try { raw = values.snapshot ? readTextBounded(values.snapshot) : undefined; if (!raw) err = 'no snapshot supplied'; } catch (e) { err = (e as Error).message; }
    let prev: StoredSnapshot | undefined;
    if (values.previous && existsSync(values.previous)) {
      const p = JSON.parse(readFileSync(values.previous, 'utf8')) as StoredSnapshot | StoredSnapshot['snapshot'];
      prev = 'snapshot' in p ? p : { snapshot: p, sha256: '', storedAt: '' };
    }
    const res = processSanctionsFeed(raw, err, prev, policy, values.now ? new Date(values.now) : new Date());
    out(`${res.status.toUpperCase()}: ${res.message}`);
    if (res.status === 'changed') out(JSON.stringify({ diff: res.diff, proposal: res.proposal }, null, 2));
    if ((res.status === 'changed' || res.status === 'unchanged') && values.store) writeText(values.store, JSON.stringify(res.snapshot, null, 2));
    if (res.status === 'failed' || res.status === 'stale') process.exitCode = 5;
    return;
  }
  fail('Usage: bcr geo evaluate|feed ...');
}

main(process.argv.slice(2)).catch((err: unknown) => {
  if (err instanceof InputError || err instanceof z.ZodError) fail(`Error: ${err instanceof z.ZodError ? err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : err.message}`, 2);
  fail(`Error: ${(err as Error).message}`, 1);
});
