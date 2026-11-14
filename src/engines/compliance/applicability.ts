// Applicability rules, one function per obligation id. Each returns applicable / not_applicable /
// uncertain with plain-language reasoning. These are screening rules, not legal conclusions.
// Rule of thumb used throughout: a data label (e.g. "health") is a signal to ask about legal roles,
// never proof that a specific law applies; and a missing answer yields "uncertain", never "not applicable".
import type { BusinessProfile, Tri } from '../../domain/schemas.js';

export const APPLICABILITY_RULES_VERSION = '1.1.0';

export type Applicability = 'applicable' | 'not_applicable' | 'uncertain';
export interface ApplicabilityResult {
  status: Applicability;
  reasoning: string[];
  counselQuestions: string[];
  /** Extra flags the report should surface (e.g. related laws to check). */
  notes: string[];
}

export const EU_MEMBER_STATES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
const EEA = [...EU_MEMBER_STATES, 'IS', 'LI', 'NO'];

/**
 * CCPA revenue threshold (Civil Code 1798.140(d)(1)(A)), CPI-adjusted to $26,625,000 from
 * 1 January 2025. Machine-verified against the CPPA's CPI adjustment page (SRC-CPPA-CPI) on
 * 2026-11-14. The figure is adjusted periodically: CCPA_THRESHOLD_RECHECK_AFTER makes results say so
 * once a new adjustment may be in force.
 */
export const CCPA_REVENUE_THRESHOLD_USD = 26_625_000;
export const CCPA_REVENUE_THRESHOLD_EFFECTIVE = '2025-01-01';
export const CCPA_THRESHOLD_RECHECK_AFTER = '2027-01-01';
export const CCPA_CONSUMER_THRESHOLD = 100_000;

const r = (status: Applicability, reasoning: string[], counselQuestions: string[] = [], notes: string[] = []): ApplicabilityResult => ({ status, reasoning, counselQuestions, notes });
const has = (list: string[], set: string[]) => list.some((c) => set.includes(c));
const noPersonalData = (b: BusinessProfile) => b.dataClasses.length > 0 && b.dataClasses.every((c) => c === 'none');
const dataUnknown = (b: BusinessProfile) => b.dataClasses.length === 0;
const any = (...t: Tri[]) => t.includes('yes');
const allNo = (...t: Tri[]) => t.every((x) => x === 'no');

function euScope(b: BusinessProfile): { status: Applicability; via: 'establishment' | 'targeting' | 'none' | 'unknown'; why: string } {
  if (noPersonalData(b)) return { status: 'not_applicable', via: 'none', why: 'No personal data is processed.' };
  if (has(b.establishment.countries, EEA)) return { status: 'applicable', via: 'establishment', why: 'The business is established in the EU/EEA.' };
  if (any(b.privacy.offersToEuIndividuals, b.privacy.monitorsEuBehaviour)) return { status: 'applicable', via: 'targeting', why: 'The business offers goods/services to, or monitors, people in the EU/EEA (Article 3(2)).' };
  if (has(b.targetMarkets, [...EEA, 'EU']) && b.privacy.offersToEuIndividuals !== 'no') return { status: 'applicable', via: 'targeting', why: 'EU/EEA countries are listed as target markets, which indicates offering services to people there.' };
  if (allNo(b.privacy.offersToEuIndividuals, b.privacy.monitorsEuBehaviour) && b.establishment.countries.length > 0) {
    return { status: 'not_applicable', via: 'none', why: 'Not established in the EU/EEA and neither offering to nor monitoring people there. Incidental EU visitors alone do not trigger GDPR.' };
  }
  return { status: 'uncertain', via: 'unknown', why: 'Establishment, targeting or monitoring of people in the EU/EEA is not known.' };
}

