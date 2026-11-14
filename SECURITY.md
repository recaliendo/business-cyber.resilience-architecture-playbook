# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately through GitHub: **Security → Report a vulnerability** on this repository
(private vulnerability reporting). Include what you found, where (file and line, or commit),
and how to reproduce it.

You can expect an acknowledgement within 5 business days.

## Scope

This repository is a playbook of documentation, reference templates and a worked example.
In scope:

- Reference code or configuration under `templates/` that would be insecure if copied as directed
- Example code under `examples/`
- Any secret, credential or personal data committed to the repository or its history

## If you find a committed secret

Report it as above. The owner will revoke and rotate the credential first, then remove it from
history. Removing it from git alone is not enough: assume anything pushed to a public repo is
already compromised.
