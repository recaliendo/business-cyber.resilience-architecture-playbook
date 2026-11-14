// Read-only snapshot of a repository checkout. Never executes repository code, hooks or scripts.
// The only subprocess is `git` with fixed argument arrays (no shell) for metadata.
import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, sep, extname, basename } from 'node:path';

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_FILES = 20_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.next', '.nuxt', 'out', 'coverage', 'Pods', 'DerivedData', '.venv', 'venv', '__pycache__', '.terraform', '.netlify', '.turbo', '.cache']);
const GENERATED = [/(^|\/)package-lock\.json$/, /(^|\/)yarn\.lock$/, /(^|\/)pnpm-lock\.yaml$/, /\.min\.(js|css)$/, /(^|\/)Podfile\.lock$/, /\.pbxproj$/, /(^|\/)Package\.resolved$/, /\.map$/];

export interface RepoFile { path: string; size: number; text?: string; skipped?: 'too_large' | 'binary' | 'generated' }
export interface RepoSnapshot {
  root: string;
  commit?: string;
  dirty: boolean;
  github?: { owner: string; repo: string };
  files: RepoFile[];
  submodules: string[];
  symlinksSkipped: string[];
  truncated: boolean;
  limitations: string[];
}

function git(root: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], { cwd: root, encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

/** Parse a GitHub remote, dropping any embedded credentials. */
export function parseGithubRemote(url: string | undefined): { owner: string; repo: string } | undefined {
  if (!url) return undefined;
  const m = url.match(/github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1]!, repo: m[2]! } : undefined;
}

export function snapshotRepository(root: string): RepoSnapshot {
  const limitations: string[] = ['Static source inspection only: deployed configuration, runtime behaviour and capacity are not verified.'];
  const commit = git(root, ['rev-parse', 'HEAD']);
  if (!commit) limitations.push('Not a git checkout (or git unavailable): findings cannot be pinned to a commit.');
  const dirty = Boolean(git(root, ['status', '--porcelain', '--untracked-files=no']));
  if (dirty) limitations.push('Working tree has uncommitted changes: line references may not match the commit permalinks.');
  const github = parseGithubRemote(git(root, ['config', '--get', 'remote.origin.url']));

  const submodules: string[] = [];
  if (existsSync(join(root, '.gitmodules'))) {
    const txt = readFileSync(join(root, '.gitmodules'), 'utf8');
    for (const m of txt.matchAll(/path\s*=\s*(.+)/g)) submodules.push(m[1]!.trim());
    if (submodules.length) limitations.push(`Submodules not reviewed: ${submodules.join(', ')}.`);
  }

  // .bcrignore: one path prefix per line (# comments). Used for deliberate fixtures such as fake
  // secrets in tests. Every exclusion is reported as a limitation, so nothing is hidden silently.
  const ignored: string[] = [];
  if (existsSync(join(root, '.bcrignore'))) {
    for (const line of readFileSync(join(root, '.bcrignore'), 'utf8').split('\n')) {
      const p = line.replace(/#.*/, '').trim().replace(/^\.?\//, '');
      if (p && !p.includes('..')) ignored.push(p);
    }
  }
  const isIgnored = (rel: string) => ignored.some((p) => rel === p.replace(/\/$/, '') || rel.startsWith(p.endsWith('/') ? p : `${p}/`) || rel === p);
  const excluded: string[] = [];

  const files: RepoFile[] = [];
  const symlinksSkipped: string[] = [];
  let truncated = false;
  const walk = (dir: string): void => {
    if (truncated) return;
    let entries: string[];
    try { entries = readdirSync(dir).sort(); } catch { return; }
    for (const name of entries) {
      const abs = join(dir, name);
      const rel = relative(root, abs).split(sep).join('/');
      let st;
      try { st = lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) { symlinksSkipped.push(rel); continue; }
      if (isIgnored(rel)) { excluded.push(rel); continue; }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(name) || submodules.includes(rel)) continue;
        walk(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (files.length >= MAX_FILES) { truncated = true; return; }
      if (GENERATED.some((re) => re.test(rel))) { files.push({ path: rel, size: st.size, skipped: 'generated' }); continue; }
      if (st.size > MAX_FILE_BYTES) { files.push({ path: rel, size: st.size, skipped: 'too_large' }); continue; }
      const buf = readFileSync(abs);
      if (buf.subarray(0, 8000).includes(0)) { files.push({ path: rel, size: st.size, skipped: 'binary' }); continue; }
      files.push({ path: rel, size: st.size, text: buf.toString('utf8') });
    }
  };
  walk(root);
  if (truncated) limitations.push(`File limit of ${MAX_FILES} reached: the review is partial.`);
  const large = files.filter((f) => f.skipped === 'too_large');
  if (large.length) limitations.push(`${large.length} file(s) over ${MAX_FILE_BYTES} bytes were not read.`);
  if (symlinksSkipped.length) limitations.push(`${symlinksSkipped.length} symlink(s) were not followed.`);
  if (excluded.length) limitations.push(`Excluded by .bcrignore (not reviewed): ${excluded.join(', ')}.`);
  return { root, commit, dirty, github, files, submodules, symlinksSkipped, truncated, limitations };
}

export function permalink(s: RepoSnapshot, path: string, line?: number): string | undefined {
  if (!s.github || !s.commit) return undefined;
  return `https://github.com/${s.github.owner}/${s.github.repo}/blob/${s.commit}/${path.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
}

export const isText = (f: RepoFile): f is RepoFile & { text: string } => typeof f.text === 'string';
export const ext = (p: string) => extname(p).toLowerCase();
export const base = (p: string) => basename(p);
