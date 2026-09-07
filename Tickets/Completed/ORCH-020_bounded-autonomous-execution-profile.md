# ORCH-020 — Bounded autonomous execution profile and overnight queue safeguards

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-015, ORCH-017, ORCH-018, ORCH-019 |
| **Blocks** | ORCH-026 |
| **Labels** | `autonomous`, `overnight`, `safeguards`, `profiles`, `m4` |
| **Milestone** | M4 — Overnight queues |

## Summary
Implement operational execution profiles (Plan-Only, Supervised, and Bounded-Autonomous) with strict overnight safety ceilings, human authorization persistence, and an intervention queue for human review.

## Description
To allow personal and corporate developers to run tasks overnight with peace of mind:

1. **Execution Profiles & Configurable Confirmation**:
   - **Plan-Only**: Decompose goals and generate tickets/acceptance criteria; no code edits or dispatches.
   - **Supervised**: Configurable confirmation checkpoints (e.g. prompt on new tool categories, cross-boundary edits, patch integration, or lead takeover). Any action or scope already granted in the persistent workspace authorization scope executes without redundant prompting.
   - **Bounded-Autonomous**: Allows workers to execute bounded tasks, run local tests, and produce reviewed patches up to explicit ceilings without human intervention.

2. **Authorization Scopes**:
   - Persist granted permissions per workspace (e.g. "Allowed to edit `src/**` and `test/**`", "Allowed to run `npm test`", "Disallowed from git push or cloud deploy").
   - Respect pre-authorized scopes across both Supervised and Bounded-Autonomous modes.

3. **Overnight Stopping Rules & Safety Ceilings**:
   - **Pre-Dispatch Budget Bounding**: Prevent dispatch *before* exceeding the budget. If remaining budget < attempt reservation ceiling, the scheduler stops dispatch immediately.
   - **Circuit Breaker**: Trips and pauses the queue only on consecutive *terminal failures* (e.g. 2 consecutive unresolvable failures or aborts). **Ordinary worker-to-lead escalation is expected orchestration behavior and does not count as a failed ticket.**
   - **Batch Limits**: Maximum completed ticket count per run (e.g. max 5 tickets before pausing).
   - **Default Deliverable**: A reviewed patch or verified local build ready for morning inspection, requiring zero remote pushes.

4. **Human Intervention Queue**:
   - Consolidates genuine decisions and blockers (not routine tool executions or normal lead escalations) for morning review.

## Acceptance Criteria
- [x] Operational profiles (`plan-only`, `supervised`, `bounded-autonomous`) configured in settings.
- [x] Configurable confirmation checkpoints in Supervised mode that respect pre-authorized workspace scopes.
- [x] Pre-dispatch budget gate stops scheduling before exceeding configured allowance.
- [x] Circuit breaker pauses queue on consecutive terminal failures, explicitly excluding routine worker-to-lead escalations.
- [x] Intervention queue groups blocked decisions in webview drawer with actionable prompts.
- [x] End-to-end integration test of bounded-autonomous queue execution.

## Technical Notes
- Implemented in `src/orchestrator/scheduler/autonomousProfile.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `AutonomousProfileManager` with plan-only / supervised / bounded-autonomous modes, pre-dispatch budget bounding, terminal failure circuit breaker (explicitly preserving worker-to-lead routine escalations), and human intervention queue with actionable prompts. Verified in `test/m4Tests.ts`.
