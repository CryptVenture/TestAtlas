# `examples/node-api` — Express 5 ESM API

A minimal Express 5 ESM API used as a TestAtlas reference example. The
companion `_testatlas/` workspace inside this directory is the durable
quality intelligence layer produced by mapping this codebase end-to-end.

## What this is

- Plain ESM (`"type": "module"`), Node 20.11+, no build step
- 4 route modules: `health`, `auth`, `tasks`, `users`
- In-memory store (Map) for tasks; mock bearer-token auth
- ~150 LOC across `server.js` + `routes/` + `lib/`

## How to run

```sh
npm install
node server.js
# → example-node-api listening on http://localhost:3000
```

Available endpoints:

| Method  | Path              | Notes                                       |
| ------- | ----------------- | ------------------------------------------- |
| `GET`   | `/api/health`     | Liveness probe → `{status: "ok"}`           |
| `POST`  | `/api/auth/login` | Returns mock JWT on any non-empty input     |
| `POST`  | `/api/auth/logout`| 204                                         |
| `GET`   | `/api/tasks`      | List all tasks                              |
| `POST`  | `/api/tasks`      | Create task                                 |
| `GET`   | `/api/tasks/:id`  | Get task                                    |
| `PATCH` | `/api/tasks/:id`  | Update task                                 |
| `DELETE`| `/api/tasks/:id`  | Delete task — **missing ownership check**   |
| `GET`   | `/api/users/me`   | Requires `Authorization: Bearer mock-jwt-token` |

## TestAtlas workspace

The `_testatlas/` directory next to this README is regenerable from
`_testatlas-fixture/example-script.json` via:

```sh
node ../../scripts/regenerate-example.js examples/node-api
```

`--check` mode (used by CI in plan 08-04) runs the regeneration against a
tempdir and exits non-zero if the checked-in tree drifts from replay
output — see [`examples/framework/README.md`](../framework/README.md).

## Realistic seeded findings

Three findings are intentionally seeded into this example so the workspace
demonstrates real-looking issues:

1. **NO-AUTH-ON-DELETE-TASK** (medium) — `DELETE /api/tasks/:id` does not
   verify the requester owns the task.
2. **IN-MEMORY-STORE-DATA-LOSS** (enhancement) — a process restart wipes
   all task state.
3. **MOCK-JWT-SECRET-LITERAL** (low) — `.env.example` ships a string that
   reads like a real secret.

See `_testatlas/to_fix/` for the full issue records (severity, repro,
acceptance criteria, evidence).
