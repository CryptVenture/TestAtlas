# 06 Risks and Gaps

> Updated automatically by every TestAtlas command. Human notes outside the generated blocks are preserved across runs.

This document enumerates the risks and gaps discovered during exploration. Risks are things that could cause harm; gaps are things we cannot test. Each entry must have a severity and a mitigation path.

## Untested Domains

(Which product domains have not yet been mapped or tested? Why?)

## Missing Data or Accounts

(What test data, fixtures, or user accounts are missing?)

## Unavailable Services

(Which dependencies are not reachable from the test environment? Sandboxes down, integrations rate-limited, etc.)

## Setup Problems

(What environment-setup issues are blocking exploration? Broken seed scripts, version mismatches, missing toolchain?)

## Observability Gaps

(Where is logging, metrics, or tracing insufficient to debug failures?)

## Security and Privacy Concerns

(What security or privacy risks have been spotted? Credentials in logs, PII in screenshots, missing auth on a route?)

## Product Ambiguity

(Where is product behavior so undefined that testing cannot decide pass/fail?)

## Automation Gaps

(Which flows cannot be automated? Captcha-gated, payment-gated, MFA-gated, hardware-bound?)

## Severity

(One of: blocker / critical / major / minor / trivial — per the severity vocabulary.)

## Mitigation

(What action would close the risk or gap? Who owns it? What is the deadline?)
