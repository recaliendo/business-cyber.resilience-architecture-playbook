// Clean-checkout demo: no credentials, no network. Writes bundles to reports/demo/ (gitignored).
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageRoot } from '../src/knowledge/load.js';
import { loadIntakeFile } from '../src/intake/intake.js';
import { runAssessment } from '../src/assess.js';
import { writeBundle } from '../src/reporting/render.js';
import { reviewRepository } from '../src/review/review.js';
import { loadPolicy, loadApprovals } from '../src/engines/geo/policy.js';
import { loadStructured } from '../src/lib/io.js';
import type { ThreatSignal } from '../src/domain/schemas.js';

const root = packageRoot();
const out = (n: string) => join(root, 'reports', 'demo', n);
const now = new Date('2026-11-14T12:00:00Z');

const step = (title: string, fn: () => void) => { console.log(`\n== ${title}`); fn(); };

step('1. Solo B2C launch (partial intake)', () => {
  const r = runAssessment({ intake: loadIntakeFile(join(root, 'examples/intake/01-solo-b2c-launch.yaml')).intake });
  writeBundle(r, out('01-solo-b2c'), {});
  console.log(`   SOC 2: ${r.compliance!.soc2.recommendation}; ${r.findings.length} findings; ${r.intake!.questions.length} follow-up questions -> reports/demo/01-solo-b2c/report.html`);
});
step('2. B2B SaaS with enterprise procurement', () => {
  const r = runAssessment({ intake: loadIntakeFile(join(root, 'examples/intake/02-b2b-enterprise.yaml')).intake });
  writeBundle(r, out('02-b2b'), {});
  console.log(`   SOC 2: ${r.compliance!.soc2.recommendation}; readiness ${Math.round(r.security!.score.readiness * 100)}%, coverage ${Math.round(r.security!.score.evidenceCoverage * 100)}% -> reports/demo/02-b2b/report.html`);
});
step('3. Repository review of the synthetic vulnerable app', () => {
  // Copy into a temporary git repo so findings are pinned to a commit.
  const dir = mkdtempSync(join(tmpdir(), 'bcr-demo-'));
  cpSync(join(root, 'examples/repos/vulnerable-saas'), dir, { recursive: true });
  const git = (...a: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=demo', '-c', 'user.email=demo@example.test', '-c', 'commit.gpgsign=false', ...a], { cwd: dir, stdio: 'ignore' });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'demo'); git('remote', 'add', 'origin', 'https://github.com/example-org/vulnerable-saas.git');
  const review = reviewRepository(dir);
  const r = runAssessment({ review, now });
  writeBundle(r, out('03-repo-review'), { repository: 'https://github.com/example-org/vulnerable-saas', commit: review.commit });
  rmSync(dir, { recursive: true, force: true });
  console.log(`   ${r.findings.length} findings (${r.findings.filter((f) => f.launchBlocker).length} blockers); prompts in reports/demo/03-repo-review/prompts/index.md`);
});
step('4. Global growth with uploads, plus the geo-risk scenario', () => {
  const signals = (loadStructured(join(root, 'examples/geo/signals.yaml')) as { signals: ThreatSignal[] }).signals;
  const r = runAssessment({
    intake: loadIntakeFile(join(root, 'examples/intake/03-global-growth-uploads.yaml')).intake,
    geo: { policy: loadPolicy(join(root, 'examples/geo/policy.yaml')), approvals: loadApprovals(join(root, 'examples/geo/approvals.yaml')), signals, overrides: [] },
    now,
  });
  writeBundle(r, out('04-global-geo'), {});
  console.log(`   geo decisions: ${r.geo!.decisions.map((d) => `${d.country}=${d.outcome}`).join(', ')} -> reports/demo/04-global-geo/report.html`);
});
console.log('\nDemo complete. Nothing was sent, deployed or fetched.');
