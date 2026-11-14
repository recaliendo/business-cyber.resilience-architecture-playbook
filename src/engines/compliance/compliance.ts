// Compliance positioning: legal/platform/contractual obligations kept separate from voluntary
// attestations. Results are screening outputs for counsel, never legal conclusions.
import type { BusinessProfile, Finding, ObligationCatalog, ObligationDef, SourceRegistry } from '../../domain/schemas.js';
import { makeFinding } from '../../domain/findings.js';
import type { ControlResult } from '../../evidence/scoring.js';
import { RULES, APPLICABILITY_RULES_VERSION, type ApplicabilityResult } from './applicability.js';

export interface ObligationResult extends ApplicabilityResult {
  obligation: ObligationDef;
  sourcesVerified: boolean;
  unverifiedSources: string[];
  relatedControlStates: Array<{ controlId: string; state: string }>;
}

export interface Soc2Positioning {
  recommendation: 'not_now' | 'monitor_triggers' | 'evaluate_now' | 'pursue';
  reasoning: string[];
  triggers: string[];
  paths: string[];
  typeIEstimate: { weeks: string; costUsd: string; caveats: string[] };
  isoNote: string;
  readiness: { controlReadiness: number; evidenceCoverage: number; note: string };
}

export interface ComplianceReport {
  catalogVersion: string;
  rulesVersion: string;
  results: ObligationResult[];
  soc2: Soc2Positioning;
  findings: Finding[];
  counselQuestions: string[];
}

export function assessCompliance(
  b: BusinessProfile, catalog: ObligationCatalog, sources: SourceRegistry, controls: ControlResult[],
  scores: { readiness: number; evidenceCoverage: number },
): ComplianceReport {
  const srcById = new Map(sources.sources.map((s) => [s.id, s]));
  const stateById = new Map(controls.map((c) => [c.control.id, c.state]));
  const results: ObligationResult[] = catalog.obligations.map((ob) => {
    const rule = RULES[ob.id];
    const res: ApplicabilityResult = rule
      ? rule(b)
      : { status: 'uncertain', reasoning: ['No applicability rule is implemented for this obligation yet.'], counselQuestions: [], notes: [] };
    const unverified = ob.sourceIds.filter((id) => !srcById.get(id)?.verifiedAt);
    return {
      ...res, obligation: ob, sourcesVerified: unverified.length === 0, unverifiedSources: unverified,
      relatedControlStates: ob.relatedControls.map((id) => ({ controlId: id, state: stateById.get(id) ?? 'unknown' })),
    };
  });

  const findings: Finding[] = [];
  for (const r of results) {
    const ob = r.obligation;
    if (ob.category === 'voluntary' || r.status === 'not_applicable') continue;
    const gaps = r.relatedControlStates.filter((c) => c.state !== 'met' && c.state !== 'not_applicable');
    const applicable = r.status === 'applicable';
    findings.push(makeFinding({
      key: ob.id, ruleId: `CMP-${ob.id}`, ruleVersion: `${catalog.version}/${APPLICABILITY_RULES_VERSION}`,
      title: applicable ? `${ob.title} applies: confirm implementation and evidence` : `${ob.title}: applicability uncertain`,
      domains: ['compliance'], category: `${ob.category}:${ob.ruleCategory}`, affected: { assets: [], controls: ob.relatedControls, files: [] },
      severity: applicable && ob.launchBlockerIfApplicable ? 'high' : applicable ? 'medium' : 'low',
      // Implementation of legal/platform obligations isn't evidenced by this intake, so an applicable
      // launch-blocking obligation stays a blocker until its evidence is recorded.
      launchBlocker: applicable && ob.launchBlockerIfApplicable,
      confidence: r.sourcesVerified ? 'medium' : 'low', status: applicable ? 'requires_verification' : 'suspected',
      provenance: 'inferred', evidenceLevel: 'self_reported',
      observed: r.reasoning.join(' '),
      expected: applicable ? `Required artefacts in place: ${ob.requiredEvidence.join('; ') || 'see obligation'}.` : 'Applicability determined, with reasoning recorded.',
      scenario: applicable ? `A regulator, platform reviewer or contract counterparty asks for evidence of ${ob.title} compliance.` : 'An obligation that does apply goes unaddressed because its scope was never settled.',
      businessImpact: ob.category === 'platform' ? 'App rejection or removal.' : ob.category === 'contractual' ? 'Loss of the ability to take payments, or contract penalties.' : 'Regulatory enforcement, fines, or civil claims.',
      insights: [...r.notes, ...(gaps.length ? [`Related controls not met: ${gaps.map((g) => `${g.controlId} (${g.state})`).join(', ')}.`] : [])],
      limitations: [
        'Screening result, not legal advice.',
        ...(r.sourcesVerified ? [] : [`Supporting sources not yet verified: ${r.unverifiedSources.join(', ')}.`]),
      ],
      references: ob.sourceIds.map((id) => ({ title: srcById.get(id)?.title ?? id, url: srcById.get(id)?.url ?? '', sourceId: id })),
      remediation: { summary: ob.remediation, steps: ob.counselReview ? ['Confirm applicability with counsel before relying on this result.'] : [] },
      ownerRole: ob.counselReview ? 'Founder with counsel' : 'Founder', effortHours: { low: 2, high: 16 },
      validation: applicable ? `Evidence on file: ${ob.requiredEvidence.join('; ') || 'as listed'}.` : 'Applicability decision documented in the compliance applicability register.',
      acceptanceCriteria: ['Decision and evidence recorded in templates/consultant/compliance-applicability-register.md.'],
      applicableStage: b.stage, reassessWhen: 'New market, data type, feature (AI, payments, children), or a change in the law.',
    }));
  }

  return {
    catalogVersion: catalog.version, rulesVersion: APPLICABILITY_RULES_VERSION, results,
    soc2: positionSoc2(b, scores), findings,
    counselQuestions: [...new Set(results.flatMap((r) => r.counselQuestions))],
  };
}

