# Backup and restore exercise

This exercise proves that backups can be restored and measures your real RTO (time to recover) and RPO (data you would lose). Run it before launch and at least every six months (control RES-02).

## Authorization (required when production data is involved)

Restoring a production backup creates a copy of customer data outside production. That is allowed only as a controlled exception:

- [ ] Approved by ______ on ______ (record it in the evidence register)
- [ ] Isolated target: a separate, non-public project or account with no preview or app access
- [ ] Access limited to: ______
- [ ] Retention limit: the copy is deleted within ___ hours (48 is a good default)
- [ ] No outbound integrations (email, webhooks, payments) are enabled in the restored copy

Where a **synthetic** dataset of realistic size will do, use it for routine drills and keep production restores for the periodic proof.

## Steps

1. Note the backup's timestamp: ______ (this sets the RPO you would have suffered).
2. Start the clock: ______
3. Restore the **database** into the isolated target.
4. Restore a sample of **uploaded objects** (database backups usually do not include them).
5. Integrity checks: compare row counts for key tables with production at backup time, open 10 random objects, and do one end-to-end read of a test account.
6. Stop the clock: ______

## Results

| Measure | Target | Measured |
|---|---|---|
| RTO (minutes to a working restore) | | |
| RPO (minutes of data lost) | | |
| Database restore succeeded | | |
| Object restore succeeded | | |
| Integrity checks passed | | |

## Cleanup (evidence)

- [ ] Restored copy deleted at ______ by ______ (screenshot or CLI output in the evidence register)
- [ ] Credentials used for the exercise rotated or revoked

Record the measured RTO and RPO in your intake (`workload.rtoMinutes`, `workload.rpoMinutes`) and add evidence items for RES-01 and RES-02.
