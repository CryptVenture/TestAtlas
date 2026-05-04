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

VERSION="0.1.0"
TARBALL_SHA256="REPLACE_AT_RELEASE"
TARBALL_URL="https://registry.npmjs.org/testatlas/-/testatlas-${VERSION}.tgz"
GITHUB_RELEASE_URL="https://github.com/<org>/testatlas/releases/download/v${VERSION}/testatlas-${VERSION}.tgz"

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

_main() {
    _log "Installing TestAtlas v${VERSION}"
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

    _log "Extracting and running install"
    (cd "$TMP" && tar -xzf testatlas.tgz)
    # npm tarball top-level dir is `package/`.
    node "${TMP}/package/install.js" "${TARGET:-$PWD}"

    _log "Done. Run your agent's bootstrap (e.g. /atlas:bootstrap) to start."
}

# CRITICAL: this MUST be the LAST line of the file. Partial-pipe protection:
# if `curl | sh` is interrupted before this point, sh reaches EOF without ever
# calling _main — nothing runs.
_main "$@"
