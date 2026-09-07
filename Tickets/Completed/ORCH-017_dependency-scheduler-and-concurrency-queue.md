# ORCH-017 — Multi-board dependency scheduler and fair-share concurrency queue

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-014, ORCH-016 |
| **Blocks** | ORCH-018, ORCH-020 |
| **Labels** | `scheduler`, `dependencies`, `concurrency`, `queues`, `multi-board`, `m4` |
| **Milestone** | M4 — Overnight queues |

## Summary
Implement a global task scheduler that evaluates multi-board dependencies, enforces per-board and per-provider concurrency limits, and manages the Ready queue with Pause/Resume controls.

## Description
To support overnight autonomous runs across multiple boards without throttling or starvation:

1. **Dependency Resolution**:
   - A card enters the dispatchable `Ready` state only when:
     - All tickets listed in `Depends on` are in `Completed` (or have verified passing patches).
     - No active blocking dependencies exist.
     - Board policy permits execution.
     - Acceptance criteria are defined.

2. **Fair-Share Concurrency & Quota Scheduling**:
   - Manages global provider concurrency limits (e.g. max 1 concurrent frontier lead call, max 2 economical workers).
   - Manages per-board worker concurrency (initial default: 1 worker per board).
   - Round-robin / fair-share scheduling across active boards to prevent one project from starving shared budgets.

3. **Queue Controls**:
   - UI and CLI commands:
     - `Run Ready Queue`: Dispatches ready tickets sequentially up to concurrency caps.
     - `Pause Queue`: Stops new dispatches while allowing active runs to complete gracefully.
     - `Resume Queue`: Resumes scheduling from where it paused.

## Acceptance Criteria
- [x] Task dependency resolution engine identifies ready cards and handles dynamic dependencies.
- [x] Global concurrency queue arbitrates dispatch across multiple boards.
- [x] Fair-share resource allocation respects provider-level concurrency and rate limits.
- [x] Queue pause, resume, and step-through commands implemented in backend.
- [x] Unit tests for multi-board dependency ordering, queue pause/resume, and concurrency throttling.

## Technical Notes
- Implemented in `src/orchestrator/scheduler/dependencyScheduler.ts` and `src/orchestrator/scheduler/concurrencyQueue.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `DependencyScheduler` with Kahn's DAG cycle detection and `ConcurrencyQueue` with fair-share round-robin, global worker limits, per-board limits, and pause/resume controls. Verified via `test/m4Tests.ts`.
