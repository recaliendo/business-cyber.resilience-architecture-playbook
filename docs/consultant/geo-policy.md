# Geo-risk policy as code

Two tracks are kept separate in the data model, decision logic, review, enforcement and reports.

| | Sanctions track | Discretionary threat track |
|---|---|---|
| Purpose | Legal restrictions on providing the service | Reducing abuse noise |
| Source of truth | Official regimes (OFAC, EU, UK) via a counsel-reviewed snapshot | Your own WAF and auth logs, plus contextual feeds |
| Actions | BLOCK (counsel-reviewed) | MONITOR, temporary CHALLENGE; BLOCK only as a reviewed human decision |
| Who changes it | A person, through an approved pull request | Signals may *propose*, or with `--auto-challenge` apply a 72-hour CHALLENGE |
| Failure mode | Feed outage keeps the last approved policy | Bad or thin data means no escalation |

## Safe enforcement workflow

1. **Edit** `policies/<your-policy>.yaml` (schema: `schemas/geo-policy.schema.json`) in a branch.
2. **Review**: open a pull request. Sanctions changes need counsel review, including removals and relaxations.
3. **Approve**: after merge, record an approval bound to the policy's content hash (`bcr geo evaluate` prints the hash). Use [templates/consultant/geo-policy-review.md](../../templates/consultant/geo-policy-review.md).
4. **Plan**: `bcr enforce plan --provider <provider> --dry-run` produces a provider artifact, a diff against the previous artifact, and explicit capability gaps. It refuses unapproved content.
5. **Deploy**: apply the artifact through a protected deployment environment (for example a GitHub environment with required reviewers). This tool does not call provider APIs.
6. **Verify and roll back**: keep the previous artifact. Rolling back means redeploying it.

A typed approver name is never treated as proof. Approval binds to the content hash, and identity comes from branch protection, required review and protected environments.

## Regions and territories

- Selectors are ISO 3166-1 countries, ISO 3166-2 subdivisions, or **legally described territories**.
- A territory that does not map exactly to codes needs a counsel-agreed approximation (`approximateSubdivisions` + `counselReviewed: true`). Without one, the compiler reports a gap with manual steps. It never widens the rule to the whole country.
- If a provider cannot match subdivisions (CloudFront, App Store), the rule becomes a gap, not a country block.

## Threat signals: thresholds and safeguards (defaults in `src/engines/geo/signals.ts`)

| Setting | Default |
|---|---|
| Malicious-request share threshold | 20% |
| Failed-login multiple of baseline | 3x |
| Minimum requests / login attempts | 1,000 / 200 |
| Window length | 15 min to 24 h |
| Maximum signal age | 6 h |
| Maximum baseline age | 30 days (a zero baseline is never used) |
| Hysteresis | stays active down to 80% of threshold |
| CHALLENGE TTL | 72 h; expiry restores the approved policy |
| Automatic renewals | 1, then a human decision is required |

Browser challenges apply to web traffic only. For iOS and API clients the tool recommends per-account, IP or device rate limits and step-up authentication instead. Provide an accessible recovery path and avoid CAPTCHA loops.

## EU guardrail

For B2C (and hybrid) policies, discretionary BLOCK rules on EU member states are refused at compile time; CHALLENGE or MONITOR are used instead. Regulation (EU) 2018/302 has a defined scope, exclusions and justified exceptions, and it does not forbid every security restriction. This guardrail is a conservative default. Route exceptions and conflicts to counsel. Legally required restrictions (the sanctions track) take precedence.

## Limits of geo controls

Geo controls reduce noise and are easily bypassed with VPNs and proxies. Pair them with rate limits, bot management, MFA, authorization and payment screening. Country, nationality, billing country or phone country is never proof of malice or of sanctions status. IP blocking is not sanctions screening of people, entities or transactions.

## Sanctions sources

- What is implemented: a normalized, dated, checksummed snapshot format; semantic diffs; deduplicated proposals that require approval; and failure handling that keeps the last approved policy.
- What is **not** implemented: automatic extraction from official program pages or legal acts. A person maintains the snapshot from official sources. Name lists (SDN and consolidated lists) are person and entity lists, not geographic bans.
- OpenSanctions may help normalize data, subject to its licence and verification against official sources.

## Alerts

Slack and PagerDuty transports exist, plus a dry-run transport (the default); email is not implemented. Alerts are redacted, deduplicated by key, and retried with backoff. Nothing is sent without `--send` and a configured destination.

## Reviews

Do a complete review every quarter (`quarterlyReviewDue` in the policy) and an event-driven review after major geopolitical changes. Approval records and policy diffs serve as change and risk evidence.
