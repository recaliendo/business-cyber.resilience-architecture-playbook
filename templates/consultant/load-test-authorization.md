# Load-test authorization

Load tests can cause outages, trip abuse protections and cost money. Fill this in before any test that does not target `localhost`.

| Item | Value |
|---|---|
| Target URL (exact) | |
| Environment | local / staging / production |
| Owner of the target who approved the test | |
| Approval reference (ticket, PR, email) | |
| Window (UTC start and end) | |
| Maximum virtual users | |
| Maximum request rate | |
| Maximum duration | |
| Expected vendor cost, and who pays | |
| Third parties affected (payments, email, SMS) and how they are stubbed | |
| Stop conditions (error rate, p95, vendor alerts) | |
| Person watching dashboards during the test | |

Rules:

- Use synthetic accounts and data, never real customer accounts.
- Payment providers must be in test mode or stubbed. Never send real email or SMS.
- **Production tests need written approval from the owner of every system involved.** Never test systems you do not own.
- The k6 scripts in [templates/load-tests](../load-tests/README.md) refuse non-local targets unless `ALLOW_REMOTE_TARGET=yes` is set alongside `TARGET_URL`.
