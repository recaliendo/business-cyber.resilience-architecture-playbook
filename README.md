# Business Cyber Resilience Architecture Playbook & Consultant

Two tools in one repository, for solo founders and small teams launching iOS and web products (B2C, B2B or hybrid):

1. **The playbook**: an opinionated reference architecture, setup sequence, config templates and checklists for going from a blank GitHub account to early production without over-building.
2. **The consultant (`bcr`)**: a local-first command-line tool that **reviews your repositories** and **assesses your business** from an intake file and evidence. It produces a report with prioritized findings, a 30/60/90-day roadmap, and a copy-ready Claude Code prompt for each fix.

The consultant runs offline, needs no accounts or credentials, and never deploys, sends or changes anything on its own.

> Screening tool, not legal advice or an audit. Reports never claim that a business is compliant, "SOC 2 certified", or protected at runtime. Every legal and vendor source behind the rules is currently **unverified** (see [source governance](docs/consultant/source-governance.md)).

## Quick start (5 minutes, no credentials)

Requires [Node.js](https://nodejs.org/) 22.12 or newer.

```bash
git clone https://github.com/recaliendo/business-cyber.resilience-architecture-playbook.git
cd business-cyber.resilience-architecture-playbook
npm ci
npm run demo
```

Then open `reports/demo/03-repo-review/report.html` in a browser. It is a review of a deliberately insecure sample app, with **Copy prompt** buttons on every finding.

To review your own code and business:

```bash
npm run bcr -- review --repo ../your-app --out reports/your-app
cp templates/consultant/intake.yaml assessments/intake.yaml   # then fill it in (gitignored)
npm run bcr -- assess --intake assessments/intake.yaml --repo ../your-app --out reports/full
```

All commands, exit codes and opt-in flags: [docs/consultant/cli.md](docs/consultant/cli.md).

## What the consultant does

| Capability | What you get | Details |
|---|---|---|
| **Repository review** | Read-only static review of a checkout or GitHub repo. Findings pinned to commit, file and line; the boundary between code, config, deployed state and unknown made explicit | [repository-review.md](docs/consultant/repository-review.md) |
| **Infrastructure and health** | Backups, restores, tenant isolation, timeouts, retries, idempotency, rate limits, origin exposure, failure dependencies | [capabilities](docs/consultant/capabilities.md) |
| **Capacity and storage** | Little's Law concurrency, DB connection demand, present/10x/100x scenarios, storage runway with retention, versioning, replicas and backups, cost ranges from your dated prices. Projected vs demonstrated, kept separate | [slo-capacity-plan](templates/consultant/slo-capacity-plan.md) |
| **Security posture** | 26 controls with evidence requirements, solo-founder alternatives, a one-day quick-win package; readiness and evidence coverage reported separately | [scoring.md](docs/consultant/scoring.md) |
| **Compliance positioning** | 26 obligations screened as applicable / not applicable / uncertain with reasoning. Legal, platform, contractual and voluntary obligations kept apart; SOC 2 / ISO positioning; questions for counsel | [security.md](docs/security.md#compliance-obligations-vs-attestations) |
| **Geo-risk policy as code** | Sanctions and threat tracks kept separate, hash-bound approvals, expiring CHALLENGEs, EU guardrail, dry-run artifacts for Cloudflare, AWS WAF, CloudFront and App Store, with explicit capability gaps | [geo-policy.md](docs/consultant/geo-policy.md) |
| **Reports** | Business summary + engineering detail (Markdown), JSON, accessible HTML, and `prompts/<finding>.md` for each actionable finding | [cli.md](docs/consultant/cli.md) |

What is a stub or not built yet is listed plainly in [capabilities.md](docs/consultant/capabilities.md).

### How evidence and scoring work

Every control is `met`, `partial`, `unmet`, `unknown` or `not_applicable` (the last needs a reason). **Unknown never counts as met**, and stale evidence becomes unknown. *Readiness* (how much is in place) and *evidence coverage* (how much is proven) are separate numbers. Blockers such as missing MFA, committed secrets or untested backups are listed first and never averaged away. Full formula: [scoring.md](docs/consultant/scoring.md).

## Examples

| Example | Shows |
|---|---|
| [01-solo-b2c-launch](examples/intake/01-solo-b2c-launch.yaml) | Partial intake; follow-up questions; SOC 2 correctly **not** recommended |
| [02-b2b-enterprise](examples/intake/02-b2b-enterprise.yaml) | Questionnaires arriving; SOC 2 / ISO evaluation; stale evidence |
| [03-global-growth-uploads](examples/intake/03-global-growth-uploads.yaml) | Heavy uploads, storage runway, EU/UK/BR obligations, measured traffic and load tests |
| [04-health-education-screening](examples/intake/04-health-education-screening.yaml) | Sector-law screening that stays "uncertain" until legal roles are known |
| [geo/](examples/geo/policy.yaml) | Regional sanctions modelling, threat signals, approval binding, feed proposals |
| [repos/vulnerable-saas](examples/repos/vulnerable-saas/README.md) | Synthetic app with RLS, webhook, CI and secret issues for the repository review |

## The playbook

| If you're... | Start here |
|---|---|
| Starting a brand-new venture | [templates/launch-checklist.md](templates/launch-checklist.md) |
| Deciding on the tech stack | [architecture/reference-architecture.md](architecture/reference-architecture.md) |
| Setting up a new GitHub repo | [vendors/github.md](vendors/github.md) + [templates/repository-checklist.md](templates/repository-checklist.md) |
| Wiring up Supabase | [vendors/supabase.md](vendors/supabase.md) |
| Wiring up Stripe billing | [vendors/stripe.md](vendors/stripe.md) |
| Deploying to Netlify | [vendors/netlify.md](vendors/netlify.md) |
| Checking if you're ready to launch | [templates/production-readiness-checklist.md](templates/production-readiness-checklist.md) |
| Doing a security pass | [templates/security-checklist.md](templates/security-checklist.md) + [docs/security.md](docs/security.md) |
| Working out which laws and platform rules apply | [compliance applicability register](templates/consultant/compliance-applicability-register.md) + `bcr compliance` |
| Preparing for SOC 2 / ISO 27001 when buyers ask | [templates/consultant/soc2-iso-readiness-roadmap.md](templates/consultant/soc2-iso-readiness-roadmap.md) |
| Writing policies, runbooks and registers | [templates/consultant/](templates/consultant/policies/README.md) |
| Wondering "why did we pick X over Y" | [docs/architecture-decisions.md](docs/architecture-decisions.md) |

To use the playbook as the starting point for a new venture:

```bash
gh repo create <new-business-name> --template recaliendo/business-cyber.resilience-architecture-playbook --private --clone
```

(Enable "Template repository" in this repository's settings first if it is not already on.)

The config files under `templates/config/` are **examples to copy into a new project**. They are not active controls on this repository. This repository's own CI lives in `.github/workflows/`.

Prices and plan limits quoted in the playbook are dated illustrations; check vendors' current pricing before deciding anything ([cost-management.md](docs/cost-management.md)).

## Repository structure

```text
├── src/                 consultant source (TypeScript): domain, intake, evidence, engines, review, reporting, cli
├── knowledge/           versioned controls, obligations, sources, provider capabilities (YAML)
├── schemas/             JSON Schemas generated from src/domain (for editors and CI)
├── examples/            synthetic intakes, geo policy and signals, a vulnerable sample repo
├── tests/               offline acceptance tests (node:test)
├── docs/                playbook guidance + docs/consultant/ + docs/adr/
├── templates/           playbook checklists, config examples, consultant templates, k6 load tests
├── vendors/             per-vendor deep dives
└── architecture/        reference architecture and diagrams
```

## Maturity stages

1. **Prelaunch / Day 0**: account and tool bootstrap, before any code.
2. **Launch / MVP**: first deployed, usable version.
3. **Early production**: real customers, real payments, real data at stake.
4. **Growth**: signals that say "this default no longer fits, reconsider".
5. **Enterprise / global**: procurement, multiple markets, data residency.

Don't build stage-4 infrastructure at stage 1. Applicable laws and platform rules are the exception: they apply from launch.

## What this is not

- Not a no-code/low-code guide; it assumes you write code.
- Not enterprise architecture for its own sake. Kubernetes, multi-region and service meshes are adopted only when **measured** needs require them: latency, saturation, resilience targets, data residency, vendor limits or cost. Revenue figures are not the trigger, and neither is planned growth.
- Not vendor-neutral: it picks defaults (GitHub, Netlify, Supabase, Stripe, Apple). The consultant accepts other architectures through its normalized intake.
- Not legal advice, an audit, or a substitute for counsel or a qualified auditor.

## Contributing and maintenance

See [CLAUDE.md](CLAUDE.md) for commands, rules and how to add controls, obligations, sources, checks and integrations. Run `npm run check` before opening a PR. When a new business surfaces a pattern worth generalizing, bring the lesson back here through a PR, and record decisions in [docs/architecture-decisions.md](docs/architecture-decisions.md) or [docs/adr/](docs/adr/0001-local-first-typescript-consultant.md).

Security issues: see [SECURITY.md](SECURITY.md).
