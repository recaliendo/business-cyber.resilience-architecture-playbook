import { Finding, type FindingInput, type Priority, type Severity } from './schemas.js';
import { sha256 } from '../lib/hash.js';

/** Stable ID: rule + affected key, so the same issue keeps its ID across runs. */
export function findingId(ruleId: string, key: string): string {
  return `${ruleId}.${sha256(`${ruleId}|${key}`).slice(0, 6)}`;
}

export function priorityFor(severity: Severity, launchBlocker = false): Priority {
  if (launchBlocker || severity === 'critical') return 'P0';
  if (severity === 'high') return 'P1';
  if (severity === 'medium') return 'P2';
  return 'P3';
}

/** Validate and normalise a finding. Throws if an engine emits a malformed one (a bug, not user error). */
export function makeFinding(input: Omit<FindingInput, 'id' | 'priority'> & { key: string; priority?: Priority }): Finding {
  const { key, ...rest } = input;
  const severity = rest.severity as Severity;
  return Finding.parse({
    ...rest,
    id: findingId(rest.ruleId, key),
    priority: rest.priority ?? priorityFor(severity, Boolean(rest.launchBlocker)),
  });
}

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

/** Launch blockers first, then severity, then id (deterministic). */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) =>
    Number(b.launchBlocker) - Number(a.launchBlocker) || SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.id.localeCompare(b.id));
}

/** Merge findings that share an id (one issue surfaced by several engines maps to several domains). */
export function dedupeFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) {
    const existing = byId.get(f.id);
    if (!existing) { byId.set(f.id, f); continue; }
    existing.domains = [...new Set([...existing.domains, ...f.domains])];
    existing.evidence = [...existing.evidence, ...f.evidence];
  }
  return [...byId.values()];
}