function ukScope(b: BusinessProfile): { status: Applicability; via: 'establishment' | 'targeting' | 'none' | 'unknown'; why: string } {
  if (noPersonalData(b)) return { status: 'not_applicable', via: 'none', why: 'No personal data is processed.' };
  if (b.establishment.countries.includes('GB')) return { status: 'applicable', via: 'establishment', why: 'The business is established in the UK.' };
  if (any(b.privacy.offersToUkIndividuals, b.privacy.monitorsUkBehaviour) || (b.targetMarkets.includes('GB') && b.privacy.offersToUkIndividuals !== 'no')) return { status: 'applicable', via: 'targeting', why: 'The business offers services to, or monitors, people in the UK.' };
  if (allNo(b.privacy.offersToUkIndividuals, b.privacy.monitorsUkBehaviour) && b.establishment.countries.length > 0) return { status: 'not_applicable', via: 'none', why: 'Not established in the UK and not targeting or monitoring people there.' };
  return { status: 'uncertain', via: 'unknown', why: 'UK establishment or targeting is not known.' };
}

function representative(scope: ReturnType<typeof euScope>, b: BusinessProfile, region: string): ApplicabilityResult {
  if (scope.status === 'not_applicable') return r('not_applicable', [`${region} data protection law does not apply, so no representative is needed.`]);
  if (scope.status === 'uncertain') return r('uncertain', [scope.why], [`Does ${region} data protection law apply to us, and if so do we need a ${region} representative?`]);
  if (scope.via === 'establishment') return r('not_applicable', [`The business has a ${region} establishment, so the representative requirement does not apply.`]);
  const p = b.privacy;
  if (p.occasionalProcessingOnly === 'yes' && p.largeScaleSensitiveProcessing === 'no') {
    return r('not_applicable', ['Processing is reported as occasional and without large-scale special-category data, which matches the Article 27(2) exception.'], [`Confirm that the Article 27(2) exception applies to our ${region} processing (it also requires that risk to individuals is unlikely).`]);
  }
  if (p.occasionalProcessingOnly === 'no' || p.largeScaleSensitiveProcessing === 'yes') {
    return r('applicable', [`${region} law applies through targeting or monitoring, there is no ${region} establishment, and the occasional-processing exception does not fit.`], [`Which ${region === 'EU' ? 'member state' : 'provider'} should host our representative?`]);
  }
  return r('uncertain', [`${region} law applies without a ${region} establishment. Whether the occasional-processing exception applies is not known.`], [`Is our ${region} processing "occasional" and low-risk within Article 27(2)?`]);
}

function apple(b: BusinessProfile, t: Tri, yes: string, no: string, q: string): ApplicabilityResult {
  if (!b.surfaces.ios) return r('not_applicable', ['No iOS app.']);
  if (t === 'yes') return r('applicable', [yes]);
  if (t === 'no') return r('not_applicable', [no]);
  return r('uncertain', [q]);
}

type Rule = (b: BusinessProfile) => ApplicabilityResult;

