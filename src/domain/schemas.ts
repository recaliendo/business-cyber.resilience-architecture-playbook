// Shared domain models. Every file the tool reads is validated against these schemas, and
// schemas/*.json is generated from them (npm run schemas). Do not hand-edit the JSON copies.
import { z } from 'zod';

// ---------- primitives ----------
export const Tri = z.enum(['yes', 'no', 'unknown']);
export type Tri = z.infer<typeof Tri>;
const tri = () => Tri.default('unknown');

export const Stage = z.enum(['prelaunch', 'launch', 'early_production', 'growth', 'enterprise_global']);
export type Stage = z.infer<typeof Stage>;
export const STAGE_ORDER: Stage[] = ['prelaunch', 'launch', 'early_production', 'growth', 'enterprise_global'];

export const Provenance = z.enum(['observed', 'self_reported', 'inferred', 'unknown']);
export type Provenance = z.infer<typeof Provenance>;

export const ControlState = z.enum(['met', 'partial', 'unmet', 'unknown', 'not_applicable']);
export type ControlState = z.infer<typeof ControlState>;

export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof Severity>;
export const Priority = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof Priority>;
export const Confidence = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof Confidence>;

const IsoDateTime = z.iso.datetime({ offset: true });
const IsoDate = z.iso.date();
/** ISO 3166-1 alpha-2, or the pseudo-code "EU" for the EU as a target market. */
const CountryCode = z.string().regex(/^([A-Z]{2}|EU)$/, 'ISO 3166-1 alpha-2 country code (or EU)');

const Range = z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() }).refine((r) => r.high >= r.low, 'high must be >= low');

// ---------- business profile ----------
export const DataClass = z.enum([
  'personal', 'contact', 'account_credentials', 'precise_location', 'payment_card', 'financial',
  'health', 'children', 'education', 'biometric', 'government_id', 'user_content', 'behavioral_analytics',
  'employee', 'none',
]);
export type DataClass = z.infer<typeof DataClass>;

export const BusinessProfile = z.object({
  name: z.string().min(1).max(200),
  model: z.enum(['b2c', 'b2b', 'hybrid', 'unknown']).default('unknown'),
  enterpriseDealsInPipeline: tri(),
  securityQuestionnairesReceived: tri(),
  revenueBlockedBySecurityReview: tri(),
  stage: Stage,
  team: z.object({ size: z.number().int().positive(), engineeringHoursPerWeek: z.number().nonnegative().optional() }),
  budgetMonthlyUsd: z.number().nonnegative().optional(),
  riskTolerance: z.enum(['low', 'medium', 'high']).default('medium'),
  establishment: z.object({ countries: z.array(CountryCode).default([]) }).default({ countries: [] }),
  targetMarkets: z.array(CountryCode).default([]),
  dataLocations: z.array(z.string()).default([]),
  dataClasses: z.array(DataClass).default([]),
  processingPurposes: z.array(z.string()).default([]),
  surfaces: z.object({ ios: z.boolean().default(false), web: z.boolean().default(false), android: z.boolean().default(false), publicApi: z.boolean().default(false) }).default({ ios: false, web: false, android: false, publicApi: false }),
  sector: z.object({
    hipaaRole: z.enum(['covered_entity', 'business_associate', 'none', 'unknown']).default('unknown'),
    ferpaRole: z.enum(['school_official_service_provider', 'none', 'unknown']).default('unknown'),
    glbaFinancialInstitution: tri(),
  }).default({ hipaaRole: 'unknown', ferpaRole: 'unknown', glbaFinancialInstitution: 'unknown' }),
  children: z.object({
    directedToChildren: tri(),
    likelyAccessedByChildren: tri(),
    actualKnowledgeOfUnder13: tri(),
  }).default({ directedToChildren: 'unknown', likelyAccessedByChildren: 'unknown', actualKnowledgeOfUnder13: 'unknown' }),
  privacy: z.object({
    role: z.enum(['controller', 'processor', 'both', 'unknown']).default('unknown'),
    offersToEuIndividuals: tri(),
    monitorsEuBehaviour: tri(),
    offersToUkIndividuals: tri(),
    monitorsUkBehaviour: tri(),
    processesInBrazilOrOffersToBrazil: tri(),
    caResidentsPersonalDataPerYear: z.number().int().nonnegative().optional(),
    annualGrossRevenueUsd: z.number().nonnegative().optional(),
    revenueShareFromSellingOrSharingData: z.number().min(0).max(1).optional(),
    sellsOrSharesPersonalData: tri(),
    largeScaleSensitiveProcessing: tri(),
    occasionalProcessingOnly: tri(),
  }).default({
    role: 'unknown', offersToEuIndividuals: 'unknown', monitorsEuBehaviour: 'unknown', offersToUkIndividuals: 'unknown',
    monitorsUkBehaviour: 'unknown', processesInBrazilOrOffersToBrazil: 'unknown', sellsOrSharesPersonalData: 'unknown',
    largeScaleSensitiveProcessing: 'unknown', occasionalProcessingOnly: 'unknown',
  }),
  ios: z.object({
    supportsAccountCreation: tri(),
    tracksPerAttDefinition: tri(),
    thirdPartySdks: z.array(z.string()).default([]),
    sellsDigitalGoodsOrSubscriptions: tri(),
    usesRequiredReasonApis: tri(),
  }).default({ supportsAccountCreation: 'unknown', tracksPerAttDefinition: 'unknown', thirdPartySdks: [], sellsDigitalGoodsOrSubscriptions: 'unknown', usesRequiredReasonApis: 'unknown' }),
  payments: z.object({
    method: z.enum(['stripe_hosted_checkout', 'stripe_elements', 'apple_iap', 'custom_card_form', 'none', 'unknown']).default('unknown'),
    rawCardDataTouchesOurServers: tri(),
  }).default({ method: 'unknown', rawCardDataTouchesOurServers: 'unknown' }),
  ai: z.object({
    usesAi: tri(),
    role: z.enum(['provider', 'deployer', 'both', 'none', 'unknown']).default('unknown'),
    usersInteractWithAiSystem: tri(),
    generatesSyntheticContent: tri(),
    possibleHighRiskUseCase: tri(),
    outputUsedInEu: tri(),
  }).default({ usesAi: 'unknown', role: 'unknown', usersInteractWithAiSystem: 'unknown', generatesSyntheticContent: 'unknown', possibleHighRiskUseCase: 'unknown', outputUsedInEu: 'unknown' }),
  accessibility: z.object({
    offersEaaCoveredServicesInEu: tri(),
    microenterprise: tri(),
    usPublicFacingService: tri(),
  }).default({ offersEaaCoveredServicesInEu: 'unknown', microenterprise: 'unknown', usPublicFacingService: 'unknown' }),
});
export type BusinessProfile = z.infer<typeof BusinessProfile>;

