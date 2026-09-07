# ORCH-013 — Provider eligibility engine, EU-only verification, and local execution policy

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-002, ORCH-006 |
| **Blocks** | ORCH-014, ORCH-015 |
| **Labels** | `policy`, `eu-only`, `local-only`, `routing`, `compliance`, `m3` |
| **Milestone** | M3 — Policy and budget reliability |

## Summary
Implement the multi-tier policy evaluation engine that authorizes providers and models according to EU-only, local-only, and data classification policies before any dispatch occurs.

## Description
Routing must evaluate constraints strictly in order:
`Policy Eligibility` → `Required Capabilities` → `Available Budget/Quota` → `Suitable Quality` → `Cost/Latency Preference`.

A cheaper provider must **never** be used as a fallback if it violates the board's policy.

1. **EU-Only Policy Verification**:
   - Must evaluate the **full execution path**, not just the marketing name of the provider.
   - Includes: Lead & worker inference endpoints, fallback models, embeddings, telemetry, crash logs, tools, and remote subprocess runners.
   - Maintain explicit provider metadata: Model host region, endpoint URL, data retention policies, subprocessor locations, verification date, and allowed data classes.
   - An opaque CLI whose network destinations are unknown fails strict EU-only eligibility by default.

2. **Local-Only Policy**:
   - Fully offline execution using local models (e.g. Ollama, Gemma 4, vLLM, llama.cpp).
   - Zero outbound network traffic permitted.

3. **Policy Engine Enforcement**:
   - Rejects or blocks dispatch immediately if any step of the proposed execution chain violates the board policy.

## Acceptance Criteria
- [x] Policy engine module created in `src/orchestrator/policy/`.
- [x] Strict evaluation order enforced: policy eligibility checked first before capability or cost optimization.
- [x] EU-only evaluation rules inspect model host, inference endpoint, and tool egress metadata.
- [x] Local-only execution profile blocks all non-localhost network endpoints.
- [x] Clear diagnostic errors in UI when a task cannot be scheduled due to policy restrictions.
- [x] Unit tests for EU-only, local-only, and invalid fallback rejections.

## Technical Notes
- Clarify in documentation: The extension enforces configured technical policy boundaries; it does not claim to serve as legal compliance certification.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `ProviderRegistry` in `src/orchestrator/policy/providerEligibility.ts` tracking data residency regions (`EU`, `US`, `LOCAL`, `GLOBAL`), endpoint hosts, and auditable capabilities. Implemented `PolicyEngine` in `src/orchestrator/policy/policyEngine.ts` enforcing strict EU-only, local-only (loopback-only), and strict auditable checks, along with `filterEligibleProviders` guaranteeing that ineligible providers are never used as fallback. Verified in `test/m3Tests.ts`.
