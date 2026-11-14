// Discretionary threat track: turns aggregate signals into temporary, expiring proposals.
// Hard limits, enforced in code:
//  - Signals can only produce MONITOR or a temporary CHALLENGE. Never BLOCK.
//  - A CHALLENGE is applied automatically only if autoEscalateToChallenge is enabled; otherwise it is a proposal.
//  - Every automatic CHALLENGE has a TTL (default 72h). Expiry restores the approved policy.
//  - Automatic renewal is capped (default 1). After that a human must decide.
//  - Small samples, zero or stale baselines, and stale signals never escalate.
//  - Browser challenges are scoped to web clients; iOS and API traffic gets rate-limit / step-up advice.
//  - EU member states with a B2C model never receive a discretionary BLOCK recommendation.
import type { ClientType, GeoPolicy, ThreatSignal } from '../../domain/schemas.js';
import { EU_MEMBER_STATES } from '../compliance/applicability.js';

export interface ThreatConfig {
  maliciousShareThreshold: number;
  failedLoginMultiplier: number;
  minRequests: number;
  minLoginAttempts: number;
  minWindowMinutes: number;
  maxWindowMinutes: number;
  maxSignalAgeHours: number;
  maxBaselineAgeDays: number;
  hysteresisFactor: number;
  autoEscalateToChallenge: boolean;
  challengeTtlHours: number;
  maxAutoRenewals: number;
}

export const DEFAULT_THREAT_CONFIG: ThreatConfig = {
  maliciousShareThreshold: 0.2,
  failedLoginMultiplier: 3,
  minRequests: 1000,
  minLoginAttempts: 200,
  minWindowMinutes: 15,
  maxWindowMinutes: 24 * 60,
  maxSignalAgeHours: 6,
  maxBaselineAgeDays: 30,
  hysteresisFactor: 0.8,
  autoEscalateToChallenge: false,
  challengeTtlHours: 72,
  maxAutoRenewals: 1,
};

export interface ActiveOverride {
  country: string;
  action: 'CHALLENGE' | 'MONITOR';
  clients: ClientType[];
  createdAt: string;
  expiresAt: string;
  renewals: number;
  reason: string;
  signalRef: string;
}

export interface SignalDecision {
  country: string;
  outcome: 'no_action' | 'insufficient_evidence' | 'monitor' | 'propose_challenge' | 'apply_challenge' | 'renew_challenge' | 'human_review_required';
  reasons: string[];
  maliciousShare?: number;
  failedLoginRate?: number;
  baselineMultiple?: number;
  override?: ActiveOverride;
  nativeClientAdvice?: string;
  alert?: { severity: 'info' | 'warning' | 'critical'; title: string; dedupeKey: string };
}