// ---------- workload & capacity ----------
export const RequestClass = z.object({
  name: z.string(),
  share: z.number().min(0).max(1).describe('Fraction of requests (all classes should sum to 1)'),
  avgDurationMs: z.number().positive(),
  dbQueriesPerRequest: z.number().nonnegative().default(0),
  avgDbQueryMs: z.number().nonnegative().default(0),
  cacheHitRatio: z.number().min(0).max(1).default(0),
});
export type RequestClass = z.infer<typeof RequestClass>;

const PricedUnit = z.object({ usd: z.number().nonnegative(), sourceDate: IsoDate, source: z.string().optional() });

export const Measurement = z.object({
  metric: z.string(),
  value: z.number(),
  unit: z.string(),
  measuredAt: IsoDateTime,
  provenance: Provenance,
  evidenceRef: z.string().optional(),
});
export type Measurement = z.infer<typeof Measurement>;

export const LoadTestResult = z.object({
  scenario: z.enum(['baseline', 'ramp', 'spike', 'soak', 'recovery']),
  environment: z.enum(['local', 'staging', 'production']),
  sustainedRps: z.number().positive(),
  p95Ms: z.number().positive(),
  errorRate: z.number().min(0).max(1),
  testedAt: IsoDateTime,
  evidenceRef: z.string(),
});
export type LoadTestResult = z.infer<typeof LoadTestResult>;

