# SLOs and capacity plan

## Critical user journeys and SLOs

| Journey | SLI (what you measure) | SLO target | Measured (last 28 days) | Error budget left |
|---|---|---|---|---|
| Sign in | % of sign-in requests that succeed in under 1 s | 99.5% | | |
| Checkout | % of checkout sessions created without error | 99.9% | | |
| Core read | p95 latency | under 500 ms | | |

## Capacity inputs (measure them; do not guess from MAU)

| Input | Value | Source and date |
|---|---|---|
| Peak requests per second | | dashboard |
| Peak concurrently-active users | | analytics |
| Request mix (share, duration, DB queries) | | APM or logs |
| Compute concurrency limit | | vendor plan |
| Database max connections / pool size | | vendor plan |
| Storage quotas | | vendor plan |

Run `bcr forecast --intake <file>` for present, 10x and 100x projections and storage runway. Projections are not demonstrated capacity; only a passing load test is (see [load-test authorization](load-test-authorization.md)).

## Scaling triggers (measured, not revenue-based)

Revisit the architecture when one of these is **measured**, not merely anticipated:

- p95 latency on a critical journey exceeds its SLO for 3 consecutive days at normal load
- Sustained utilisation above 70% of a compute, connection or storage limit
- A load test fails below the next expected peak
- A data-residency or contractual requirement that the current regions cannot meet
- A vendor limit you cannot raise on your plan

Start with the least complex change that removes the measured bottleneck (indexes, caching, a connection pooler, a plan upgrade) before adding infrastructure. Do not adopt Kubernetes or multiple regions just because growth is planned.
