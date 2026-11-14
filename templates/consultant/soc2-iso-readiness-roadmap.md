# SOC 2 / ISO 27001 readiness roadmap

**Start only when a trigger exists:** a buyer or contract requires the report or certificate, security questionnaires are blocking deals, or revenue is blocked by a security review. Applicable laws and platform rules come first regardless.

## Decide what buyers actually need

| Buyer or prospect | Asked for | Deadline | Would accept instead (bridge letter, Type I, questionnaire, ISO certificate) |
|---|---|---|---|
| | | | |

There is no such thing as being "SOC 2 certified": SOC 2 is an auditor's report. ISO/IEC 27001 certifies a management system. The two are not interchangeable.

## Path options

- **Type I, then Type II.** A common path. Type I covers control design at a point in time; Type II also covers how controls operated over an observation period. Type I is optional.
- **Straight to Type II.** For when controls have already run for a while and buyers want operating evidence.
- **ISO/IEC 27001.** For when EU or global enterprise buyers ask for it. Scope the ISMS deliberately.

## Planning assumption (illustrative only)

Type I with automation tooling: roughly 6 to 12 weeks and $10k to $25k, for a small scope with moderate maturity. This is not a quote. Audit fees, tooling, penetration tests and remediation vary widely, so get current quotes.

## Phases

| Phase | Work | Evidence produced | Target date |
|---|---|---|---|
| 0. Foundations | Quick-win package (MFA, branch protection, logs, scanning), vendor inventory, restore test | Evidence register entries | |
| 1. Scope | Systems, trust services criteria or ISMS scope, in-scope vendors | Scope document | |
| 2. Policies | Adapt the [policy templates](policies/README.md) to actual practice | Approved policies | |
| 3. Readiness | `bcr assess` with evidence; close blockers; optional pre-audit | Readiness report | |
| 4. Tooling (optional) | Evaluate an automation platform if the evidence volume justifies it | | |
| 5. Audit | Type I, or start the Type II observation period | Auditor engagement | |

"Type I complete, Type II observation in progress" helps in some buyer conversations. Do not promise that every buyer will accept it.
