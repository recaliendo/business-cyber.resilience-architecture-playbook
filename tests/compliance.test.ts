import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, CCPA_REVENUE_THRESHOLD_USD } from '../src/engines/compliance/applicability.js';
import { positionSoc2 } from '../src/engines/compliance/compliance.js';
import { runAssessment } from '../src/assess.js';
import { biz, intakeFile } from './helpers.js';

const rule = (id: string, b: ReturnType<typeof biz>) => RULES[id]!(b);
const usOnly = { establishment: { countries: ['US'] }, targetMarkets: ['US'], dataClasses: ['personal' as const] };

test('B2C founder is not pushed into SOC 2 spending', () => {
  const r = runAssessment({ intake: intakeFile('01-solo-b2c-launch.yaml') });
  assert.equal(r.compliance!.soc2.recommendation, 'not_now');
  assert.ok(!r.findings.some((f) => f.ruleId === 'CMP-OB-SOC2'));
  assert.ok(!r.roadmap.some((i) => /SOC 2/i.test(i.title)));
});

test('B2B with questionnaires evaluates SOC 2; Type I optional; buyer acceptance not guaranteed', () => {
  const s = positionSoc2(biz({ model: 'b2b', securityQuestionnairesReceived: 'yes' }), { readiness: 0.4, evidenceCoverage: 0.3 });
  assert.equal(s.recommendation, 'evaluate_now');
  assert.ok(s.paths.some((p) => /Type I is optional/.test(p)));
  assert.ok(s.paths.some((p) => /Do not assume most or all buyers/.test(p)));
  assert.ok(s.typeIEstimate.caveats.some((c) => /not a quote or promise/.test(c)));
  assert.match(s.readiness.note, /not an audit opinion/);
});

test('sector law depends on legal role, not on the data label', () => {
  assert.equal(rule('OB-HIPAA', biz({ dataClasses: ['health'], sector: { hipaaRole: 'none' } })).status, 'not_applicable');
  assert.equal(rule('OB-HIPAA', biz({ dataClasses: ['health'] })).status, 'uncertain');
  assert.equal(rule('OB-HIPAA', biz({ dataClasses: ['personal'], sector: { hipaaRole: 'business_associate' } })).status, 'applicable');
  assert.equal(rule('OB-FERPA', biz({ dataClasses: ['education'], sector: { ferpaRole: 'none' } })).status, 'not_applicable');
  assert.equal(rule('OB-FERPA', biz({ dataClasses: ['education'] })).status, 'uncertain');
  assert.equal(rule('OB-GLBA', biz({ dataClasses: ['financial'] })).status, 'uncertain');
  assert.equal(rule('OB-GLBA', biz({ dataClasses: ['financial'], sector: { glbaFinancialInstitution: 'no' } })).status, 'not_applicable');
  const notes = rule('OB-HIPAA', biz({ dataClasses: ['health'], sector: { hipaaRole: 'none' } })).notes.join(' ');
  assert.match(notes, /FTC Health Breach|state consumer health/);
});

test('health/education example is screened as uncertain, not concluded', () => {
  const r = runAssessment({ intake: intakeFile('04-health-education-screening.yaml') });
  const st = (id: string) => r.compliance!.results.find((o) => o.obligation.id === id)!.status;
  assert.equal(st('OB-HIPAA'), 'uncertain');
  assert.equal(st('OB-FERPA'), 'uncertain');
  assert.equal(st('OB-COPPA'), 'uncertain');
});

test('user location alone does not trigger GDPR', () => {
  assert.equal(rule('OB-GDPR', biz({ ...usOnly, privacy: { offersToEuIndividuals: 'no', monitorsEuBehaviour: 'no' } })).status, 'not_applicable');
  assert.equal(rule('OB-GDPR', biz({ ...usOnly, privacy: { offersToEuIndividuals: 'yes' } })).status, 'applicable');
  assert.equal(rule('OB-GDPR', biz({ dataClasses: ['personal'] })).status, 'uncertain');
});

test('CCPA thresholds use the verified CPI-adjusted revenue figure', () => {
  const p = (privacy: object) => rule('OB-CCPA', biz({ ...usOnly, privacy: { sellsOrSharesPersonalData: 'no', ...privacy } as never }));
  assert.equal(CCPA_REVENUE_THRESHOLD_USD, 26_625_000);
  assert.equal(p({ annualGrossRevenueUsd: 1_000_000, caResidentsPersonalDataPerYear: 5000 }).status, 'not_applicable');
  assert.equal(p({ annualGrossRevenueUsd: 1_000_000, caResidentsPersonalDataPerYear: 150_000 }).status, 'applicable');
  assert.equal(p({ annualGrossRevenueUsd: CCPA_REVENUE_THRESHOLD_USD + 1, caResidentsPersonalDataPerYear: 0 }).status, 'applicable');
  assert.equal(p({ annualGrossRevenueUsd: CCPA_REVENUE_THRESHOLD_USD, caResidentsPersonalDataPerYear: 0 }).status, 'not_applicable', 'the statute says exceeds');
  assert.equal(p({ annualGrossRevenueUsd: 25_000_001, caResidentsPersonalDataPerYear: 0 }).status, 'not_applicable', 'the old unadjusted base no longer applies');
  assert.match(p({ annualGrossRevenueUsd: 1, caResidentsPersonalDataPerYear: 0 }).notes.join(' '), /re-check it after 2027-01-01/);
  assert.equal(p({}).status, 'uncertain');
});

