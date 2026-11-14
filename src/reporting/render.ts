// Report bundle: report.md (business summary + engineering detail), report.json, report.html,
// prompts/<finding-id>.md and prompts/index.md. Everything is redacted before it is written.
import { join } from 'node:path';
import type { Finding } from '../domain/schemas.js';
import type { AssessmentResult } from '../assess.js';
import { redact, redactDeep } from '../lib/redact.js';
import { writeText } from '../lib/io.js';
import { buildPrompt, promptPath, type PromptContext } from './prompts.js';
import { SUPPORT_LABEL } from '../engines/compliance/compliance.js';

export interface BundleOutput { dir: string; files: string[] }

const pct = (n: number) => `${Math.round(n * 100)}%`;
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const H = { next_day: 'Next day', d30: 'Within 30 days', d60: 'Within 60 days', d90: 'Within 90 days', later: 'Later' } as const;

export function attachPrompts(r: AssessmentResult, ctx: PromptContext): void {
  for (const f of r.findings) {
    if (f.severity === 'info') continue;
    f.prompt = { path: promptPath(f), text: buildPrompt(f, ctx) };
  }
}

export function renderMarkdown(r: AssessmentResult): string {
  const L: string[] = [];
  const blockers = r.findings.filter((f) => f.launchBlocker);
  const top = r.findings.filter((f) => f.severity === 'critical' || f.severity === 'high').slice(0, 7);
  L.push(`# ${r.meta.title}`, '', `Generated ${r.meta.generatedAt} by ${r.meta.tool}. Rule versions: ${Object.entries(r.meta.ruleVersions).map(([k, v]) => `${k} ${v}`).join(', ')}. Inputs hash \`${r.meta.inputsHash.slice(0, 16)}\`.`, '');
  L.push('> This report is a screening tool. It is not legal advice, an audit opinion, or proof of compliance, capacity or live protection. Scores never mean "compliant" or "certified".', '');

  // ---------- Part 1: business summary ----------
  L.push('## Part 1: Business summary', '');
  L.push('### 1. Executive assessment and immediate decisions', '');
  if (r.review) L.push(`**Reviewed:** ${r.review.github ? `${r.review.github.owner}/${r.review.github.repo}` : 'local checkout'} at commit \`${r.review.commit ?? 'unknown'}\` (${r.review.filesReviewed} files read).`, '');
  L.push(blockers.length ? `**${blockers.length} blocker(s) need attention before anything else**, whatever the scores say:` : '**No launch blockers were identified** from the information supplied.', '');
  for (const f of blockers.slice(0, 10)) L.push(`- **${f.title}** (${f.severity}, ${f.status}). ${f.businessImpact} [Details](#${anchor(f.id)})`);
  if (blockers.length) L.push('');
  if (top.length) {
    L.push('Most consequential findings:', '');
    for (const f of top) L.push(`- ${f.title}: ${f.businessImpact}`);
    L.push('');
  }
  if (r.security) {
    const s = r.security.score;
    L.push(`Security control readiness **${pct(s.readiness)}**, evidence coverage **${pct(s.evidenceCoverage)}** (observed evidence ${pct(s.observedCoverage)}). Controls: ${s.counts.met} met, ${s.counts.partial} partial, ${s.counts.unmet} unmet, ${s.counts.unknown} unknown, ${s.counts.not_applicable} not applicable. Unknown never counts as met. See [scoring](../docs/consultant/scoring.md) if viewing in the repository.`, '');
  }
  if (r.compliance) L.push(`SOC 2 positioning: **${r.compliance.soc2.recommendation.replace(/_/g, ' ')}**. ${r.compliance.soc2.reasoning.join(' ')}`, '');

  L.push('### 2. Known facts, assumptions and missing information', '');
  if (r.intake) {
    L.push(`Intake completeness: ${r.intake.completeness.answered}/${r.intake.completeness.total} key areas answered.`, '');
    if (r.intake.assumptions.length) { L.push('Assumptions:', ...r.intake.assumptions.map((a) => `- ${a}`), ''); }
    if (r.intake.questions.length) { L.push('Questions that would unblock conclusions:', ...r.intake.questions.map((q) => `- **${q.question}** _(unblocks: ${q.blocks.join(', ')})_`), ''); }
  }
  if (r.review) L.push('Evidence boundary for the repository review:', ...r.review.evidenceBoundary.map((b) => `- ${b}`), '', 'Limitations:', ...r.review.limitations.map((b) => `- ${b}`), '');
  const c = r.sources.counts;
  L.push(`Sources (${r.sources.total}): ${c.human_verified} human-verified, ${c.machine_verified} machine-verified awaiting human sign-off, ${c.partially_verified} partially verified, ${c.stale} stale, ${c.unverified} unverified. Machine verification means a tool read the source and checked each claim our rules rely on; it is not legal review. Conclusions resting on partially verified, stale or unverified sources are marked low confidence.`, '');

  // ---------- Part 2: engineering detail ----------
  L.push('## Part 2: Engineering detail', '');
  L.push('### 3. Architecture and current health', '');
  if (r.review) {
    const inv = r.review.inventory;
    L.push(`- Languages: ${inv.languages.map((l) => `${l.language} (${l.files})`).join(', ') || 'none detected'}`);
    L.push(`- Frameworks: ${inv.frameworks.join(', ') || 'none detected'}; integrations: ${inv.integrations.join(', ') || 'none detected'}`);
    L.push(`- Entry points: ${inv.entryPoints.length ? inv.entryPoints.map((e) => `\`${e}\``).join(', ') : 'none detected'}`);
    L.push(`- Migrations: ${inv.migrations.length}; CI configs: ${inv.ci.length}; IaC/hosting config: ${inv.iac.map((e) => `\`${e}\``).join(', ') || 'none'}`);
    L.push(`- iOS: ${inv.ios.xcodeProjects.length ? `${inv.ios.xcodeProjects.length} Xcode project(s), ${inv.ios.privacyManifests.length} privacy manifest(s)` : 'no Xcode project'}`, '');
  }
  if (r.infrastructure) {
    const i = r.infrastructure;
    if (i.criticalDependencies.length) { L.push('Critical-journey dependencies (declared):', ...i.criticalDependencies.map((d) => `- ${d.journey}: ${d.dependsOn.join(' -> ')}`), ''); }
    if (i.unknowns.length) { L.push('Declared controls still unknown:', ...i.unknowns.map((u) => `- ${u.component}: ${u.controls.join(', ')}`), ''); }
    if (i.singleRegion.length) L.push(`Single-region data stores: ${i.singleRegion.join(', ')}. This is a reasonable default unless measured availability, latency or residency needs require more.`, '');
  }
  if (!r.review && !r.infrastructure) L.push('_No architecture input supplied._', '');

  L.push('### 4. Capacity, storage runway, costs and bottlenecks', '');
  if (r.capacity) {
    const c = r.capacity;
    if (c.arrival) L.push(`Peak arrival rate: **${round(c.arrival.peakRps)} req/s** (${c.arrival.basis}).`, '');
    if (c.scenarios.length) {
      L.push('| Scenario | Peak req/s | Burst req/s | Concurrency (Little\'s Law) | Compute util. | DB busy conns | Evidence | Monthly cost (USD) |', '|---|---|---|---|---|---|---|---|');
      for (const s of c.scenarios) L.push(`| ${s.scenario.name} | ${s.peakRps} | ${s.burstRps} | ${s.requiredComputeConcurrency} | ${s.computeUtilisation === undefined ? 'unknown' : pct(s.computeUtilisation)} | ${s.dbBusyConnections} | ${s.evidence} | ${s.monthlyCostUsd ? `${s.monthlyCostUsd.low}-${s.monthlyCostUsd.high}` : 'not estimated'} |`);
      L.push('');
      for (const s of c.scenarios) if (s.bottlenecks.length) L.push(`- **${s.scenario.name}** bottlenecks: ${s.bottlenecks.join('; ')}`);
      L.push('', '"Projected" figures come from the supplied assumptions. Only "demonstrated" figures are backed by a passing load test.', '');
    }
    for (const f of c.storage) {
      const last = f.points[f.points.length - 1]!;
      const p12 = f.points[12] ?? last;
      L.push(`- Storage (${f.scenario.name}): month 12: DB ${p12.databaseGb} GB, objects ${p12.objectGbPhysical} GB physical, backups ${p12.backupGb} GB, logs ${p12.logGb} GB. Quota exhaustion: DB ${f.databaseExhaustionMonth ?? 'not within 24 months / no quota'}, objects ${f.objectExhaustionMonth ?? 'not within 24 months / no quota'}.`);
    }
    L.push('', 'Storage assumptions:', ...[...new Set(c.storage.flatMap((s) => s.notes))].map((n) => `- ${n}`), '');
    if (c.sensitivity.length) L.push('Sensitivity:', ...c.sensitivity.map((s) => `- ${s}`), '');
    if (c.missingMeasurements.length) L.push('Missing measurements:', ...c.missingMeasurements.map((s) => `- ${s}`), '');
    if (c.assumptions.length) L.push('Capacity assumptions:', ...c.assumptions.map((s) => `- ${s}`), '');
  } else L.push('_No workload data supplied; no capacity forecast._', '');

  L.push('### 5. Security gaps and resilience evidence', '');
  if (r.security) {
    L.push('| Control | State | Provenance | Evidence age (days) | Notes |', '|---|---|---|---|---|');
    for (const c of r.security.results) L.push(`| ${c.control.id} ${cell(c.control.title)} | ${c.state} | ${c.provenance} | ${c.evidenceAgeDays ?? '-'} | ${cell([c.justification, ...c.notes].filter(Boolean).join(' '))} |`);
    L.push('', `Quick-win package: ${r.security.quickWins.controls.join(', ') || 'nothing open'} (${r.security.quickWins.effortHours.low}-${r.security.quickWins.effortHours.high} h). ${r.security.quickWins.note}`, '');
    L.push('Deliberately deferred:', ...r.security.deferred.map((d) => `- ${d}`), '');
  } else L.push('_No intake supplied: control posture not assessed._', '');

  L.push('### 6. Legal, platform and contractual positioning', '');
  if (r.compliance) {
    L.push('| Obligation | Category | Status | Reasoning | Source support |', '|---|---|---|---|---|');
    for (const o of r.compliance.results.filter((x) => x.obligation.category !== 'voluntary')) L.push(`| ${cell(o.obligation.title)} | ${o.obligation.category} | **${o.status.replace('_', ' ')}** | ${cell(o.reasoning.join(' '))} | ${SUPPORT_LABEL[o.sourceSupport]} |`);
    L.push('', 'These are screening results for discussion with counsel, not legal conclusions.', '');
  } else L.push('_Not assessed._', '');

  L.push('### 7. SOC 2 and ISO 27001 positioning', '');
  if (r.compliance) {
    const s = r.compliance.soc2;
    L.push(`Recommendation: **${s.recommendation.replace(/_/g, ' ')}**. ${s.reasoning.join(' ')}`, '', 'Triggers to watch:', ...s.triggers.map((t) => `- ${t}`), '', 'Paths:', ...s.paths.map((p) => `- ${p}`), '');
    L.push(`Illustrative Type I planning range: ${s.typeIEstimate.weeks}, ${s.typeIEstimate.costUsd}.`, ...s.typeIEstimate.caveats.map((c) => `- ${c}`), '');
    L.push(`Control readiness ${pct(s.readiness.controlReadiness)} and evidence coverage ${pct(s.readiness.evidenceCoverage)}, reported separately. ${s.readiness.note}`, '', s.isoNote, '');
  } else L.push('_Not assessed._', '');

  L.push('### 8. Sanctions and threat geo-policy posture', '');
  if (r.geo) {
    const g = r.geo;
    L.push(`Policy \`${g.policyId}\` v${g.version} (hash \`${g.policyHash.slice(0, 12)}\`): ${g.sanctionsRules} sanctions rule(s), ${g.threatRules} threat rule(s). Approval: **${g.approval.approved ? 'bound to this content' : 'NOT approved'}**. ${g.approval.reasons.join(' ')}`, '');
    L.push(`Quarterly review due ${g.reviewDue}${g.reviewOverdue ? ' (**overdue**)' : ''}.`, '');
    if (g.decisions.length) { L.push('| Country | Outcome | Reasoning |', '|---|---|---|'); for (const d of g.decisions) L.push(`| ${d.country} | ${d.outcome} | ${cell([...d.reasons, d.nativeClientAdvice].filter(Boolean).join(' '))} |`); L.push(''); }
    L.push(g.note, '');
  } else L.push('_No geo-policy supplied._', '');

  L.push('### 9. Roadmap', '');
  for (const h of Object.keys(H) as Array<keyof typeof H>) {
    const items = r.roadmap.filter((i) => i.horizon === h);
    if (!items.length) continue;
    L.push(`#### ${H[h]}`, '', '| Priority | Action | Owner | Effort (h) | Cost (USD) | Done when |', '|---|---|---|---|---|---|');
    for (const i of items) L.push(`| ${i.priority} | ${cell(i.title)} | ${cell(i.ownerRole)} | ${i.effortHours.low}-${i.effortHours.high} | ${i.costUsd ? `${i.costUsd.low}-${i.costUsd.high}` : '-'} | ${cell(i.completionCriteria.join('; '))} |`);
    L.push('');
  }

  L.push('### 10. Findings, validation, and questions for counsel or auditors', '');
  L.push('Remediation prompts: [prompts/index.md](prompts/index.md)', '');
  for (const f of r.findings) L.push(...renderFinding(f));
  if (r.compliance?.counselQuestions.length) L.push('#### Questions for counsel', '', ...r.compliance.counselQuestions.map((q) => `- ${q}`), '');
  L.push('#### Questions for a qualified auditor (when an attestation is pursued)', '', '- Which trust services criteria and systems should be in scope for our buyers?', '- Will compensating controls for a solo or very small team be accepted, and how should we evidence them?', '- What observation period suits our first Type II?', '');
  return redact(L.join('\n'));
}