export const RULES: Record<string, Rule> = {
  'OB-GDPR': (b) => {
    const s = euScope(b);
    return r(s.status, [s.why], s.status === 'uncertain' ? ['Do we offer goods/services to, or monitor, people in the EU/EEA within GDPR Article 3(2)?'] : [],
      s.status === 'applicable' ? ['Data residency is a separate decision from transfer compliance: storing data in the EU does not remove transfer rules for access from elsewhere.'] : []);
  },
  'OB-GDPR-ART27': (b) => representative(euScope(b), b, 'EU'),
  'OB-UK-GDPR': (b) => { const s = ukScope(b); return r(s.status, [s.why], s.status === 'uncertain' ? ['Do we target or monitor people in the UK?'] : []); },
  'OB-UK-REP': (b) => representative(ukScope(b), b, 'UK'),
  'OB-CCPA': (b) => {
    if (noPersonalData(b)) return r('not_applicable', ['No personal data is processed.']);
    const us = b.establishment.countries.includes('US') || b.targetMarkets.includes('US');
    if (!us && b.establishment.countries.length > 0 && b.targetMarkets.length > 0) return r('not_applicable', ['No US establishment or US target market, so the business is not doing business in California on the information given.']);
    const p = b.privacy;
    const reasons: string[] = [];
    // The statute uses "exceeds": revenue exactly at the threshold does not meet it.
    if (p.annualGrossRevenueUsd !== undefined && p.annualGrossRevenueUsd > CCPA_REVENUE_THRESHOLD_USD) reasons.push(`Annual gross revenue of $${p.annualGrossRevenueUsd.toLocaleString('en-US')} exceeds the $${CCPA_REVENUE_THRESHOLD_USD.toLocaleString('en-US')} threshold.`);
    if (p.caResidentsPersonalDataPerYear !== undefined && p.caResidentsPersonalDataPerYear >= CCPA_CONSUMER_THRESHOLD) reasons.push(`Personal information of ${p.caResidentsPersonalDataPerYear.toLocaleString('en-US')} California consumers/households meets the ${CCPA_CONSUMER_THRESHOLD.toLocaleString('en-US')} threshold.`);
    if (p.revenueShareFromSellingOrSharingData !== undefined && p.revenueShareFromSellingOrSharingData >= 0.5) reasons.push('At least 50% of revenue comes from selling or sharing personal information.');
    const thresholdNote = `Revenue threshold $${CCPA_REVENUE_THRESHOLD_USD.toLocaleString('en-US')} has applied since ${CCPA_REVENUE_THRESHOLD_EFFECTIVE} (CPPA CPI adjustment). It is adjusted periodically: re-check it after ${CCPA_THRESHOLD_RECHECK_AFTER}.`;
    if (reasons.length) return r('applicable', reasons, ['Confirm CCPA scope and any sector exemptions.'], [thresholdNote]);
    const known = p.annualGrossRevenueUsd !== undefined && p.caResidentsPersonalDataPerYear !== undefined && (p.revenueShareFromSellingOrSharingData !== undefined || p.sellsOrSharesPersonalData === 'no');
    if (known) return r('not_applicable', ['Below all three CCPA thresholds on the figures supplied. A user being in California is not by itself a trigger.'], [], [thresholdNote, 'Reassess yearly and when California consumer counts approach 100,000. Service-provider contracts may still impose CCPA terms.']);
    return r('uncertain', ['Revenue, California consumer count, or revenue share from selling/sharing data is not known.'], ['Do we meet any CCPA threshold?']);
  },
  'OB-US-STATE-PRIVACY': (b) => {
    if (noPersonalData(b)) return r('not_applicable', ['No personal data is processed.']);
    const us = b.establishment.countries.includes('US') || b.targetMarkets.includes('US');
    if (!us && b.targetMarkets.length > 0 && b.establishment.countries.length > 0) return r('not_applicable', ['No US establishment or US target market.']);
    const notes = b.dataClasses.includes('health') ? ['Consumer health data laws in some states apply at low or no thresholds. Check these specifically.'] : [];
    return r('uncertain', ['State thresholds differ and depend on per-state resident counts, which this intake does not capture.'], ['Which state privacy laws do our resident counts and data types bring into scope?'], notes);
  },
  'OB-LGPD': (b) => {
    if (noPersonalData(b)) return r('not_applicable', ['No personal data is processed.']);
    if (b.establishment.countries.includes('BR') || b.privacy.processesInBrazilOrOffersToBrazil === 'yes' || b.targetMarkets.includes('BR')) return r('applicable', ['The business is established in, targets, or processes data in Brazil.']);
    if (b.privacy.processesInBrazilOrOffersToBrazil === 'no') return r('not_applicable', ['No processing in Brazil and no offering to people in Brazil.']);
    return r('uncertain', ['Whether the business targets or processes data in Brazil is not known.']);
  },
  'OB-DPIA': (b) => {
    const eu = euScope(b).status;
    const uk = ukScope(b).status;
    if (eu === 'not_applicable' && uk === 'not_applicable') return r('not_applicable', ['Neither GDPR nor UK GDPR applies.']);
    const highRiskSignal = b.privacy.largeScaleSensitiveProcessing === 'yes' || any(b.privacy.monitorsEuBehaviour, b.privacy.monitorsUkBehaviour) || has(b.dataClasses, ['health', 'biometric', 'children']);
    if ((eu === 'applicable' || uk === 'applicable') && highRiskSignal) return r('applicable', ['GDPR/UK GDPR applies and the intake shows a high-risk signal (sensitive data, children, or monitoring). Run at least a DPIA screening.'], ['Is a full DPIA required for our processing?']);
    if ((eu === 'applicable' || uk === 'applicable') && b.privacy.largeScaleSensitiveProcessing === 'no') return r('not_applicable', ['GDPR applies but no high-risk processing signal was reported. Keep a short screening note.']);
    return r('uncertain', ['GDPR scope or the risk level of processing is not known.']);
  },
  'OB-APPLE-PRIVACY-LABELS': (b) => (b.surfaces.ios ? r('applicable', ['Every App Store app must provide accurate privacy details, including for third-party SDKs.']) : r('not_applicable', ['No iOS app.'])),
  'OB-APPLE-PRIVACY-MANIFEST': (b) => {
    if (!b.surfaces.ios) return r('not_applicable', ['No iOS app.']);
    if (b.ios.usesRequiredReasonApis === 'yes') return r('applicable', ['The app uses required-reason APIs.']);
    if (b.ios.thirdPartySdks.length > 0) return r('uncertain', [`The app includes third-party SDKs (${b.ios.thirdPartySdks.join(', ')}). Check each against Apple's list of SDKs that need a manifest and signature.`]);
    if (b.ios.usesRequiredReasonApis === 'no') return r('not_applicable', ['No required-reason APIs and no third-party SDKs reported.']);
    return r('uncertain', ['Use of required-reason APIs (file timestamps, UserDefaults, system boot time, disk space and similar) is not known. Most apps use at least one.']);
  },
  'OB-APPLE-ACCOUNT-DELETION': (b) => apple(b, b.ios.supportsAccountCreation, 'The app supports account creation, so it must offer in-app account deletion.', 'The app does not support account creation.', 'Whether the iOS app supports account creation is not known.'),
  'OB-APPLE-ATT': (b) => apple(b, b.ios.tracksPerAttDefinition, "The app tracks users as Apple defines tracking, so the ATT prompt is required.", "The app does not track users under Apple's definition. Re-check when adding advertising or analytics SDKs.", "Whether the app or its SDKs track users under Apple's definition is not known."),
  'OB-APPLE-IAP': (b) => {
    const res = apple(b, b.ios.sellsDigitalGoodsOrSubscriptions, 'The iOS app sells digital goods or subscriptions, so Guideline 3.1.1 (in-app purchase) applies, subject to storefront-specific exceptions.', 'The iOS app does not sell digital goods or subscriptions.', 'Whether the iOS app sells digital goods or subscriptions is not known.');
    if (res.status === 'applicable') res.notes.push('US storefront apps may include buttons, external links and calls to action to other purchase methods without an entitlement; other storefronts allow links only under StoreKit External Purchase Link entitlements where permitted. EU terms differ: check the current EU-specific guidance.');
    return res;
  },
  'OB-PCI-DSS': (b) => {
    const m = b.payments.method;
    if (m === 'none') return r('not_applicable', ['The business does not accept card payments.']);
    if (m === 'unknown') return r('uncertain', ['The payment method is not known.']);
    if (m === 'apple_iap' && b.payments.rawCardDataTouchesOurServers !== 'yes') return r('not_applicable', ['Payments are taken only through Apple in-app purchase; Apple handles the card data.'], [], ['This changes if you add card payments on the web.']);
    if (m === 'custom_card_form' || b.payments.rawCardDataTouchesOurServers === 'yes') {
      return r('applicable', ['Raw card data reaches your own pages or servers. This brings a large PCI DSS scope.'], [], ['Moving to hosted checkout would shrink the scope substantially.']);
    }
    return r('applicable', [`Card payments are accepted via ${m.replace(/_/g, ' ')}. PCI DSS applies as a contractual requirement; scope is reduced because raw card data stays off your servers.`], [], ['Do not assume a particular self-assessment questionnaire or zero scope: confirm with your processor. The security of the page that launches checkout still matters.']);
  },
  'OB-COPPA': (b) => {
    const us = b.establishment.countries.includes('US') || b.targetMarkets.includes('US');
    const c = b.children;
    if (!us && b.establishment.countries.length > 0 && b.targetMarkets.length > 0) return r('not_applicable', ['No US establishment or US target market.']);
    if (any(c.directedToChildren, c.actualKnowledgeOfUnder13)) return r('applicable', ['The service is directed to children under 13 or has actual knowledge of collecting their personal information.'], ['Which parental-consent method fits our service?']);
    if (allNo(c.directedToChildren, c.actualKnowledgeOfUnder13) && !b.dataClasses.includes('children')) return r('not_applicable', ['A general-audience service, not directed to children and with no actual knowledge of under-13 users.'], [], ['This changes on gaining actual knowledge of an under-13 user. Whether a service is "directed to children" considers content, audience and marketing.']);
    return r('uncertain', ["Children's data is indicated, or it is not known whether the service is directed to children or has actual knowledge of under-13 users. A user's age alone is an intake signal, not the full legal test."], ['Is our service directed to children or mixed-audience under COPPA?']);
  },
  'OB-GDPR-CHILD-CONSENT': (b) => {
    const eu = euScope(b).status;
    const uk = ukScope(b).status;
    if (eu === 'not_applicable' && uk === 'not_applicable') return r('not_applicable', ['Neither GDPR nor UK GDPR applies.']);
    const c = b.children;
    if (allNo(c.directedToChildren, c.likelyAccessedByChildren)) return r('not_applicable', ['The service is not offered to, or likely to be accessed by, children.']);
    if ((eu === 'applicable' || uk === 'applicable') && c.directedToChildren === 'yes') return r('applicable', ['GDPR/UK GDPR applies and the service is offered directly to children. Where consent is the lawful basis, parental authorisation is needed below the national age (13 to 16 depending on the country).'], ['Which lawful basis do we rely on for children, and what is the age threshold in each country we serve?']);
    return r('uncertain', ['Whether the service is offered directly to children, and whether consent is the lawful basis, is not known.']);
  },
  'OB-UK-AADC': (b) => {
    const uk = ukScope(b).status;
    if (uk === 'not_applicable') return r('not_applicable', ['UK GDPR does not apply.']);
    const c = b.children;
    if (uk === 'applicable' && any(c.likelyAccessedByChildren, c.directedToChildren)) return r('applicable', ['UK GDPR applies and the service is likely to be accessed by under-18s.']);
    if (allNo(c.likelyAccessedByChildren, c.directedToChildren)) return r('not_applicable', ['The service is not likely to be accessed by children. Keep the assessment on file.']);
    return r('uncertain', ['UK scope, or whether children are likely to access the service, is not known.']);
  },
  'OB-EAA': (b) => {
    const a = b.accessibility;
    if (a.offersEaaCoveredServicesInEu === 'no') return r('not_applicable', ['No covered product or service is offered to consumers in the EU.']);
    if (a.offersEaaCoveredServicesInEu === 'yes' && a.microenterprise === 'yes') return r('not_applicable', ['Covered services are offered in the EU, but the business reports microenterprise status, which is exempt from the service requirements.'], ['Confirm that we meet the microenterprise definition (fewer than 10 people and at most EUR 2 million turnover or balance sheet) under each relevant national law.'], ['The exemption ends when you outgrow the definition. Accessibility is still good practice.']);
    if (a.offersEaaCoveredServicesInEu === 'yes' && a.microenterprise === 'no') return r('applicable', ['Covered services are offered to EU consumers and the microenterprise exemption does not apply.'], ['Which national implementations and transition periods apply to us?']);
    if (b.model === 'b2b' && a.offersEaaCoveredServicesInEu === 'unknown') return r('uncertain', ['The EAA covers consumer-facing products and services. Whether any consumer-facing covered service is offered in the EU is not known.']);
    return r('uncertain', ['Whether a covered service (such as e-commerce) is offered to EU consumers, or whether the microenterprise exemption applies, is not known.'], ['Are our services within the EAA, and are we a microenterprise?']);
  },
  'OB-ADA': (b) => {
    const us = b.establishment.countries.includes('US') || b.targetMarkets.includes('US');
    if (b.accessibility.usPublicFacingService === 'no' || (!us && b.establishment.countries.length > 0 && b.targetMarkets.length > 0)) return r('not_applicable', ['No public-facing service offered in the US.']);
    if (b.accessibility.usPublicFacingService === 'yes' || us) return r('uncertain', ['A public-facing service is offered in the US. Courts differ on how the ADA applies to online-only businesses, so exposure is real but its extent is uncertain.'], ['What is our ADA exposure given how we sell and where?'], ['Testing critical journeys against WCAG 2.1 AA reduces exposure whichever way the law is read.']);
    return r('uncertain', ['US presence is not known.']);
  },
  'OB-EU-AI-ACT': (b) => {
    const ai = b.ai;
    if (ai.usesAi === 'no') return r('not_applicable', ['No AI features.']);
    if (ai.usesAi === 'unknown') return r('uncertain', ['Use of AI is not known.']);
    const euNexus = ai.outputUsedInEu === 'yes' || has(b.establishment.countries, EU_MEMBER_STATES) || has(b.targetMarkets, [...EU_MEMBER_STATES, 'EU']);
    if (ai.outputUsedInEu === 'no' && !has(b.establishment.countries, EU_MEMBER_STATES) && !has(b.targetMarkets, [...EU_MEMBER_STATES, 'EU'])) return r('not_applicable', ['AI is used, but there is no EU market, establishment, or use of its output in the EU.']);
    if (!euNexus) return r('uncertain', ['AI is used; whether its output is used in the EU is not known.']);
    // Duties per Art. 50 and dates per Art. 113 as amended by Regulation (EU) 2026/1744
    // (machine-verified 2026-11-14 against the official texts; see SRC-EU-AI-ACT, SRC-EU-AI-OMNIBUS).
    const provider = ai.role === 'provider' || ai.role === 'both';
    const deployer = ai.role === 'deployer' || ai.role === 'both';
    const duties: string[] = [];
    if (ai.possibleHighRiskUseCase === 'yes') duties.push('A possible high-risk use case was reported and needs classification. High-risk obligations apply from 2 December 2027 (Annex III uses) or 2 August 2028 (Annex I products), as amended by Regulation (EU) 2026/1744.');
    if (ai.usersInteractWithAiSystem === 'yes') {
      if (provider) duties.push('As a provider of a system people interact with directly, design it so they are told they are interacting with AI, unless that is obvious from context (Art. 50(1), applying since 2 August 2026).');
      if (ai.role === 'deployer') duties.push('Users interact with an AI system you deploy. The Art. 50(1) interaction-disclosure duty falls on the provider of the system; confirm your vendor meets it. Deployer duties arise for emotion recognition or biometric categorisation (Art. 50(3)) and deepfakes (Art. 50(4)).');
    }
    if (ai.generatesSyntheticContent === 'yes') {
      if (provider) duties.push('As a provider of a system generating synthetic audio, image, video or text, mark outputs in a machine-readable, detectable way (Art. 50(2)). Systems placed on the market before 2 August 2026 have until 2 December 2026.');
      if (deployer) duties.push('As a deployer, disclose deepfake image, audio or video content as artificially generated or manipulated (Art. 50(4)); text published to inform the public on matters of public interest can also require disclosure.');
    }
    if (ai.role === 'unknown') duties.push('Your role (provider or deployer) is not recorded; Art. 50 duties differ between them.');
    if (duties.length === 0 && ai.possibleHighRiskUseCase === 'no' && ai.usersInteractWithAiSystem === 'no' && ai.generatesSyntheticContent === 'no') {
      return r('applicable', ['The Act is in scope territorially, but no specific transparency or high-risk trigger was reported. Many AI features carry no additional duty. Keep the AI inventory current.'], [], ['Prohibited practices (Art. 5) apply to everyone in scope; new prohibitions added by Regulation (EU) 2026/1744 apply from 2 December 2026.']);
    }
    return r(duties.length ? 'applicable' : 'uncertain', ['There is an EU nexus and AI is used.', ...duties], ['What is our role for each AI feature, and which obligations and dates apply?'], ['Dates reflect the AI Act as amended by Regulation (EU) 2026/1744 (Digital Omnibus on AI).']);
  },
  'OB-HIPAA': (b) => {
    const role = b.sector.hipaaRole;
    const health = b.dataClasses.includes('health');
    if (role === 'covered_entity' || role === 'business_associate') return r('applicable', [`The business is a ${role.replace('_', ' ')} under HIPAA.`], ['Confirm our HIPAA role and the business associate agreements we need, including with our vendors.']);
    if (role === 'none') return r('not_applicable', ['The business is neither a covered entity nor a business associate. Handling health data does not by itself bring HIPAA into scope.'], [], health ? ['Health data outside HIPAA can still fall under the FTC Health Breach Notification Rule, state consumer health data laws, and GDPR special-category rules. Assess those.'] : []);
    if (health) return r('uncertain', ['Health data is processed but the business relationship is not recorded. HIPAA depends on whether you are a covered entity or handle PHI on behalf of one.'], ['Are we a covered entity or business associate? If not, which health-data laws do apply?']);
    if (dataUnknown(b)) return r('uncertain', ['Data classes and HIPAA role are not recorded.']);
    return r('not_applicable', ['No health data and no HIPAA relationship reported.']);
  },
  'OB-FERPA': (b) => {
    const role = b.sector.ferpaRole;
    const edu = b.dataClasses.includes('education');
    if (role === 'school_official_service_provider') return r('applicable', ["The business receives education records from covered institutions as a service provider. FERPA binds the institution, and reaches you through contract and the school-official conditions."], ['What do our institution contracts require, and which state student privacy laws apply?']);
    if (role === 'none') return r('not_applicable', ['The business does not receive education records from covered institutions. Education data collected directly from consumers is not a FERPA record.'], [], edu ? ['State student privacy laws and COPPA may still apply.'] : []);
    if (edu) return r('uncertain', ['Education data is processed but the relationship with schools is not recorded.'], ['Do we receive education records from institutions that FERPA covers?']);
    if (dataUnknown(b)) return r('uncertain', ['Data classes and FERPA role are not recorded.']);
    return r('not_applicable', ['No education data and no school relationship reported.']);
  },
  'OB-GLBA': (b) => {
    const g = b.sector.glbaFinancialInstitution;
    const fin = b.dataClasses.includes('financial');
    if (g === 'yes') return r('applicable', ['The business reports being a financial institution under GLBA.'], ['Which GLBA rules apply to our activities?']);
    if (g === 'no') return r('not_applicable', ['The business does not offer consumers financial products or services such as loans, financial or investment advice, or insurance (the FTC rules define this as being significantly engaged in financial activities). Using a payment processor or holding financial data does not by itself make GLBA apply.']);
    if (fin) return r('uncertain', ['Financial data is processed but whether the business is a "financial institution" under GLBA is not recorded.'], ['Are our activities "financial activities" under GLBA?']);
    if (dataUnknown(b)) return r('uncertain', ['Data classes and GLBA status are not recorded.']);
    return r('not_applicable', ['No financial data and no financial-institution activity reported.']);
  },
  'OB-SANCTIONS': (b) => {
    const nexus = has(b.establishment.countries, ['US', 'GB', ...EU_MEMBER_STATES]);
    if (nexus) return r('applicable', ['The business is established in a jurisdiction with sanctions regimes that bind it wherever it operates.'], ['Which sanctions programs restrict providing our service, and do any licences or exemptions apply?'], ['Sanctions rules are handled in the geo-policy sanctions track, with human approval for every change.']);
    if (b.establishment.countries.length === 0) return r('uncertain', ['Place of establishment is not known.']);
    return r('uncertain', ['No US, EU or UK establishment is recorded, but other links (owners, staff, currency, infrastructure, customers) can create a nexus.'], ['Do we have a sanctions nexus through ownership, staff, USD payments or infrastructure?']);
  },
  // Voluntary attestations are positioned by soc2.ts; they are never "applicable" as obligations.
  'OB-SOC2': () => r('not_applicable', ['SOC 2 is a voluntary, market-driven report, not a legal obligation. See the SOC 2 positioning section.']),
  'OB-ISO27001': () => r('not_applicable', ['ISO/IEC 27001 is a voluntary certification, not a legal obligation. See the positioning section.']),
};
