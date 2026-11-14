# End-to-end repository review

`bcr review` inspects one repository checkout and produces a report bundle with findings, an architecture inventory, and one remediation prompt per actionable finding.

## Four kinds of evidence, never mixed

| Evidence level | Meaning | Example |
|---|---|---|
| Source code | What the code demonstrably implements | A webhook handler with no signature check |
| Declared configuration | What config files say | A workflow with no `permissions:` block |
| Deployed evidence | What running systems confirm | Branch protection export, database RLS query; **never** from a repository alone |
| Unknown | Not visible from what was read | Dashboard-only settings, other repositories, submodules |

A repository review cannot prove deployed security settings, actual capacity, operating effectiveness or legal compliance. Every repository finding records the reviewed commit and states that deployed state was not verified.

## Safety

- **Read-only.** No scripts, hooks, package installs, builds or tests from the reviewed repository are run. The only subprocess is `git` (metadata) with hooks disabled.
- **Untrusted content.** Repository files are pattern-matched as data. Their text is never copied into findings or prompts (only sanitized identifiers such as table names) and never treated as instructions. A test includes an injection probe in a README.
- **Bounded.** Files over 1 MB, binaries, generated files (lockfiles, minified bundles), symlinks and submodules are skipped and listed as limitations. The walk stops at 20,000 files.
- **Secrets.** Matches are reported by location only; values are redacted from every output.
- **Exclusions.** A `.bcrignore` file at the repository root (one path prefix per line, `#` comments) excludes deliberate fixtures, such as fake secrets in tests. Every excluded path is listed in the report's limitations, so nothing is hidden silently. This repository uses one for its synthetic vulnerable app and its redaction tests.
- **GitHub adapter.** Accepts only `https://github.com/<owner>/<repo>`, does a shallow clone with hooks and submodules disabled, passes `GITHUB_TOKEN` through git's environment configuration (never on the command line), and deletes the clone afterwards.

## Checks in version 1.0.0

| Rule | What it detects |
|---|---|
| REPO-SECRET | Credential-like strings in source (redacted) |
| REPO-ENV-FILE | Committed `.env` files |
| REPO-GITIGNORE-ENV | No `.env` pattern in `.gitignore` |
| REPO-GHA-PERMISSIONS | Workflows without a top-level `permissions:` block |
| REPO-GHA-PRT-CHECKOUT | `pull_request_target` checking out untrusted PR code |
| REPO-GHA-INJECTION | `${{ github.event.* }}` text interpolated into `run:` scripts |
| REPO-GHA-UNPINNED | Actions referenced by tag rather than commit SHA |
| REPO-NO-CI, REPO-NO-DEP-UPDATES, REPO-NO-LOCKFILE | Missing delivery and supply-chain basics |
| REPO-RLS-MISSING | Tables created without `enable row level security` |
| REPO-RLS-UPDATE-NO-CHECK | UPDATE policies without `WITH CHECK` |
| REPO-SECDEF-SEARCH-PATH | `SECURITY DEFINER` functions without a fixed `search_path` |
| REPO-STRIPE-UNVERIFIED | Stripe event handling without `constructEvent` |
| REPO-STRIPE-API-VERSION | Stripe client without a pinned `apiVersion` |
| REPO-SERVICE-ROLE-CLIENT | Supabase service-role key referenced from client-side paths |
| REPO-IOS-PRIVACY-MANIFEST | Xcode project without `PrivacyInfo.xcprivacy` |

These are focused heuristics, not a full static analyser. "Suspected" findings say so, together with what would confirm them.

## Finding structure

Each finding in `report.md` has four parts:

- **A. Finding:** ID, severity, priority, confidence, status, evidence level, affected files, observed versus expected behaviour, scenario, and business impact.
- **B. Insights:** evidence permalinks pinned to the reviewed commit, with line anchors; limitations; references.
- **C. Recommendation:** the smallest fix, alternatives, illustrative code labelled as untested, effort, owner, validation, and a link to the remediation prompt.
- **D. Third-party options:** included only when an external product materially helps, with fit, limits and the responsibilities you keep. Otherwise it states that a code or configuration change is sufficient.

## Prompts

`prompts/<finding-id>.md` holds a copy-ready Claude Code prompt containing:

- the finding ID and objective
- the repository and the reviewed commit
- the evidence paths
- the desired behaviour, constraints and tests
- an instruction to revalidate against the current checkout first

The HTML report adds **Copy prompt** buttons. Prompts are proposed work. They do not launch Claude Code and they authorise nothing.

`bcr review verify --bundle <dir> --repo <path>` exits with code 4 when the checkout has moved past the reviewed commit.

## Multiple repositories and monorepos

A monorepo is reviewed in one run; inventory and checks cover every package in it. For separate repositories (for example iOS, web, backend and infrastructure), run `bcr review` once per repository. Combine them with the business assessment by passing one repository through `bcr assess --repo`. Merging several repositories into one report is not implemented yet (see [capabilities.md](capabilities.md)).
