# Evidence register

Record **references** to evidence (file paths, ticket links, export names), never the secrets or customer data themselves. Store the evidence files somewhere access-controlled, not in a public repository.

Quarterly collection is a starting cadence. Some controls need fresher evidence: the `evidenceMaxAgeDays` in `knowledge/controls/controls.yaml` is what the consultant uses. Evidence older than that counts as **unknown**, not met.

To feed the consultant, copy rows into the `evidence:` list of your intake (format in `examples/intake/02-b2b-enterprise.yaml`).

| ID | Control(s) | State asserted | Kind | Provenance | Collected (UTC) | Collected by | Reference | Notes / justification |
|---|---|---|---|---|---|---|---|---|
| ev-2026q4-mfa | IAM-01, IAM-02 | met | config_export | observed | 2026-11-05T10:00Z | Founder | evidence/2026-q4/mfa/ | GitHub, registrar, email, Apple, Stripe |
| | | | | | | | | |

**Provenance:** `observed` = an export or screenshot taken from the system. `self_reported` = a statement without an artefact. Only observed evidence counts towards "observed coverage" in the report.

**Not applicable:** always write the reason. A `not_applicable` without a justification is treated as unknown.

## Recurring evidence checklist

| Evidence | Suggested cadence | Last collected |
|---|---|---|
| MFA status on all critical accounts | Quarterly | |
| Access review (who has what) | Quarterly | |
| Branch protection export | Quarterly and on change | |
| Dependency and secret-scan alert status | Monthly | |
| Vulnerability remediation times vs targets | Monthly | |
| Backup success and latest timestamp | Monthly | |
| Restore exercise record | Every 6 months | |
| Policy reviews | Yearly and on material change | |
| Vendor inventory and DPA check | Yearly and on new vendor | |
