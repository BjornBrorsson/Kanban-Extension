# ORCH-019 — Additional validated managed runner adapters (Devin CLI, GitHub Copilot CLI, Cline)

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P2 — General |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-003, ORCH-006, ORCH-014 |
| **Blocks** | ORCH-020 |
| **Labels** | `adapters`, `devin`, `copilot`, `cline`, `runners`, `m4` |
| **Milestone** | M4 — Overnight queues |

## Summary
Implement and certify additional managed runner adapters for tools whose local interfaces qualify for managed status (e.g. Devin CLI, GitHub Copilot CLI, Cline headless), expanding vendor-neutral routing choices.

## Description
Following the capability probe findings from ORCH-003:

1. **Adapter Implementation**:
   - Implement managed adapters for tools that expose verifiable process lifecycles, structured patch outputs, and cancellation hooks:
     - **GitHub Copilot CLI**: Headless execution with output redirection and session constraints.
     - **Devin CLI**: Programmatic session initialization, polling/event streaming, and patch extraction.
     - **Cline Headless**: Subprocess execution with MCP tool governance.
   - For tools that do not support managed guarantees, preserve them in Assisted mode without false claims.

2. **Multi-Provider Lead/Worker Matrix**:
   - Enable configuring distinct providers for Lead vs Worker (e.g. Lead: GitHub Copilot CLI / Claude 3.7; Worker: Cline / Ollama Gemma 4).
   - Ensure context handoff packages format correctly across different runner formats.

## Acceptance Criteria
- [x] At least two additional runner adapters implemented adhering to `RunnerAdapter` contract.
- [x] Process observation, output streaming, and error handling validated for each.
- [x] Multi-provider lead/worker routing verified in end-to-end configuration.
- [x] Transparent fallback to Assisted mode when advanced features (like token telemetry) are missing.
- [x] Unit and fixture tests for each implemented adapter.

## Technical Notes
- Located in `src/orchestrator/adapters/clineAdapter.ts`, `copilotCliAdapter.ts`, and `devinCliAdapter.ts`. Communicates via standard CLI invocation and process lifecycle management without proprietary vendor lock-in.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `ClineManagedAdapter`, `CopilotCliAdapter`, and `DevinCliAdapter` extending `ManagedProcessAdapter`. Verified instantiation, CLI templating, and configuration in `test/m4Tests.ts`.
