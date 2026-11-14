# Access register (and device inventory)

One row per person per critical system. No shared logins. Review quarterly (control IAM-04) and keep each dated review as evidence.

| System | Person | Role | Privileged? | Why they need it | MFA type | Recovery method | Granted | Last reviewed |
|---|---|---|---|---|---|---|---|---|
| GitHub (org) | | owner | yes | | passkey | recovery codes in password manager | | |
| Cloud / hosting | | | | | | | | |
| Database provider | | | | | | | | |
| Domain registrar and DNS | | | | | | | | |
| Email / identity provider | | | | | | | | |
| Apple Developer | | | | | | | | |
| Payments (Stripe) | | | | | | | | |
| Error tracking / logging | | | | | | | | |

**Solo founder:** you hold every role. Note where the vendor allows a separate non-admin account for daily work, and record that exception plainly instead of pretending there is segregation of duties.

## Offboarding checklist

- [ ] Remove from every system above (same day)
- [ ] Rotate any shared secret they could have seen
- [ ] Transfer ownership of repositories, domains and vendor accounts
- [ ] Record date and who performed it

## Device inventory (control END-01)

| Device | Owner | OS and version | Disk encryption | Auto-updates | Screen lock | Firewall | Malware protection | Checked |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
