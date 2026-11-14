// Repository validation run in CI: knowledge files, examples, geo policies + approval hashes,
// source references, generated schemas up to date, and internal Markdown links.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { z } from 'zod';
import { packageRoot, loadControls, loadObligations, loadSources } from '../src/knowledge/load.js';
import { validateIntake } from '../src/intake/intake.js';
import { loadStructured } from '../src/lib/io.js';
import { loadPolicy, loadApprovals, checkApproval } from '../src/engines/geo/policy.js';
import { loadCapabilities } from '../src/engines/geo/compiler.js';
import { RULES } from '../src/engines/compliance/applicability.js';
import { ThreatSignal } from '../src/domain/schemas.js';

const root = packageRoot();
const errors: string[] = [];
const ok = (m: string) => console.log(`ok   ${m}`);
const err = (m: string) => { errors.push(m); console.error(`FAIL ${m}`); };
const tryRun = (label: string, fn: () => void) => { try { fn(); ok(label); } catch (e) { err(`${label}: ${(e as Error).message}`); } };

const controls = loadControls();
const obligations = loadObligations();
const sources = loadSources();
ok(`knowledge: ${controls.controls.length} controls, ${obligations.obligations.length} obligations, ${sources.sources.length} sources`);
const srcIds = new Set(sources.sources.map((s) => s.id));
const ctlIds = new Set(controls.controls.map((c) => c.id));
for (const id of new Set(controls.controls.map((c) => c.id))) if (controls.controls.filter((c) => c.id === id).length > 1) err(`duplicate control ${id}`);
for (const c of controls.controls) for (const d of c.dependsOn) if (!ctlIds.has(d)) err(`${c.id} depends on unknown control ${d}`);
for (const o of obligations.obligations) {
  for (const s of o.sourceIds) if (!srcIds.has(s)) err(`${o.id} cites unknown source ${s}`);
  for (const c of o.relatedControls) if (!ctlIds.has(c)) err(`${o.id} references unknown control ${c}`);
  if (!RULES[o.id]) err(`${o.id} has no applicability rule in applicability.ts`);
}
for (const s of sources.sources) if (s.verifiedAt && !s.verifiedBy) err(`${s.id} has verifiedAt without verifiedBy`);
tryRun('provider capabilities', () => loadCapabilities());

for (const f of readdirSync(join(root, 'examples', 'intake'))) {
  const v = validateIntake(loadStructured(join(root, 'examples', 'intake', f)));
  if (v.ok) ok(`example intake ${f}`); else err(`example intake ${f}: ${v.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
}
tryRun('example geo policy + approval hash', () => {
  const p = loadPolicy(join(root, 'examples', 'geo', 'policy.yaml'));
  const a = checkApproval(p, loadApprovals(join(root, 'examples', 'geo', 'approvals.yaml')));
  if (!a.approved) throw new Error(`example approval does not match policy content: ${a.reasons.join(' ')} (re-run npm run example:approve after reviewing the change)`);
});
tryRun('example threat signals', () => z.object({ signals: z.array(ThreatSignal) }).parse(loadStructured(join(root, 'examples', 'geo', 'signals.yaml'))));
tryRun('template intake', () => { const v = validateIntake(loadStructured(join(root, 'templates', 'consultant', 'intake.yaml'))); if (!v.ok) throw new Error(v.issues.map((i) => `${i.path}: ${i.message}`).join('; ')); });

// Internal Markdown links (relative paths only; anchors and external URLs are not fetched).
const skip = new Set(['node_modules', 'dist', '.git', 'assessments', 'reports', 'repos']);
const mdFiles: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { if (skip.has(n)) continue; const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.md')) mdFiles.push(p); } };
walk(root);
let links = 0;
for (const f of mdFiles) {
  const text = readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = target.split('#')[0]!;
    if (!path) continue;
    links++;
    if (!existsSync(resolve(dirname(f), decodeURIComponent(path)))) err(`broken link in ${relative(root, f)}: ${target}`);
  }
}
ok(`checked ${links} internal links in ${mdFiles.length} Markdown files`);

if (errors.length) { console.error(`\n${errors.length} validation error(s)`); process.exit(1); }
console.log('\nAll validation checks passed.');
