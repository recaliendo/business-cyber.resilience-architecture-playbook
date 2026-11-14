// Static checks over a repository snapshot. Each finding cites file + line in the reviewed commit.
// Repository content is untrusted data: it is pattern-matched, never interpreted as instructions,
// and never copied into findings or prompts beyond sanitised identifiers (table names, workflow names).
import type { Finding, FindingInput, Stage } from '../domain/schemas.js';
import { makeFinding } from '../domain/findings.js';
import { redact } from '../lib/redact.js';
import { isText, permalink, base, type RepoSnapshot, type RepoFile } from './snapshot.js';
import type { RepoInventory } from './inventory.js';

export const REVIEW_RULES_VERSION = '1.0.0';

type Loc = { path: string; line?: number };
type Spec = Omit<FindingInput, 'id' | 'ruleId' | 'priority' | 'ruleVersion' | 'domains' | 'affected' | 'evidence' | 'provenance' | 'applicableStage' | 'ownerRole' | 'reassessWhen'> & {
  domains?: FindingInput['domains']; ownerRole?: string; reassessWhen?: string;
};

const ident = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80);
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

export function runChecks(s: RepoSnapshot, inv: RepoInventory, stage: Stage = 'launch'): Finding[] {
  const out: Finding[] = [];
  const add = (ruleId: string, locs: Loc[], spec: Spec) => {
    const { domains, ownerRole, reassessWhen, ...rest } = spec;
    out.push(makeFinding({
      ...rest,
      key: locs.map((l) => `${l.path}:${l.line ?? ''}`).join('|') || ruleId,
      ruleId, ruleVersion: REVIEW_RULES_VERSION, domains: domains ?? ['repository', 'security'],
      affected: { assets: [], controls: [], files: [...new Set(locs.map((l) => l.path))] },
      evidence: locs.map((l) => ({ kind: 'source_file' as const, ref: `${l.path}${l.line ? `:${l.line}` : ''}`, line: l.line, url: permalink(s, l.path, l.line) })),
      provenance: 'observed', applicableStage: stage, ownerRole: ownerRole ?? 'Engineering lead',
      reassessWhen: reassessWhen ?? 'On every change to the affected files.',
      limitations: [...(rest.limitations ?? []), `Source inspection at commit ${s.commit ?? 'unknown (not a git checkout)'}; deployed state not verified.`],
    }));
  };
  const text = s.files.filter(isText);

  // 1. Secrets committed to source.
  for (const f of text) {
    if (/\.example$|\.sample$|\.md$/.test(f.path) || f.path.includes('/fixtures/')) continue;
    const lines = f.text.split('\n');
    lines.forEach((ln, i) => {
      if (ln.length > 2000) return;
      // A provider-format token is always reported. Generic `token: ...` style matches whose value is
      // a template interpolation (`${opts.token}`) are code referencing a variable, not a secret.
      const providerFormat = /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\b(?:AKIA|ASIA)[0-9A-Z]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY|\bsk-ant-|\bxox[abprs]-/.test(ln);
      const interpolatedOnly = !providerFormat && /\$\{[^}]+\}/.test(ln) && redact(ln.replace(/\$\{[^}]+\}/g, '')) === ln.replace(/\$\{[^}]+\}/g, '');
      if (redact(ln) !== ln && !interpolatedOnly && !/process\.env|import\.meta\.env|Deno\.env|\$\{\{\s*secrets\./.test(ln) && !/<[a-z-]+>|\.\.\.|your[-_]?key|example/i.test(ln)) {
        add('REPO-SECRET', [{ path: f.path, line: i + 1 }], {
          title: `Possible secret committed in ${f.path}`, category: 'secrets', severity: 'critical', launchBlocker: true, confidence: 'medium', status: 'suspected', evidenceLevel: 'source_code',
          observed: 'A line matches a credential pattern. The value is redacted from this report.', expected: 'Secrets are loaded from the environment or a secrets manager; none are in source.',
          scenario: 'Anyone with read access to the repository or a fork or clone can use the credential.', businessImpact: 'Account takeover, data theft or fraudulent charges, depending on the credential.',
          insights: ['If the value is real, removing it from the current code is not enough: it remains in git history and must be revoked and rotated.'],
          remediation: { summary: 'Revoke and rotate the credential first, then move it to environment configuration and add a secret scanner with push protection.', steps: ['Rotate at the issuing vendor.', 'Replace the literal with an environment variable.', 'Purge from history only after rotation (history rewriting does not un-leak).'] },
          effortHours: { low: 1, high: 4 }, validation: 'gitleaks (--redact) over full history finds nothing; the old credential is revoked.', acceptanceCriteria: ['Credential revoked at the vendor.', 'Secret scan passes on the default branch.'],
          vendorOptions: [{
            name: 'GitHub secret scanning with push protection',
            addresses: 'Prevents the next provider-format secret from being pushed',
            whyNotNative: 'It is the native option on GitHub; it does not rotate the credential already exposed.',
            retainedResponsibilities: 'Rotating this credential, reviewing alerts, and covering generic or custom secret formats.',
            stageFit: 'Day one: enable before the first public push.',
            pricingNote: 'Free for public repositories; private-repository availability depends on plan (check current GitHub documentation).',
            limitations: 'Provider patterns only unless custom patterns are configured.',
            lowerCostAlternative: 'gitleaks in CI and as a pre-commit hook, with --redact.',
          }],
        });
      }
    });
  }

  // 2. Environment files committed.
  for (const f of s.files) {
    const b = base(f.path);
    if (/^\.env(\..+)?$/.test(b) && !/\.(example|sample|template)$/.test(b)) {
      add('REPO-ENV-FILE', [{ path: f.path }], {
        title: `Environment file committed: ${f.path}`, category: 'secrets', severity: 'high', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code',
        observed: 'A non-example .env file is tracked in the repository.', expected: 'Only .env.example with placeholders is committed.',
        scenario: 'The next real secret added to this file is published with the repository.', businessImpact: 'Credential exposure.',
        remediation: { summary: 'Remove the file from git, add .env* (except .env.example) to .gitignore, and rotate any real values it held.' },
        effortHours: { low: 0.5, high: 2 }, validation: 'git ls-files shows no .env files other than examples.', acceptanceCriteria: ['File untracked and ignored.'],
      });
    }
  }
  const gi = text.find((f) => f.path === '.gitignore');
  if (inv.manifests.length && (!gi || !/^\s*\.env/m.test(gi.text))) {
    add('REPO-GITIGNORE-ENV', [{ path: '.gitignore' }], {
      title: '.gitignore does not exclude .env files', category: 'secrets', severity: 'medium', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code',
      observed: gi ? '.gitignore has no .env pattern.' : 'No root .gitignore.', expected: '.env and .env.* ignored (except .env.example).',
      scenario: 'A developer creates .env locally and commits it with a bulk add.', businessImpact: 'Credential exposure.',
      remediation: { summary: 'Add `.env`, `.env.*` and `!.env.example` to .gitignore before any secrets exist.' }, effortHours: { low: 0.25, high: 0.5 },
      validation: '`git check-ignore .env` succeeds.', acceptanceCriteria: ['.env is ignored.'],
    });
  }

  // 3. GitHub Actions.
  const workflows = text.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f.path));
  for (const w of workflows) {
    const t = w.text;
    if (!/^permissions\s*:/m.test(t)) {
      add('REPO-GHA-PERMISSIONS', [{ path: w.path }], {
        title: `Workflow has no top-level permissions: ${w.path}`, category: 'ci_cd', severity: 'medium', confidence: 'high', status: 'confirmed', evidenceLevel: 'declared_config', domains: ['repository', 'security'],
        observed: 'No `permissions:` block at workflow level.', expected: 'Least-privilege token, e.g. `permissions: contents: read`, widened per job only where needed.',
        scenario: 'A compromised action or dependency uses a write-scoped GITHUB_TOKEN to push code or alter releases.', businessImpact: 'Supply-chain compromise of the product.',
        insights: ['The effective default depends on repository and organisation settings, which a source review cannot see.'],
        remediation: { summary: 'Add `permissions: contents: read` at the top of the workflow and grant extra scopes per job.', illustrativeCode: 'permissions:\n  contents: read' },
        effortHours: { low: 0.25, high: 1 }, validation: 'Workflow runs successfully with the reduced token.', acceptanceCriteria: ['Top-level permissions block present.'],
      });
    }
    const prt = /^\s*pull_request_target\s*:/m.test(t) || /on:\s*\[?[^\n]*pull_request_target/.test(t);
    if (prt && /github\.event\.pull_request\.head\.(sha|ref)|refs\/pull\//.test(t)) {
      const idx = t.search(/github\.event\.pull_request\.head\.(sha|ref)|refs\/pull\//);
      add('REPO-GHA-PRT-CHECKOUT', [{ path: w.path, line: lineOf(t, idx) }], {
        title: `pull_request_target checks out untrusted PR code: ${w.path}`, category: 'ci_cd', severity: 'critical', launchBlocker: true, confidence: 'high', status: 'confirmed', evidenceLevel: 'declared_config',
        observed: 'The workflow runs on pull_request_target and checks out the pull request head.', expected: 'Untrusted PR code runs only under `pull_request` with no secrets and a read-only token.',
        scenario: 'A fork PR runs attacker code with repository secrets and a write token.', businessImpact: 'Secrets theft and repository takeover.',
        remediation: { summary: 'Switch to `pull_request`, or split into an unprivileged build and a privileged follow-up that never executes PR code.' },
        effortHours: { low: 1, high: 4 }, validation: 'No privileged workflow executes PR-controlled code.', acceptanceCriteria: ['Workflow redesigned and reviewed.'],
      });
    }
    for (const m of t.matchAll(/\$\{\{\s*github\.event\.(issue|pull_request|comment|review|head_commit|discussion)\.[a-z_.]*(title|body|message|ref|label|name)[^}]*\}\}/g)) {
      const line = lineOf(t, m.index ?? 0);
      const runBlock = t.slice(0, m.index).split('\n').reverse().find((l) => /^\s*(-\s*)?(run|script)\s*:|^\s*(-\s*)?(uses|with)\s*:/.test(l));
      if (!runBlock || !/run\s*:|script\s*:/.test(runBlock)) continue;
      add('REPO-GHA-INJECTION', [{ path: w.path, line }], {
        title: `Untrusted event data interpolated into a shell step: ${w.path}`, category: 'ci_cd', severity: 'high', confidence: 'medium', status: 'suspected', evidenceLevel: 'declared_config',
        observed: 'A `${{ github.event.* }}` expression with attacker-controllable text is expanded inside a `run:` script.', expected: 'Untrusted values passed through `env:` and quoted, never interpolated into the script.',
        scenario: 'A PR title or comment containing shell syntax executes commands in CI.', businessImpact: 'CI compromise; secret exposure.',
        remediation: { summary: 'Move the value into an environment variable and reference it as "$VAR".', illustrativeCode: 'env:\n  TITLE: ${{ github.event.pull_request.title }}\nrun: echo "$TITLE"' },
        effortHours: { low: 0.5, high: 1 }, validation: 'No event text interpolated directly into run steps.', acceptanceCriteria: ['Pattern removed.'],
      });
    }
    const unpinned = [...t.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+)@([^\s#]+)/g)].filter((m) => !/^[a-f0-9]{40}$/.test(m[2]!) && !m[1]!.startsWith('./'));
    if (unpinned.length) {
      add('REPO-GHA-UNPINNED', unpinned.slice(0, 5).map((m) => ({ path: w.path, line: lineOf(t, m.index ?? 0) })), {
        title: `Actions referenced by tag rather than commit SHA: ${w.path}`, category: 'supply_chain', severity: 'low', confidence: 'high', status: 'confirmed', evidenceLevel: 'declared_config',
        observed: `${unpinned.length} action reference(s) use a mutable tag (e.g. ${ident(unpinned[0]![1]!)}@${ident(unpinned[0]![2]!)}).`, expected: 'Third-party actions pinned to full commit SHAs, kept current by Dependabot.',
        scenario: 'A compromised or retagged action release runs in CI.', businessImpact: 'Supply-chain compromise.',
        insights: ['Tags are acceptable for first-party actions in many risk models; pinning matters most for third-party actions with access to secrets.'],
        remediation: { summary: 'Pin to the full SHA with the tag in a comment, and enable Dependabot for github-actions.' }, effortHours: { low: 0.5, high: 1 },
        validation: 'All third-party `uses:` reference 40-character SHAs.', acceptanceCriteria: ['Actions pinned.'],
      });
    }
  }
  if (!workflows.length && inv.manifests.length) {
    add('REPO-NO-CI', [], {
      title: 'No CI workflow found', category: 'change_management', severity: 'medium', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code', domains: ['repository', 'security'],
      observed: 'No files under .github/workflows (or other recognised CI config).', expected: 'Build, tests and secret scanning run on every change.',
      scenario: 'A broken build, failing test or committed secret reaches the default branch unnoticed.', businessImpact: 'Outages and leaks that automation would have caught.',
      remediation: { summary: 'Add CI from templates/config/github-workflows-ci.yml and make it a required check.' }, effortHours: { low: 1, high: 4 },
      validation: 'Required status check blocks merge on failure.', acceptanceCriteria: ['Workflow present and required.'],
    });
  }
  if (inv.manifests.some((m) => m.endsWith('package.json')) && !s.files.some((f) => f.path === '.github/dependabot.yml' || f.path === '.github/dependabot.yaml' || f.path === 'renovate.json')) {
    add('REPO-NO-DEP-UPDATES', [], {
      title: 'No automated dependency updates configured', category: 'vulnerability_management', severity: 'low', confidence: 'medium', status: 'requires_verification', evidenceLevel: 'source_code',
      observed: 'No Dependabot or Renovate configuration file.', expected: 'Automated dependency alerts and update PRs.',
      scenario: 'A vulnerable dependency stays in production long after a fix is published.', businessImpact: 'Preventable compromise.',
      limitations: ['Dependabot alerts can be enabled in repository settings without a file; that is not visible from source.'],
      remediation: { summary: 'Add .github/dependabot.yml (templates/config/dependabot.yml).' }, effortHours: { low: 0.25, high: 1 },
      validation: 'Dependabot PRs appear for outdated packages.', acceptanceCriteria: ['Config present.'],
    });
  }
  for (const m of inv.manifests.filter((p) => base(p) === 'package.json')) {
    const dir = m.includes('/') ? m.slice(0, m.lastIndexOf('/') + 1) : '';
    if (!inv.lockfiles.some((l) => l.startsWith(dir) && !l.slice(dir.length).includes('/'))) {
      add('REPO-NO-LOCKFILE', [{ path: m }], {
        title: `No lockfile next to ${m}`, category: 'supply_chain', severity: 'low', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code',
        observed: 'package.json without package-lock.json, yarn.lock or pnpm-lock.yaml.', expected: 'A committed lockfile for reproducible installs.',
        scenario: 'A new, possibly malicious, transitive version installs in CI or production.', businessImpact: 'Unreproducible builds and supply-chain exposure.',
        remediation: { summary: 'Commit the lockfile and install with `npm ci` in CI.' }, effortHours: { low: 0.25, high: 0.5 }, validation: 'CI uses a frozen-lockfile install.', acceptanceCriteria: ['Lockfile committed.'],
      });
    }
  }

  // 4. Postgres / Supabase row-level security.
  const sql = text.filter((f) => f.path.endsWith('.sql'));
  const allSql = sql.map((f) => f.text).join('\n').toLowerCase();
  for (const f of sql) {
    for (const m of f.text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"?public"?\.)?"?([A-Za-z0-9_]+)"?)/gi)) {
      const table = m[2]!.toLowerCase();
      const schemaQualified = /public/i.test(m[1]!) || !m[1]!.includes('.');
      if (!schemaQualified) continue;
      const rls = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:"?public"?\\.)?"?${table}"?\\s+enable\\s+row\\s+level\\s+security`).test(allSql);
      if (!rls) {
        add('REPO-RLS-MISSING', [{ path: f.path, line: lineOf(f.text, m.index ?? 0) }], {
          title: `Table ${ident(table)} has no row-level security`, category: 'tenant_isolation', severity: 'critical', launchBlocker: true, confidence: 'medium', status: 'suspected', evidenceLevel: 'source_code',
          observed: `\`create table ${ident(table)}\` with no matching \`enable row level security\` in any migration in this snapshot.`, expected: 'RLS enabled in the same migration, with one policy per operation.',
          scenario: 'With Supabase, any client holding the public anon key can read or write every row of an exposed table without RLS.', businessImpact: 'Exposure or tampering of all rows in the table.',
          limitations: ['RLS may have been enabled outside these migrations (dashboard or another repository). Verify against the deployed database.', 'Tables not exposed through the API (other schemas, revoked grants) are lower risk.'],
          remediation: { summary: 'Enable RLS on the table and add explicit per-operation policies; verify with two test users.', illustrativeCode: `alter table public.${ident(table)} enable row level security;` },
          effortHours: { low: 1, high: 6 }, validation: 'Query `pg_tables.rowsecurity` in each environment; tenant-isolation test passes.', acceptanceCriteria: ['RLS enabled in a migration.', 'Isolation test with two users.'],
        });
      }
    }
    for (const m of f.text.matchAll(/create\s+policy[\s\S]*?for\s+update[\s\S]*?;/gi)) {
      if (!/with\s+check/i.test(m[0])) {
        add('REPO-RLS-UPDATE-NO-CHECK', [{ path: f.path, line: lineOf(f.text, m.index ?? 0) }], {
          title: 'UPDATE policy without WITH CHECK', category: 'tenant_isolation', severity: 'high', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code',
          observed: 'An UPDATE policy has USING but no WITH CHECK clause.', expected: 'WITH CHECK constrains the new row so ownership or tenant columns cannot be changed.',
          scenario: 'A user updates a row they own and sets its owner or tenant column to another user or tenant.', businessImpact: 'Cross-tenant data manipulation or takeover.',
          remediation: { summary: 'Add WITH CHECK mirroring USING; restrict updatable columns with column grants where tenant columns exist.' },
          effortHours: { low: 0.5, high: 2 }, validation: 'Test that changing the owner or tenant column is refused.', acceptanceCriteria: ['Policy has WITH CHECK.', 'Negative test added.'],
        });
      }
    }
    for (const m of f.text.matchAll(/create\s+(or\s+replace\s+)?function[\s\S]*?\$\$/gi)) {
      if (/security\s+definer/i.test(m[0]) && !/set\s+search_path/i.test(m[0])) {
        add('REPO-SECDEF-SEARCH-PATH', [{ path: f.path, line: lineOf(f.text, m.index ?? 0) }], {
          title: 'SECURITY DEFINER function without a fixed search_path', category: 'database', severity: 'medium', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code',
          observed: 'A SECURITY DEFINER function does not set search_path.', expected: '`set search_path = ...` on every SECURITY DEFINER function, plus narrow grants.',
          scenario: 'A caller who can create objects in a searched schema shadows a function or table and runs code with the owner’s privileges.', businessImpact: 'Privilege escalation inside the database.',
          remediation: { summary: 'Add `set search_path = public` (or an empty search_path with schema-qualified names) and revoke execute from public.' },
          effortHours: { low: 0.25, high: 1 }, validation: 'All SECURITY DEFINER functions show a search_path setting.', acceptanceCriteria: ['search_path set.'],
        });
      }
    }
  }

  // 5. Stripe webhooks.
  const code = text.filter((f) => /\.(t|j)sx?$|\.mjs$/.test(f.path));
  for (const f of code) {
    const handlesEvents = /checkout\.session\.completed|invoice\.(paid|payment_succeeded)|customer\.subscription\./.test(f.text) && /event\.type|\.type\s*===|switch\s*\(/.test(f.text);
    if (handlesEvents && !/constructEvent(Async)?\s*\(/.test(f.text) && /req|request|event\.body|body/.test(f.text)) {
      add('REPO-STRIPE-UNVERIFIED', [{ path: f.path, line: lineOf(f.text, f.text.search(/checkout\.session\.completed|invoice\.|customer\.subscription\./)) }], {
        title: `Stripe webhook handling without signature verification: ${f.path}`, category: 'payments', severity: 'critical', launchBlocker: true, confidence: 'medium', status: 'suspected', evidenceLevel: 'source_code',
        observed: 'The file handles Stripe event types but does not call `stripe.webhooks.constructEvent`.', expected: 'Every webhook verified against the raw body and signing secret before use.',
        scenario: 'Anyone can POST a forged `checkout.session.completed` event and obtain paid entitlements.', businessImpact: 'Revenue loss and fraudulent access.',
        limitations: ['Verification might happen in shared middleware not matched by this pattern. Confirm by reading the request path.'],
        remediation: { summary: 'Verify the signature with the raw body and STRIPE_WEBHOOK_SECRET; reject failures with a generic 400; record processed event IDs for idempotency.', files: [f.path] },
        effortHours: { low: 1, high: 4 }, validation: 'A request with an invalid signature returns 400 and has no side effects.', acceptanceCriteria: ['Signature test added.', 'Replay test shows one effect per event ID.'],
      });
    }
    if (/new\s+Stripe\s*\(\s*process\.env\.[A-Z_]+!?\s*\)/.test(f.text)) {
      add('REPO-STRIPE-API-VERSION', [{ path: f.path, line: lineOf(f.text, f.text.search(/new\s+Stripe\s*\(/)) }], {
        title: `Stripe client without a pinned apiVersion: ${f.path}`, category: 'payments', severity: 'low', confidence: 'high', status: 'confirmed', evidenceLevel: 'source_code',
        observed: 'The Stripe client is constructed without an explicit apiVersion.', expected: 'apiVersion pinned and upgraded deliberately with tests.',
        scenario: 'An SDK upgrade changes the API version and object shapes (for example where the subscription ID lives on an invoice), silently breaking webhook handling.', businessImpact: 'Missed or wrong entitlements after an upgrade.',
        remediation: { summary: 'Pass `{ apiVersion: \'<version you tested>\' }` and add a test fixture per handled event type.' }, effortHours: { low: 0.5, high: 2 },
        validation: 'Handlers tested against fixtures for the pinned version.', acceptanceCriteria: ['apiVersion pinned.'],
      });
    }
  }

  // 6. Service-role key reachable from client code.
  for (const f of code) {
    const clientSide = /(^|\/)(components|public|src\/app|app|pages|src\/pages|src\/components|assets)\//.test(f.path) && !/(^|\/)(api|server|functions)\//.test(f.path) || /^['"]use client['"]/m.test(f.text);
    if (clientSide && /SUPABASE_SERVICE_ROLE|service_role|serviceRoleKey/.test(f.text)) {
      add('REPO-SERVICE-ROLE-CLIENT', [{ path: f.path, line: lineOf(f.text, f.text.search(/SUPABASE_SERVICE_ROLE|service_role|serviceRoleKey/)) }], {
        title: `Service-role key referenced in client-side code: ${f.path}`, category: 'secrets', severity: 'critical', launchBlocker: true, confidence: 'medium', status: 'suspected', evidenceLevel: 'source_code',
        observed: 'A file in a client-side path references the Supabase service-role key.', expected: 'The service-role key is used only in server-side functions.',
        scenario: 'The key ships in the browser bundle and bypasses all row-level security.', businessImpact: 'Full read and write access to the database for anyone.',
        limitations: ['Path-based heuristic: confirm whether this file is bundled for the browser.'],
        remediation: { summary: 'Move the code to a server function; rotate the key if it was ever shipped.' }, effortHours: { low: 1, high: 4 },
        validation: 'Build output contains no service-role key; key rotated if exposure is possible.', acceptanceCriteria: ['No client-side reference.'],
      });
    }
  }

  // 7. iOS privacy manifest.
  if (inv.ios.xcodeProjects.length && !inv.ios.privacyManifests.length) {
    add('REPO-IOS-PRIVACY-MANIFEST', inv.ios.xcodeProjects.map((p) => ({ path: p })), {
      title: 'iOS project without a privacy manifest', category: 'platform_compliance', severity: 'medium', confidence: 'medium', status: 'requires_verification', evidenceLevel: 'source_code', domains: ['repository', 'compliance'],
      observed: 'An Xcode project exists but no PrivacyInfo.xcprivacy file was found.', expected: 'A privacy manifest declaring collected data and approved reasons for required-reason APIs.',
      scenario: 'App Store submission is rejected or flagged for missing declarations.', businessImpact: 'Release delays.',
      references: [{ title: 'Apple: Privacy manifest files', url: 'https://developer.apple.com/documentation/bundleresources/privacy-manifest-files', sourceId: 'SRC-APPLE-PRIVACY-MANIFEST' }],
      remediation: { summary: 'Add PrivacyInfo.xcprivacy to the app target and reconcile it with the privacy labels and SDK list.' }, effortHours: { low: 1, high: 4 },
      validation: 'Xcode privacy report generated from an archive matches the labels.', acceptanceCriteria: ['Manifest in the app target.'],
    });
  }
  return out;
}

export type { RepoFile };
