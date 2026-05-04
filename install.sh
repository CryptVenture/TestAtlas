#!/bin/sh
# install.sh — POSIX install for TestAtlas. Pin: VERSION below is rewritten at
# release time by .github/workflows/release.yml (sed step). TARBALL_SHA256 is
# likewise rewritten by the post-publish step. The literal "REPLACE_AT_RELEASE"
# sentinel triggers placeholder mode (no checksum verification, dev install).
#
# Plan 07-02 (INSTALL-02). POSIX `/bin/sh` only — NO bashisms.
# shellcheck shell=sh
#
# TODO(07-05): list of intentionally disabled shellcheck codes lives in
# .shellcheckrc; document the reasoning in CONTRIBUTING.md.

set -eu

VERSION="1.0.0"
TARBALL_SHA256="REPLACE_AT_RELEASE"
TARBALL_URL="https://registry.npmjs.org/@webventures/testatlas/-/testatlas-${VERSION}.tgz"
GITHUB_RELEASE_URL="https://github.com/CryptVenture/TestAtlas/releases/download/v${VERSION}/testatlas-${VERSION}.tgz"

_log() { printf '[testatlas] %s\n' "$*"; }
_err() { printf '[testatlas:error] %s\n' "$*" >&2; }

_require_node() {
    if ! command -v node >/dev/null 2>&1; then
        _err "Node.js not found. Install Node >=20.11 first:"
        _err "  macOS:   brew install node"
        _err "  Linux:   https://nodejs.org/  (or use nvm: https://github.com/nvm-sh/nvm)"
        _err "  Windows: winget install OpenJS.NodeJS"
        exit 1
    fi
    NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
    if [ "$NODE_MAJOR" -lt 20 ]; then
        _err "Node.js >=20.11 required (found $(node -v)). Upgrade and retry."
        exit 1
    fi
}

_download() {
    url="$1"
    dst="$2"
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL "$url" -o "$dst"
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$url" -O "$dst"
    else
        _err "Neither curl nor wget found. Install one and retry."
        exit 1
    fi
}

_verify_checksum() {
    file="$1"
    expected="$2"
    if [ "$expected" = "REPLACE_AT_RELEASE" ]; then
        _log "Checksum is placeholder (dev install). Skipping verification."
        return 0
    fi
    if [ "${TESTATLAS_SKIP_CHECKSUM:-0}" = "1" ]; then
        _log "TESTATLAS_SKIP_CHECKSUM=1 set; skipping checksum verification."
        return 0
    fi
    if command -v shasum >/dev/null 2>&1; then
        printf '%s  %s\n' "$expected" "$file" | shasum -a 256 -c -
    elif command -v sha256sum >/dev/null 2>&1; then
        printf '%s  %s\n' "$expected" "$file" | sha256sum -c -
    else
        _err "Neither shasum nor sha256sum found. Cannot verify checksum."
        _err "Re-run with TESTATLAS_SKIP_CHECKSUM=1 to bypass (NOT recommended)."
        exit 1
    fi
}

# Plan 07-04 (UPDATE-07). Opt-in cosign attestation verify. Gated on the
# TESTATLAS_VERIFY_SIGNATURE=1 env var (the npx CLI's --verify-signature flag
# bridges to this). Default install path skips entirely (checksum-only).
#
# Without cosign on PATH AND env=1: actionable error pointing to the install
# guide, exit 1. The full docs/SIGNING.md lives in Plan 07-05.
_verify_signature_if_enabled() {
    tarball="$1"
    if [ "${TESTATLAS_VERIFY_SIGNATURE:-0}" != "1" ]; then
        return 0
    fi
    if ! command -v cosign >/dev/null 2>&1; then
        _err "cosign not found on PATH but --verify-signature requested."
        _err "Install cosign: https://docs.sigstore.dev/cosign/installation/"
        exit 1
    fi
    bundle="${tarball}.sigstore.json"
    if [ ! -f "$bundle" ]; then
        _log "Downloading cosign bundle from ${TARBALL_URL}.sigstore.json"
        if ! _download "${TARBALL_URL}.sigstore.json" "$bundle"; then
            _err "Could not download cosign attestation bundle from ${TARBALL_URL}.sigstore.json"
            exit 1
        fi
    fi
    _log "Verifying cosign attestation"
    cosign verify-blob-attestation \
        --bundle "$bundle" \
        --new-bundle-format \
        --certificate-oidc-issuer="https://token.actions.githubusercontent.com" \
        --certificate-identity-regexp="^https://github.com/CryptVenture/TestAtlas/.github/workflows/release.yml.*" \
        "$tarball"
}