export function evaluateSignals(
  signals: ThreatSignal[], policy: GeoPolicy, active: ActiveOverride[], now: Date, cfg: ThreatConfig = DEFAULT_THREAT_CONFIG,
): { decisions: SignalDecision[]; overrides: ActiveOverride[] } {
  const decisions: SignalDecision[] = [];
  // 1. Expire overrides first: expiry restores the approved policy (overrides are a separate layer on top of it).
  const current = active.filter((o) => Date.parse(o.expiresAt) > now.getTime());
  for (const o of active.filter((x) => Date.parse(x.expiresAt) <= now.getTime())) {
    decisions.push({ country: o.country, outcome: 'no_action', reasons: [`Temporary ${o.action} expired at ${o.expiresAt}; the approved policy applies again.`] });
  }

  for (const s of signals) {
    const reasons: string[] = [];
    const winMin = (Date.parse(s.windowEnd) - Date.parse(s.windowStart)) / 60000;
    const ageH = (now.getTime() - Date.parse(s.windowEnd)) / 3_600_000;
    const sanctioned = policy.rules.some((r) => r.track === 'sanctions' && selectorCountry(r.selector) === s.country);
    if (sanctioned) reasons.push('Country also appears in the sanctions track; that track is decided separately and is not affected by threat signals.');

    const bad: string[] = [];
    if (winMin < cfg.minWindowMinutes || winMin > cfg.maxWindowMinutes) bad.push(`window of ${winMin.toFixed(0)} min is outside ${cfg.minWindowMinutes}-${cfg.maxWindowMinutes} min`);
    if (ageH > cfg.maxSignalAgeHours) bad.push(`signal is ${ageH.toFixed(1)} h old (max ${cfg.maxSignalAgeHours} h)`);
    if (ageH < -0.1) bad.push('signal window ends in the future');
    if (s.maliciousRequests > s.totalRequests || s.failedLogins > s.loginAttempts) bad.push('counts are inconsistent');

    const share = s.totalRequests >= cfg.minRequests ? s.maliciousRequests / s.totalRequests : undefined;
    if (s.totalRequests < cfg.minRequests) reasons.push(`Only ${s.totalRequests} requests (minimum ${cfg.minRequests}); malicious share not evaluated.`);
    let multiple: number | undefined;
    const rate = s.loginAttempts > 0 ? s.failedLogins / s.loginAttempts : undefined;
    if (s.loginAttempts < cfg.minLoginAttempts) reasons.push(`Only ${s.loginAttempts} login attempts (minimum ${cfg.minLoginAttempts}); failed-login rate not evaluated.`);
    else if (s.baselineFailedLoginRate === undefined || s.baselineFailedLoginRate <= 0) reasons.push('No usable baseline (missing or zero); baseline multiple not evaluated.');
    else if (!s.baselineComputedAt || (now.getTime() - Date.parse(s.baselineComputedAt)) / 86_400_000 > cfg.maxBaselineAgeDays) reasons.push(`Baseline is missing a date or older than ${cfg.maxBaselineAgeDays} days; baseline multiple not evaluated.`);
    else multiple = rate! / s.baselineFailedLoginRate;

    const existing = current.find((o) => o.country === s.country);
    if (bad.length) {
      decisions.push({ country: s.country, outcome: 'insufficient_evidence', reasons: [...reasons, ...bad.map((x) => `Not evaluated: ${x}.`)], override: existing });
      continue;
    }
    if (share === undefined && multiple === undefined) {
      decisions.push({ country: s.country, outcome: 'insufficient_evidence', reasons, override: existing });
      continue;
    }
    const over = (share !== undefined && share >= cfg.maliciousShareThreshold) || (multiple !== undefined && multiple >= cfg.failedLoginMultiplier);
    // Hysteresis: an existing challenge stays "hot" until metrics fall well below the thresholds.
    const stillHot = (share !== undefined && share >= cfg.maliciousShareThreshold * cfg.hysteresisFactor) || (multiple !== undefined && multiple >= cfg.failedLoginMultiplier * cfg.hysteresisFactor);
    if (share !== undefined) reasons.push(`Malicious share ${(share * 100).toFixed(1)}% (threshold ${(cfg.maliciousShareThreshold * 100).toFixed(0)}%).`);
    if (multiple !== undefined) reasons.push(`Failed-login rate ${(rate! * 100).toFixed(1)}% = ${multiple.toFixed(1)}x baseline (threshold ${cfg.failedLoginMultiplier}x).`);

    const webClients = s.clients.filter((c) => c === 'web');
    const native = s.clients.filter((c) => c !== 'web');
    const nativeClientAdvice = native.length
      ? `Traffic includes ${native.join(' and ')} clients, which cannot complete browser challenges. Use per-account/IP/device rate limits and step-up authentication for them instead.`
      : undefined;
    const isEuB2c = EU_MEMBER_STATES.includes(s.country) && policy.businessModel !== 'b2b';
    const base = { country: s.country, maliciousShare: share, failedLoginRate: rate, baselineMultiple: multiple, nativeClientAdvice };

    if (!over && !(existing && stillHot)) {
      decisions.push({ ...base, outcome: existing ? 'no_action' : 'monitor', reasons: [...reasons, existing ? 'Below thresholds with hysteresis; the active challenge will expire at its TTL.' : 'Below thresholds; continue monitoring.'], override: existing });
      continue;
    }
    if (!webClients.length) {
      decisions.push({ ...base, outcome: 'human_review_required', reasons: [...reasons, 'Thresholds exceeded but no web traffic is in this signal: a browser CHALLENGE would not apply.'],
        alert: { severity: 'warning', title: `Elevated abuse from ${s.country} on native/API clients`, dedupeKey: `threat:${s.country}:native:${dayKey(now)}` } });
      continue;
    }
    if (existing) {
      if (existing.renewals >= cfg.maxAutoRenewals) {
        decisions.push({ ...base, outcome: 'human_review_required', override: existing,
          reasons: [...reasons, `Challenge already auto-renewed ${existing.renewals} time(s); further renewal needs a human decision. Consider whether a reviewed permanent rule is justified${isEuB2c ? ' (EU B2C guardrail: CHALLENGE or MONITOR only, no discretionary BLOCK)' : ''}.`],
          alert: { severity: 'critical', title: `Human decision needed: sustained abuse from ${s.country}`, dedupeKey: `threat:${s.country}:decide:${existing.createdAt}` } });
        continue;
      }
      if (!cfg.autoEscalateToChallenge) {
        decisions.push({ ...base, outcome: 'propose_challenge', override: existing, reasons: [...reasons, 'Auto-escalation is disabled; renewal proposed for human approval.'],
          alert: { severity: 'warning', title: `Proposal: renew CHALLENGE for ${s.country}`, dedupeKey: `threat:${s.country}:renew:${existing.createdAt}` } });
        continue;
      }
      const renewed: ActiveOverride = { ...existing, expiresAt: new Date(now.getTime() + cfg.challengeTtlHours * 3_600_000).toISOString(), renewals: existing.renewals + 1, signalRef: s.source };
      decisions.push({ ...base, outcome: 'renew_challenge', override: renewed, reasons: [...reasons, `Renewed once for ${cfg.challengeTtlHours} h (renewal ${renewed.renewals} of ${cfg.maxAutoRenewals}).`],
        alert: { severity: 'warning', title: `CHALLENGE renewed for ${s.country}`, dedupeKey: `threat:${s.country}:renewed:${existing.createdAt}:${renewed.renewals}` } });
      continue;
    }
    const override: ActiveOverride = {
      country: s.country, action: 'CHALLENGE', clients: ['web'], createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + cfg.challengeTtlHours * 3_600_000).toISOString(), renewals: 0,
      reason: reasons.join(' '), signalRef: s.source,
    };
    if (!cfg.autoEscalateToChallenge) {
      decisions.push({ ...base, outcome: 'propose_challenge', override, reasons: [...reasons, 'Auto-escalation is disabled; a temporary web CHALLENGE is proposed for human approval.'],
        alert: { severity: 'warning', title: `Proposal: temporary CHALLENGE for ${s.country}`, dedupeKey: `threat:${s.country}:propose:${dayKey(now)}` } });
    } else {
      decisions.push({ ...base, outcome: 'apply_challenge', override, reasons: [...reasons, `Temporary web CHALLENGE for ${cfg.challengeTtlHours} h; provide an accessible recovery path and avoid CAPTCHA loops.`],
        alert: { severity: 'warning', title: `Temporary CHALLENGE applied for ${s.country}`, dedupeKey: `threat:${s.country}:apply:${dayKey(now)}` } });
    }
  }

  const changed = new Map(current.map((o) => [o.country, o]));
  for (const d of decisions) {
    if ((d.outcome === 'apply_challenge' || d.outcome === 'renew_challenge') && d.override) changed.set(d.country, d.override);
  }
  return { decisions, overrides: [...changed.values()] };
}

function selectorCountry(sel: GeoPolicy['rules'][number]['selector']): string {
  return sel.type === 'country' ? sel.code : sel.type === 'subdivision' ? sel.code.slice(0, 2) : sel.country;
}
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
