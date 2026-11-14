// Architecture and operational-health checks over the declared infrastructure inventory.
// The inventory is self-reported unless evidence says otherwise, so findings here are
// "requires_verification" (declared 'no') or reported as unknowns. Nothing is assumed safe.
import type { Component, Finding, InfrastructureInventory, Severity, Stage, Tri } from '../../domain/schemas.js';
import { makeFinding } from '../../domain/findings.js';

export const INFRA_RULES_VERSION = '1.0.0';

interface Check {
  ruleId: string;
  field: keyof Component['controls'];
  kinds: Component['kind'][];
  onlyIf?: (c: Component) => boolean;
  title: (c: Component) => string;
  severity: Severity;
  scenario: string;
  impact: string;
  fix: string;
  validation: string;
  effort: { low: number; high: number };
}

const CHECKS: Check[] = [
  { ruleId: 'INF-BACKUP', field: 'backups', kinds: ['database', 'object_storage'], onlyIf: (c) => c.holdsCustomerData, title: (c) => `No backups declared for ${c.id}`, severity: 'critical',
    scenario: 'An accidental delete, bad migration, or account compromise destroys customer data with no way back.', impact: 'Permanent customer data loss.',
    fix: 'Enable automated backups (database point-in-time recovery or daily backups; object versioning or a second-bucket copy for uploads).', validation: 'Backup configuration export plus a dated successful backup.', effort: { low: 1, high: 6 } },
  { ruleId: 'INF-RESTORE', field: 'restoreTested', kinds: ['database', 'object_storage'], onlyIf: (c) => c.holdsCustomerData, title: (c) => `Restore never tested for ${c.id}`, severity: 'high',
    scenario: 'A restore is first attempted during an incident and fails or takes far longer than the recovery-time objective.', impact: 'Extended outage; possible data loss despite having backups.',
    fix: 'Run the restore exercise in templates/consultant/backup-restore-exercise.md into an isolated project and record measured RTO/RPO.', validation: 'Dated restore-test record with measured duration and integrity check.', effort: { low: 2, high: 8 } },
  { ruleId: 'INF-TENANT', field: 'tenantIsolationEnforced', kinds: ['database', 'object_storage'], onlyIf: (c) => c.holdsCustomerData, title: (c) => `Tenant isolation not enforced at ${c.id}`, severity: 'critical',
    scenario: 'A bug or crafted request reads or changes another customer’s data.', impact: 'Cross-customer data exposure; breach-notification duties may follow.',
    fix: 'Enforce isolation in the data layer (row-level security or per-tenant keys), not only in application code. Test with two tenants.', validation: 'Automated test proving tenant A cannot read or write tenant B.', effort: { low: 4, high: 24 } },
  { ruleId: 'INF-RATELIMIT', field: 'rateLimited', kinds: ['function', 'compute', 'edge'], title: (c) => `No rate limiting declared on ${c.id}`, severity: 'medium',
    scenario: 'A scraper, retry storm, or attacker drives request volume that exhausts quotas or runs up paid vendor calls.', impact: 'Outage for real users and cost amplification.',
    fix: 'Add per-IP and per-account limits at the edge or in the function, with a durable counter.', validation: 'Test showing HTTP 429 after the limit.', effort: { low: 2, high: 8 } },
  { ruleId: 'INF-TIMEOUT', field: 'timeoutsConfigured', kinds: ['function', 'compute'], title: (c) => `No outbound timeouts declared on ${c.id}`, severity: 'medium',
    scenario: 'A slow dependency holds requests open until the platform limit, consuming all concurrency.', impact: 'One slow vendor takes the whole service down.',
    fix: 'Set explicit timeouts on every outbound call, shorter than the function limit.', validation: 'Code review or test with a stalled dependency.', effort: { low: 1, high: 6 } },
  { ruleId: 'INF-RETRY', field: 'retriesWithBackoffAndJitter', kinds: ['function', 'compute', 'queue', 'scheduled_job'], title: (c) => `Retries without backoff and jitter on ${c.id}`, severity: 'low',
    scenario: 'Synchronized retries after a brief outage arrive together and prolong it.', impact: 'Slower recovery from incidents.',
    fix: 'Use capped exponential backoff with jitter; make retried operations idempotent.', validation: 'Code review.', effort: { low: 1, high: 4 } },
  { ruleId: 'INF-IDEMPOTENT', field: 'idempotentWrites', kinds: ['function', 'compute', 'queue', 'payments'], title: (c) => `Writes on ${c.id} are not idempotent`, severity: 'high',
    scenario: 'A retried request or redelivered webhook applies the same change twice (double charge, double entitlement).', impact: 'Incorrect billing or entitlements; support load and refunds.',
    fix: 'Key each write on a deterministic identifier with a unique constraint; record processed event IDs in the same transaction.', validation: 'Test that replays the same request/event twice and asserts one effect.', effort: { low: 3, high: 12 } },
  { ruleId: 'INF-HEALTH', field: 'healthCheck', kinds: ['function', 'compute', 'database', 'edge'], title: (c) => `No health check or uptime monitor on ${c.id}`, severity: 'medium',
    scenario: 'The component fails and nobody is alerted until customers complain.', impact: 'Longer outages.',
    fix: 'Add an external uptime check on a critical-journey endpoint with an owned alert.', validation: 'Monitor configuration plus a test alert.', effort: { low: 1, high: 3 } },
  { ruleId: 'INF-ORIGIN', field: 'originOnlyReachableViaEdge', kinds: ['compute', 'function'], title: (c) => `Origin ${c.id} may be reachable without the edge`, severity: 'medium',
    scenario: 'Attackers bypass WAF, geo and rate-limit rules by calling the origin directly.', impact: 'Edge protections are ineffective.',
    fix: 'Restrict the origin to edge traffic (allow-list, authenticated origin pulls, or private networking).', validation: 'Direct request to the origin is refused.', effort: { low: 2, high: 8 } },
  { ruleId: 'INF-ENCRYPT', field: 'encryptionAtRest', kinds: ['database', 'object_storage'], onlyIf: (c) => c.holdsCustomerData, title: (c) => `Encryption at rest not confirmed for ${c.id}`, severity: 'medium',
    scenario: 'Storage media or a backup copy is exposed in readable form.', impact: 'Data exposure; weakens the position in breach assessments.',
    fix: 'Enable provider-managed encryption at rest and record the setting.', validation: 'Provider configuration export.', effort: { low: 1, high: 2 } },
];

