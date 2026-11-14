// Sanctions source snapshots and proposed policy updates.
//
// What is implemented: a normalized snapshot format for jurisdiction- and region-level service
// restrictions, checksummed and dated, with a semantic diff against the previous snapshot and a
// PROPOSED policy change. What is NOT implemented: automatic extraction from official program
// pages or legal acts. A person (with counsel) maintains the normalized snapshot from official
// sources. Name lists (OFAC SDN, EU and UK consolidated lists) describe persons and entities,
// not geographic service bans, and are never turned into country rules.
//
// Invariants:
//  - A failed or malformed feed never changes, clears or relaxes the approved policy.
//  - Every proposal (including a removal) needs human approval before it can be deployed.
//  - Duplicate proposals are deduplicated by content hash.
import { z } from 'zod';
import { GeoSelector, type GeoPolicy } from '../../domain/schemas.js';
import { hashValue, sha256 } from '../../lib/hash.js';
import { parseStructured } from '../../lib/io.js';

export const SanctionsSnapshot = z.object({
  regime: z.enum(['US-OFAC', 'EU', 'UK']),
  sourceIds: z.array(z.string()).min(1),
  asOf: z.iso.date(),
  preparedBy: z.string(),
  entries: z.array(z.object({
    key: z.string().regex(/^[A-Z0-9-]+$/),
    selector: GeoSelector,
    restriction: z.enum(['comprehensive', 'regional', 'sectoral_review']),
    legalBasis: z.string().min(5),
    note: z.string().optional(),
  })),
});
export type SanctionsSnapshot = z.infer<typeof SanctionsSnapshot>;

export interface StoredSnapshot { snapshot: SanctionsSnapshot; sha256: string; storedAt: string }

export type FeedOutcome =
  | { status: 'unchanged'; snapshot: StoredSnapshot; message: string }
  | { status: 'changed'; snapshot: StoredSnapshot; diff: SnapshotDiff; proposal: PolicyProposal; message: string }
  | { status: 'failed'; message: string; keptPolicyVersion: number; alert: { severity: 'critical'; title: string; dedupeKey: string } }
  | { status: 'stale'; message: string; keptPolicyVersion: number; alert: { severity: 'warning'; title: string; dedupeKey: string } };

export interface SnapshotDiff { added: string[]; removed: string[]; changed: string[] }

export interface PolicyProposal {
  proposalId: string;
  basePolicyVersion: number;
  proposedVersion: number;
  requiresApproval: true;
  requiresCounselReview: boolean;
  rulesToAdd: string[];
  rulesToRemove: string[];
  rulesToChange: string[];
  note: string;
}

/**
 * Process fetched feed content. `raw` may be undefined when the fetch failed.
 * The approved policy object is never mutated.
 */
export function processSanctionsFeed(
  raw: string | undefined, fetchError: string | undefined, previous: StoredSnapshot | undefined, policy: GeoPolicy, now: Date, maxAgeDays = 2,
): FeedOutcome {
  const keep = { keptPolicyVersion: policy.version };
  if (fetchError || raw === undefined) {
    return { status: 'failed', ...keep, message: `Source fetch failed (${fetchError ?? 'no content'}). The last approved policy v${policy.version} stays in force; nothing was cleared.`,
      alert: { severity: 'critical', title: 'Sanctions source refresh failed', dedupeKey: `sanctions:fetch-failed:${now.toISOString().slice(0, 10)}` } };
  }
  let parsed: SanctionsSnapshot;
  try {
    const result = SanctionsSnapshot.safeParse(parseStructured(raw, 'feed.json'));
    if (!result.success) throw new Error(result.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    parsed = result.data;
  } catch (err) {
    return { status: 'failed', ...keep, message: `Source content failed validation (${(err as Error).message}). The last approved policy v${policy.version} stays in force.`,
      alert: { severity: 'critical', title: 'Sanctions source malformed', dedupeKey: `sanctions:malformed:${sha256(raw).slice(0, 12)}` } };
  }
  if (parsed.entries.length === 0 && previous && previous.snapshot.entries.length > 0) {
    return { status: 'failed', ...keep, message: 'The source returned an empty list where entries existed before. Treated as a source failure, not as all restrictions being lifted.',
      alert: { severity: 'critical', title: 'Sanctions source returned an empty list', dedupeKey: `sanctions:empty:${sha256(raw).slice(0, 12)}` } };
  }
  const ageDays = (now.getTime() - Date.parse(parsed.asOf)) / 86_400_000;
  if (ageDays > maxAgeDays) {
    return { status: 'stale', ...keep, message: `Snapshot is dated ${parsed.asOf} (${ageDays.toFixed(0)} days old, max ${maxAgeDays}). The policy is unchanged; refresh the snapshot from official sources.`,
      alert: { severity: 'warning', title: 'Sanctions snapshot is stale', dedupeKey: `sanctions:stale:${parsed.asOf}` } };
  }
  const stored: StoredSnapshot = { snapshot: parsed, sha256: sha256(raw), storedAt: now.toISOString() };
  const diff = diffSnapshots(previous?.snapshot, parsed);
  if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
    return { status: 'unchanged', snapshot: stored, message: 'No semantic change from the previous snapshot.' };
  }
  const proposal: PolicyProposal = {
    proposalId: `PROP-${hashValue({ base: policy.version, diff }).slice(0, 12)}`,
    basePolicyVersion: policy.version, proposedVersion: policy.version + 1, requiresApproval: true,
    requiresCounselReview: true,
    rulesToAdd: diff.added.map((k) => `SAN-${parsed.regime}-${k}`),
    rulesToRemove: diff.removed.map((k) => `SAN-${previous?.snapshot.regime ?? parsed.regime}-${k}`),
    rulesToChange: diff.changed.map((k) => `SAN-${parsed.regime}-${k}`),
    note: 'Proposed only. Removing or relaxing a sanctions rule needs the same approval as adding one. Regional entries must stay regional; do not widen them to whole countries.',
  };
  return { status: 'changed', snapshot: stored, diff, proposal, message: `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed. Proposal ${proposal.proposalId} created; approval required.` };
}

export function diffSnapshots(prev: SanctionsSnapshot | undefined, next: SanctionsSnapshot): SnapshotDiff {
  const a = new Map((prev?.entries ?? []).map((e) => [e.key, hashValue(e)]));
  const b = new Map(next.entries.map((e) => [e.key, hashValue(e)]));
  return {
    added: [...b.keys()].filter((k) => !a.has(k)).sort(),
    removed: [...a.keys()].filter((k) => !b.has(k)).sort(),
    changed: [...b.keys()].filter((k) => a.has(k) && a.get(k) !== b.get(k)).sort(),
  };
}
