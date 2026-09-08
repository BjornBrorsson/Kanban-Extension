# DEMO-070 — Structured request payload templates for external API integration

| Field | Value |
|-------|-------|
| **Epic** | D — Integration & API Connectors |
| **Type** | Improvement |
| **Priority** | P1 — Core |
| **Estimate** | M (2–3 days) |
| **Status** | Backlog |
| **Depends on** | DEMO-012, DEMO-015 |
| **Blocks** | — |
| **Labels** | `api`, `payloads`, `integration`, `validation` |
| **Milestone** | M3 |

## Summary
Provide strongly typed request payload templates for complex write operations sent to external API endpoints.

## Description
When interacting with third-party webhooks and upstream service endpoints, requests require structured payloads with specific nested schema objects rather than flat scalar arguments.

Build a payload template registry that maps endpoints to parameter schemas and validates payloads before dispatch. Unrecognized schemas should be flagged for review rather than dispatched with fallback defaults.

## Acceptance Criteria
- [ ] Implement a `payload-templates.json` registry defining schemas for write endpoints.
- [ ] Add pre-dispatch validation that rejects payloads missing required nested fields.
- [ ] Fall back to a `needs_validation` status when no matching template schema exists.
- [ ] Add unit tests verifying payload generation and schema validation.

## Technical Notes
- Store schema templates in JSON format for easy extension and review.
- Integrate with the existing request client middleware.

## Definition of Done
Requests to structured endpoints match their expected schema definitions, and missing template definitions are cleanly caught prior to transmission.

## Work Log
- Documented schema requirements for outbound write endpoints.
