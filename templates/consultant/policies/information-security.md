# Information security policy

**Owner:** ______  **Approved:** ______  **Next review:** ______

## Purpose and scope

This policy protects customer data and the availability of *product name*. It applies to everyone with access to production systems, source code or customer data, including contractors.

## Roles

- **Security owner:** ______ (accountable for this policy and the evidence register)
- **Everyone:** report suspected incidents immediately to ______

## Principles

1. Customer data is accessed only to provide the service, support customers, or meet legal obligations.
2. Production is separate from staging and development. Non-production environments use synthetic or sanitized data.
3. Secrets are kept in the platform's secret store, never in source code.
4. Every change reaches production through a pull request with automated checks.

## Vulnerability management

We remediate vulnerabilities within these targets *(adjust them to what you can actually meet)*:

| Severity | Target |
|---|---|
| Critical, or actively exploited | 7 days (faster when exploited in the wild) |
| High | 30 days |
| Medium | 90 days |
| Low | Next planned maintenance |

Exceptions are recorded with a reason, a compensating measure and an expiry date.

## Logging

Audit logs are enabled on critical systems and kept for ______ months. Only ______ can access them.

## Exceptions

Any deviation from this policy is recorded in the risk register with an owner and a review date.
