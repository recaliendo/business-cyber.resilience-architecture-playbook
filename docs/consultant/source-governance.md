# Source governance

Every obligation, platform rule and provider capability cites a source in `knowledge/sources/registry.yaml`.

## Current state: nothing is verified yet

All 39 sources were recorded from prior knowledge and **none has been verified by a person**. Their `verifiedAt` fields are `null`, so every report marks the dependent conclusions as resting on unverified sources (low confidence). This is deliberate: the tool never invents a verification date.

Run `npm run bcr -- sources status` for the backlog.

## Verifying a source

1. Open the URL and read the current official text.
2. Check that the rules citing the source (`grep -n SRC-ID knowledge/`) still match it: thresholds, dates, exceptions.
3. If a rule needs to change, edit it in the same pull request and bump the catalog `version`.
4. Fill in `retrievedAt`, `verifiedAt` (the moment you checked), `verifiedBy` (your name), and `contentHash` (from `sources refresh --allow-network`, optional). Set `effectiveDate` if the source states one.
5. Open a pull request. A reviewer checks the change against the source.

## Refreshing

`bcr sources refresh --allow-network` fetches each URL (https only, public addresses only, no redirects followed, 5 MB cap, 15 s timeout) and compares a content hash. A change means "a person should re-read this source". The command never updates rules, policies or verification fields.

Sanctions sources have a 1-day review cadence. They are handled through the sanctions snapshot workflow in [geo-policy.md](geo-policy.md), not through automatic rule rewriting.

## Staleness

A verified source becomes **stale** once `verifiedAt + reviewCadenceDays` has passed. Stale and unverified sources are reported in every assessment.

## Reproducibility

Reports record the catalog, applicability, scoring and capacity rule versions and a hash of the inputs. To reproduce an old report, check out the commit that matches those versions and run the same command with the same inputs.
