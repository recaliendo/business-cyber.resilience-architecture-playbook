import { execFileSync } from 'node:child_process';
import type { Finding, Stage } from '../domain/schemas.js';
import { snapshotRepository, type RepoSnapshot } from './snapshot.js';
import { buildInventory, type RepoInventory } from './inventory.js';
import { runChecks, REVIEW_RULES_VERSION } from './checks.js';

export interface RepositoryReview {
  rulesVersion: string;
  path: string;
  commit?: string;
  dirty: boolean;
  github?: { owner: string; repo: string };
  filesReviewed: number;
  filesSkipped: Array<{ path: string; reason: string }>;
  inventory: RepoInventory;
  findings: Finding[];
  limitations: string[];
  evidenceBoundary: string[];
}

export function reviewRepository(path: string, stage: Stage = 'launch'): RepositoryReview {
  const snap: RepoSnapshot = snapshotRepository(path);
  const inventory = buildInventory(snap);
  return {
    rulesVersion: REVIEW_RULES_VERSION, path, commit: snap.commit, dirty: snap.dirty, github: snap.github,
    filesReviewed: snap.files.filter((f) => f.text !== undefined).length,
    filesSkipped: snap.files.filter((f) => f.skipped).map((f) => ({ path: f.path, reason: f.skipped! })),
    inventory, findings: runChecks(snap, inventory, stage), limitations: snap.limitations,
    evidenceBoundary: [
      'Code: what the source demonstrably implements (observed in files at the reviewed commit).',
      'Configuration: what config files declare (CI, hosting, migrations). Declared is not the same as deployed.',
      'Deployed state: NOT verified by a repository review. Branch protection, platform settings, database RLS and capacity need deployed evidence.',
      'Unknown: anything not in the files read (skipped, submodules, other repositories, dashboards).',
    ],
  };
}

/** Before remediating, confirm the checkout still matches the reviewed commit. */
export function checkFreshness(reviewedCommit: string | undefined, repoPath: string): { fresh: boolean; current?: string; message: string } {
  let current: string | undefined;
  try {
    current = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'rev-parse', 'HEAD'], { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* not a git repo */ }
  if (!reviewedCommit || !current) return { fresh: false, current, message: 'Cannot compare commits; revalidate every finding before acting on it.' };
  if (current === reviewedCommit) return { fresh: true, current, message: 'Checkout matches the reviewed commit.' };
  return { fresh: false, current, message: `Checkout is at ${current.slice(0, 12)} but findings were produced at ${reviewedCommit.slice(0, 12)}. Revalidate each finding against the current code before remediating.` };
}