export interface InfrastructureReport {
  version: string;
  findings: Finding[];
  unknowns: Array<{ component: string; controls: string[] }>;
  singleRegion: string[];
  brokenDependencies: string[];
  criticalDependencies: Array<{ journey: string; dependsOn: string[] }>;
}

export function assessInfrastructure(inv: InfrastructureInventory, stage: Stage): InfrastructureReport {
  const findings: Finding[] = [];
  const unknowns: InfrastructureReport['unknowns'] = [];
  const ids = new Set(inv.components.map((c) => c.id));
  const base = { ruleVersion: INFRA_RULES_VERSION, applicableStage: stage, ownerRole: 'Engineering lead', provenance: 'self_reported' as const, evidenceLevel: 'self_reported' as const };

  for (const c of inv.components) {
    const unk: string[] = [];
    for (const chk of CHECKS) {
      if (!chk.kinds.includes(c.kind) || (chk.onlyIf && !chk.onlyIf(c))) continue;
      const v: Tri = c.controls[chk.field];
      if (v === 'unknown') { unk.push(chk.field); continue; }
      if (v === 'yes') continue;
      findings.push(makeFinding({
        ...base, key: c.id, ruleId: chk.ruleId, title: chk.title(c), domains: chk.ruleId === 'INF-TENANT' || chk.ruleId === 'INF-ENCRYPT' ? ['infrastructure', 'security'] : ['infrastructure'],
        category: 'resilience', affected: { assets: [c.id], controls: [], files: [] }, severity: chk.severity,
        launchBlocker: chk.severity === 'critical', confidence: 'medium', status: 'requires_verification',
        observed: `Inventory declares ${chk.field} = no for ${c.id}${c.vendor ? ` (${c.vendor})` : ''}.`, expected: `${chk.field} in place and evidenced.`,
        scenario: chk.scenario, businessImpact: chk.impact,
        limitations: ['Based on the declared inventory, not on deployed-state evidence.'],
        evidence: [{ kind: 'intake_field', ref: `infrastructure.components[${c.id}].controls.${chk.field}` }],
        remediation: { summary: chk.fix }, effortHours: chk.effort, validation: chk.validation, acceptanceCriteria: [chk.validation],
        reassessWhen: 'After remediation, or when the component changes.',
      }));
    }
    if (unk.length) unknowns.push({ component: c.id, controls: unk });
  }

  const brokenDependencies = inv.components.flatMap((c) => c.dependsOn.filter((d) => !ids.has(d)).map((d) => `${c.id} -> ${d}`));
  const singleRegion = inv.components.filter((c) => c.holdsCustomerData && c.regions.length === 1).map((c) => `${c.id} (${c.regions[0]})`);

  const expand = (start: string[]): string[] => {
    const seen = new Set<string>();
    const stack = [...start];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      inv.components.find((c) => c.id === id)?.dependsOn.forEach((d) => stack.push(d));
    }
    return [...seen].sort();
  };
  const criticalDependencies = inv.criticalJourneys.map((j) => ({ journey: j.name, dependsOn: expand(j.components) }));

  const simple = (ruleId: string, key: string, title: string, severity: Severity, observed: string, scenario: string, impact: string, fix: string, validation: string, blocker = false) =>
    findings.push(makeFinding({
      ...base, key, ruleId, title, domains: ['infrastructure', 'security'], category: 'architecture', affected: { assets: [], controls: [], files: [] }, severity, launchBlocker: blocker,
      confidence: 'medium', status: 'requires_verification', observed, expected: 'Declared and evidenced.', scenario, businessImpact: impact,
      limitations: ['Based on the declared inventory.'], remediation: { summary: fix }, effortHours: { low: 1, high: 8 }, validation, acceptanceCriteria: [validation], reassessWhen: 'After remediation.',
    }));
  if (inv.productionIsolatedFromNonProduction === 'no') {
    simple('INF-ENV-ISOLATION', 'env', 'Production is not isolated from non-production', 'high', 'productionIsolatedFromNonProduction = no.',
      'A preview deploy or local script writes to, or leaks, production data.', 'Customer data exposure or corruption from test activity.',
      'Use separate projects, keys and payment modes for production; see docs/environments.md.', 'Preview deploys verified to use non-production credentials.');
  }
  if (inv.tlsEverywhere === 'no') {
    simple('INF-TLS', 'tls', 'TLS is not enforced everywhere', 'high', 'tlsEverywhere = no.', 'Credentials or session tokens travel in clear text.', 'Account takeover; data exposure.',
      'Force HTTPS with HSTS at the edge and require TLS for database connections.', 'HTTP requests redirect; database rejects non-TLS connections.');
  }
  if (inv.dnsRegistrarLocked === 'no') {
    simple('INF-DNS-LOCK', 'dns', 'Domain registrar lock / MFA not in place', 'high', 'dnsRegistrarLocked = no.', 'A hijacked registrar account repoints the domain to an attacker.', 'Complete service takeover and phishing of customers.',
      'Enable registrar lock and phishing-resistant MFA on the registrar and DNS accounts.', 'Registrar settings export.');
  }
  if (brokenDependencies.length) {
    simple('INF-INVENTORY-GAP', 'deps', 'Inventory references undeclared components', 'info', `Undeclared dependencies: ${brokenDependencies.join(', ')}.`,
      'Failure analysis misses a dependency.', 'Blind spots in incident planning.', 'Add the missing components to the inventory.', '`bcr validate intake` reports no undeclared dependencies.');
  }
  return { version: INFRA_RULES_VERSION, findings, unknowns, singleRegion, brokenDependencies, criticalDependencies };
}