export function positionSoc2(b: BusinessProfile, scores: { readiness: number; evidenceCoverage: number }): Soc2Positioning {
  const reasoning: string[] = [];
  const triggers = [
    'An enterprise prospect requires a SOC 2 report or ISO 27001 certificate in procurement.',
    'Security questionnaires are slowing or blocking deals.',
    'A contract, partner or regulator requires an attestation.',
    'Revenue is blocked by security review (record which deals).',
  ];
  let rec: Soc2Positioning['recommendation'];
  const demand = [b.enterpriseDealsInPipeline, b.securityQuestionnairesReceived, b.revenueBlockedBySecurityReview];
  if (b.revenueBlockedBySecurityReview === 'yes') {
    rec = 'pursue';
    reasoning.push('Revenue is reported as blocked by security review: that is the clearest trigger for an attestation.');
  } else if (b.model !== 'b2c' && demand.includes('yes')) {
    rec = 'evaluate_now';
    reasoning.push('Enterprise deals or security questionnaires are appearing. Evaluate SOC 2 and/or ISO 27001 against what those buyers actually ask for.');
  } else if (b.model === 'b2c') {
    rec = 'not_now';
    reasoning.push('B2C: put applicable law, platform requirements and security foundations first. SOC 2 is not generally a legal launch requirement, and consumers rarely ask for it.');
  } else if (b.model === 'unknown') {
    rec = 'monitor_triggers';
    reasoning.push('The business model is unknown, so positioning is uncertain.');
  } else {
    rec = 'monitor_triggers';
    reasoning.push('B2B or hybrid with no reported buyer demand yet: build the foundations and evidence habits now, and watch the triggers below.');
  }
  return {
    recommendation: rec, reasoning, triggers,
    paths: [
      'Type I (control design at a point in time), then Type II (operating effectiveness over an observation period, often 3 to 12 months). A common path, but Type I is optional.',
      'Straight to Type II, when buyers want operating evidence and controls have already run for a while.',
      '"Type I complete, Type II observation in progress" helps in some buyer conversations. Do not assume most or all buyers will accept it.',
    ],
    typeIEstimate: {
      weeks: '~6-12 weeks', costUsd: '~$10k-$25k',
      caveats: [
        'Illustrative planning assumption only, not a quote or promise.',
        'Assumes compliance-automation tooling, a small scope and moderate existing maturity.',
        'Audit fees, tooling subscriptions, penetration tests and remediation effort vary widely and may be excluded.',
        'Estimate source and date: playbook planning heuristic (2026); unverified against current market pricing.',
      ],
    },
    isoNote: 'ISO/IEC 27001 certifies an information security management system. It is common with EU and global buyers and is not interchangeable with SOC 2. Choose one or both based on what buyers, markets and scope require.',
    readiness: {
      controlReadiness: scores.readiness, evidenceCoverage: scores.evidenceCoverage,
      note: 'These measure the playbook control catalog. They are not an audit opinion, and no score means "SOC 2 compliant" or "certified".',
    },
  };
}
