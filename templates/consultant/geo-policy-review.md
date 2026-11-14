# Geo-policy approval record and quarterly review

## Approval record (one per policy version)

Each approval is bound to the policy's **content hash**. Any edit, including removing or relaxing a sanctions rule, needs a new approval. `bcr geo evaluate` prints the current hash.

| Field | Value |
|---|---|
| Policy ID and version | |
| Policy hash (sha256) | |
| Change summary (rules added, removed, changed) | |
| Sanctions changes reviewed by counsel (who, date, memo reference) | |
| Approver (named person) | |
| Pull request URL (merged through branch protection) | |
| Deployment environment protection used | |
| Rollback plan | |

A name typed into a file is not proof of approval. The proof is the reviewed pull request, merged through branch protection, plus a protected deployment environment.

## Quarterly review (and after major geopolitical events)

- [ ] Sanctions sources re-checked against official publications (`bcr sources status`)
- [ ] Each sanctions rule still has a current legal basis and source
- [ ] Regional rules still map correctly, and none has been widened to a whole country
- [ ] Temporary threat CHALLENGE rules reviewed; none renewed indefinitely
- [ ] Any discretionary BLOCK rules still justified, with a counsel decision on file
- [ ] No discretionary BLOCK on EU member states for B2C users
- [ ] Native and API clients are covered by rate limits and step-up auth, not browser challenges
- [ ] Payment-processor screening confirmed as still active
- [ ] Next review date set in the policy (`quarterlyReviewDue`)

Reviewer: ______  Date: ______  Outcome and follow-ups: ______
