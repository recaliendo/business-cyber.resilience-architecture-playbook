// Control-state evaluation and the published scoring model.
//
// SCORING (documented in docs/consultant/scoring.md; changes require a SCORING_VERSION bump):
//   Applicable controls  = controls whose minStage <= business stage and state != not_applicable
//   credit(state)        = met 1.0 | partial 0.5 | unmet 0 | unknown 0
//   readiness            = sum(weight * credit) / sum(weight)                        over applicable controls
//   evidenceCoverage     = sum(weight where state is backed by fresh evidence) / sum(weight)
//   observedCoverage     = sum(weight where that evidence is provenance=observed) / sum(weight)
// Readiness and coverage are always reported separately. Unknown never earns credit.
// Blockers (blockerIfUnmet controls that are partial, unmet or unknown) are listed on their own and are
// never offset by a high aggregate score.
import { STAGE_ORDER, type ControlDef, type ControlState, type EvidenceItem, type Provenance, type Stage } from '../domain/schemas.js';

export const SCORING_VERSION = '1.0.0';
export const CREDIT: Record<Exclude<ControlState, 'not_applicable'>, number> = { met: 1, partial: 0.5, unmet: 0, unknown: 0 };

export interface ControlResult {
  control: ControlDef;
  state: ControlState;
  provenance: Provenance;
  evidenceIds: string[];
  evidenceAgeDays?: number;
  stale: boolean;
  justification?: string;
  notes: string[];
}

export interface Score {
  version: string;
  readiness: number;
  evidenceCoverage: number;
  observedCoverage: number;
  applicableWeight: number;
  counts: Record<ControlState, number>;
  blockers: string[];
}

export function stageAtLeast(current: Stage, min: Stage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(min);
}

export function evaluateControls(controls: ControlDef[], evidence: EvidenceItem[], stage: Stage, now: Date): ControlResult[] {
  return controls.map((control) => {
    if (!stageAtLeast(stage, control.minStage)) {
      return {
        control, state: 'not_applicable', provenance: 'inferred', evidenceIds: [], stale: false,
        justification: `Not expected before the ${control.minStage} stage (business is at ${stage}).`, notes: [],
      };
    }
    const assertions = evidence
      .flatMap((e) => e.assertions.filter((a) => a.controlId === control.id).map((a) => ({ e, a })))
      .sort((x, y) => Date.parse(y.e.collectedAt) - Date.parse(x.e.collectedAt));
    const latest = assertions[0];
    if (!latest) {
      return { control, state: 'unknown', provenance: 'unknown', evidenceIds: [], stale: false, notes: ['No evidence supplied.'] };
    }
    const ageDays = Math.floor((now.getTime() - Date.parse(latest.e.collectedAt)) / 86_400_000);
    const notes: string[] = [];
    let state: ControlState = latest.a.state;
    let stale = false;
    if (state === 'not_applicable' && !latest.a.justification?.trim()) {
      notes.push('Marked not_applicable without justification; treated as unknown.');
      state = 'unknown';
    }
    if (ageDays > control.evidenceMaxAgeDays && state !== 'not_applicable') {
      stale = true;
      notes.push(`Latest evidence is ${ageDays} days old (max ${control.evidenceMaxAgeDays}); treated as unknown until refreshed.`);
      state = 'unknown';
    }
    if (ageDays < 0) notes.push('Evidence is dated in the future relative to the assessment time.');
    if (latest.e.provenance === 'self_reported' && state === 'met') notes.push('Met per self-report only; not independently observed.');
    return {
      control, state, provenance: latest.e.provenance, evidenceIds: assertions.map((x) => x.e.id),
      evidenceAgeDays: ageDays, stale, justification: latest.a.justification, notes,
    };
  });
}

export function score(results: ControlResult[]): Score {
  const counts: Record<ControlState, number> = { met: 0, partial: 0, unmet: 0, unknown: 0, not_applicable: 0 };
  let total = 0;
  let earned = 0;
  let covered = 0;
  let observed = 0;
  const blockers: string[] = [];
  for (const r of results) {
    counts[r.state] += 1;
    if (r.state === 'not_applicable') continue;
    const w = r.control.weight;
    total += w;
    earned += w * CREDIT[r.state];
    if (r.state !== 'unknown') {
      covered += w;
      if (r.provenance === 'observed') observed += w;
    }
    if (r.control.blockerIfUnmet && r.state !== 'met') blockers.push(r.control.id);
  }
  const ratio = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 1000);
  return { version: SCORING_VERSION, readiness: ratio(earned), evidenceCoverage: ratio(covered), observedCoverage: ratio(observed), applicableWeight: total, counts, blockers };
}
