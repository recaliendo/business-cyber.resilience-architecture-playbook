# Evidence and scoring model (version 1.0.0)

The scoring model is published so anyone can reproduce a report by hand. Any change to it bumps `SCORING_VERSION` in `src/evidence/scoring.ts`, and every report records the version it used.

## Control states

| State | Meaning | Credit |
|---|---|---|
| `met` | Evidence shows the control in place | 1.0 |
| `partial` | Evidence shows it partly in place | 0.5 |
| `unmet` | Evidence shows it is not in place | 0 |
| `unknown` | No evidence, stale evidence, or an unjustified "not applicable" | 0 |
| `not_applicable` | Justified as not applying, or not expected at this stage | excluded |

- **Unknown never counts as met.**
- **Not applicable needs a reason.** Without a justification it is treated as unknown.
- **Stale evidence is unknown.** Each control has an `evidenceMaxAgeDays`; older evidence earns no credit.
- **Stage gating:** a control whose `minStage` is later than the business's stage is reported as not applicable *with the stage as the stated reason*.

## Provenance

Every piece of evidence is `observed` (an export or screenshot from the system), `self_reported` (a statement), `inferred` (derived by the tool), or `unknown`. Self-reported "met" earns credit but is labelled as such and does not count towards observed coverage.

## Scores (always reported separately)

Over the applicable controls (state not `not_applicable`), with each control's `weight` (1 to 5):

```text
readiness          = sum(weight * credit) / sum(weight)
evidenceCoverage   = sum(weight for controls with a known state) / sum(weight)
observedCoverage   = sum(weight for controls backed by observed evidence) / sum(weight)
```

A business can have high readiness and low coverage (claims without proof) or high coverage and low readiness (well documented gaps). Both numbers matter, so neither is merged into the other.

## Blockers are never averaged away

Controls marked `blockerIfUnmet` (MFA, secrets, backups) are listed as **blockers** whenever they are not `met`. Applicable legal or platform obligations flagged as launch blockers are listed too. Reports and roadmaps put blockers first, whatever the aggregate score.

## What scores are not

A score is not an audit opinion, not legal compliance, and not "SOC 2 compliant" or "certified". The control catalog's mappings to SOC 2 criteria and ISO 27001 Annex A are informational pointers only.

## Findings and priority

| Severity | Default priority |
|---|---|
| critical, or any launch blocker | P0 |
| high | P1 |
| medium | P2 |
| low, info | P3 |

Unknown controls are reported one severity level lower than confirmed gaps (with status `requires_verification`), except blocker controls, which keep their severity.
