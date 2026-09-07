# ORCH-022 — Parallel isolated worker execution using multi-worktrees

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P2 — General |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-007, ORCH-017, ORCH-021 |
| **Blocks** | ORCH-023 |
| **Labels** | `parallelism`, `worktrees`, `concurrency`, `isolation`, `m5` |
| **Milestone** | M5 — Broader workspaces and parallelism |

## Summary
Enable multiple concurrent worker agents to execute independent tasks in parallel using isolated Git worktrees without filesystem collision, while supporting concurrent read-only Lead planning.

## Description
Once single-worker execution is fully stabilized, allow parallel execution of independent tickets (cards with no mutual dependencies):

1. **Multi-Worktree Allocation**:
   - Each active worker attempt receives a dedicated Git worktree rooted at `.agentic-kanban/worktrees/{attemptId}`.
   - Worktree checked out from current target integration baseline.
   - Worker runs, edits, and tests completely inside its isolated directory.

2. **Concurrency Invariants**:
   - Two workers cannot edit the same ticket or touch intersecting scopes if designated exclusive.
   - Lead agent can run read-only planning concurrently alongside active editing workers.
   - Write ownership transfers only occur after previous writer has terminated and its patch is secured.

3. **Lifecycle & Cleanup**:
   - Temporary worktrees are pruned upon attempt completion, cancellation, or crash recovery.

## Acceptance Criteria
- [x] Multi-worktree allocator creates and manages isolated directories per attempt.
- [x] Independent tasks execute concurrently without file lock contention or git index collisions.
- [x] Concurrent read-only Lead planning runs alongside worker edits safely.
- [x] Worktree cleanup routine removes stale worktrees on exit or abort.
- [x] Stress tests verifying parallel execution of 2–3 simultaneous worker tasks.

## Technical Notes
- Implemented in `src/orchestrator/workspaces/worktreeAllocator.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `MultiWorktreeAllocator` with isolated directories, exclusive scope collision prevention, concurrent read-only Lead planning bypass, and cleanup routines. Verified in `test/m5Tests.ts`.