_main() {
    # Forward all extra args to `node install.js` verbatim; detect --global
    # so we can default the positional target to $HOME instead of $PWD.
    INSTALL_FLAGS="$*"
    GLOBAL_MODE=0
    case " $INSTALL_FLAGS " in *" --global "*) GLOBAL_MODE=1 ;; esac

    _log "Installing TestAtlas v${VERSION}${GLOBAL_MODE:+ (global mode)}"
    _require_node

    TMP=$(mktemp -d 2>/dev/null || mktemp -d -t testatlas)
    trap 'rm -rf "$TMP"' EXIT

    TARBALL="${TMP}/testatlas.tgz"

    if [ -n "${_TESTATLAS_TARBALL_OVERRIDE:-}" ]; then
        # Test hook: bypass network fetch and copy the local tarball.
        # Used by Plan 07-02's CI smoke + node:test integration tests; not a
        # public feature.
        _log "Using local tarball override: ${_TESTATLAS_TARBALL_OVERRIDE}"
        cp "${_TESTATLAS_TARBALL_OVERRIDE}" "$TARBALL"
    else
        _log "Downloading from ${TARBALL_URL}"
        if ! _download "$TARBALL_URL" "$TARBALL"; then
            _log "npm registry fetch failed; falling back to GitHub Releases."
            _download "$GITHUB_RELEASE_URL" "$TARBALL"
        fi
    fi

    _verify_checksum "$TARBALL" "$TARBALL_SHA256"

    _verify_signature_if_enabled "$TARBALL"

    _log "Extracting and running install"
    (cd "$TMP" && tar -xzf testatlas.tgz)
    # npm tarball top-level dir is `package/`.

    # Read VERSION from the extracted package.json so dev-smoke runs
    # report the actual tarball version instead of the install.sh
    # hardcoded constant. Release-time sed still rewrites VERSION above
    # so the network-fetch URLs stay correct, but the runtime log
    # tracks what we actually unpacked.
    if [ -f "${TMP}/package/package.json" ]; then
        UNPACKED_VERSION=$(node -p "require('${TMP}/package/package.json').version")
        if [ "$UNPACKED_VERSION" != "$VERSION" ]; then
            _log "Unpacked tarball is v${UNPACKED_VERSION} (install.sh pin: v${VERSION})"
        fi
    fi

    # The npm tarball ships SOURCE only; runtime deps (commander, ajv,
    # ajv-formats, semver) are NOT bundled. Resolve them inside the
    # extracted dir before invoking install.js. `--omit=dev --no-audit
    # --no-fund --silent` keeps the install lean (~3 packages) and
    # quiet. We require `npm` to be on PATH (it ships with Node).
    if ! command -v npm >/dev/null 2>&1; then
        _err "npm not found on PATH (expected — it ships with Node)."
        _err "Reinstall Node.js or fix PATH and retry."
        exit 1
    fi
    _log "Resolving runtime dependencies"
    (cd "${TMP}/package" && npm install --omit=dev --no-audit --no-fund --silent)

    # In global mode, `install.js` defaults to $HOME when no positional target
    # is supplied. Project-local mode keeps the historical `${TARGET:-$PWD}`
    # default so existing CI smokes don't regress.
    if [ "$GLOBAL_MODE" = "1" ]; then
        # shellcheck disable=SC2086
        node "${TMP}/package/install.js" $INSTALL_FLAGS
    else
        # shellcheck disable=SC2086
        node "${TMP}/package/install.js" "${TARGET:-$PWD}" $INSTALL_FLAGS
    fi

    if [ "$GLOBAL_MODE" = "1" ]; then
        _log "Done (global). Adapter command files are now in your user home."
    else
        _log "Done. Run your agent's bootstrap (e.g. /atlas:bootstrap) to start."
    fi
}

# CRITICAL: this MUST be the LAST line of the file. Partial-pipe protection:
# if `curl | sh` is interrupted before this point, sh reaches EOF without ever
# calling _main — nothing runs.
_main "$@"
