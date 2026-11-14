// Security posture: evaluates the control catalog against supplied evidence.
import type { ControlCatalog, EvidenceItem, Finding, Stage } from '../../domain/schemas.js';
import { makeFinding } from '../../domain/findings.js';
import { evaluateControls, score, type ControlResult, type Score } from '../../evidence/scoring.js';

export interface QuickWinPackage { controls: string[]; effortHours: { low: number; high: number }; note: string }
export interface SecurityReport {
  catalogVersion: string;
  results: ControlResult[];
  score: Score;
  findings: Finding[];
  quickWins: QuickWinPackage;
  deferred: string[];
}

export function assessSecurity(catalog: ControlCatalog, evidence: EvidenceItem[], stage: Stage, teamSize: number, now: Date): SecurityReport {
  const results = evaluateControls(catalog.controls, evidence, stage, now);
  const findings: Finding[] = [];
  for (const r of results) {
    if (r.state === 'met' || r.state === 'not_applicable') continue;
    const c = r.control;
    const unknown = r.state === 'unknown';
    const insights = [...r.notes];
    if (teamSize === 1 && c.soloFounderAlternative) insights.push(`Solo-founder option: ${c.soloFounderAlternative}`);
    findings.push(makeFinding({
      key: c.id, ruleId: `SEC-${c.id}`, ruleVersion: catalog.version,
      title: unknown ? `${c.title}: no current evidence` : `${c.title}: ${r.state}`,
      domains: ['security'], category: c.domain, affected: { assets: [], controls: [c.id], files: [] },
      // An unknown is not a confirmed gap: it is reported one level lower, but blockers stay blockers.
      severity: unknown && !c.blockerIfUnmet ? lower(c.severityIfUnmet) : c.severityIfUnmet,
      launchBlocker: c.blockerIfUnmet, // any non-met state of a blocker control (matches score().blockers)
      confidence: unknown ? 'low' : r.provenance === 'observed' ? 'high' : 'medium',
      status: unknown ? 'requires_verification' : 'confirmed',
      provenance: r.provenance, evidenceLevel: unknown ? 'none' : r.provenance === 'observed' ? 'deployed_evidence' : 'self_reported',
      observed: unknown ? (r.stale ? 'Evidence exists but is too old to rely on.' : 'No evidence was supplied for this control.') : `Evidence reports this control as ${r.state}.`,
      expected: c.description,
      scenario: scenarioFor(c.domain), businessImpact: impactFor(c.domain),
      insights, limitations: unknown ? ['State is unknown, not failed. Supplying evidence may close this finding.'] : [],
      evidence: r.evidenceIds.map((id) => ({ kind: 'evidence_item' as const, ref: id })),
      remediation: { summary: c.remediation, steps: [`Collect: ${c.evidenceRequired.join('; ')}.`] },
      ownerRole: c.ownerRole, effortHours: c.effortHours, costUsd: c.costUsd, dependencies: c.dependsOn,
      validation: c.validation, acceptanceCriteria: [c.validation, `Evidence no older than ${c.evidenceMaxAgeDays} days recorded for ${c.id}.`],
      applicableStage: c.minStage, reassessWhen: `Every ${c.evidenceMaxAgeDays} days or on material change.`,
      vendorOptions: VENDOR_OPTIONS[c.id] ?? [],
    }));
  }
  const open = results.filter((r) => r.control.quickWin && r.state !== 'met' && r.state !== 'not_applicable');
  const quickWins: QuickWinPackage = {
    controls: open.map((r) => r.control.id),
    effortHours: { low: sum(open.map((r) => r.control.effortHours.low)), high: sum(open.map((r) => r.control.effortHours.high)) },
    note: 'MFA, branch protection, audit logging and dependency/secret scanning. Often about a day of work; the range shown is the sum of the catalog estimates for the items still open. Follow with the vendor inventory (VEN-01) and a restore test (RES-02).',
  };
  const deferred = [
    'Paid compliance-automation tooling: defer until audit demand justifies it.',
    'An external auditor engagement: defer until a buyer or contract requires an attestation.',
    'Discretionary penetration tests: defer until buyer or risk requirements justify them. Do not defer testing that law, a contract or a platform requires.',
  ];
  return { catalogVersion: catalog.version, results, score: score(results), findings, quickWins, deferred };
}

