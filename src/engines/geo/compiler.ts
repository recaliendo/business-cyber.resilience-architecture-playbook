// Provider-neutral geo-policy compiler with adapters.
// Output is a DRY-RUN artifact plus a diff. Nothing here calls a provider API: deploying the
// artifact is a separate, authorised step through your normal change process.
import { z } from 'zod';
import type { GeoPolicy, GeoRule, GeoSelector } from '../../domain/schemas.js';
import type { ApprovalCheck } from './policy.js';
import type { ActiveOverride } from './signals.js';
import { EU_MEMBER_STATES } from '../compliance/applicability.js';
import { knowledgePath } from '../../knowledge/load.js';
import { loadStructured } from '../../lib/io.js';

export type ProviderId = 'cloudflare-waf' | 'aws-cloudfront' | 'aws-waf' | 'app-store';
const Cap = z.union([z.boolean(), z.literal('plan_dependent')]);
const Capabilities = z.object({
  version: z.string(),
  providers: z.record(z.string(), z.object({ sourceIds: z.array(z.string()), country: Cap, subdivision: Cap, challenge: Cap, log_only: Cap, nativeClientChallenge: z.boolean(), notes: z.string() })),
});
export type ProviderCaps = z.infer<typeof Capabilities>['providers'][string];

export function loadCapabilities(): z.infer<typeof Capabilities> {
  return Capabilities.parse(loadStructured(knowledgePath('geo', 'provider-capabilities.yaml')));
}

export interface CapabilityGap { ruleId: string; provider: ProviderId; missing: string; manualSteps: string[] }
export interface CompiledRule { key: string; ruleId: string; track: 'sanctions' | 'threat'; action: string; expression?: string; target?: string; description: string; warnings: string[] }
export interface CompileResult {
  provider: ProviderId;
  dryRun: true;
  liveProtection: false;
  policyId: string;
  policyVersion: number;
  refused: boolean;
  refusalReasons: string[];
  rules: CompiledRule[];
  gaps: CapabilityGap[];
  conflicts: string[];
  warnings: string[];
  artifact: unknown;
  diff?: { added: string[]; removed: string[]; unchanged: number };
}

export interface CompileOptions {
  allowSynthetic?: boolean;
  apiPathPrefix?: string;
  previousArtifactRules?: Array<{ description: string }>;
}

