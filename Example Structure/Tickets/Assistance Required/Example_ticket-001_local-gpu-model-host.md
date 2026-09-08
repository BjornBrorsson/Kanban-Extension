# DEMO-005 — Configure local model inference endpoint for AI agent runners

| Field | Value |
|-------|-------|
| **Epic** | A — Foundation & Infrastructure |
| **Type** | Infrastructure |
| **Priority** | P0 — Critical |
| **Estimate** | M (2–3 days) |
| **Status** | Assistance Required |
| **Depends on** | — |
| **Blocks** | DEMO-008, DEMO-012 |
| **Labels** | `llm`, `infra`, `gpu`, `runner` |

## Summary
Stand up a local model runner service endpoint for local development and offline agent reasoning tasks.

## Description
Configure a local inference server compatible with standard OpenAI/Ollama HTTP endpoints. This enables local development agents to perform code reviews and ticket task generation without requiring external cloud API calls.

## Acceptance Criteria
- [x] Local inference runtime installed and responding on localhost port.
- [x] Lightweight development model downloaded and verified.
- [ ] Configure environment variables so agent runners automatically detect the local endpoint.
- [ ] Perform end-to-end round-trip test: prompt dispatch, streaming output, and structured tool invocation.
- [ ] Document configuration procedure for team members in `docs/local-models.md`.

## Technical Notes
- Ensure the local endpoint port is configurable via `.env`.
- Verify behavior when local GPU acceleration is available vs CPU fallback.

## Definition of Done
Local model endpoint responds to agent dispatch requests, environment configuration persists across terminal sessions, and setup documentation is verified.

## Work Log
- Installed local model runner and verified basic response.
- Downloaded lightweight model for local test execution.
- Awaiting team decision on default port and authentication configuration.
