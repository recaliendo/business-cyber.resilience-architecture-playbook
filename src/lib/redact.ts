// Redaction applied to every report, log line, prompt and alert payload before it leaves the process.
// Patterns favour false positives: redacting a harmless string is cheap, leaking a key is not.

const PATTERNS: Array<[string, RegExp]> = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g],
  ['stripe-key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g],
  ['stripe-webhook-secret', /\bwhsec_[A-Za-z0-9]{8,}\b/g],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b|\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g],
  ['slack-webhook', /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g],
  ['openai-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ['url-credentials', /\b([a-z][a-z0-9+.-]*:\/\/)[^\s:/@]+:[^\s@/]+@/gi],
  ['bearer', /\b(Bearer)\s+[A-Za-z0-9._~+/-]{16,}=*/g],
  ['generic-assignment', /\b((?:api[_-]?key|secret|password|passwd|token|auth[_-]?token|client[_-]?secret)\s*[:=]\s*["']?)([^\s"']{8,})/gi],
  ['card-number', /\b(?:\d[ -]?){13,19}\b/g],
];

/** Return `text` with likely secrets replaced by `[REDACTED:<kind>]`. */
export function redact(text: string): string {
  let out = text;
  for (const [kind, re] of PATTERNS) {
    out = out.replace(re, (match, ...groups: unknown[]) => {
      if (kind === 'url-credentials') return `${String(groups[0])}[REDACTED:credentials]@`;
      if (kind === 'bearer') return `${String(groups[0])} [REDACTED:bearer]`;
      if (kind === 'generic-assignment') return `${String(groups[0])}[REDACTED:${kind}]`;
      if (kind === 'card-number') return luhn(match.replace(/[ -]/g, '')) ? '[REDACTED:card-number]' : match;
      return `[REDACTED:${kind}]`;
    });
  }
  return out;
}

/** Deep-redact every string inside a JSON-like value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v)])) as T;
  }
  return value;
}

export function containsSecret(text: string): boolean {
  return redact(text) !== text;
}

function luhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}
