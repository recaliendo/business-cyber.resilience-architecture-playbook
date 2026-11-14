// Writes examples/geo/approvals.yaml bound to the CURRENT content hash of examples/geo/policy.yaml.
// For the synthetic example only. Real approvals are recorded by a person through a reviewed PR.
import { join } from 'node:path';
import { stringify } from 'yaml';
import { packageRoot } from '../src/knowledge/load.js';
import { loadPolicy, policyHash } from '../src/engines/geo/policy.js';
import { writeText } from '../src/lib/io.js';

const root = packageRoot();
const p = loadPolicy(join(root, 'examples', 'geo', 'policy.yaml'));
const doc = {
  approvals: [{
    id: `APR-${p.policyId}-v${p.version}`,
    policyId: p.policyId,
    policyVersion: p.version,
    policyHash: policyHash(p),
    approver: 'example-approver (synthetic)',
    approvedAt: '2026-11-14T09:00:00Z',
    changeRef: 'https://github.com/example-org/example-repo/pull/1',
    method: 'github_pr_review',
  }],
};
writeText(join(root, 'examples', 'geo', 'approvals.yaml'), `# SYNTHETIC approval bound to the example policy's content hash. Regenerate with npm run example:approve.\n${stringify(doc)}`);
console.log(`approval bound to ${policyHash(p)}`);
