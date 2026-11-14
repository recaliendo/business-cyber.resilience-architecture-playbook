# Bounded k6 load-test examples

Five scenarios: `baseline`, `ramp`, `spike`, `soak`, `recovery`. All of them:

- default to `http://localhost:8888` and **refuse** any other target unless both `TARGET_URL` and `ALLOW_REMOTE_TARGET=yes` are set
- have hard caps on virtual users, request rate and duration, plus abort thresholds (error rate over 5% or p95 over 2 s stops the run)
- use synthetic data only; never point them at real customer accounts

Fill in [load-test authorization](../consultant/load-test-authorization.md) before any non-local run.

```bash
k6 run -e SCENARIO=baseline templates/load-tests/k6-scenarios.js
k6 run -e SCENARIO=ramp -e TARGET_URL=https://staging.example.test -e ALLOW_REMOTE_TARGET=yes templates/load-tests/k6-scenarios.js
```

Record a passing result in your intake under `workload.loadTests`. The consultant only labels capacity as "demonstrated" from passing staging or production tests.

## Also worth testing (write these for your app)

| Area | What to prove |
|---|---|
| Auth | Login and token refresh hold up at peak; rate limits return 429, not 500 |
| Tenant isolation under concurrency | Two synthetic tenants hammering the same endpoints never see each other's rows |
| Uploads | Concurrent uploads at peak size do not exhaust function memory or time limits |
| Webhooks | Duplicate and out-of-order deliveries produce exactly one effect |
| Restore performance | A restore of realistic size meets the RTO (see the restore exercise) |
