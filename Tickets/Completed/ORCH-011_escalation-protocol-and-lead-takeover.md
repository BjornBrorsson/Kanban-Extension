# ORCH-011 — Escalation protocol, blocker resolution, and lead checkpoint takeover

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-010 |
| **Blocks** | ORCH-012 |
| **Labels** | `escalation`, `lead`, `takeover`, `blockers`, `m2` |
| **Milestone** | M2 — Lead and worker |

## Summary
Implement deterministic escalation triggers that return control to the Lead agent when economical workers encounter blockers, scope expansion, or repeated test failures, supporting lead takeover with atomic write-ownership transfer.

## Description
Self-reported confidence from models is unreliable. The runtime must enforce objective escalation triggers:

1. **Objective Escalation Triggers**:
   - Ambiguous or conflicting acceptance criteria identified during run.
   - Required changes exceed the worker's assigned `allowedScope`.
   - Repeated test or build failures exceed the configured `retryLimit` (e.g. 1 or 2 retries).
   - Architectural decision required (new dependency, major refactor).
   - Worker progress stalls (inactivity timeout / loop detection).

2. **Escalation & Takeover Lifecycle**:
   - Worker process is cleanly halted and its intermediate patch/state is captured.
   - Escalation record is compiled with the exact failing test output and open questions.
   - Lead agent is summoned:
     - **Option A (Guidance)**: Lead clarifies ambiguity or adjusts acceptance criteria, then re-delegates to the worker.
     - **Option B (Takeover)**: Lead assumes write ownership from the worker's checkpoint, completes the difficult section, and verifies the solution.
     - **Option C (Human Escalation)**: If lead also cannot resolve, card transitions to `Assistance Required` / `Blocked` with an actionable prompt in the human intervention queue.

3. **Atomic Ownership Transfer**:
   - Write lease of previous worker must be explicitly revoked before Lead or another worker acquires write lock.

## Acceptance Criteria
- [x] Escalation trigger evaluation engine implemented.
- [x] Worker process safely paused and intermediate diff snapshot captured upon escalation.
- [x] Lead session receives escalation context with failing command traces.
- [x] Checkpoint takeover allows Lead to resume directly from worker's patch.
- [x] Clean card transition to `Assistance Required` when automated resolution fails.
- [x] Integration test simulating worker failure, escalation to lead, and successful takeover.

## Technical Notes
- Implement in `src/orchestrator/lead/escalationManager.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `EscalationHandler` in `src/orchestrator/lead/escalationHandler.ts`. Evaluates objective escalation triggers (`OUT_OF_SCOPE`, `RETRY_LIMIT_EXCEEDED`, `AMBIGUITY_DETECTED`), safely halts worker processes, logs escalations in `RuntimeJournal`, persists escalation records to `.agentic-kanban/runtime/escalations/`, and executes `executeLeadTakeover` with atomic worker lease revocation and generation increment. Confirmed that routine worker-to-lead escalation is expected orchestration behavior and does not count as a failed ticket. Verified in `test/m2Tests.ts`.
