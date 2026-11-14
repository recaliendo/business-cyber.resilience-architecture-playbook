# ADR 0001: Local-first, deterministic TypeScript consultant

- **Status:** Accepted
- **Date:** 2026-11-14
- **Context commit:** `84ae2a4`

## Context

The repository was a documentation playbook. It now also needs to *assess* a business: its intake, evidence, capacity, security, compliance, geo-risk and source repositories. The output has to be reproducible, auditable and honest about uncertainty. The primary users are solo founders and small teams, who should not need accounts, databases or paid models to run it.

## Decision

1. **TypeScript on Node.js LTS (>= 22.12), with no runtime framework.** Runtime dependencies are limited to:
   - `zod`: runtime validation, plus JSON Schema export for editors and CI.
   - `yaml`: YAML 1.2 parsing in its safe default mode. Custom tags are not used, merge keys are off, and alias expansion is capped.

   Everything else uses the Node standard library: `node:test`, `node:crypto` and `node:util.parseArgs`.
2. **TypeScript is pinned to 6.0.x.** TypeScript 7.0 (the native compiler) is out, but `typescript-eslint` 8.x supports only `<6.1`. Revisit once lint tooling supports 7.
3. **The deterministic core is the product.** Every finding, score, capacity number and policy decision comes from versioned rules and knowledge files. There is no LLM in the loop. An optional conversational layer is out of scope for this ADR. If one is added, it may only *explain* existing findings and ask intake questions; it must not create evidence or change policy.
4. **The CLI is the first interface.** Reports are generated as Markdown, JSON and a static HTML file, written into a self-contained bundle directory with per-finding remediation prompt files.
5. **Knowledge lives in data, logic lives in code.**
   - Controls, obligations, sources and provider capabilities are YAML under `knowledge/`, each with a version.
   - The applicability logic for each obligation is a TypeScript function keyed by obligation ID. That keeps it reviewable and testable, rather than an ad-hoc expression language.
   - Every report records the rule-set version.
6. **Nothing live by default.** Alert transports default to `dry-run`. Enforcement produces artifacts and diffs, never API calls. Source refresh without `--allow-network` does not fetch. Repository review never runs scripts from the reviewed repository.

## Consequences

- The tool runs offline from a clean checkout after `npm ci`.
- Legal and vendor knowledge goes stale. That is handled by the source registry, which carries a verification status and review cadence, plus staleness checks in reports.
- Logic is spread across TypeScript functions and YAML. `CLAUDE.md` documents how to add each kind of rule.
- No database. Assessments are files, which keeps sensitive evidence out of any hosted system but leaves secure storage to the user. `assessments/` is gitignored by default.

## Alternatives considered

- **Python CLI.** Equally viable. TypeScript was chosen because the repository's templates and the default stack (Netlify Functions, Supabase JS) are already TypeScript.
- **A rules engine or policy language (OPA/Rego) for compliance and geo rules.** Rejected for now: it adds a toolchain founders would have to learn. Geo policies are still plain, schema-validated YAML, so a Rego export can be added later.
- **A hosted dashboard.** Rejected for v1: it needs accounts and storage of sensitive assessment data.
