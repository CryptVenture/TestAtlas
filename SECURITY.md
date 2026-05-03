# Security Policy

## Supported Versions

| Version | Status                |
| ------- | --------------------- |
| 1.x     | Pre-release / not yet GA |

## Reporting a Vulnerability

Please report security issues privately by emailing `security@testatlas.dev` (placeholder pending org). Do NOT open a public GitHub Issue for security-sensitive reports. We aim to acknowledge within 72 hours and patch high-severity issues within 30 days.

## Threat Model

See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) for documented attack surfaces and mitigations, including the `curl|sh` installer, auto-update propagation, and prompt injection via `.claude/commands/`.

## Disclosure Policy

We follow coordinated disclosure: reporter and maintainers agree on a disclosure date; CVE assigned where appropriate.

## Signing & Verification

Releases ship as signed tarballs with SHA-256 checksums published in GitHub Releases. The `install.sh` installer pins to a tagged release and verifies checksums.
