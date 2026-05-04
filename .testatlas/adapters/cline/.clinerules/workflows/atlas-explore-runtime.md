<!-- TestAtlas command: atlas-explore-runtime. Invoke as /atlas-explore-runtime.md. Description: Map how to run the target product safely — package scripts, Docker, env vars, ports, migrations, seeds, mock servers; start local services only when safe. -->

<!-- TESTATLAS:GENERATED:START section="adapter-body" source="commands/explore-runtime.md" hash="15bbebcb206098a5" -->
First read `.testatlas/bootstrap.md`. Then read this command file. Follow both exactly. If they conflict, bootstrap safety and persistence rules win unless this command is more specific and not less safe.

## Purpose

Map how to run the target product safely per PRD §13.6: package scripts, Dockerfiles and Compose configs, environment-variable surface, exposed ports, migration and seed scripts, mock servers, and service interdependencies. Start local services only when explicitly safe under `safeMode` and `allowDestructiveActions`. Capture port-binding probes and env-key inventories (KEYS only, never values). Write runtime metadata into `_testatlas/00_overview.md` (preserving human content via generated-section markers) and detailed evidence under `_testatlas/evidence/explore-runtime/<timestamp>/`.

## Required First Reads

- `.testatlas/bootstrap.md` — especially §4 (capability degradation), §8 (no-evidence-no-finding), §12 (explorer standards).
- `_testatlas/11_workspace_manifest.json` — initialization status; current counts.
- `_testatlas/12_app_map.json` — runtime metadata seeded by `explore-codebase` (apps, services, workers); this command enriches it.
- `.testatlas/default.config.json` — read `safeMode`, `allowDestructiveActions`, `allowProductionTesting`. All three flags gate this command.
- Target runtime artifacts: `Dockerfile` (and variants), `docker-compose.yml` / `compose.yaml`, `.env`, `.env.example`, `.env.*`, `Procfile`, `package.json` (`scripts.start`/`dev`/`serve`), `pyproject.toml` entry points, `Makefile` runtime targets, migration directories (`migrations/`, `db/migrate/`, `prisma/migrations/`), seed scripts, mock-server fixtures.

## Required Actions

1. **No evidence, no finding.** Per `bootstrap.md` §8, every runtime claim — port binding, ENV key, service edge, health-check status — MUST cite an evidence file path under `_testatlas/evidence/explore-runtime/<timestamp>/`. Fabricated paths fail `validate-workspace`.
2. Verify `shell` capability. **If `shell` is unavailable, MUST NOT execute startup, port probes, or migration scripts** — fall back to manifest reading (`Dockerfile`, `docker-compose.yml`, `.env.example`, `package.json` scripts, `Procfile`) and mark every finding `confidence: needs-validation` per `bootstrap.md` §4. Add `tool_unavailable: shell` to each entry. Never invent ports, environment variables, or service health from training-data priors.
3. Enumerate runtime artifacts:
   - Dockerfiles: collect every `Dockerfile*` in the tree.
   - Compose configs: parse `docker-compose.yml` / `compose.yaml` services, networks, volumes, dependencies.
   - Env files: read `.env.example` and any `.env.*` files. **Capture KEYS only — never persist values.** Count keys and record key names plus the file each came from.
   - Process declarations: `Procfile`, `package.json` `scripts.start`/`dev`/`serve`, `pyproject.toml` entry points, `Makefile` runtime targets.
   - Migration scripts and seed scripts: list paths and the tooling used (Prisma, Knex, Alembic, Flyway, Liquibase, ActiveRecord, Sequelize).
   - Mock servers and fixture directories (`mocks/`, `fixtures/`, `wiremock/`, `msw/`).
