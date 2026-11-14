// Load and validate an intake, then work out the smallest useful set of follow-up questions.
import { Intake, type IntakeInput, type Tri } from '../domain/schemas.js';
import { loadStructured, InputError } from '../lib/io.js';

export interface FollowUpQuestion {
  id: string;
  priority: 1 | 2 | 3;
  question: string;
  why: string;
  blocks: string[];
}

export interface LoadedIntake {
  intake: Intake;
  questions: FollowUpQuestion[];
  assumptions: string[];
  completeness: { answered: number; total: number };
}

export interface ValidationIssue { path: string; message: string }

export function validateIntake(raw: unknown): { ok: true; intake: Intake } | { ok: false; issues: ValidationIssue[] } {
  const parsed = Intake.safeParse(raw);
  if (parsed.success) return { ok: true, intake: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message })),
  };
}

export function loadIntakeFile(path: string): LoadedIntake {
  const result = validateIntake(loadStructured(path));
  if (!result.ok) {
    throw new InputError(`intake is invalid:\n${result.issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`, path);
  }
  return analyseIntake(result.intake);
}

export function analyseIntake(intake: Intake): LoadedIntake {
  const b = intake.business;
  const q: FollowUpQuestion[] = [];
  const assumptions: string[] = [];
  const unk = (t: Tri) => t === 'unknown';

  // The three questions the consultant always asks first.
  if (b.model === 'unknown' || (b.model !== 'b2c' && unk(b.enterpriseDealsInPipeline) && unk(b.securityQuestionnairesReceived))) {
    q.push({
      id: 'Q1-model', priority: 1,
      question: 'Is the business B2C, B2B, or hybrid? Are enterprise deals or security questionnaires already appearing?',
      why: 'Determines whether SOC 2 / ISO 27001 belong on the roadmap now, later, or not at all.',
      blocks: ['SOC 2 / ISO positioning'],
    });
  }
  const sensitive = b.dataClasses.some((c) => ['health', 'children', 'education', 'financial', 'biometric', 'payment_card', 'government_id'].includes(c));
  if (b.dataClasses.length === 0 || (sensitive && (b.sector.hipaaRole === 'unknown' || b.sector.ferpaRole === 'unknown' || unk(b.sector.glbaFinancialInstitution))) || b.processingPurposes.length === 0) {
    q.push({
      id: 'Q2-sensitive-data', priority: 1,
      question: "Are minors', health, education, financial, or other sensitive data involved? What are the actual business relationships (e.g. are you a HIPAA covered entity or business associate, a school's service provider, a financial institution) and processing purposes?",
      why: 'Sector laws (HIPAA, FERPA, GLBA, COPPA) depend on legal roles and relationships, not just on the type of data.',
      blocks: ['sector-law applicability', "children's privacy applicability"],
    });
  }
  if (b.establishment.countries.length === 0 || b.targetMarkets.length === 0 || b.dataLocations.length === 0) {
    q.push({
      id: 'Q3-geography', priority: 1,
      question: 'Where is the business established, which countries/regions do you target, and where are data and vendors located?',
      why: 'Privacy-law scope, representatives, transfer mechanisms, sanctions nexus, and accessibility duties all depend on establishment and targeting.',
      blocks: ['privacy-law applicability', 'sanctions nexus', 'EU/UK representative assessment'],
    });
  }

  // Follow-ups only when they unblock a conclusion.
  const w = intake.workload;
  if (!w || (w.peakConcurrentActiveUsers === undefined && w.dau === undefined)) {
    q.push({ id: 'Q4-traffic', priority: 2, question: 'What are your DAU and peak concurrently-active users (users making requests in the same minute)?', why: 'Capacity cannot be derived from MAU alone.', blocks: ['capacity forecast'] });
  }
  if (w && w.requestMix.length === 0) {
    q.push({ id: 'Q5-request-mix', priority: 2, question: 'What is your request mix (main request types, their share, average duration, and DB queries per request)?', why: 'Needed to estimate compute and database concurrency.', blocks: ['capacity forecast'] });
  }
  if (!intake.infrastructure || intake.infrastructure.components.length === 0) {
    q.push({ id: 'Q6-infra', priority: 2, question: 'List your production components (edge/CDN, compute/functions, database, storage, auth, payments, email) and vendors.', why: 'Needed for architecture, failure-dependency and backup analysis.', blocks: ['infrastructure assessment'] });
  }
  if (b.surfaces.ios && unk(b.ios.supportsAccountCreation)) {
    q.push({ id: 'Q7-ios-accounts', priority: 2, question: 'Does the iOS app let users create accounts? Does it track users across other companies’ apps or websites (per Apple’s ATT definition)?', why: 'Drives Apple account-deletion and App Tracking Transparency requirements.', blocks: ['Apple platform obligations'] });
  }
  if (b.payments.method === 'unknown') {
    q.push({ id: 'Q8-payments', priority: 2, question: 'How do you take payments (Stripe hosted Checkout, Stripe Elements, Apple IAP, own card form, none)?', why: 'Determines PCI DSS scope and Apple IAP rules.', blocks: ['payments obligations'] });
  }
  if (unk(b.ai.usesAi)) {
    q.push({ id: 'Q9-ai', priority: 3, question: 'Do you use AI features? If so: do you build/provide the model or deploy a third-party one, do users chat with it, and does it generate images/audio/video/text shown to the public?', why: 'AI-specific duties depend on role and use case.', blocks: ['AI obligations'] });
  }
  if (intake.evidence.length === 0) {
    q.push({ id: 'Q10-evidence', priority: 3, question: 'Can you provide evidence for MFA, branch protection, backups/restore tests, and vendor DPAs (exports, screenshots, or links)?', why: 'Without evidence, controls are reported as unknown, never as met.', blocks: ['control readiness'] });
  }

  if (b.model === 'unknown') assumptions.push('Business model unknown: SOC 2 / ISO positioning is reported as uncertain.');
  if (!w) assumptions.push('No workload data: capacity forecasts are not produced.');
  if (w && w.peakToAverageRatio === 3) assumptions.push('Peak-to-average traffic ratio is 3x, the default when not supplied (replace with measured data).');
  if (w && w.burstMultiplier === 2) assumptions.push('Burst multiplier is 2x over peak, the default when not supplied (replace with measured data).');

  const checks: boolean[] = [
    b.model !== 'unknown', b.dataClasses.length > 0, b.establishment.countries.length > 0, b.targetMarkets.length > 0,
    b.dataLocations.length > 0, b.payments.method !== 'unknown', !unk(b.ai.usesAi), w !== undefined,
    !!intake.infrastructure && intake.infrastructure.components.length > 0, !!intake.data && intake.data.vendors.length > 0,
    intake.evidence.length > 0,
  ];
  return {
    intake,
    questions: q.sort((a, c) => a.priority - c.priority),
    assumptions,
    completeness: { answered: checks.filter(Boolean).length, total: checks.length },
  };
}

export type { IntakeInput };