const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);

// Vendor options are offered only where an external product materially helps. Pricing is never
// stated as fact here: it changes, so the note points to the vendor's current pricing page.
type VendorOption = NonNullable<Finding['vendorOptions']>[number];
const VENDOR_OPTIONS: Record<string, VendorOption[]> = {
  'EVD-01': [{
    name: 'Compliance automation platform (e.g. Vanta, Drata, Secureframe, Comp AI)',
    addresses: 'Continuous evidence collection from cloud, identity and source-control accounts, plus audit workflow',
    whyNotNative: 'A spreadsheet register works at small scale but does not pull evidence automatically or track control drift between quarters.',
    retainedResponsibilities: 'Operating the controls, keeping policies true to practice, scoping the audit, and choosing the auditor. The platform does not make you compliant.',
    stageFit: 'Worth evaluating once buyer demand for SOC 2 or ISO 27001 is real; usually unnecessary at launch.',
    pricingNote: 'Annual subscription; check current vendor pricing (not verified here).',
    limitations: 'Integrations vary by vendor; the platform gets read access to many of your systems, which is itself a vendor risk to assess.',
    lowerCostAlternative: 'templates/consultant/evidence-register.md with a quarterly calendar reminder.',
  }],
  'VUL-02': [{
    name: 'GitHub secret scanning and push protection',
    addresses: 'Detects provider-format secrets and blocks pushes that contain them',
    whyNotNative: 'This is the native option on GitHub; a CI scanner such as gitleaks adds generic patterns and full-history scans.',
    retainedResponsibilities: 'Rotating any exposed credential, reviewing alerts, and covering non-provider secrets.',
    stageFit: 'Day one; free for public repositories.',
    pricingNote: 'Availability on private repositories depends on plan; check current GitHub documentation.',
    limitations: 'Provider patterns only unless extended; does not cover other git hosts.',
    lowerCostAlternative: 'gitleaks in CI with --redact (open source).',
  }],
};
const lower = (s: Finding['severity']): Finding['severity'] => (s === 'critical' ? 'high' : s === 'high' ? 'medium' : s === 'medium' ? 'low' : s);

function scenarioFor(domain: string): string {
  const m: Record<string, string> = {
    identity_access: 'A phished or reused password gives an attacker a critical account (hosting, source control, registrar, payments).',
    change_management: 'An unreviewed or untested change reaches production and breaks or exposes the service.',
    logging_monitoring: 'An incident happens and there is no record of who did what, or nobody is alerted.',
    vulnerability_management: 'A publicly known vulnerability or leaked credential stays exploitable because nothing flagged it.',
    data_protection: 'Personal data is exposed, kept longer than stated, or cannot be located when a user asks.',
    resilience: 'Data is lost or the service stays down because recovery was never proven.',
    vendor_management: 'A vendor incident or a customer questionnaire reveals processors with no contract or review.',
    policy: 'During an incident or a buyer review there is no agreed process to follow or show.',
    endpoint: 'A lost or infected laptop exposes source code and production credentials.',
    evidence: 'A buyer or auditor asks for proof that controls operated and none was kept.',
  };
  return m[domain] ?? 'The control fails when it is needed.';
}
function impactFor(domain: string): string {
  const m: Record<string, string> = {
    identity_access: 'Full account takeover: data theft, service hijack, fraudulent payouts.',
    change_management: 'Outages and security regressions; weak position in buyer security reviews.',
    logging_monitoring: 'Longer incidents and no way to scope a breach.',
    vulnerability_management: 'Preventable compromise.',
    data_protection: 'Regulatory exposure and loss of customer trust.',
    resilience: 'Permanent data loss or prolonged downtime.',
    vendor_management: 'Legal exposure for data transfers; stalled enterprise deals.',
    policy: 'Slower, less consistent incident handling; failed questionnaires.',
    endpoint: 'Compromise of everything the device can reach.',
    evidence: 'Readiness cannot be demonstrated; audits take longer and cost more.',
  };
  return m[domain] ?? 'Reduced resilience.';
}
