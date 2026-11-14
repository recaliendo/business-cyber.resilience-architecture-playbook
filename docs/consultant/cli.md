# CLI reference and clean-checkout demo

Requires Node.js 22.12 or newer. No accounts, credentials or network access are needed for anything below.

## Clean-checkout demo (copy and paste)

```bash
git clone https://github.com/recaliendo/business-cyber.resilience-architecture-playbook.git
cd business-cyber.resilience-architecture-playbook
npm ci
npm run demo
```

`npm run demo` builds the tool and writes four report bundles under `reports/demo/` (gitignored). It covers a solo B2C launch, a B2B SaaS, a repository review of the synthetic vulnerable app, and the geo-risk scenario. Open `reports/demo/*/report.html` in a browser.

## Commands

After `npm run build`, run commands as `node dist/src/cli/index.js <command>`, or with `npm run bcr -- <command>`. The examples below use the `npm run bcr --` form.

| Task | Command |
|---|---|
| Validate an intake and see follow-up questions | `npm run bcr -- validate intake examples/intake/01-solo-b2c-launch.yaml` |
| Assess a business (full bundle) | `npm run bcr -- assess --intake examples/intake/02-b2b-enterprise.yaml --out reports/b2b` |
| Forecast capacity | `npm run bcr -- forecast --intake examples/intake/03-global-growth-uploads.yaml` |
| Custom scenario | `npm run bcr -- forecast --intake examples/intake/03-global-growth-uploads.yaml --scenario holiday=4 --scenario launch=25` |
| Assess compliance positioning | `npm run bcr -- compliance --intake examples/intake/04-health-education-screening.yaml` |
| Evaluate the geo-policy against threat signals | `npm run bcr -- geo evaluate --policy examples/geo/policy.yaml --approvals examples/geo/approvals.yaml --signals examples/geo/signals.yaml --now 2026-11-14T12:00:00Z` |
| Process a sanctions snapshot (proposal only) | `npm run bcr -- geo feed --policy examples/geo/policy.yaml --snapshot examples/geo/sanctions-snapshot-new.json --previous examples/geo/sanctions-snapshot-previous.json --now 2026-11-14T12:00:00Z` |
| Source verification backlog | `npm run bcr -- sources status` |
| Refresh sources (dry run) | `npm run bcr -- sources refresh --dry-run` |
| Plan enforcement (dry run) | `npm run bcr -- enforce plan --policy examples/geo/policy.yaml --approvals examples/geo/approvals.yaml --provider cloudflare-waf --dry-run --allow-synthetic` |
| Review a repository | `npm run bcr -- review --repo examples/repos/vulnerable-saas --out reports/review` |
| Review a GitHub repository (network) | `npm run bcr -- review --repo https://github.com/<owner>/<repo> --out reports/review` |
| Check a review is still current | `npm run bcr -- review verify --bundle reports/review --repo <path-to-checkout>` |
| Open a remediation prompt | `npm run bcr -- prompt show --bundle reports/review --finding <finding-id>` |
| Combined assessment and review | `npm run bcr -- assess --intake examples/intake/02-b2b-enterprise.yaml --repo examples/repos/vulnerable-saas --out reports/combined` |
| Re-render Markdown from JSON | `npm run bcr -- render --from reports/b2b/report.json --out reports/b2b/rerendered.md` |
| Exercise alert transports (dry run) | `npm run bcr -- alerts test --transport slack` |

## Review a repository, then open and copy a prompt

1. `npm run bcr -- review --repo ../your-app --out reports/your-app`
2. Open `reports/your-app/report.html`. Each finding has **Open remediation prompt** and **Copy prompt** buttons.
3. Or open `reports/your-app/prompts/index.md` and follow a link to `prompts/<finding-id>.md`.
4. Paste the prompt into Claude Code inside the reviewed repository. The prompt first checks that the checkout still matches the reviewed commit.

These links open files. They do not launch Claude Code, and a prompt does not authorise any change.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Unexpected error |
| 2 | Invalid input (intake, policy or schema) |
| 3 | Enforcement plan refused (unapproved policy, or synthetic rules without `--allow-synthetic`) |
| 4 | Review is stale: the checkout has moved past the reviewed commit |
| 5 | Sanctions feed failed or stale: the last approved policy stays in force |

## Flags that allow side effects (all off by default)

| Flag | Effect |
|---|---|
| `sources refresh --allow-network` | Fetches registry URLs (https only, public addresses only, 5 MB cap). Never marks anything verified. |
| `geo evaluate --auto-challenge` | Allows a temporary 72-hour CHALLENGE override to be written (with `--write-overrides`). It is still a dry run at the edge. |
| `--send` (alerts) | Delivers alerts through Slack or PagerDuty when `BCR_SLACK_WEBHOOK_URL` or `BCR_PAGERDUTY_ROUTING_KEY` is set. |
| `review --repo https://github.com/...` | Clones over the network; uses `GITHUB_TOKEN` if set (prefer a fine-grained, read-only token). |
