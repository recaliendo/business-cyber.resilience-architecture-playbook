// Geo-policy loading, hashing and approval binding.
// An approval counts only if it is bound to the exact policy content (hash), id and version.
// A typed approver name is never treated as proof by itself: identity is verified by the change
// process (protected branch, required review, protected deployment environment). See docs/consultant/geo-policy.md.
import { ApprovalRecord, GeoPolicy } from '../../domain/schemas.js';
import { loadStructured, InputError } from '../../lib/io.js';
import { hashValue } from '../../lib/hash.js';
import { z } from 'zod';

export const GEO_RULES_VERSION = '1.0.0';

export function loadPolicy(path: string): GeoPolicy {
  const parsed = GeoPolicy.safeParse(loadStructured(path));
  if (!parsed.success) throw new InputError(`geo policy invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, path);
  return parsed.data;
}

export function loadApprovals(path: string): ApprovalRecord[] {
  const parsed = z.object({ approvals: z.array(ApprovalRecord) }).safeParse(loadStructured(path));
  if (!parsed.success) throw new InputError(`approvals invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, path);
  return parsed.data.approvals;
}

/** Content hash of the policy (key order independent). Any edit, including a relaxation, changes it. */
export function policyHash(p: GeoPolicy): string {
  return hashValue(p);
}

export interface ApprovalCheck {
  approved: boolean;
  record?: ApprovalRecord;
  reasons: string[];
  identityVerified: false;
}

export function checkApproval(policy: GeoPolicy, approvals: ApprovalRecord[], opts: { allowManualRecord?: boolean } = {}): ApprovalCheck {
  const hash = policyHash(policy);
  const reasons: string[] = [];
  const candidates = approvals.filter((a) => a.policyId === policy.policyId && a.policyVersion === policy.version);
  if (!candidates.length) return { approved: false, reasons: [`No approval record for ${policy.policyId} v${policy.version}.`], identityVerified: false };
  const bound = candidates.find((a) => a.policyHash === hash);
  if (!bound) {
    return { approved: false, reasons: [`Approval exists for v${policy.version} but its hash does not match the current policy content: the policy changed after approval.`], identityVerified: false };
  }
  if (bound.method === 'manual_record' && !opts.allowManualRecord) {
    return { approved: false, record: bound, reasons: ['Approval method is manual_record. Manual records are not accepted for deployment without --allow-manual-approval.'], identityVerified: false };
  }
  if (bound.method === 'github_pr_review' && !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(bound.changeRef)) {
    return { approved: false, record: bound, reasons: ['github_pr_review approvals must reference a pull request URL.'], identityVerified: false };
  }
  reasons.push(`Approval ${bound.id} matches policy hash ${hash.slice(0, 12)}.`);
  reasons.push('Approver identity is not verified by this tool. Rely on branch protection, required review and a protected deployment environment.');
  return { approved: true, record: bound, reasons, identityVerified: false };
}
