# TestAtlas Endpoints Map

Human-readable view of `_testatlas/maps/endpoints.json`. Catalogs every HTTP / RPC / GraphQL endpoint with auth, schema, errors, pagination, idempotency, and rate-limit metadata. Per PRD §7.13.

> **Updated by:** `/atlas:explore-api`. **Source:** `endpoints.json`.

## Field reference

| Field | Description |
| --- | --- |
| `path` | Endpoint path (with parameters as `:slug` or `{slug}`). |
| `method` | `GET` / `POST` / `PUT` / `PATCH` / `DELETE` / etc. |
| `auth` | Required + supported schemes. |
| `request_schema` | Path to request body / query schema. |
| `response_schema` | Path to response body schema. |
| `errors` | Array of `{status, shape}` for documented error responses. |
| `pagination` | Pagination strategy or `null`. |
| `idempotency` | Whether the operation is idempotent and how it's enforced. |
| `rate_limit` | Scope + cap. |
| `test_coverage` | Test IDs + percent. |
| `evidence` | On-disk evidence paths. |
| `confidence` | `low` / `needs-validation` / `medium` / `high`. |

<!-- TESTATLAS:GENERATED:START section="endpoints" -->
_Generated from `endpoints.json`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="endpoints" -->