function renderFinding(f: Finding): string[] {
  const L: string[] = [];
  L.push(`<a id="${anchor(f.id)}"></a>`, `#### ${f.id}: ${f.title}`, '');
  L.push(`**A. Finding**: ${f.severity} / ${f.priority}, confidence ${f.confidence}, ${f.status.replace('_', ' ')}, evidence level ${f.evidenceLevel.replace('_', ' ')}${f.launchBlocker ? ', **blocker**' : ''}. Domains: ${f.domains.join(', ')}. Category: ${f.category}.`, '');
  if (f.affected.files.length || f.affected.assets.length || f.affected.controls.length) L.push(`Affected: ${[...f.affected.files.map((x) => `\`${x}\``), ...f.affected.assets, ...f.affected.controls].join(', ')}`, '');
  L.push(`- Observed: ${f.observed}`, `- Expected: ${f.expected}`, `- Scenario: ${f.scenario}`, `- Business impact: ${f.businessImpact}`, '');
  L.push('**B. Insights and commentary**', '');
  for (const e of f.evidence) L.push(`- Evidence (${e.kind}): ${e.url ? `[${e.ref}](${e.url})` : `\`${e.ref}\``}`);
  for (const i of f.insights) L.push(`- ${i}`);
  for (const a of f.assumptions) L.push(`- Assumption: ${a}`);
  for (const l of f.limitations) L.push(`- Limitation: ${l}`);
  for (const ref of f.references) L.push(`- Reference: [${ref.title}](${ref.url})${ref.sourceId ? ` (${ref.sourceId})` : ''}`);
  L.push('', '**C. Recommendation**', '', f.remediation.summary, '');
  if (f.remediation.steps.length) L.push(...f.remediation.steps.map((s, i) => `${i + 1}. ${s}`), '');
  if (f.remediation.alternatives.length) L.push('Alternatives:', ...f.remediation.alternatives.map((a) => `- ${a}`), '');
  if (f.remediation.illustrativeCode) L.push('Illustrative code (not tested, not production-ready):', '', '```', f.remediation.illustrativeCode, '```', '');
  L.push(`Owner: ${f.ownerRole}. Effort: ${f.effortHours.low}-${f.effortHours.high} h${f.costUsd ? `. Cost: $${f.costUsd.low}-${f.costUsd.high}` : ''}${f.dependencies.length ? `. Depends on: ${f.dependencies.join(', ')}` : ''}.`, '');
  L.push(`Validation: ${f.validation}`, '', `Reassess: ${f.reassessWhen}`, '');
  if (f.prompt) L.push(`[Open Claude Code remediation prompt](${f.prompt.path})`, '');
  L.push('**D. Third-party options**', '');
  if (f.vendorOptions.length) for (const v of f.vendorOptions) L.push(`- **${v.name}**: ${v.addresses}. ${v.whyNotNative} You keep responsibility for: ${v.retainedResponsibilities}. Fit: ${v.stageFit}. Pricing: ${v.pricingNote}. Limits: ${v.limitations}.${v.lowerCostAlternative ? ` Lower-cost alternative: ${v.lowerCostAlternative}.` : ''}`);
  else L.push('A code or configuration change is sufficient; no external product is needed.');
  L.push('', '---', '');
  return L;
}

export function renderPromptIndex(r: AssessmentResult): string {
  const L = ['# Remediation prompts', '', 'Each file is a proposed Claude Code prompt for one finding. Open it, review it, and copy it into Claude Code. Opening a file does not launch anything.', '', '| Finding | Severity | Prompt |', '|---|---|---|'];
  for (const f of r.findings) if (f.prompt) L.push(`| ${cell(f.title)} | ${f.severity} | [${f.id}](${f.id}.md) |`);
  return L.join('\n') + '\n';
}

export function renderHtml(r: AssessmentResult): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const rows = r.findings.map((f) => `
<section class="finding" id="${e(anchor(f.id))}">
  <h3>${e(f.id)}: ${e(f.title)}</h3>
  <p class="meta"><span class="sev ${e(f.severity)}">${e(f.severity)}</span> ${e(f.priority)} &middot; ${e(f.status)} &middot; confidence ${e(f.confidence)}${f.launchBlocker ? ' &middot; <strong>blocker</strong>' : ''}</p>
  <p><strong>Observed:</strong> ${e(f.observed)}</p>
  <p><strong>Impact:</strong> ${e(f.businessImpact)}</p>
  <p><strong>Fix:</strong> ${e(f.remediation.summary)}</p>
  ${f.evidence.length ? `<ul>${f.evidence.map((x) => `<li>${x.url && /^https:\/\//.test(x.url) ? `<a href="${e(x.url)}" rel="noopener noreferrer">${e(x.ref)}</a>` : e(x.ref)}</li>`).join('')}</ul>` : ''}
  ${f.prompt ? `<details><summary>Remediation prompt</summary>
    <p><a href="${e(f.prompt.path)}">Open remediation prompt</a> <button type="button" class="copy" data-target="p-${e(f.id)}" aria-label="Copy remediation prompt for ${e(f.id)}">Copy prompt</button>
    <a href="${e(f.prompt.path)}" download>Download</a></p>
    <pre id="p-${e(f.id)}" tabindex="0">${e(f.prompt.text)}</pre></details>` : ''}
</section>`).join('\n');
  const s = r.security?.score;
  return redact(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'none'">
<title>${e(r.meta.title)}</title>
<style>
:root{--bg:#fff;--fg:#1b1f24;--muted:#57606a;--border:#d0d7de;--crit:#b42318;--high:#c2410c;--med:#a16207;--low:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0d1117;--fg:#e6edf3;--muted:#9da7b3;--border:#30363d}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem}
.finding{border-top:1px solid var(--border);padding:.5rem 0}.meta{color:var(--muted)}
.sev{font-weight:600;padding:0 .4rem;border-radius:4px;color:#fff}.critical{background:var(--crit)}.high{background:var(--high)}.medium{background:var(--med)}.low,.info{background:var(--low)}
pre{white-space:pre-wrap;border:1px solid var(--border);padding:.75rem;border-radius:6px;overflow-x:auto}
button{font:inherit;padding:.2rem .6rem;cursor:pointer}a{color:inherit}
</style></head><body>
<h1>${e(r.meta.title)}</h1>
<p class="meta">Generated ${e(r.meta.generatedAt)} by ${e(r.meta.tool)}. Screening output, not legal advice, an audit opinion, or proof of live protection.</p>
${s ? `<p>Control readiness <strong>${pct(s.readiness)}</strong> &middot; evidence coverage <strong>${pct(s.evidenceCoverage)}</strong> &middot; blockers <strong>${r.findings.filter((f) => f.launchBlocker).length}</strong></p>` : ''}
<p>Full narrative: <a href="report.md">report.md</a> &middot; data: <a href="report.json">report.json</a> &middot; prompts: <a href="prompts/index.md">index</a></p>
<h2>Findings (${r.findings.length})</h2>
${rows}
<script>
document.querySelectorAll('button.copy').forEach(function(b){b.addEventListener('click',function(){var t=document.getElementById(b.dataset.target);if(!t)return;navigator.clipboard.writeText(t.textContent).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy prompt'},1500)},function(){b.textContent='Copy failed: select the text manually'})})});
</script>
</body></html>
`);
}

