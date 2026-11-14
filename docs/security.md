# Security

## Trust boundaries (memorize these)

1. **Browser holds only public keys**: Supabase anon key, Stripe publishable key, Plausible domain, Sentry DSN. Nothing else.
2. **Netlify Functions hold the secrets**: Supabase service role key, Stripe secret key, Stripe webhook secret, Resend API key. These never appear in client-bundled code — check your build output if unsure, don't assume.
3. **RLS is the real access-control layer**, not application code. Application code is a convenience filter on top; RLS is what actually stops a malicious or buggy client from reading another tenant's data.
4. **Webhooks are untrusted until signature-verified.** Every inbound webhook (Stripe, and any future vendor) gets signature verification before its payload is trusted for anything.

## Checklist — do this on every new project

- [ ] RLS enabled on every table in the same migration that creates it (never a follow-up "enable RLS later" migration)
- [ ] Service role key only referenced in server-side code paths (Netlify Functions), never in a file that could end up in a client bundle
- [ ] `.gitignore` covers `.env*` (except `.env.example`), `*.db`, `*.sqlite`, `/logs/` — in place before the first commit
- [ ] CI secret-scan job active on every PR (see [templates/config/github-workflows-ci.yml](../templates/config/github-workflows-ci.yml))
- [ ] Stripe webhook handler verifies `stripe-signature` and rejects invalid signatures with a generic error (no detail leakage)
- [ ] No real vendor account IDs, project refs, or customer data in documentation or example config — genericize before committing
- [ ] Dependabot enabled (`templates/config/dependabot.yml`) with a real review cadence, not just auto-created PRs nobody looks at
- [ ] Auth session cookies are httpOnly; refresh logic lives in server-aware middleware, not client-side localStorage token juggling
- [ ] Rate limiting on any endpoint that triggers a paid vendor call (Stripe, email send) — a retry storm or scraper shouldn't be able to run up your bill
- [ ] Admin/service-role actions require an explicit authorization check even inside a "trusted" Netlify Function — don't assume every function caller is authorized just because they reached the function

## Recurring mistakes found in prior projects (don't repeat these)

- **Committing a runtime database/log file to a public repo.** A personal automation tool committed its SQLite tracker and log file in a bulk upload — real personal data, publicly readable. If a repo produces runtime data files, gitignore them from the first commit, before there's anything in them to leak.
- **No `.env` entry in `.gitignore` at all.** Even when the actual committed values were low-sensitivity, the pattern would silently leak the next secret added to that file.
- **Zero CI on 11 of 12 repos reviewed**, meaning nothing would have caught either issue above automatically. The one repo with a secret-scanning CI job is also the only one of the two incidents it would have caught that never happened there.
- **Shared Supabase project / Stripe mode across production and preview deploys** — see [environments.md](environments.md). Not a secrets leak, but the same category of problem: no boundary between "real" and "throwaway."
- **Real account IDs/project refs in plaintext docs.** Low severity (not credentials), but genericize example config before it's ever shared or made public.

## Incident response (minimal, for a small team)

1. **Identify** — what's affected, is it still active, what's the blast radius (which environment, which users).
2. **Contain** — rotate any exposed credential immediately (see [secrets-management.md](secrets-management.md#rotation)); if a repo leaked data publicly, make it private immediately, then decide on deletion/history-rewrite separately.
3. **Communicate** — if user data was exposed, you likely have a legal notification obligation; don't guess, check applicable law (GDPR/state breach notification statutes) or ask counsel before deciding "it's fine."
4. **Fix root cause** — not just the symptom (rotate the key *and* fix the `.gitignore`/CI gap that let it happen).
5. **Write it down** — even a five-line incident note with date, cause, fix, and rotation record. Future-you needs this more than you think.

## Compliance: obligations vs. attestations

Keep three things separate. They have different triggers and different deadlines.

| Kind | Examples | When it applies |
|---|---|---|
| **Legal and regulatory obligations** | GDPR/UK GDPR, US state privacy laws, COPPA, HIPAA, FERPA, GLBA, accessibility laws, the EU AI Act, sanctions | **As soon as the legal trigger is met, possibly from launch.** They do not wait for customer demand. |
| **Platform and contractual requirements** | App Store privacy labels, privacy manifests and account deletion; PCI DSS through your payment processor | When you ship on the platform or accept cards. PCI DSS applies whenever you take card payments; hosted checkout reduces the scope but does not remove it. |
| **Voluntary attestations** | SOC 2, ISO/IEC 27001 | When buyers, contracts or blocked revenue call for them. Not generally a legal launch requirement. |

Sector laws depend on legal **roles**, not data labels. Handling health data does not by itself make HIPAA apply: it depends on being a covered entity or business associate. Likewise, FERPA depends on receiving records from a covered institution, and GLBA on being a financial institution. Where a sector law does apply, it can override the ordinary startup roadmap.

Run `npm run bcr -- compliance --intake <file>` for a screening of what may apply, with reasoning and questions for counsel. Record the decisions in the [compliance applicability register](../templates/consultant/compliance-applicability-register.md). The screening is not legal advice.

Lightweight written policies cost little and help both with obligations and with the first enterprise questionnaire. Adapt them to what you actually do: [templates/consultant/policies](../templates/consultant/policies/README.md). For the SOC 2 / ISO path once buyers ask, see the [readiness roadmap](../templates/consultant/soc2-iso-readiness-roadmap.md).
