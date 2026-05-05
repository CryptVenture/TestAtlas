#!/bin/sh
# setup-dogfood-env.sh — pre-flight checker for `/atlas:test-flow --all`
# dogfood runs. POSIX `/bin/sh`, shellcheck-clean. Pairs with the CI step
# "Install dogfood-test prerequisites (cosign + shellcheck)" in
# .github/workflows/ci.yml: contributors run THIS script locally; CI runs
# the matching workflow step. Both paths converge on the same binary set.
#
# Quick 260506-07b. Tests live at test/scripts/setup-dogfood-env.test.js.
#
# Implementation note: this script uses `printf` (a shell builtin) for all
# output. We deliberately avoid `cat` heredocs because the test harness
# spawns this script with PATH sanitized to verify the missing-binary path,
# and `cat` is itself an external binary. A `cat`-based heredoc would
# produce confusing "cat: not found" errors instead of the actionable
# install hints we want.
#
# shellcheck shell=sh

set -eu

INSTALL_FLAG=0

_print_usage() {
    printf '%s\n' \
        'Usage: sh scripts/setup-dogfood-env.sh [--install] [--help]' \
        '' \
        'Probes that all binaries required by the TestAtlas dogfood test environment' \
        'are present. Run this BEFORE invoking /atlas:test-flow --all.' \
        '' \
        'Required binaries (with version floors where relevant):' \
        '  - cosign        (any v2+; needed for FLOW-install-curl-pipe-install' \
        '                   cosign attestation scenarios)' \
        '  - shellcheck    (any; gates install.sh + setup-dogfood-env.sh)' \
        '  - gh            (GitHub CLI; needed for FLOW-publishing release-asset' \
        '                   verification)' \
        '  - sha256sum     (coreutils on Linux; macOS ships shasum -a 256)' \
        '  - tar           (universal; needed for tarball install path)' \
        '  - git           (any modern version)' \
        '  - curl          (or wget; install.sh detects either)' \
        '  - jq            (used by several test fixtures)' \
        '  - node          (>=20.11)' \
        '' \
        'Options:' \
        '  --install   Attempt non-interactive Linux install (apt) of missing' \
        '              binaries. Refuses on Darwin/Windows — prints brew/winget' \
        '              hints instead.' \
        '  --help, -h  Show this help and exit 0.' \
        '' \
        'Exit codes:' \
        '  0  All required binaries present (or --install succeeded).' \
        '  1  At least one required binary missing.' \
        '  2  Usage error (e.g., bad flag).' \
        '' \
        'CI parity: the equivalent CI step lives in .github/workflows/ci.yml under' \
        '"Install dogfood-test prerequisites (cosign + shellcheck)". CI uses' \
        'sigstore/cosign-installer@v3 for cosign and apt-get install shellcheck' \
        'on Linux runners.'
}

# Short-circuit dispatch BEFORE any probing.
case "${1:-}" in
    -h|--help) _print_usage; exit 0 ;;
    --install) INSTALL_FLAG=1 ;;
    "") ;;
    *)
        printf '[setup-dogfood-env] error: unknown flag: %s\n' "$1" >&2
        _print_usage >&2
        exit 2
        ;;
esac

_log()  { printf '[setup-dogfood-env] %s\n' "$*"; }
_warn() { printf '[setup-dogfood-env:WARN] %s\n' "$*" >&2; }
_err()  { printf '[setup-dogfood-env:error] %s\n' "$*" >&2; }

# Detect platform up front — install hints vary.
UNAME=$(uname -s 2>/dev/null || echo "unknown")
case "$UNAME" in
    Linux*)  PLATFORM="linux" ;;
    Darwin*) PLATFORM="darwin" ;;
    MINGW*|CYGWIN*|MSYS*) PLATFORM="windows" ;;
    *) PLATFORM="unknown" ;;
esac

MISSING=0
MISSING_NAMES=""

# Per-binary hint emitter. Picks the right install command for the platform.
_hint() {
    bin="$1"
    case "$bin" in
        cosign)
            printf '%s\n' >&2 \
                '  cosign — sigstore signature verification.' \
                '    Linux  (apt):    sudo apt-get update && sudo apt-get install -y cosign' \
                '                     # If apt is too old, raw download:' \
                "                     #   curl -sSLo cosign 'https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64'" \
                '                     #   chmod +x cosign && sudo mv cosign /usr/local/bin/' \
                '    macOS  (brew):   brew install cosign' \
                '    Windows (winget): winget install sigstore.cosign' \
                '    Docs:            https://docs.sigstore.dev/cosign/installation/' \
                '    CI parity:       sigstore/cosign-installer@v3 (.github/workflows/ci.yml)'
            ;;
        shellcheck)
            printf '%s\n' >&2 \
                '  shellcheck — POSIX-shell linter (gates install.sh + setup-dogfood-env.sh).' \
                '    Linux (apt):     sudo apt-get install -y shellcheck' \
                '    macOS (brew):    brew install shellcheck' \
                '    Windows:         scoop install shellcheck (or winget install koalaman.shellcheck)'
            ;;
        gh)
            printf '%s\n' >&2 \
                '  gh — GitHub CLI (release-asset verification).' \
                '    Linux:           https://github.com/cli/cli/blob/trunk/docs/install_linux.md' \
                '    macOS (brew):    brew install gh' \
                '    Windows (winget): winget install --id GitHub.cli'
            ;;
        sha256sum)
            printf '%s\n' >&2 \
                '  sha256sum — checksum verification.' \
                '    Linux:           pre-installed via coreutils. Reinstall with: sudo apt-get install -y coreutils' \
                "    macOS:           ships as 'shasum -a 256'; if you want GNU naming: brew install coreutils" \
                "                     (then 'gsha256sum' is on PATH)." \
                "    Windows:         use 'CertUtil -hashfile <file> SHA256' (built-in)."
            ;;
        tar)
            _warn "tar should be pre-installed on every supported OS. Reinstall coreutils/bsdtar."
            ;;
        git)
            printf '%s\n' >&2 \
                '  git — version control.' \
                '    Linux (apt):     sudo apt-get install -y git' \
                '    macOS:           xcode-select --install (or brew install git)' \
                '    Windows (winget): winget install --id Git.Git'
            ;;
        curl)
            printf '%s\n' >&2 \
                '  curl — HTTP fetch (also: wget works as install.sh fallback).' \
                '    Linux (apt):     sudo apt-get install -y curl' \
                '    macOS:           pre-installed; reinstall with brew install curl' \
                '    Windows:         pre-installed on Windows 10+ as curl.exe'
            ;;
        jq)
            printf '%s\n' >&2 \
                '  jq — JSON CLI (used by several test fixtures).' \
                '    Linux (apt):     sudo apt-get install -y jq' \
                '    macOS (brew):    brew install jq' \
                '    Windows (winget): winget install --id stedolan.jq'
            ;;
        node)
            printf '%s\n' >&2 \
                '  node — Node.js >=20.11 required.' \
                '    macOS (brew):    brew install node' \
                '    Linux:           https://nodejs.org/ (or use nvm: https://github.com/nvm-sh/nvm)' \
                '    Windows (winget): winget install OpenJS.NodeJS'
            ;;
        *)
            _warn "no install hint for $bin"
            ;;
    esac
}

