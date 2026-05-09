# Signing & Verification

TestAtlas releases are signed end-to-end. Default flows verify content with SHA-256 + npm provenance attestations (zero install required); a stronger opt-in cosign verification path is available for security-sensitive environments.

## Threat model summary

We protect against:

| Threat | Defense |
|--------|---------|
| Tampered tarball in transit | HTTPS + SHA-256 against checksum sidecar |
| Compromised npm package version | npm provenance (SLSA Build L3 attestation, OIDC-bound to GitHub Actions) |
| Compromised registry (registry-side substitution) | cosign sigstore bundle, certificate identity pinned to `release.yml` workflow |
| Partial-pipe attack (`curl … \| sh` interrupted mid-stream) | `_main "$@"` sentinel pattern in `install.sh` |

We do **not** protect against:

- A compromised user machine. If your dev box is compromised, no signature scheme helps.
- Targeted attacks on signing infrastructure. (Sigstore + GitHub OIDC is the strongest commodity defense available; a nation-state-level attacker compromising both is out of scope.)

## Default verification (zero-install)

Every published version of `@webventures/testatlas` ships with npm provenance:

```sh
npm install @webventures/testatlas
npm audit signatures
```

Output:

```
audited 1 package in 0.4s
1 package has a verified registry signature
```

`npm audit signatures` checks the npm registry signature AND the SLSA provenance attestation. Failure = stop, do not use, file an issue.

This is the **default supported verification path** — zero extra installs, ships with npm CLI ≥ 9.5.

## Strong verification (opt-in cosign)

For environments requiring offline-verifiable, key-pinnable, sigstore-native verification:

### 1. Install cosign

```sh
# macOS
brew install cosign

# Linux
curl -fsSL https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 \
  -o /usr/local/bin/cosign && chmod +x /usr/local/bin/cosign

# Windows: Scoop or download exe from sigstore/cosign Releases
```

Cosign is ~80 MB (Go binary). It is NOT a runtime dependency for TestAtlas — only required if you opt into `--verify-signature`.

### 2. Pass `--verify-signature` to install/update

```sh
npx @webventures/testatlas init --verify-signature
node update.js --verify-signature
```

The flag fetches `<tarball>.sigstore.json` from the GitHub Release sidecar (or from npm's attestations URL) and runs:

```sh
cosign verify-blob-attestation \
  --bundle testatlas-<VERSION>.tgz.sigstore.json \
  --certificate-identity-regexp 'https://github.com/CryptVenture/TestAtlas/\.github/workflows/release\.yml@refs/tags/v.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  testatlas-<VERSION>.tgz
```

If verification fails, install/update aborts. If cosign is absent, install.sh prints the install link from above and exits non-zero.

## Manual verification

You can verify a release entirely outside the install flow:

```sh
# 1. Download the published tarball (replace <VERSION> with the target release, e.g. 1.2.6)
curl -fsSL https://registry.npmjs.org/testatlas/-/testatlas-<VERSION>.tgz -o testatlas.tgz

# 2. Download the sigstore bundle (from GitHub Releases)
curl -fsSL https://github.com/CryptVenture/TestAtlas/releases/download/v<VERSION>/testatlas-<VERSION>.tgz.sigstore.json \
  -o testatlas.tgz.sigstore.json

# 3. Verify
cosign verify-blob-attestation \
  --bundle testatlas.tgz.sigstore.json \
  --certificate-identity-regexp 'https://github.com/CryptVenture/TestAtlas/\.github/workflows/release\.yml@refs/tags/v.*' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  testatlas.tgz
```

The `--certificate-identity-regexp` pin enforces that the build came from the canonical release workflow on a tagged release. Loose patterns defeat the purpose.

## Partial-pipe protection

`install.sh` is structured so that an interrupted `curl … | sh` cannot execute partial logic:

- All work is wrapped in functions; the LAST line is `_main "$@"`.
- If the curl pipe is severed before the final byte, `sh` reaches EOF without ever calling `_main`. Nothing executes.
- shellcheck `# shellcheck shell=sh` directive enforces no top-level statements.

To verify the pattern:

```sh
head -c 1000 install.sh | sh
# Expected output: an error like "main: command not found"; nothing else runs.
```

## What gets signed

Per release, the following sidecars are attached to the GitHub Release:

| File | Purpose |
|------|---------|
| `testatlas-<VERSION>.tgz` | The published npm tarball (identical to the one on the npm registry). |
| `testatlas-<VERSION>.tgz.sha256` | SHA-256 checksum of the tarball. Plain text; one line: `<hash>  testatlas-<VERSION>.tgz`. |
| `testatlas-<VERSION>.tgz.sigstore.json` | The cosign sigstore bundle (DSSE envelope with the SLSA provenance + Fulcio cert). |

npm publishes the same provenance via its attestations API (visible at `https://registry.npmjs.org/testatlas/-/testatlas-<VERSION>.tgz` metadata).

## Reporting a verification failure

If `npm audit signatures` or `cosign verify-blob-attestation` fails on a published release:

1. **Stop.** Do not install or use the version.
2. Capture the exact CLI output (including version numbers).
3. File a security issue per [SECURITY.md](../SECURITY.md) — DO NOT open a public issue (gives an active attacker advance notice).

## Frequently asked

### Do I need cosign for normal use?

No. `npm audit signatures` is sufficient for the vast majority of users. Cosign is an opt-in for heightened threat models.

### What if I'm offline?

The `--verify-signature` flag is online-only (sigstore bundle fetch + Fulcio cert chain). For offline verification, pre-fetch the bundle and use `cosign verify-blob-attestation` against a local file.

### Why not GPG?

GPG keys require manual rotation, key servers, and trust web maintenance. Sigstore + OIDC is keyless, automatic, and tied to immutable GitHub workflow identity. It is the 2026 industry standard.

### Where's the public key?

There isn't one. Sigstore uses ephemeral certificates issued by Fulcio, bound to the OIDC identity of the GitHub Actions runner. The `--certificate-identity-regexp` pin replaces public key trust.
