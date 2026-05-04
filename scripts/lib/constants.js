// scripts/lib/constants.js
//
// Single source of truth for repo identity strings, GitHub API URLs, and the
// canonical manifest/lockfile/cache paths. Per RESEARCH.md §Anti-Patterns,
// avoid hardcoding `<org>/testatlas` in dozens of places — every other module
// imports these constants.
//
// `<org>` is a deliberate placeholder until Plan 07-05 closure (npm-name +
// owner-org decision). Plan 07-05 rewrites these constants in one place.

export const REPO_OWNER_REPO = '<org>/testatlas';
export const GH_RELEASES_API = `https://api.github.com/repos/${REPO_OWNER_REPO}/releases`;
export const GH_LATEST_RELEASE_API = `${GH_RELEASES_API}/latest`;

// Suite tree paths (relative to install target).
export const INSTALL_MANIFEST_PATH = '.testatlas/.install-manifest.json';
export const UPDATE_CACHE_PATH = '.testatlas/.update-cache.json';

// Workspace tree paths (relative to install target).
export const WORKSPACE_LOCK_PATH = '_testatlas/.lock';

// Schema id of the install manifest (for schema-loader / AJV lookups).
export const INSTALL_MANIFEST_SCHEMA_ID =
  'https://testatlas.dev/schemas/v1/install-manifest.schema.json';