test('EU and UK representatives: establishment, exception, and separate assessments', () => {
  const targeting = { ...usOnly, privacy: { offersToEuIndividuals: 'yes', offersToUkIndividuals: 'yes' } } as const;
  assert.equal(rule('OB-GDPR-ART27', biz({ ...targeting, establishment: { countries: ['IE'] } })).status, 'not_applicable');
  assert.equal(rule('OB-GDPR-ART27', biz({ ...targeting, privacy: { ...targeting.privacy, occasionalProcessingOnly: 'yes', largeScaleSensitiveProcessing: 'no' } })).status, 'not_applicable');
  assert.equal(rule('OB-GDPR-ART27', biz({ ...targeting, privacy: { ...targeting.privacy, occasionalProcessingOnly: 'no' } })).status, 'applicable');
  assert.equal(rule('OB-GDPR-ART27', biz(targeting)).status, 'uncertain');
  const ukOnly = biz({ ...usOnly, privacy: { offersToUkIndividuals: 'yes', offersToEuIndividuals: 'no', monitorsEuBehaviour: 'no', occasionalProcessingOnly: 'no' } });
  assert.equal(rule('OB-UK-REP', ukOnly).status, 'applicable');
  assert.equal(rule('OB-GDPR-ART27', ukOnly).status, 'not_applicable');
});

test('payments: hosted checkout is in scope but no SAQ is promised; IAP-only is not', () => {
  const hosted = rule('OB-PCI-DSS', biz({ payments: { method: 'stripe_hosted_checkout', rawCardDataTouchesOurServers: 'no' } }));
  assert.equal(hosted.status, 'applicable');
  assert.match(hosted.notes.join(' '), /Do not assume a particular self-assessment questionnaire or zero scope/);
  assert.equal(rule('OB-PCI-DSS', biz({ payments: { method: 'apple_iap', rawCardDataTouchesOurServers: 'no' } })).status, 'not_applicable');
});

test('accessibility microenterprise exemption and AI duties vary by trigger', () => {
  assert.equal(rule('OB-EAA', biz({ accessibility: { offersEaaCoveredServicesInEu: 'yes', microenterprise: 'yes' } })).status, 'not_applicable');
  assert.equal(rule('OB-EAA', biz({ accessibility: { offersEaaCoveredServicesInEu: 'yes', microenterprise: 'no' } })).status, 'applicable');
  const noTrigger = rule('OB-EU-AI-ACT', biz({ targetMarkets: ['DE'], ai: { usesAi: 'yes', role: 'deployer', usersInteractWithAiSystem: 'no', generatesSyntheticContent: 'no', possibleHighRiskUseCase: 'no', outputUsedInEu: 'yes' } }));
  assert.match(noTrigger.reasoning.join(' '), /no specific transparency or high-risk trigger/);
  const deployerChat = rule('OB-EU-AI-ACT', biz({ targetMarkets: ['DE'], ai: { usesAi: 'yes', role: 'deployer', usersInteractWithAiSystem: 'yes', outputUsedInEu: 'yes' } }));
  assert.match(deployerChat.reasoning.join(' '), /falls on the provider/);
  const providerChat = rule('OB-EU-AI-ACT', biz({ targetMarkets: ['DE'], ai: { usesAi: 'yes', role: 'provider', usersInteractWithAiSystem: 'yes', generatesSyntheticContent: 'yes', outputUsedInEu: 'yes' } }));
  assert.match(providerChat.reasoning.join(' '), /Art\. 50\(1\)/);
  assert.match(providerChat.reasoning.join(' '), /2 December 2026/);
  const highRisk = rule('OB-EU-AI-ACT', biz({ targetMarkets: ['DE'], ai: { usesAi: 'yes', role: 'provider', possibleHighRiskUseCase: 'yes', outputUsedInEu: 'yes' } }));
  assert.match(highRisk.reasoning.join(' '), /2 December 2027.*2 August 2028/);
});

test('every obligation result carries reasoning and voluntary attestations are never obligations', () => {
  const r = runAssessment({ intake: intakeFile('03-global-growth-uploads.yaml') });
  for (const o of r.compliance!.results) assert.ok(o.reasoning.length > 0, o.obligation.id);
  assert.ok(r.compliance!.results.filter((o) => o.obligation.category === 'voluntary').every((o) => o.status === 'not_applicable'));
  assert.ok(r.compliance!.results.every((o) => o.sourceSupport !== 'human_verified'), 'no source has human sign-off yet; nothing may claim it');
  assert.ok(r.compliance!.results.some((o) => o.sourceSupport === 'machine_verified'));
  const partial = r.compliance!.results.find((o) => o.sourceSupport === 'partially_verified');
  assert.ok(partial && partial.weakSources.length > 0, 'partially verified obligations name their weak sources');
});
