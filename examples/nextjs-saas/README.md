# `examples/nextjs-saas` — Next.js 15 App Router SaaS shell

A minimal Next.js 15 App Router + React 19 SaaS shell used as a TestAtlas
reference example. The companion `_testatlas/` workspace inside this directory
is the durable quality intelligence layer produced by mapping this codebase
end-to-end.

## What this is

- Plain ESM JavaScript (`"type": "module"`), Node 20.11+, no TypeScript build
- Next.js 15 App Router with route groups: `(auth)`, `(dashboard)`
- React 19 Server + Client Components
- Mock cookie-based auth (no real JWT, no DB)
- Three Route Handlers: `/api/health`, `/api/auth/login`, `/api/auth/signup`
- ~250 LOC across `app/`, `components/`, `lib/`

## How to run

```sh
npm install
npm run dev
# → ready on http://localhost:3000
```

Available routes:

| Route                  | Type           | Notes                                              |
| ---------------------- | -------------- | -------------------------------------------------- |
| `/`                    | Server (page)  | Marketing landing                                  |
| `/login`               | Server + Client form | Calls `POST /api/auth/login`                  |
| `/signup`              | Server + Client form | Calls `POST /api/auth/signup`                 |
| `/dashboard`           | Server (guarded by layout) | Reads session cookie or redirects     |
| `/dashboard/settings`  | Server         | Stub                                               |
| `GET /api/health`      | Route Handler  | `{status:"ok"}`                                    |
| `POST /api/auth/login` | Route Handler  | Mock token + `Set-Cookie`                          |
| `POST /api/auth/signup`| Route Handler  | Mock signup + 201                                  |

## TestAtlas workspace

The `_testatlas/` directory next to this README is regenerable from
`_testatlas-fixture/example-script.json` via:

```sh
node ../../scripts/regenerate-example.js examples/nextjs-saas
```

`--check` mode runs the regeneration against a tempdir and exits non-zero if
the checked-in tree drifts — see [`examples/framework/README.md`](../framework/README.md).

## Mappable concerns

The seeded `_testatlas/` fixture covers ~14 mappable concerns:

- 4 domains: `auth`, `dashboard`, `marketing`, `api`
- 6 user/system flows: `login-with-credentials`, `signup-new-account`,
  `logout`, `dashboard-navigation`, `view-landing-page`, `health-check`
- 3 evidence records backing the seeded findings
- 3 confirmed issues (see below)

## Realistic seeded findings

1. **MOCK-JWT-TOKEN-LITERAL** (medium, auth) — `/api/auth/login` returns a
   string literal `mock-jwt-token`; nothing is signed.
2. **DASHBOARD-NO-EXPIRY-CHECK** (high, dashboard) — the `(dashboard)` layout
   only checks cookie *presence*; an expired session cookie still passes.
3. **SIGNUP-NO-PASSWORD-STRENGTH** (medium, auth) — `/api/auth/signup` accepts
   any non-empty password.

See `_testatlas/to_fix/` for the full issue records.
