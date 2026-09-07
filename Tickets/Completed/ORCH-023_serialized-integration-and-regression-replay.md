# ORCH-023 — Serialized integration engine with conflict detection and regression check replay

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-007, ORCH-012, ORCH-022 |
| **Blocks** | ORCH-024 |
| **Labels** | `integration`, `git`, `conflicts`, `regression`, `replay`, `m5` |
| **Milestone** | M5 — Broader workspaces and parallelism |

## Summary
Implement a serialized integration pipeline that checks target branch divergence, rebases worker patches, and automatically replays verification checks on the combined integrated state before completing cards.

## Description
When multiple workers execute in parallel, merging their completed patches must be strictly serialized to prevent integration regressions:

1. **Serialized Integration Queue**:
   - Completed worker patches enter the integration queue one at a time.
   - The engine checks if the main working branch has advanced since the worker's baseline was captured.

2. **Divergence & Rebase Handling**:
   - If the baseline is clean: patch applies cleanly.
   - If the main branch changed:
     - Attempt clean 3-way patch merge / rebase.
     - If conflict occurs: pause integration, mark attempt `MergeConflict`, and summon Lead or request human intervention.

3. **Regression Check Replay**:
   - After applying the patch to the integration candidate, **replay all relevant test and build checks against the combined state**.
   - If tests fail now (even though they passed in the worker's isolated worktree), the integration is rejected and escalated.
   - Only cards whose combined integrated state passes all checks are transitioned to `Completed`.

## Acceptance Criteria
- [x] Serialized integration queue manages sequential merge application.
- [x] Base divergence detection identifies changes made since attempt allocation.
- [x] Automated replay of verification commands on combined workspace state.
- [x] Safe rollback / abort if integration or replayed tests fail.
- [x] Unit and fixture tests simulating concurrent worker patches integrating cleanly and handling conflicts.

## Technical Notes
- Implemented in `src/orchestrator/workspaces/integrationPipeline.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `SerializedIntegrationPipeline` with queued mutex integration, divergence detection, 3-way conflict flagging, and automatic verification replay on the merged workspace state with clean rollback upon regression. Verified in `test/m5Tests.ts`.
