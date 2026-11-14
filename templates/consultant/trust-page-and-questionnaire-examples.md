# Truthful trust page and questionnaire answers

Only say what you can back with evidence. Overstating controls on a questionnaire or trust page can amount to contractual misrepresentation.

## Trust page (example for an early-stage company)

> **Security at Example Co**
>
> - Every staff account on our critical systems uses multi-factor authentication.
> - Code changes go through pull requests on a protected branch, with automated tests and secret scanning.
> - Our infrastructure providers encrypt customer data in transit (TLS) and at rest.
> - We take automated daily backups and test restores. Our last restore test was in *month, year*.
> - Payments go through Stripe's hosted checkout. We do not store card numbers.
> - Our infrastructure providers hold their own independent assurance reports. These cover their services, not ours.
> - We do not currently hold a SOC 2 report or an ISO 27001 certificate. *(Or "We are preparing for a SOC 2 Type I assessment", but only if that is true.)*
> - To report a vulnerability, *link to SECURITY.md or a security contact*.

## Questionnaire answers: truthful versus overstated

| Question | Truthful answer | Avoid |
|---|---|---|
| Do you have SOC 2? | "No. We have documented controls and can share our security overview and evidence on request." | "We are SOC 2 compliant." |
| Do you encrypt data at rest? | "Yes, through our database and storage providers' encryption at rest, using provider-managed keys." | "We use military-grade encryption." |
| Do you perform penetration tests? | "Not yet. We run automated dependency and secret scanning on every change." | "Yes" (when only a scan was run) |
| Do you have an incident response plan? | "Yes, a written runbook, last reviewed *date*." | "24/7 SOC" (when there isn't one) |
| Where is data stored? | "AWS us-east-1 for the database, with backups in the same region." | "In the cloud." |
