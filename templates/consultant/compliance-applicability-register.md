# Compliance applicability register

One row per obligation reported by `bcr compliance`. The tool only screens; the human and counsel decisions live here.

Categories: **legal** (law or regulation), **platform** (App Store rules), **contractual** (PCI DSS through your processor), **voluntary** (SOC 2, ISO 27001).

| Obligation | Category | Tool status | Decision | Reasoning (in your words) | Counsel reviewed (who, date) | Evidence | Next review |
|---|---|---|---|---|---|---|---|
| OB-GDPR | legal | | applies / does not apply | | | | |
| OB-CCPA | legal | | | | | | |
| OB-APPLE-ACCOUNT-DELETION | platform | | | | | | |
| OB-PCI-DSS | contractual | | | | | | |
| OB-SOC2 | voluntary | n/a | pursue / not now | | n/a | | |

Rules:

- "Uncertain" from the tool means a question for counsel, not "probably fine".
- Applicable legal obligations apply from launch. They are not deferred until customers ask.
- Record the date of every decision. Re-run `bcr compliance` when you add a market, a data type, payments, AI or children's features.
