# Baseline review (before the consultant engine)

- **Reviewed commit:** `84ae2a46ed10f90dc4a9aa4baab9ab09d8147882` (`main`, 2026-11-14), the merge of PR #3.
- **Brief's starting commit:** `905ab058daf2101cc5891e640eb36ef6b84f1217`. `main` had moved on by the time this work started, so every finding below was re-checked against `84ae2a4`.
- **Reviewer:** Claude Code (static inspection; no deployed infrastructure was examined).

## Inventory at baseline

Documentation and templates only. There was no runnable code, no package manifest and no tests.

| Area | Contents |
|---|---|
| `architecture/` | Reference architecture, data flow, 4 Mermaid diagrams |
| `docs/` | Security, environments, secrets, deployment, monitoring, backup/recovery, production readiness, cost, ADR log, startup checklist |
| `vendors/` | GitHub, Netlify, Supabase, Stripe, other services |
| `templates/` | Checklists, `env.example`, `config/` (CI, Dependabot, Netlify, Stripe handlers, Supabase clients and RLS pattern) |
| `.github/` | `security.yml` (gitleaks full-history scan), `dependabot.yml` (actions), `CODEOWNERS`. All were added by PR #3 |

## Findings re-verified

| # | Finding | Status at `84ae2a4` | Resolution in this branch |
|---|---|---|---|
| B-1 | README contains an older template repository address (`caliendohomes-rgb/business-architecture-playbook`) | **Confirmed** (`README.md:8`) | Replaced with the current repository |
| B-2 | `docs/security.md` groups HIPAA/PCI with optional frameworks ("growth triggers, not MVP requirements") | **Confirmed** (`docs/security.md:41`) | Section rewritten: legal, platform and contractual obligations vs voluntary attestations |
| B-3 | Vendor prices, plan limits and portability claims are undated | **Confirmed** (`docs/cost-management.md:5-21`, `architecture/reference-architecture.md`) | Prices marked as dated illustrations that must be re-verified; no engine logic depends on them |
| B-4 | Templates are not active controls on this repository | **Partly resolved by PR #3** (repo now has its own secret scan and Dependabot) | Real CI added: build, lint, tests, validation, dependency review |
| B-5 | Stripe webhook template: SDK compatibility, ordering, idempotency, side effects | **Confirmed** (`templates/config/stripe-webhook-handler.ts`): no pinned `apiVersion`; uses `invoice.subscription`, which newer API versions moved; no event-ID dedupe table; subscription upsert has no ordering guard | Template revised and labelled *illustrative, not production-ready* |
| B-6 | Sample CI secret scanner prints the matching content | **Confirmed** (`templates/config/github-workflows-ci.yml`, `echo "$MATCHES"`) | Replaced with gitleaks (`--redact`) |
| B-7 | "No customer data outside production" vs restore testing | **Confirmed tension**: `docs/backup-recovery.md:7` says to restore into a scratch project, while `docs/environments.md` forbids production data outside production | Reconciled: authorized, isolated, time-boxed restore exercise with cleanup evidence |
| B-8 | Arbitrary revenue thresholds used as infrastructure gates | **Confirmed** (`README.md:89`, "below ~$50k MRR") | Replaced with measured triggers (latency, saturation, residency, cost) |

## Strengths kept

- Stage-based guidance that explicitly warns against over-building.
- Environment separation (staging vs production Supabase project and Stripe mode).
- RLS-first access control, service-role isolation, `security definer` + `search_path` discipline.
- Webhook signature verification and server-side price maps.
