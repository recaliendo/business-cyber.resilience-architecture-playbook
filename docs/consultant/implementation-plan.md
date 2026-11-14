# Implementation plan: Business Cyber Resilience Consultant

The decisions behind this plan are in [ADR 0001](../adr/0001-local-first-typescript-consultant.md). The starting state is recorded in [baseline-review.md](baseline-review.md).

## Layout

```text
src/
  domain/        zod schemas for all shared models (single source of truth)
  lib/           safe IO (bounded file reads, safe YAML), redaction, hashing, IDs
  intake/        load, validate, and compute follow-up questions + assumptions
  evidence/      control-state evaluation and published scoring
  engines/
    infrastructure/  architecture & operational-health checks on the inventory
    capacity/        Little's Law, scenarios, storage runway, cost ranges
    security/        control catalog evaluation, quick-win package
    compliance/      obligation applicability + SOC 2 / ISO positioning
    geo/             sanctions vs threat tracks, signals, TTL, approvals, compiler, alerts
  review/        read-only repository review (local checkout, git-clone adapter)
  sources/       source registry, staleness, guarded refresh
  reporting/     Markdown / JSON / HTML bundle + per-finding prompt files
  cli/           `bcr` command
knowledge/       versioned YAML: controls, obligations, sources, provider capabilities
schemas/         JSON Schema generated from src/domain (do not edit by hand)
policies/        geo-policy examples (synthetic, never production lists)
examples/        synthetic intakes, evidence, signals, repos to review
tests/           node:test unit + acceptance tests
```

## Phases and status

Each phase is complete when it has code, tests and docs. Anything that is a stub is labelled as one in the README and in [capabilities.md](capabilities.md).

1. Foundation: package, tsconfig, lint, schemas, CLI skeleton.
2. Intake and evidence model: partial intake, assumptions, scoring.
3. Capacity and infrastructure engines.
4. Security control catalog.
5. Compliance obligations and SOC 2 / ISO positioning.
6. Geo-risk policy-as-code: two tracks, approvals, TTL, compiler, alerts.
7. Repository review and report bundle with prompt artifacts.
8. Source governance.
9. CI, acceptance tests, templates, docs, README.

## Engineering assumptions

- Intake files are YAML or JSON, up to 2 MB each.
- Assessments run in a single process. No concurrency or persistence is needed.
- Prices are never built into the engine. Cost estimates use unit prices supplied with the intake, each with a source date, and are labelled as estimates.
- No source has been verified unless its `verifiedAt` field says so. All sources start as unverified.
