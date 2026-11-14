# Threat model and risk register

Keep this short and current. Revisit it when you add a data type, vendor, payment flow, AI feature or market.

## 1. What are we protecting?

| Asset | Where it lives | Why it matters | Data classes |
|---|---|---|---|
| Customer accounts | | Takeover leads to data and payment exposure | personal, credentials |
| Customer data | | | |
| Payment and entitlement state | | Fraud, revenue loss | |
| Source code and CI secrets | | Supply-chain compromise | |
| Domain and DNS | | Full service takeover | |

## 2. Trust boundaries and entry points

List each place untrusted input enters: public pages, APIs, webhooks, uploads, admin tools, CI runs from forks, third-party SDKs.

## 3. Threats (STRIDE prompts)

For each entry point, ask whether someone can **S**poof identity, **T**amper with data, **R**epudiate actions, cause **I**nformation disclosure, **D**eny service (including running up your bills), or **E**levate privilege.

## 4. Risk register

Likelihood and impact run from 1 (low) to 5 (high); score = L x I. Record the decision honestly. "Accept" is a valid decision when it is written down with an owner and a review date.

| ID | Risk | Likelihood | Impact | Score | Current controls | Decision (mitigate / accept / transfer / avoid) | Owner | Review by | Linked finding |
|---|---|---|---|---|---|---|---|---|---|
| R-001 | Takeover of a critical vendor account | | | | IAM-01 | | | | |
| R-002 | Cross-tenant data read through a missing RLS policy | | | | | | | | |
| R-003 | Forged payment webhook grants paid access | | | | | | | | |
| R-004 | Database or uploads lost with no tested restore | | | | RES-01, RES-02 | | | | |
| R-005 | Abuse traffic runs up vendor bills | | | | | | | | |