export const WorkloadProfile = z.object({
  mau: z.number().int().nonnegative().optional(),
  dau: z.number().int().nonnegative().optional(),
  peakConcurrentActiveUsers: z.number().nonnegative().optional().describe('Users with an active session making requests in the same minute'),
  requestsPerActiveUserPerMinute: z.number().positive().optional(),
  peakToAverageRatio: z.number().min(1).default(3),
  burstMultiplier: z.number().min(1).default(2).describe('Short spikes above peak (seconds to minutes)'),
  requestMix: z.array(RequestClass).default([]),
  growth: z.object({ monthlyRate: z.number().min(-1).max(10).optional() }).default({}),
  storage: z.object({
    databaseGb: z.number().nonnegative().optional(),
    databaseGrowthGbPerMonth: z.number().nonnegative().optional(),
    indexOverheadRatio: z.number().min(0).max(5).default(0.3),
    objectStorageGb: z.number().nonnegative().optional(),
    uploadsPerDay: z.number().nonnegative().optional(),
    avgUploadMb: z.number().nonnegative().optional(),
    objectRetentionDays: z.number().int().positive().optional().describe('Omit for keep-forever'),
    objectVersioning: z.boolean().default(false),
    versionOverheadRatio: z.number().min(0).max(10).default(0.2),
    replicaCount: z.number().int().min(1).default(1).describe('Total stored copies incl. primary'),
    backupRetentionDays: z.number().int().nonnegative().optional(),
    backupFullCopiesRetained: z.number().int().nonnegative().optional().describe('If omitted, estimated as one full copy per 7 days of retention'),
    logsGbPerDay: z.number().nonnegative().optional(),
    logRetentionDays: z.number().int().nonnegative().optional(),
    egressGbPerMonth: z.number().nonnegative().optional(),
  }).default({ indexOverheadRatio: 0.3, objectVersioning: false, versionOverheadRatio: 0.2, replicaCount: 1 }),
  limits: z.object({
    computeConcurrency: z.number().int().positive().optional(),
    functionTimeoutMs: z.number().int().positive().optional(),
    dbMaxConnections: z.number().int().positive().optional(),
    dbPoolSize: z.number().int().positive().optional(),
    dbQuotaGb: z.number().positive().optional(),
    objectStorageQuotaGb: z.number().positive().optional(),
    logQuotaGb: z.number().positive().optional(),
  }).default({}),
  unitPrices: z.object({
    perMillionRequests: PricedUnit.optional(),
    perGbSecondCompute: PricedUnit.optional(),
    perGbMonthDatabase: PricedUnit.optional(),
    perGbMonthObject: PricedUnit.optional(),
    perGbMonthBackup: PricedUnit.optional(),
    perGbEgress: PricedUnit.optional(),
    perGbLogsIngested: PricedUnit.optional(),
    fixedMonthly: PricedUnit.optional(),
  }).default({}),
  computeMemoryGb: z.number().positive().default(1),
  slo: z.object({ availability: z.number().min(0).max(1).optional(), p95LatencyMs: z.number().positive().optional() }).default({}),
  rtoMinutes: z.number().positive().optional(),
  rpoMinutes: z.number().nonnegative().optional(),
  measurements: z.array(Measurement).default([]),
  loadTests: z.array(LoadTestResult).default([]),
});
export type WorkloadProfile = z.infer<typeof WorkloadProfile>;

// ---------- infrastructure & data ----------
export const Component = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  kind: z.enum(['dns', 'edge', 'cdn', 'compute', 'function', 'database', 'object_storage', 'queue', 'scheduled_job', 'auth', 'payments', 'email', 'monitoring', 'third_party']),
  vendor: z.string().optional(),
  regions: z.array(z.string()).default([]),
  holdsCustomerData: z.boolean().default(false),
  dependsOn: z.array(z.string()).default([]),
  controls: z.object({
    healthCheck: tri(),
    timeoutsConfigured: tri(),
    retriesWithBackoffAndJitter: tri(),
    circuitBreakerOrLoadShedding: tri(),
    idempotentWrites: tri(),
    rateLimited: tri(),
    backups: tri(),
    restoreTested: tri(),
    originOnlyReachableViaEdge: tri(),
    tenantIsolationEnforced: tri(),
    encryptionAtRest: tri(),
  }).default({
    healthCheck: 'unknown', timeoutsConfigured: 'unknown', retriesWithBackoffAndJitter: 'unknown', circuitBreakerOrLoadShedding: 'unknown',
    idempotentWrites: 'unknown', rateLimited: 'unknown', backups: 'unknown', restoreTested: 'unknown', originOnlyReachableViaEdge: 'unknown',
    tenantIsolationEnforced: 'unknown', encryptionAtRest: 'unknown',
  }),
  notes: z.string().optional(),
});
export type Component = z.infer<typeof Component>;

export const InfrastructureInventory = z.object({
  components: z.array(Component).default([]),
  environments: z.array(z.enum(['local', 'preview', 'staging', 'production'])).default([]),
  productionIsolatedFromNonProduction: tri(),
  criticalJourneys: z.array(z.object({ name: z.string(), components: z.array(z.string()), sloP95Ms: z.number().positive().optional() })).default([]),
  tlsEverywhere: tri(),
  dnsRegistrarLocked: tri(),
});
export type InfrastructureInventory = z.infer<typeof InfrastructureInventory>;

