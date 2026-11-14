# Incident runbook

Keep this somewhere you can reach when production is down. Keep a timestamped log from the first minute.

## 0. Roles (a solo founder holds all of them)

- **Lead:** decides and coordinates.
- **Scribe:** keeps the timeline.
- **Comms:** talks to customers and, if needed, regulators.

## 1. Identify (first 15 minutes)

- What is affected? Which environment, which users, which data?
- Is it still happening?
- Severity: **SEV1** data exposure or full outage; **SEV2** major feature down or suspected compromise; **SEV3** degraded.

## 2. Contain

- Rotate any exposed credential **first** (see [secrets management](../../docs/secrets-management.md)). Removing it from code is not enough.
- Revoke sessions or tokens if accounts may be compromised.
- If a repository leaked data publicly, make it private now; decide about rewriting history later.
- Preserve evidence: export logs before they expire, and copy what you need before wiping anything.

## 3. Communicate

- Post a status page or in-app notice for customer impact.
- If personal data may have been exposed, fill in the **breach-notification worksheet** below **before** deciding it is fine. Deadlines can be short; for example, GDPR (where it applies) gives 72 hours to notify the regulator.
- Contracts may require you to notify business customers faster than the law does. Check your DPAs.

## 4. Fix the root cause

Fix the cause, not only the symptom: rotate the key **and** close the gap that let it leak.

## 5. Record

Write a short incident note: timeline, cause, impact, fix, and follow-ups with owners. Add it to the evidence register.

---

## Breach-notification decision worksheet

This worksheet organises the facts for counsel. It does not decide whether notification is legally required.

| Question | Answer | Evidence |
|---|---|---|
| When did we become aware? (date and time, UTC) | | |
| What data was involved? (classes, not the data itself) | | |
| How many people, and where do they live? | | |
| Was the data encrypted, and was the key also exposed? | | |
| Was the data actually accessed or taken, or only exposed? | | |
| Which laws or contracts could apply? (from the compliance applicability register) | | |
| Are we the controller, or a processor that must tell its customers? | | |
| Likely harm to individuals (identity theft, financial, discrimination, distress)? | | |
| Regulator deadline(s) that may apply | | |
| Customer or contract deadline(s) | | |
| Counsel consulted (who, when) | | |
| Decision and rationale | | |
