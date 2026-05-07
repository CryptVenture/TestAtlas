# TestAtlas Integrations Map

Human-readable view of `_testatlas/maps/integrations.json`. Catalogs every external service the product depends on. Per PRD §7.13.

> **Updated by:** `/atlas:explore-integrations` and `/atlas:explore-observability`. **Source:** `integrations.json`.

## Field reference

| Field | Description |
| --- | --- |
| `service` | Vendor / service name (e.g. Stripe, Sentry, SendGrid). |
| `type` | Category: `payments`, `auth`, `email`, `sms`, `analytics`, `telemetry`, `storage`, `search`, `feature-flags`, `webhooks`, `outbound-api`. |
| `auth_method` | How the product authenticates with the service. |
| `sandbox_strategy` | `{available, host, key_prefix_for_sandbox, key_prefix_for_production}`. |
| `endpoints` | Array of `{path, method, purpose}` exercised by the product. |
| `test_coverage` | Test IDs + percent. |
| `evidence` | On-disk evidence paths. |

<!-- TESTATLAS:GENERATED:START section="integrations" -->
_Generated from `integrations.json`. Do not edit by hand._
<!-- TESTATLAS:GENERATED:END section="integrations" -->