# Special-case: macOS sha256sum is named differently. Treat 'shasum -a 256'
# as a satisfying alternative.
_have_sha256sum() {
    if command -v sha256sum >/dev/null 2>&1; then
        return 0
    fi
    if command -v shasum >/dev/null 2>&1 && shasum -a 256 /dev/null >/dev/null 2>&1; then
        return 0
    fi
    return 1
}

_check() {
    bin="$1"
    if [ "$bin" = "sha256sum" ]; then
        if _have_sha256sum; then
            _log "  ok: sha256sum (or shasum -a 256)"
            return 0
        fi
    elif command -v "$bin" >/dev/null 2>&1; then
        ver=$("$bin" --version 2>/dev/null | head -n 1 || echo "")
        if [ -n "$ver" ]; then
            _log "  ok: $bin    ($ver)"
        else
            _log "  ok: $bin"
        fi
        return 0
    fi

    _warn "missing: $bin"
    _hint "$bin"
    MISSING=$((MISSING + 1))
    MISSING_NAMES="$MISSING_NAMES $bin"
    return 1
}

_check_node_version() {
    if ! command -v node >/dev/null 2>&1; then
        return 0  # already counted by _check above
    fi
    NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo "0")
    if [ "$NODE_MAJOR" -lt 20 ]; then
        _warn "node version too low: $(node -v) (need >=20.11)"
        _hint "node"
        MISSING=$((MISSING + 1))
        MISSING_NAMES="$MISSING_NAMES node-version"
    fi
}

_apt_install() {
    if [ "$PLATFORM" != "linux" ]; then
        _err "--install is Linux-only (refusing on $PLATFORM)."
        case "$PLATFORM" in
            darwin)  _err "  Use Homebrew:  brew install $*" ;;
            windows) _err "  Use winget/scoop:  winget install <pkg> ; or scoop install <pkg>" ;;
        esac
        return 1
    fi
    if ! command -v apt-get >/dev/null 2>&1; then
        _err "--install requires apt-get; this Linux flavor is unsupported by --install."
        _err "  Install manually per the hints above."
        return 1
    fi
    _log "Running: sudo apt-get update"
    sudo apt-get update >/dev/null
    for pkg in "$@"; do
        _log "Running: sudo apt-get install -y $pkg"
        sudo apt-get install -y "$pkg"
    done
}

_log "TestAtlas dogfood-env preflight (platform=$PLATFORM)"
_log "Probing required binaries:"

# Order matches the CONTRIBUTING.md docs section.
# Allow non-zero from individual checks without aborting (set -e).
set +e
_check cosign
_check shellcheck
_check gh
_check sha256sum
_check tar
_check git
_check curl
_check jq
_check node
_check_node_version
set -e

if [ "$MISSING" -eq 0 ]; then
    _log "All required binaries present. Ready for /atlas:test-flow --all."
    exit 0
fi

_warn "$MISSING binary check(s) failed:$MISSING_NAMES"

if [ "$INSTALL_FLAG" -eq 1 ]; then
    # Best-effort apt install for the most-commonly-missing trio.
    _log "--install requested; attempting apt install on Linux."
    APT_PKGS=""
    case "$MISSING_NAMES" in *" cosign"*) APT_PKGS="$APT_PKGS cosign" ;; esac
    case "$MISSING_NAMES" in *" shellcheck"*) APT_PKGS="$APT_PKGS shellcheck" ;; esac
    case "$MISSING_NAMES" in *" gh"*) APT_PKGS="$APT_PKGS gh" ;; esac
    case "$MISSING_NAMES" in *" jq"*) APT_PKGS="$APT_PKGS jq" ;; esac
    case "$MISSING_NAMES" in *" curl"*) APT_PKGS="$APT_PKGS curl" ;; esac
    case "$MISSING_NAMES" in *" git"*) APT_PKGS="$APT_PKGS git" ;; esac
    if [ -n "$APT_PKGS" ]; then
        # shellcheck disable=SC2086  # word-splitting intentional
        _apt_install $APT_PKGS || exit 1
        _log "apt install attempted; re-run without --install to verify."
    else
        _err "--install cannot satisfy these missing items: $MISSING_NAMES"
        exit 1
    fi
fi

exit 1