4. Map exposed ports + service topology. Parse port bindings from compose, Dockerfile `EXPOSE`, framework defaults declared in code (only when explicitly written; never assume). Record service interdependencies (e.g. web → api → db → cache) using compose `depends_on` and explicit code-level config.
5. **Safety prose for `npm install` / `docker compose up` / migrations.** All three are destructive in the senses below. Apply this rule:
   - NEVER run `npm install` (or `pnpm install`, `yarn install`, `pip install`, `bundle install`, `cargo build`) against the target without an explicit operator confirmation recorded as a finding. These mutate lockfiles and write to disk.
   - NEVER run `docker compose up -d` if the compose file declares any `volumes:` mount that maps to a host path under the target repo or to absolute host paths — the container could write into the target tree. Only acceptable mounts are named volumes or paths inside `_testatlas/`.
   - NEVER run migrations against any database unless seed/sandbox is explicitly declared (env var name contains `sandbox`/`local`/`test`, or the connection string targets `localhost`/`127.0.0.1` with a database name marked test).
   - NEVER persist ENV values (only KEYS). If a `.env` file appears to contain live secrets (entropy heuristic + key names like `*_SECRET`, `*_KEY`, `*_TOKEN`), HALT and surface — do not copy the file into evidence.
6. For each safe runtime artifact, capture evidence:
   - `docker image inspect` output for any locally-built images discovered (but do not pull remote images).
   - Port-binding listings (`docker compose config` parsed, never `docker compose up`).
   - ENV-key inventory: `_testatlas/evidence/explore-runtime/<timestamp>/env-keys.json` with `{file, keys:[...]}` entries (KEYS ONLY).
   - Health-check declarations from compose / Dockerfile (recorded; not executed unless `safeMode=true` AND the check is local-only AND `allowDestructiveActions=true` is unnecessary for the probe).
   - Migration / seed inventory (paths + tooling identified).
7. Update `_testatlas/00_overview.md` runtime-detection metadata. Preserve human content using generated-section markers (`<!-- testatlas:runtime-start -->` ... `<!-- testatlas:runtime-end -->`); only the content between markers is rewritten. If markers are missing, append a new managed section at the end of the file.
8. Append a Runtime section to `_testatlas/01_app_inventory.md` summarizing services, ports, ENV-key counts, migration tooling.
9. Close the lifecycle (next section).

## Outputs

- `_testatlas/evidence/explore-runtime/<timestamp>/` — env-keys.json, compose-config.json, image-inspect.json, port-bindings.json, migration-inventory.json.
- Updated `_testatlas/00_overview.md` — runtime metadata between generated-section markers.
- Updated `_testatlas/01_app_inventory.md` — Runtime section.

## Lifecycle

After completing this command, update these workspace artifacts in PRD §40 order:

- `_testatlas/03_execution_status.md` — record current command + completion state, evidence directory path, service / port / ENV-key counts.
- `_testatlas/09_artifact_index.md` — re-derive the on-disk artifact list (new evidence directory must appear).
- `_testatlas/10_command_log.md` — append a row per `command-result.schema.json`. Note any halts or refusals (live-secrets detection, host-volume mounts, missing flags).
- `_testatlas/11_workspace_manifest.json` — bump `lastUpdatedAt`; recompute runtime-related counts.
- `_testatlas/history/run_log.md` — narrative entry: "Mapped `<n>` services across `<n>` ports with `<n>` ENV keys; flagged `<n>` safety stops."

## Stop Conditions

- No runtime artifacts found (no Dockerfile, no compose, no Procfile, no package start scripts) → halt with a diagnostic; the explorer cannot infer how to run the product.
- `safeMode=true` and a required step would mutate target source → halt; the workspace lives only under `_testatlas/`.
- An ENV file contains live-looking secret values → halt; surface the file path and entropy signal; do NOT persist values.
- A destructive bootstrap is detected (e.g. `npm run reset-db`, compose `entrypoint` containing `DROP DATABASE`, an init container that does `rm -rf`) → refuse; record refusal in `10_command_log.md`.
- Any compose mount maps to a host path outside `_testatlas/` and a startup step is requested → halt.

## Completion Criteria

- Every runtime claim cites at least one evidence path that exists on disk.
- ENV-key inventory contains KEYS only; no values persisted anywhere.
- `_testatlas/00_overview.md` runtime metadata is updated between generated-section markers, preserving human content.
- Manifest runtime counts reflect the on-disk evidence.
- The five lifecycle files above are updated.
- A subsequent `validate-workspace` run reports zero errors against the new artifacts.
<!-- TESTATLAS:GENERATED:END section="adapter-body" -->
