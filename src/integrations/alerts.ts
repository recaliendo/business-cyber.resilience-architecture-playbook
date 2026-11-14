// Alert transports. Default is dry-run: nothing leaves the machine unless the caller passes
// send: true AND a destination is configured through environment variables.
// Every payload is redacted. Alerts are deduplicated by key so retries and repeated runs do not
// produce duplicate pages.
import { existsSync, readFileSync } from 'node:fs';
import { redact } from '../lib/redact.js';
import { writeText } from '../lib/io.js';

export interface Alert { dedupeKey: string; severity: 'info' | 'warning' | 'critical'; title: string; body: string; evidenceRefs?: string[] }
export type TransportName = 'dry-run' | 'slack' | 'pagerduty' | 'email';
export interface DeliveryResult { dedupeKey: string; transport: TransportName; status: 'sent' | 'dry_run' | 'duplicate_suppressed' | 'not_configured' | 'not_implemented' | 'failed'; detail: string; payload?: unknown }

export interface AlertOptions {
  transport: TransportName;
  send: boolean;
  stateFile?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  env?: Record<string, string | undefined>;
}

function loadSent(file?: string): Set<string> {
  if (!file || !existsSync(file)) return new Set();
  try { return new Set(JSON.parse(readFileSync(file, 'utf8')) as string[]); } catch { return new Set(); }
}

export async function deliverAlerts(alerts: Alert[], opts: AlertOptions): Promise<DeliveryResult[]> {
  const env = opts.env ?? process.env;
  const sent = loadSent(opts.stateFile);
  const seenThisRun = new Set<string>();
  const out: DeliveryResult[] = [];
  for (const a of alerts) {
    if (sent.has(a.dedupeKey) || seenThisRun.has(a.dedupeKey)) {
      out.push({ dedupeKey: a.dedupeKey, transport: opts.transport, status: 'duplicate_suppressed', detail: 'Already delivered (same dedupe key).' });
      continue;
    }
    seenThisRun.add(a.dedupeKey);
    const safe: Alert = { ...a, title: redact(a.title), body: redact(a.body), evidenceRefs: a.evidenceRefs?.map(redact) };
    const payload = buildPayload(opts.transport, safe, env);
    if (!opts.send || opts.transport === 'dry-run') {
      out.push({ dedupeKey: a.dedupeKey, transport: opts.transport, status: 'dry_run', detail: 'Not sent (dry run). Pass --send with a configured transport to deliver.', payload });
      continue;
    }
    if (opts.transport === 'email') {
      out.push({ dedupeKey: a.dedupeKey, transport: 'email', status: 'not_implemented', detail: 'Email transport is not implemented. Use Slack or PagerDuty, or forward the dry-run payload.' });
      continue;
    }
    const url = opts.transport === 'slack' ? env.BCR_SLACK_WEBHOOK_URL : 'https://events.pagerduty.com/v2/enqueue';
    if (!url || (opts.transport === 'pagerduty' && !env.BCR_PAGERDUTY_ROUTING_KEY) || !url.startsWith('https://')) {
      out.push({ dedupeKey: a.dedupeKey, transport: opts.transport, status: 'not_configured', detail: `Set ${opts.transport === 'slack' ? 'BCR_SLACK_WEBHOOK_URL' : 'BCR_PAGERDUTY_ROUTING_KEY'}.` });
      continue;
    }
    const result = await postWithRetry(url, payload, opts.fetchImpl ?? fetch, opts.maxAttempts ?? 3);
    out.push({ dedupeKey: a.dedupeKey, transport: opts.transport, status: result.ok ? 'sent' : 'failed', detail: result.detail });
    if (result.ok) sent.add(a.dedupeKey);
  }
  if (opts.stateFile && opts.send) writeText(opts.stateFile, JSON.stringify([...sent].sort(), null, 2));
  return out;
}

function buildPayload(t: TransportName, a: Alert, env: Record<string, string | undefined>): unknown {
  const text = `[${a.severity.toUpperCase()}] ${a.title}\n${a.body}${a.evidenceRefs?.length ? `\nEvidence: ${a.evidenceRefs.join(', ')}` : ''}`;
  if (t === 'pagerduty') {
    return { routing_key: env.BCR_PAGERDUTY_ROUTING_KEY ? '[set from env]' : '[not set]', event_action: 'trigger', dedup_key: a.dedupeKey,
      payload: { summary: a.title.slice(0, 1024), severity: a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'warning' : 'info', source: 'bcr', custom_details: { body: a.body, evidence: a.evidenceRefs ?? [] } } };
  }
  return { text };
}

async function postWithRetry(url: string, payload: unknown, f: typeof fetch, attempts: number): Promise<{ ok: boolean; detail: string }> {
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const body = JSON.stringify(payload).replace('"[set from env]"', JSON.stringify(process.env.BCR_PAGERDUTY_ROUTING_KEY ?? ''));
      const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
      last = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      last = redact((err as Error).message);
    }
    await new Promise((r) => setTimeout(r, Math.min(4000, 250 * 2 ** i) + Math.floor(Math.random() * 100)));
  }
  return { ok: false, detail: `Delivery failed: ${last}` };
}
