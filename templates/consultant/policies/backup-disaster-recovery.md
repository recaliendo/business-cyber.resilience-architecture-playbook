# Backup and disaster recovery policy

**Owner:** ______  **Approved:** ______  **Next review:** ______

| Item | Commitment |
|---|---|
| Database backups | Automated, at least daily; kept for ____ days |
| Uploaded files | Versioning or a copy in a second location; kept for ____ days |
| RTO target | ____ (measured in the last restore exercise: ____) |
| RPO target | ____ (measured: ____) |
| Restore exercise | At least every 6 months, using the [restore exercise template](../backup-restore-exercise.md) |

**Restore tests that use production data** are a controlled exception to the rule that production data stays in production. Each one needs:

- written approval
- an isolated target
- restricted access
- a retention limit (48 hours by default)
- outbound integrations disabled
- recorded cleanup

**Vendor outage:** if a critical vendor goes down, we ______ (status page notice, degraded mode, manual process).