export function writeBundle(r: AssessmentResult, dir: string, ctx: PromptContext): BundleOutput {
  attachPrompts(r, ctx);
  const files: string[] = [];
  const put = (rel: string, content: string) => { writeText(join(dir, rel), content); files.push(rel); };
  put('report.md', renderMarkdown(r));
  put('report.json', JSON.stringify(redactDeep(toJson(r)), null, 2));
  put('report.html', renderHtml(r));
  for (const f of r.findings) if (f.prompt) put(f.prompt.path, f.prompt.text);
  put('prompts/index.md', renderPromptIndex(r));
  put('README.md', '# Assessment bundle\n\nOpen report.html in a browser or report.md on GitHub. This bundle may contain sensitive information about your systems. Keep it out of public repositories (the playbook ignores assessments/ and reports/ by default).\n');
  return { dir, files };
}

/** JSON form: everything except the loaded catalogs, with stable field names. */
export function toJson(r: AssessmentResult): unknown {
  return {
    meta: r.meta,
    intake: r.intake ? { questions: r.intake.questions, assumptions: r.intake.assumptions, completeness: r.intake.completeness } : undefined,
    security: r.security ? { catalogVersion: r.security.catalogVersion, score: r.security.score, controls: r.security.results.map((c) => ({ id: c.control.id, title: c.control.title, state: c.state, provenance: c.provenance, evidenceIds: c.evidenceIds, evidenceAgeDays: c.evidenceAgeDays, stale: c.stale, justification: c.justification, notes: c.notes })), quickWins: r.security.quickWins, deferred: r.security.deferred } : undefined,
    compliance: r.compliance ? { catalogVersion: r.compliance.catalogVersion, rulesVersion: r.compliance.rulesVersion, obligations: r.compliance.results.map((o) => ({ id: o.obligation.id, title: o.obligation.title, category: o.obligation.category, status: o.status, reasoning: o.reasoning, notes: o.notes, counselQuestions: o.counselQuestions, sourceSupport: o.sourceSupport, weakSources: o.weakSources, counselReview: o.obligation.counselReview })), soc2: r.compliance.soc2, counselQuestions: r.compliance.counselQuestions } : undefined,
    capacity: r.capacity, infrastructure: r.infrastructure ? { ...r.infrastructure, findings: undefined } : undefined,
    geo: r.geo, review: r.review ? { ...r.review, findings: undefined } : undefined,
    sources: r.sources,
    findings: r.findings,
    roadmap: r.roadmap,
  };
}

const anchor = (id: string) => `finding-${id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
const round = (n: number) => Math.round(n * 100) / 100;
