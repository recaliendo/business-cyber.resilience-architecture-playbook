# Capabilities and limitations

## Implemented and tested

| Area | What works offline |
|---|---|
| Intake | YAML/JSON intake validated against schemas; partial input accepted; the three first consultant questions plus targeted follow-ups; explicit assumptions |
| Evidence and scoring | Control states, provenance, staleness, justified N/A; readiness, evidence coverage and observed coverage reported separately; blockers listed separately |
| Security | 26-control catalog with stage gating, solo-founder alternatives, quick-win package, deferred-spend guidance |
| Infrastructure | Declared-inventory checks (backups, restore tests, tenant isolation, rate limits, timeouts, retries, idempotency, health checks, origin exposure, encryption, environment isolation, TLS, registrar lock), dependency tracing for critical journeys |
| Capacity | Little's Law concurrency, burst and cache effects, DB connection demand and pooler amplification, timeouts, present/10x/100x and custom scenarios, sensitivity, storage runway (retention, versioning, replicas, backups, logs), cost ranges from dated user-supplied prices, projected vs demonstrated |
| Compliance | 26 obligations with applicability rules (legal, platform, contractual, voluntary kept apart); SOC 2 / ISO positioning; counsel questions |
| Geo-risk | Two-track policy model, schema validation, content-hash approvals, threat-signal evaluation with sample/baseline/staleness/hysteresis/TTL/renewal safeguards, EU guardrail, native-client handling, sanctions snapshot diffing and proposals, compiler with Cloudflare WAF, AWS WAF, CloudFront and App Store adapters producing dry-run artifacts, diffs and capability gaps |
| Alerts | Dry-run (default), Slack and PagerDuty transports with redaction, dedupe and retries |
| Repository review | Read-only local checkout review, inventory, 17 checks, commit-pinned permalinks, freshness check; GitHub clone adapter |
| Reports | Markdown (business summary + engineering detail), JSON, accessible HTML with copy buttons, per-finding prompt files and index, roadmap (next day / 30 / 60 / 90 days) |
| Sources | Registry, verification and staleness status, SSRF-guarded refresh that never verifies |

## Partial, or a stub (labelled as such)

| Item | Status |
|---|---|
| Email alert transport | Not implemented; returns `not_implemented` |
| GitHub ingestion | Shallow clone via `git`; needs network. Not covered by offline tests (URL validation is) |
| AWS WAF regional matching | Emits the documented two-rule pattern (Count geo-match labeler, then label match). Region coverage per country depends on AWS's geolocation data |
| Sanctions feeds | No automatic parsing of official program pages; a person maintains the normalized snapshot |
| `bcr render` | Re-renders findings, roadmap, capacity and geo sections from JSON; the full narrative needs `bcr assess` |
| Cloudflare Radar, CISA, Spamhaus, abuse.ch | Listed as sources and context only; there is no adapter turning them into signals (the tool will not invent country scores from them) |

## Not implemented

- Live enforcement of any kind: no provider API calls, App Store changes, WAF edits or deployments.
- Deployed-state collectors (reading branch protection, RLS state or cloud settings through APIs). Deployed evidence must be supplied in the intake.
- Multi-repository merged reports (run one review per repository).
- An optional conversational layer.
- Draft pull requests for sanctions proposals (proposals are printed and stored; opening a PR is left to the user).

## Knowledge verification

All 46 sources were **machine-verified** on 2026-11-14: fetched, read, and checked claim by claim. That is not human or legal review. A handful of claims are still open because a page was script-rendered or did not cover the detail. See [source-governance.md](source-governance.md) for what changed as a result (the AI Act amendment, the CCPA threshold, the UK single sanctions list, AWS WAF regions) and for how a person signs off.

Still not verified against any source:

- The illustrative SOC 2 Type I estimate (6 to 12 weeks, $10k to $25k). It is a planning heuristic, labelled as such in reports.
- Vendor prices in the playbook docs (marked as dated illustrations).
