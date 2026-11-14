// Roadmap from findings. Ordering rule: legal/launch blockers and critical issues first, regardless
// of any aggregate score; then by severity; quick wins grouped into the next-day package.
import type { Finding, RoadmapItem, Stage } from '../domain/schemas.js';
import { sortFindings } from '../domain/findings.js';

export function buildRoadmap(findings: Finding[], stage: Stage, quickWinControls: string[] = []): RoadmapItem[] {
  const items: RoadmapItem[] = [];
  const quick = findings.filter((f) => f.affected.controls.some((c) => quickWinControls.includes(c)));
  if (quick.length) {
    items.push({
      id: 'RM-QUICKWINS', title: 'Security quick-win package (MFA, branch protection, audit logs, dependency and secret scanning)', horizon: 'next_day', priority: 'P0',
      findingIds: quick.map((f) => f.id), businessImpact: 'Closes the most common account-takeover and leak paths for very little effort.', stage,
      ownerRole: 'Founder', effortHours: { low: sum(quick.map((f) => f.effortHours.low)), high: sum(quick.map((f) => f.effortHours.high)) },
      dependencies: [], evidenceToCollect: quick.map((f) => `${f.affected.controls.join(',')}: ${f.validation}`),
      completionCriteria: ['Each listed control has dated evidence in the evidence register.'],
    });
  }
  const quickIds = new Set(quick.map((f) => f.id));
  for (const f of sortFindings(findings)) {
    if (quickIds.has(f.id) || f.severity === 'info') continue;
    const horizon: RoadmapItem['horizon'] = f.launchBlocker || f.severity === 'critical' ? (f.effortHours.high <= 8 ? 'next_day' : 'd30') : f.severity === 'high' ? 'd30' : f.severity === 'medium' ? 'd60' : 'd90';
    items.push({
      id: `RM-${f.id}`, title: f.remediation.summary.split('. ')[0]!.slice(0, 160), horizon, priority: f.priority, findingIds: [f.id],
      businessImpact: f.businessImpact, stage: f.applicableStage, ownerRole: f.ownerRole, effortHours: f.effortHours, costUsd: f.costUsd,
      dependencies: f.dependencies, evidenceToCollect: [f.validation], completionCriteria: f.acceptanceCriteria.length ? f.acceptanceCriteria : [f.validation],
    });
  }
  const order = { next_day: 0, d30: 1, d60: 2, d90: 3, later: 4 };
  return items.sort((a, b) => order[a.horizon] - order[b.horizon] || a.priority.localeCompare(b.priority));
}

const sum = (n: number[]) => Math.round(n.reduce((a, b) => a + b, 0) * 10) / 10;
