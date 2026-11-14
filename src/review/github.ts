// GitHub ingestion adapter: shallow, read-only clone of a public or token-accessible repository.
// - Only https://github.com/<owner>/<repo> URLs are accepted (no arbitrary hosts: SSRF guard).
// - Hooks are disabled, submodules are not fetched, and only the https protocol is allowed.
// - A token, if provided via GITHUB_TOKEN, is passed through git's environment configuration,
//   never on the command line, and never written to the report. Use a fine-grained token with
//   read-only "Contents" access to the target repository only.
// - Network access is required; this adapter is not used by the offline tests or demo.
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class GithubUrlError extends Error {}

export function parseGithubUrl(url: string): { owner: string; repo: string; cloneUrl: string } {
  const m = url.match(/^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/);
  if (!m || m[2] === '.' || m[2] === '..') throw new GithubUrlError('Only https://github.com/<owner>/<repo> URLs are accepted.');
  return { owner: m[1]!, repo: m[2]!, cloneUrl: `https://github.com/${m[1]}/${m[2]}.git` };
}

export function cloneGithubRepository(url: string, opts: { ref?: string; token?: string; dest?: string } = {}): { dir: string; owner: string; repo: string } {
  const { owner, repo, cloneUrl } = parseGithubUrl(url);
  if (opts.ref && !/^[A-Za-z0-9._/-]{1,200}$/.test(opts.ref)) throw new GithubUrlError('Invalid ref.');
  const dir = opts.dest ?? mkdtempSync(join(tmpdir(), 'bcr-review-'));
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  if (opts.token) {
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${opts.token}`).toString('base64')}`;
  }
  const safe = ['-c', 'core.hooksPath=/dev/null', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'core.symlinks=false'];
  const args = [...safe, 'clone', '--depth', '1', '--no-recurse-submodules', '--filter=blob:limit=1m'];
  if (opts.ref) args.push('--branch', opts.ref);
  args.push(cloneUrl, dir);
  execFileSync('git', args, { env, stdio: ['ignore', 'ignore', 'pipe'], timeout: 180_000 });
  return { dir, owner, repo };
}