export function compile(policy: GeoPolicy, approval: ApprovalCheck, overrides: ActiveOverride[], provider: ProviderId, opts: CompileOptions = {}): CompileResult {
  const caps = loadCapabilities().providers[provider];
  const res: CompileResult = {
    provider, dryRun: true, liveProtection: false, policyId: policy.policyId, policyVersion: policy.version,
    refused: false, refusalReasons: [], rules: [], gaps: [], conflicts: [], warnings: [], artifact: null,
  };
  if (!caps) { res.refused = true; res.refusalReasons.push(`Unknown provider ${provider}.`); return res; }
  if (!approval.approved) { res.refused = true; res.refusalReasons.push('Policy is not approved for this exact content.', ...approval.reasons); }
  const synthetic = policy.rules.filter((r) => r.synthetic);
  if (synthetic.length && !opts.allowSynthetic) { res.refused = true; res.refusalReasons.push(`Policy contains synthetic example rules (${synthetic.map((r) => r.id).join(', ')}); pass --allow-synthetic for demos only.`); }
  if (res.refused) return res;
  if (caps.subdivision === 'plan_dependent' || caps.challenge === 'plan_dependent' || caps.log_only === 'plan_dependent') res.warnings.push(`Some ${provider} features depend on your plan. Verify before deploying (sources: ${caps.sourceIds.join(', ')}).`);

  // Precedence: a sanctions rule on a location suppresses threat rules for that same location.
  const sanctionKeys = new Set(policy.rules.filter((r) => r.track === 'sanctions').map((r) => selectorKey(r.selector)));
  for (const rule of policy.rules) {
    if (rule.track === 'threat' && sanctionKeys.has(selectorKey(rule.selector))) {
      res.conflicts.push(`${rule.id}: superseded by a sanctions rule for the same location.`);
      continue;
    }
    const country = selCountry(rule.selector);
    if (rule.track === 'threat' && rule.action === 'BLOCK' && EU_MEMBER_STATES.includes(country) && policy.businessModel !== 'b2b') {
      res.conflicts.push(`${rule.id}: discretionary BLOCK for EU member state ${country} with a ${policy.businessModel} model is refused by the EU guardrail. Use CHALLENGE or MONITOR, or route an exception to counsel (Regulation (EU) 2018/302 has a defined scope and justified exceptions).`);
      continue;
    }
    compileRule(rule, provider, caps, res, opts);
  }
  for (const o of overrides) {
    const synth: GeoRule = {
      id: `THR-TEMP-${o.country}`, track: 'threat', selector: { type: 'country', code: o.country }, action: o.action, reason: o.reason.slice(0, 200) || 'temporary',
      sourceRefs: [o.signalRef], confidence: 'medium', dateAdded: o.createdAt.slice(0, 10), effectiveDate: o.createdAt.slice(0, 10), reviewDate: o.expiresAt.slice(0, 10),
      expiresAt: o.expiresAt, clients: o.clients, exceptions: [], rollback: 'Expires automatically at TTL.', counselReviewed: false, synthetic: false,
    };
    if (sanctionKeys.has(selectorKey(synth.selector))) { res.conflicts.push(`${synth.id}: superseded by sanctions rule.`); continue; }
    compileRule(synth, provider, caps, res, opts);
  }
  res.artifact = buildArtifact(provider, res.rules);
  if (opts.previousArtifactRules) {
    const prev = new Set(opts.previousArtifactRules.map((r) => r.description));
    const next = new Set(res.rules.map((r) => r.description));
    res.diff = { added: [...next].filter((d) => !prev.has(d)), removed: [...prev].filter((d) => !next.has(d)), unchanged: [...next].filter((d) => prev.has(d)).length };
  }
  return res;
}