export const Vendor = z.object({
  name: z.string(),
  purpose: z.string(),
  processesCustomerData: z.boolean(),
  critical: z.boolean().default(false),
  dpaSigned: tri(),
  regions: z.array(z.string()).default([]),
  assurance: z.array(z.enum(['soc2_type1', 'soc2_type2', 'iso27001', 'pci_dss_aoc', 'hipaa_baa_available', 'none_known'])).default([]),
  assuranceReportDate: IsoDate.optional(),
  subprocessorsReviewed: tri(),
});
export type Vendor = z.infer<typeof Vendor>;

export const DataInventory = z.object({
  datasets: z.array(z.object({
    name: z.string(),
    classes: z.array(DataClass),
    locations: z.array(z.string()).default([]),
    retentionDays: z.number().int().positive().optional(),
    deletionProcess: tri(),
    backedUp: tri(),
  })).default([]),
  vendors: z.array(Vendor).default([]),
});
export type DataInventory = z.infer<typeof DataInventory>;

// ---------- evidence ----------
export const EvidenceItem = z.object({
  id: z.string().regex(/^[A-Za-z0-9._-]+$/),
  kind: z.enum(['config_export', 'screenshot', 'log_extract', 'attestation', 'statement', 'test_result', 'load_test', 'restore_test', 'policy_document', 'repo_scan', 'ticket', 'other']),
  description: z.string().max(2000),
  provenance: Provenance,
  collectedAt: IsoDateTime,
  collectedBy: z.string().optional(),
  reference: z.string().max(500).describe('Path or URL to the evidence. Never paste secrets or raw customer data.'),
  assertions: z.array(z.object({
    controlId: z.string(),
    state: ControlState,
    justification: z.string().optional(),
  })).min(1),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

// ---------- intake (top level) ----------
export const Intake = z.object({
  schemaVersion: z.literal(1).default(1),
  business: BusinessProfile,
  workload: WorkloadProfile.optional(),
  infrastructure: InfrastructureInventory.optional(),
  data: DataInventory.optional(),
  evidence: z.array(EvidenceItem).default([]),
  assessedAt: IsoDateTime.optional().describe('Fixed timestamp for reproducible reports; defaults to now'),
});
export type Intake = z.infer<typeof Intake>;
/** The shape a user writes (defaults not yet applied). */
export type IntakeInput = z.input<typeof Intake>;

// ---------- knowledge: controls & obligations ----------
export const ControlDef = z.object({
  id: z.string().regex(/^[A-Z]{2,5}-\d{2,3}$/),
  title: z.string(),
  domain: z.enum(['identity_access', 'change_management', 'logging_monitoring', 'vulnerability_management', 'data_protection', 'resilience', 'vendor_management', 'policy', 'endpoint', 'evidence', 'privacy']),
  description: z.string(),
  minStage: Stage,
  weight: z.number().int().min(1).max(5),
  severityIfUnmet: Severity,
  blockerIfUnmet: z.boolean().default(false),
  quickWin: z.boolean().default(false),
  effortHours: Range,
  costUsd: Range.optional(),
  ownerRole: z.string(),
  evidenceRequired: z.array(z.string()).min(1),
  evidenceMaxAgeDays: z.number().int().positive(),
  soloFounderAlternative: z.string().optional(),
  remediation: z.string(),
  validation: z.string(),
  dependsOn: z.array(z.string()).default([]),
  informationalMappings: z.object({ soc2Tsc: z.array(z.string()).default([]), iso27001Annex: z.array(z.string()).default([]) }).default({ soc2Tsc: [], iso27001Annex: [] }),
});
export type ControlDef = z.infer<typeof ControlDef>;

export const ControlCatalog = z.object({ version: z.string(), controls: z.array(ControlDef) });
export type ControlCatalog = z.infer<typeof ControlCatalog>;

export const ObligationDef = z.object({
  id: z.string().regex(/^OB-[A-Z0-9-]+$/),
  title: z.string(),
  category: z.enum(['legal', 'platform', 'contractual', 'voluntary']),
  jurisdiction: z.string(),
  ruleCategory: z.string(),
  summary: z.string(),
  applicabilityConditions: z.string(),
  exceptions: z.string().default(''),
  effectiveDates: z.string().default(''),
  sourceIds: z.array(z.string()).min(1),
  requiredEvidence: z.array(z.string()).default([]),
  remediation: z.string(),
  counselReview: z.boolean(),
  launchBlockerIfApplicable: z.boolean().default(false),
  relatedControls: z.array(z.string()).default([]),
});
export type ObligationDef = z.infer<typeof ObligationDef>;
export const ObligationCatalog = z.object({ version: z.string(), obligations: z.array(ObligationDef) });
export type ObligationCatalog = z.infer<typeof ObligationCatalog>;

// ---------- sources ----------
export const SourceRecord = z.object({
  id: z.string().regex(/^SRC-[A-Z0-9-]+$/),
  publisher: z.string(),
  title: z.string(),
  url: z.url({ protocol: /^https$/ }),
  topic: z.string(),
  jurisdiction: z.string(),
  official: z.boolean(),
  effectiveDate: IsoDate.nullable().default(null),
  retrievedAt: IsoDateTime.nullable().default(null),
  verifiedAt: IsoDateTime.nullable().default(null),
  verifiedBy: z.string().nullable().default(null),
  reviewCadenceDays: z.number().int().positive(),
  contentHash: z.string().nullable().default(null),
  license: z.string().optional(),
  notes: z.string().optional(),
});
export type SourceRecord = z.infer<typeof SourceRecord>;
export const SourceRegistry = z.object({ version: z.string(), sources: z.array(SourceRecord) });
export type SourceRegistry = z.infer<typeof SourceRegistry>;

// ---------- geo policy ----------
export const GeoSelector = z.discriminatedUnion('type', [
  z.object({ type: z.literal('country'), code: z.string().regex(/^[A-Z]{2}$/) }),
  z.object({ type: z.literal('subdivision'), code: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/) }),
  z.object({
    type: z.literal('territory'),
    legalDescription: z.string().min(10),
    country: z.string().regex(/^[A-Z]{2}$/),
    approximateSubdivisions: z.array(z.string().regex(/^[A-Z]{2}-[A-Z0-9]{1,3}$/)).default([]),
    mappingNote: z.string(),
  }),
]);
export type GeoSelector = z.infer<typeof GeoSelector>;

export const GeoAction = z.enum(['BLOCK', 'CHALLENGE', 'MONITOR']);
export type GeoAction = z.infer<typeof GeoAction>;
export const ClientType = z.enum(['web', 'ios', 'api']);
export type ClientType = z.infer<typeof ClientType>;

export const GeoRule = z.object({
  id: z.string().regex(/^(SAN|THR)-[A-Z0-9-]+$/),
  track: z.enum(['sanctions', 'threat']),
  selector: GeoSelector,
  action: GeoAction,
  reason: z.string().min(5),
  legalBasis: z.string().optional(),
  sourceRefs: z.array(z.string()).default([]),
  confidence: Confidence,
  dateAdded: IsoDate,
  effectiveDate: IsoDate,
  reviewDate: IsoDate,
  expiresAt: IsoDateTime.optional(),
  clients: z.array(ClientType).default(['web', 'ios', 'api']),
  exceptions: z.array(z.string()).default([]),
  rollback: z.string().default('Revert the policy commit; redeploy the previous approved artifact.'),
  counselReviewed: z.boolean().default(false),
  synthetic: z.boolean().default(false).describe('True for examples/tests. Synthetic rules are refused by enforcement planning unless --allow-synthetic.'),
}).superRefine((r, ctx) => {
  if (r.track === 'sanctions' && !r.id.startsWith('SAN-')) ctx.addIssue({ code: 'custom', message: 'sanctions rules must use the SAN- prefix' });
  if (r.track === 'threat' && !r.id.startsWith('THR-')) ctx.addIssue({ code: 'custom', message: 'threat rules must use the THR- prefix' });
  if (r.track === 'sanctions' && !r.legalBasis) ctx.addIssue({ code: 'custom', message: 'sanctions rules require legalBasis' });
  if (r.track === 'threat' && r.action === 'BLOCK' && !r.counselReviewed) {
    // Permanent discretionary blocks are allowed only as an explicit, reviewed human decision.
    ctx.addIssue({ code: 'custom', message: 'discretionary threat BLOCK rules must be counselReviewed (human decision)' });
  }
});
export type GeoRule = z.infer<typeof GeoRule>;

export const GeoPolicy = z.object({
  policyId: z.string(),
  version: z.number().int().positive(),
  businessModel: z.enum(['b2c', 'b2b', 'hybrid']),
  rules: z.array(GeoRule),
  quarterlyReviewDue: IsoDate,
});
export type GeoPolicy = z.infer<typeof GeoPolicy>;

export const ApprovalRecord = z.object({
  id: z.string(),
  policyId: z.string(),
  policyVersion: z.number().int().positive(),
  policyHash: z.string().regex(/^[a-f0-9]{64}$/),
  approver: z.string(),
  approvedAt: IsoDateTime,
  changeRef: z.string().describe('PR URL or commit SHA that carried the reviewed change'),
  method: z.enum(['github_pr_review', 'signed_commit', 'manual_record']),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecord>;

export const ThreatSignal = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  windowStart: IsoDateTime,
  windowEnd: IsoDateTime,
  totalRequests: z.number().int().nonnegative(),
  maliciousRequests: z.number().int().nonnegative(),
  loginAttempts: z.number().int().nonnegative(),
  failedLogins: z.number().int().nonnegative(),
  baselineFailedLoginRate: z.number().min(0).max(1).optional().describe('Failed/attempts over the baseline window'),
  baselineComputedAt: IsoDateTime.optional(),
  source: z.string(),
  clients: z.array(ClientType).default(['web']),
});
export type ThreatSignal = z.infer<typeof ThreatSignal>;

// ---------- outputs ----------
export const EvidenceRef = z.object({
  kind: z.enum(['evidence_item', 'source_file', 'config', 'measurement', 'intake_field', 'external_reference']),
  ref: z.string(),
  collectedAt: IsoDateTime.optional(),
  url: z.string().optional(),
  line: z.number().int().positive().optional(),
});
export type EvidenceRef = z.infer<typeof EvidenceRef>;

export const FindingStatus = z.enum(['confirmed', 'suspected', 'requires_verification']);
export const Finding = z.object({
  id: z.string(),
  ruleId: z.string(),
  ruleVersion: z.string(),
  title: z.string(),
  domains: z.array(z.enum(['infrastructure', 'capacity', 'security', 'compliance', 'geo', 'repository'])),
  category: z.string(),
  affected: z.object({ assets: z.array(z.string()).default([]), controls: z.array(z.string()).default([]), files: z.array(z.string()).default([]) }),
  severity: Severity,
  priority: Priority,
  confidence: Confidence,
  status: FindingStatus,
  provenance: Provenance,
  evidenceLevel: z.enum(['source_code', 'declared_config', 'deployed_evidence', 'self_reported', 'none']),
  observed: z.string(),
  expected: z.string(),
  scenario: z.string(),
  businessImpact: z.string(),
  insights: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  evidence: z.array(EvidenceRef).default([]),
  references: z.array(z.object({ title: z.string(), url: z.string(), sourceId: z.string().optional() })).default([]),
  remediation: z.object({
    summary: z.string(),
    steps: z.array(z.string()).default([]),
    alternatives: z.array(z.string()).default([]),
    illustrativeCode: z.string().optional(),
    files: z.array(z.string()).default([]),
    rollout: z.string().optional(),
  }),
  ownerRole: z.string(),
  effortHours: Range,
  costUsd: Range.optional(),
  dependencies: z.array(z.string()).default([]),
  validation: z.string(),
  acceptanceCriteria: z.array(z.string()).default([]),
  applicableStage: Stage,
  reassessWhen: z.string(),
  launchBlocker: z.boolean().default(false),
  vendorOptions: z.array(z.object({
    name: z.string(), addresses: z.string(), whyNotNative: z.string(), retainedResponsibilities: z.string(),
    stageFit: z.string(), pricingNote: z.string(), limitations: z.string(), docsUrl: z.string().optional(), lowerCostAlternative: z.string().optional(),
  })).default([]),
  prompt: z.object({ path: z.string(), text: z.string() }).optional(),
});
export type Finding = z.infer<typeof Finding>;
export type FindingInput = z.input<typeof Finding>;

export const RoadmapItem = z.object({
  id: z.string(),
  title: z.string(),
  horizon: z.enum(['next_day', 'd30', 'd60', 'd90', 'later']),
  priority: Priority,
  findingIds: z.array(z.string()),
  businessImpact: z.string(),
  stage: Stage,
  ownerRole: z.string(),
  effortHours: Range,
  costUsd: Range.optional(),
  dependencies: z.array(z.string()),
  evidenceToCollect: z.array(z.string()),
  completionCriteria: z.array(z.string()),
});
export type RoadmapItem = z.infer<typeof RoadmapItem>;
