// Source governance: verification status, staleness, and a guarded refresh.
// Refresh NEVER marks a source verified and NEVER rewrites rules or policies. It only records
// whether the fetched content changed, so a person can re-read the source and re-verify.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { SourceRecord, SourceRegistry } from '../domain/schemas.js';
import { sha256 } from '../lib/hash.js';

export interface SourceStatus { id: string; title: string; url: string; state: 'verified' | 'stale' | 'unverified'; dueSince?: string; reason: string }

export function sourceStatus(reg: SourceRegistry, now: Date): SourceStatus[] {
  return reg.sources.map((s) => {
    if (!s.verifiedAt) return { id: s.id, title: s.title, url: s.url, state: 'unverified', reason: 'Never verified by a person. Rules citing it are reported as unverified.' };
    const due = new Date(Date.parse(s.verifiedAt) + s.reviewCadenceDays * 86_400_000);
    if (due < now) return { id: s.id, title: s.title, url: s.url, state: 'stale', dueSince: due.toISOString().slice(0, 10), reason: `Re-verification was due on ${due.toISOString().slice(0, 10)} (every ${s.reviewCadenceDays} days).` };
    return { id: s.id, title: s.title, url: s.url, state: 'verified', reason: `Verified ${s.verifiedAt.slice(0, 10)} by ${s.verifiedBy ?? 'unknown'}.` };
  });
}

/** Reject private, loopback, link-local and other non-public addresses. */
export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224);
  }
  if (isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x.startsWith('::ffff:')) return isPublicAddress(x.slice(7));
    return !(x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('ff'));
  }
  return false;
}

export interface RefreshResult { id: string; action: 'would_fetch' | 'fetched_unchanged' | 'fetched_changed' | 'first_fetch' | 'refused' | 'failed'; detail: string; newHash?: string }

export async function refreshSources(reg: SourceRegistry, opts: { allowNetwork: boolean; ids?: string[]; fetchImpl?: typeof fetch; maxBytes?: number; resolve?: (host: string) => Promise<string[]> }): Promise<RefreshResult[]> {
  const targets = reg.sources.filter((s) => !opts.ids || opts.ids.includes(s.id));
  const out: RefreshResult[] = [];
  for (const s of targets) {
    if (!opts.allowNetwork) { out.push({ id: s.id, action: 'would_fetch', detail: `Dry run: would GET ${s.url}` }); continue; }
    out.push(await fetchOne(s, opts));
  }
  return out;
}

async function fetchOne(s: SourceRecord, opts: { fetchImpl?: typeof fetch; maxBytes?: number; resolve?: (host: string) => Promise<string[]> }): Promise<RefreshResult> {
  const url = new URL(s.url);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return { id: s.id, action: 'refused', detail: 'Only plain https URLs on port 443 are fetched.' };
  const resolver = opts.resolve ?? (async (h: string) => (await lookup(h, { all: true })).map((r) => r.address));
  try {
    const addrs = await resolver(url.hostname);
    if (!addrs.length || !addrs.every(isPublicAddress)) return { id: s.id, action: 'refused', detail: 'Host resolves to a non-public address.' };
    const res = await (opts.fetchImpl ?? fetch)(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'bcr-source-check/0.1' } });
    if (res.status >= 300 && res.status < 400) return { id: s.id, action: 'failed', detail: `Redirected to ${res.headers.get('location') ?? '?'}; update the registry URL after checking it manually.` };
    if (!res.ok) return { id: s.id, action: 'failed', detail: `HTTP ${res.status}` };
    const max = opts.maxBytes ?? 5_000_000;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > max) return { id: s.id, action: 'failed', detail: `Response larger than ${max} bytes.` };
    const hash = sha256(buf.toString('utf8'));
    if (!s.contentHash) return { id: s.id, action: 'first_fetch', newHash: hash, detail: 'Content hash recorded for review. A person must still read and verify the source.' };
    return hash === s.contentHash
      ? { id: s.id, action: 'fetched_unchanged', newHash: hash, detail: 'Content unchanged since the last recorded hash.' }
      : { id: s.id, action: 'fetched_changed', newHash: hash, detail: 'Content changed: re-read the source and re-verify dependent rules. Nothing was updated automatically.' };
  } catch (err) {
    return { id: s.id, action: 'failed', detail: (err as Error).message.slice(0, 200) };
  }
}
