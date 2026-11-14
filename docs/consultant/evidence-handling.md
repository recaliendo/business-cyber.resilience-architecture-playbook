# Handling assessments and evidence safely

Assessments describe your weaknesses. Treat report bundles and evidence as **confidential**.

- **Keep them out of public git.** `.gitignore` excludes `assessments/`, `reports/` and `.bcr/`. Store intakes and bundles there, or outside the repository.
- **Reference, don't embed.** Intake evidence items carry a `reference` (a path, ticket or export name). Never paste secrets, tokens, card numbers or raw customer records into an intake.
- **Redaction.** Every report, prompt, JSON export, alert and CLI message passes through `src/lib/redact.ts`, which removes common key formats, private keys, JWTs, credentials in URLs, bearer tokens, `password=`-style assignments and Luhn-valid card numbers. Redaction is a safety net, not permission to include secrets.
- **Safe export.** To share a report outside the company, share `report.html` or `report.md` only after reading it. The JSON contains the same information in structured form.
- **Retention.** Keep bundles as long as they are useful as evidence (for example, one audit cycle plus 12 months), then delete them. Delete restored production data from restore exercises within the agreed window.
- **Sanctions and threat data.** Policy files and approvals belong in a reviewed (often private) repository. Signals should be aggregates (counts per country per window), not raw IP or user lists.