function compileRule(rule: GeoRule, provider: ProviderId, caps: ProviderCaps, res: CompileResult, opts: CompileOptions): void {
  const warnings: string[] = [];
  const gap = (missing: string, steps: string[]): void => { res.gaps.push({ ruleId: rule.id, provider, missing, manualSteps: steps }); };
  const nativeClients = rule.clients.filter((c) => c !== 'web');

  if (rule.action === 'CHALLENGE' && !caps.challenge) {
    return gap('challenge action', ['Use a provider that supports challenges for web traffic, or apply rate limits and step-up authentication in the application.']);
  }
  if (rule.action === 'MONITOR' && !caps.log_only) {
    return gap('log-only / monitor action', ['Monitor this location through application or edge logs; no blocking rule is needed.']);
  }
  if (rule.action === 'CHALLENGE' && nativeClients.length) warnings.push(`Challenges apply to web browsers only. ${nativeClients.join('/')} clients must be handled with rate limits and step-up authentication.`);

  let locations: string[];
  const sel = rule.selector;
  if (sel.type === 'country') {
    if (!caps.country) return gap('country matching', ['Enforce in application code from a trusted geolocation header.']);
    locations = [sel.code];
  } else {
    const subdivisions = sel.type === 'subdivision' ? [sel.code] : sel.approximateSubdivisions;
    if (sel.type === 'territory' && (!subdivisions.length || !rule.counselReviewed)) {
      return gap('legally described territory', [
        `The territory "${sel.legalDescription}" does not map exactly to codes${subdivisions.length ? '' : ' and no approximation is recorded'}.`,
        'Do NOT widen this rule to the whole country.',
        'Agree an approximation with counsel (record it in approximateSubdivisions with counselReviewed: true), then add signup and payment checks for the remaining precision gap.',
      ]);
    }
    if (!caps.subdivision) {
      return gap('subdivision matching', [
        `${provider} cannot match regions within a country. Do NOT widen ${subdivisions.join(', ')} to the whole of ${sel.type === 'subdivision' ? sel.code.slice(0, 2) : sel.country}.`,
        'Enforce on a layer that supports region matching (for example a WAF with subdivision fields), and add application-level checks.',
      ]);
    }
    if (caps.subdivision === 'plan_dependent') warnings.push('Region matching depends on your plan; verify before deploying.');
    if (sel.type === 'territory') warnings.push(`Approximation agreed by counsel: ${sel.mappingNote}. Geolocation at region level is imprecise and can be bypassed with VPNs.`);
    locations = subdivisions;
  }

  const description = `${rule.id} ${rule.track} ${rule.action} ${locations.join(',')}${rule.expiresAt ? ` until ${rule.expiresAt}` : ''}`;
  let expression: string | undefined;
  let target: string | undefined;
  if (provider === 'cloudflare-waf') {
    const field = sel.type === 'country' ? 'ip.src.country' : 'ip.src.subdivision_1_iso_code';
    expression = `(${field} in {${locations.map((l) => `"${l}"`).join(' ')}})`;
    if (rule.action === 'CHALLENGE') expression += ` and not starts_with(http.request.uri.path, "${opts.apiPathPrefix ?? '/api/'}")`;
  } else if (provider === 'aws-waf') {
    expression = JSON.stringify(sel.type === 'country' ? { GeoMatchStatement: { CountryCodes: locations } } : { RegionalGeoNote: 'Use the region-level geo match available for these locations', Locations: locations });
  } else {
    target = locations.join(',');
  }
  if (provider === 'aws-cloudfront' && rule.action !== 'BLOCK') return gap(`${rule.action} action`, ['CloudFront geo restriction only allows or denies whole countries.']);
  if (provider === 'app-store') {
    if (rule.track !== 'sanctions' || rule.action !== 'BLOCK') return gap('runtime threat controls', ['App Store availability is for distribution decisions, not threat response.']);
    warnings.push('Removing a territory in App Store Connect stops new downloads there. It does not stop existing installs or runtime access; enforce at the edge and in the backend too.');
  }
  res.rules.push({ key: rule.id, ruleId: rule.id, track: rule.track, action: rule.action, expression, target, description, warnings });
}

function buildArtifact(provider: ProviderId, rules: CompiledRule[]): unknown {
  switch (provider) {
    case 'cloudflare-waf':
      return { kind: 'cloudflare-custom-rules', note: 'DRY RUN. Apply through your reviewed deployment pipeline; never edit live rules by hand.',
        rules: rules.map((r) => ({ description: r.description, expression: r.expression, action: r.action === 'BLOCK' ? 'block' : r.action === 'CHALLENGE' ? 'managed_challenge' : 'log', enabled: true })) };
    case 'aws-waf':
      return { kind: 'aws-waf-rules', note: 'DRY RUN.', rules: rules.map((r, i) => ({ Name: r.ruleId, Priority: i + 1, Statement: r.expression ? JSON.parse(r.expression) : null, Action: r.action === 'BLOCK' ? { Block: {} } : r.action === 'CHALLENGE' ? { Challenge: {} } : { Count: {} } })) };
    case 'aws-cloudfront':
      return { kind: 'cloudfront-geo-restriction', note: 'DRY RUN.', RestrictionType: rules.length ? 'blacklist' : 'none', Items: [...new Set(rules.flatMap((r) => (r.target ?? '').split(',').filter(Boolean)))].sort() };
    case 'app-store':
      return { kind: 'app-store-territory-plan', note: 'MANUAL: remove these territories in App Store Connect after approval.', removeTerritories: [...new Set(rules.flatMap((r) => (r.target ?? '').split(',').filter(Boolean)))].sort() };
  }
}

function selCountry(sel: GeoSelector): string { return sel.type === 'country' ? sel.code : sel.type === 'subdivision' ? sel.code.slice(0, 2) : sel.country; }
function selectorKey(sel: GeoSelector): string { return sel.type === 'country' ? sel.code : sel.type === 'subdivision' ? sel.code : `${sel.country}:${sel.legalDescription}`; }
