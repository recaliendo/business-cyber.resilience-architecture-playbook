# Source governance

Every obligation, platform rule and provider capability cites a source in `knowledge/sources/registry.yaml`. Each source records **how** it was verified and **which specific claims** our rules depend on, with a result for each claim.

## Verification levels

| Level | Meaning | Effect on reports |
|---|---|---|
| `human_verified` | A named person read the source and signed off; every claim confirmed | Highest support (screening results still need counsel) |
| `machine_verified` | A tool fetched and read the source and confirmed every claim. **Not human or legal review** | Shown as "machine-verified, awaiting human sign-off"; confidence medium |
| `partially_verified` | The source was read, but at least one claim was only partly visible or could not be confirmed | Confidence low; the open claims are listed |
| `stale` | Verification is older than the source's `reviewCadenceDays` | Confidence low until re-verified |
| `unverified` | Never verified | Confidence low |

Each obligation reports the **weakest** level among its cited sources.

## Current state (verified 2026-11-14)

All 46 sources were fetched and read by Claude Code at 2026-11-14T22:55:59Z, and each claim our rules rely on was checked. That is **automated** verification: **no source has human sign-off yet**. `npm run bcr -- sources status` lists the human sign-off backlog, with the most-cited sources first.

How sources were read:

- **EU law** (GDPR, AI Act and its amendment, EAA, Geo-blocking Regulation): the official Publications Office (Cellar) XHTML text was downloaded and the cited articles extracted. The `contentHash` is the sha256 of that download. EUR-Lex pages redirect automated clients, so the Cellar text is the reliable route.
- **Other sources:** web fetches, using a rendering scraper where a site blocked plain requests (HHS, ISO, Cloudflare Radar). For script-rendered pages (Apple's documentation, the PCI document list, the EU Sanctions Map), only what was visible was confirmed; everything else is recorded as `partial`.

### What verification changed

| Finding | Change |
|---|---|
| **AI Act amended** by Regulation (EU) 2026/1744 (Digital Omnibus on AI): high-risk obligations moved to 2 Dec 2027 (Annex III) and 2 Aug 2028 (Annex I); Art. 50(2) marking deadline of 2 Dec 2026 for systems already on the market; new prohibitions from 2 Dec 2026 | AI rule and obligation dates updated; the rule now separates provider duties (Art. 50(1)-(2)) from deployer duties (Art. 50(3)-(4)) |
| **CCPA** revenue threshold confirmed at $26,625,000 from 1 Jan 2025 (CPPA CPI page) | The "uncertain" band between $25M and $26.6M was removed; the threshold is applied with "exceeds", plus a re-check note for 2027 |
| **UK** OFSI Consolidated List closed on 28 Jan 2026; the UK Sanctions List is the single source | New source; sanctions remediation and geo docs updated; the old UK regimes URL (404) was replaced |
| **OFAC FAQ 1009**: EO 14065 does not block the entire Donetsk and Luhansk oblasts, and US persons may rely on vetted postal codes and maps | Cited by the example policy; the compiler's territory gap now recommends postal-code checks |
| **Apple 3.1.1**: US storefront apps may link to other purchase methods without an entitlement | IAP obligation and rule note updated |
| **AWS WAF** matches regions through labels (Count geo-match rule, then label match); unknown locations are labelled `XX` | The compiler now emits the real two-rule pattern instead of a placeholder, and warns about `XX` |
| **CloudFront** serves content when it cannot locate the user, and does not pass blocked requests to WAF | The compiler warns that CloudFront fails open for sanctions |
| **Cloudflare** subdivision field needs a Business or Enterprise plan; Log is Enterprise-only | Capabilities confirmed (already plan-dependent) |
| **Licences**: OpenSanctions is CC BY-NC 4.0 (commercial use needs a licence); abuse.ch is mixed (CC0 for some datasets, subscription for commercial use of others, no AI training); Spamhaus DROP is free with attribution and limited download frequency | `license` fields filled in |
| Moved or renamed: GDPR link (use CELEX), ICO representative guidance, OFAC Sanctions List Service page, ANPD is now an *Agência* | URLs and titles fixed |

### Claims still open (human reading needed)

`npm run bcr -- sources status` lists them. As of this verification:

- Apple's required-reason API detail (the documentation is script-rendered)
- PCI SAQ list
- EDPB "accessibility is not targeting" body text
- ICO children's code "under 18" wording, and Data (Use and Access) Act 2025 effects
- FERPA school-official conditions
- AICPA Type 1 / Type 2 wording
- EU Sanctions Map disclaimer
- EU alternative-payment terms for Apple
- IAPP state count

## Signing off a source as a person

1. Open the URL and read the current official text.
2. For each entry in `claims`, check that the source still says it. Fix the rule (and bump the catalog `version`) if it does not.
3. Set `verificationMethod: human`, `verifiedBy: <your name>`, `verifiedAt: <when you checked>`, and update each claim's `status` (and `note`).
4. Open a pull request. A reviewer checks the change against the source.

The schema rejects a `verifiedAt` without `verifiedBy`, `verificationMethod` and at least one checked claim.

## Refreshing

`bcr sources refresh --allow-network` fetches each URL with these limits:

- https only, and public addresses only
- redirects are not followed
- 5 MB cap and a 15-second timeout

It compares a content hash: a change means "a person should re-read this source". It never changes rules, policies or verification fields. Sanctions *data* is handled daily through the snapshot workflow in [geo-policy.md](geo-policy.md), not through rule rewriting.

## Staleness and reproducibility

A verified source becomes **stale** once `verifiedAt + reviewCadenceDays` has passed. Cadences range from 7 days (CISA) to 365 days (statutes). Reports record the catalog, applicability, scoring and capacity rule versions plus an inputs hash. To reproduce a report, check out the commit that matches those versions and run the same command with the same inputs.
