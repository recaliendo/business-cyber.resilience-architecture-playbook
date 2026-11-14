// Orchestrates a full assessment: intake -> engines -> shared findings -> roadmap.
import type { Finding, GeoPolicy, ApprovalRecord, ThreatSignal, Intake, RoadmapItem } from './domain/schemas.js';
import { dedupeFindings, sortFindings } from './domain/findings.js';
import { analyseIntake, type LoadedIntake } from './intake/intake.js';
import { loadControls, loadObligations, loadSources } from './knowledge/load.js';
import { assessSecurity, type SecurityReport } from './engines/security/security.js';
import { assessCompliance, type ComplianceReport } from './engines/compliance/compliance.js';
import { runCapacity, capacityFindings, type CapacityReport } from './engines/capacity/capacity.js';
import { assessInfrastructure, type InfrastructureReport } from './engines/infrastructure/infrastructure.js';
import { checkApproval, policyHash, type ApprovalCheck } from './engines/geo/policy.js';
import { evaluateSignals, type ActiveOverride, type SignalDecision, type ThreatConfig, DEFAULT_THREAT_CONFIG } from './engines/geo/signals.js';
import { sourceStatus, type SourceStatus } from './sources/sources.js';
import type { RepositoryReview } from './review/review.js';
import { buildRoadmap } from './reporting/roadmap.js';
import { hashValue } from './lib/hash.js';

export const TOOL_VERSION = '0.1.0';

export interface GeoInput { policy: GeoPolicy; approvals: ApprovalRecord[]; signals: ThreatSignal[]; overrides: ActiveOverride[]; config?: Partial<ThreatConfig> }
export interface GeoReport { policyId: string; version: number; policyHash: string; approval: ApprovalCheck; sanctionsRules: number; threatRules: number; decisions: SignalDecision[]; overrides: ActiveOverride[]; reviewDue: string; reviewOverdue: boolean; note: string }

export interface AssessmentResult {
  meta: { tool: string; generatedAt: string; inputsHash: string; ruleVersions: Record<string, string>; title: string };
  intake?: LoadedIntake;
  security?: SecurityReport;
  compliance?: ComplianceReport;
  capacity?: CapacityReport;
  infrastructure?: InfrastructureReport;
  geo?: GeoReport;
  review?: RepositoryReview;
  sources: { unverified: number; stale: number; verified: number; backlog: SourceStatus[] };
  findings: Finding[];
  roadmap: RoadmapItem[];
}

export function runAssessment(input: { intake?: Intake; review?: RepositoryReview; geo?: GeoInput; now?: Date }): AssessmentResult {
  const now = input.now ?? (input.intake?.assessedAt ? new Date(input.intake.assessedAt) : new Date());
  const controls = loadControls();
  const obligations = loadObligations();
  const sources = loadSources();
  const findings: Finding[] = [];
  const result: AssessmentResult = {
    meta: {
      tool: `bcr ${TOOL_VERSION}`, generatedAt: now.toISOString(), inputsHash: hashValue({ intake: input.intake, reviewCommit: input.review?.commit, geo: input.geo }),
      ruleVersions: { controls: controls.version, obligations: obligations.version, sources: sources.version },
      title: input.intake ? `Cyber resilience assessment: ${input.intake.business.name}` : input.review ? `Repository review: ${input.review.github ? `${input.review.github.owner}/${input.review.github.repo}` : input.review.path}` : 'Assessment',
    },
    sources: { unverified: 0, stale: 0, verified: 0, backlog: [] },
    findings: [], roadmap: [],
  };
  const st = sourceStatus(sources, now);
  result.sources = { unverified: st.filter((s) => s.state === 'unverified').length, stale: st.filter((s) => s.state === 'stale').length, verified: st.filter((s) => s.state === 'verified').length, backlog: st.filter((s) => s.state !== 'verified') };

  let quickWins: string[] = [];
  const stage = input.intake?.business.stage ?? 'launch';
  if (input.intake) {
    const intake = input.intake;
    result.intake = analyseIntake(intake);
    result.security = assessSecurity(controls, intake.evidence, stage, intake.business.team.size, now);
    result.meta.ruleVersions.scoring = result.security.score.version;
    quickWins = result.security.quickWins.controls;
    findings.push(...result.security.findings);
    result.compliance = assessCompliance(intake.business, obligations, sources, result.security.results, result.security.score);
    result.meta.ruleVersions.applicability = result.compliance.rulesVersion;
    findings.push(...result.compliance.findings);
    if (intake.workload) {
      result.capacity = runCapacity(intake.workload);
      result.meta.ruleVersions.capacity = result.capacity.version;
      findings.push(...capacityFindings(result.capacity, stage));
    }
    if (intake.infrastructure) {
      result.infrastructure = assessInfrastructure(intake.infrastructure, stage);
      result.meta.ruleVersions.infrastructure = result.infrastructure.version;
      findings.push(...result.infrastructure.findings);
    }
  }
  if (input.review) {
    result.review = input.review;
    result.meta.ruleVersions.review = input.review.rulesVersion;
    findings.push(...input.review.findings);
  }
  if (input.geo) {
    const g = input.geo;
    const approval = checkApproval(g.policy, g.approvals);
    const ev = evaluateSignals(g.signals, g.policy, g.overrides, now, { ...DEFAULT_THREAT_CONFIG, ...g.config });
    result.geo = {
      policyId: g.policy.policyId, version: g.policy.version, policyHash: policyHash(g.policy), approval,
      sanctionsRules: g.policy.rules.filter((r) => r.track === 'sanctions').length, threatRules: g.policy.rules.filter((r) => r.track === 'threat').length,
      decisions: ev.decisions, overrides: ev.overrides, reviewDue: g.policy.quarterlyReviewDue, reviewOverdue: Date.parse(g.policy.quarterlyReviewDue) < now.getTime(),
      note: 'Dry-run evaluation. Nothing here is live protection. Geo controls are bypassable (VPNs, proxies) and must be paired with rate limits, MFA, authorization and payment screening.',
    };
  }
  result.findings = sortFindings(dedupeFindings(findings));
  result.roadmap = buildRoadmap(result.findings, stage, quickWins);
  return result;
}
