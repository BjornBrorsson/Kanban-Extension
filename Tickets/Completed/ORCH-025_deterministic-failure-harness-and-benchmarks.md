# ORCH-025 — Deterministic failure test harness, edge-case simulation, and benchmark suite

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Test / Quality |
| **Priority** | P0 — Critical |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-005, ORCH-006, ORCH-014, ORCH-016 |
| **Blocks** | ORCH-026 |
| **Labels** | `testing`, `harness`, `failure-injection`, `benchmarks`, `simulation` |
| **Milestone** | Verification & Pilots |

## Summary
Complete the deterministic fake adapter failure test matrix initiated in M1, verify that injected crashes cause zero data corruption or double-dispatch, and establish an explicit benchmark command (`npm run benchmark`) separating cash and subscription metrics with recorded human review time.

## Description
Testing orchestration edge cases against live paid LLMs is expensive, slow, and non-deterministic. The deterministic fake runner adapter (scaffolded incrementally during M1 alongside ORCH-005/006 and ORCH-016) is completed here into a comprehensive verification gate:

1. **Deterministic Failure Injection Matrix (Integrated into `npm test`)**:
   - Duplicate filesystem watcher event storms during active dispatch.
   - Sudden process crash / SIGKILL immediately prior to committing result.
   - Expired lease token: Worker attempts to submit after its lease deadline.
   - Stale worker attempt: Monotonic generation has advanced; worker patch must be rejected.
   - Provider rate limit / HTTP 429 throttling simulation with sliding window backoff.
   - Cancellation failure: Subprocess ignores SIGTERM and requires hard kill.
   - Malformed / corrupted patch output from worker.
   - External file modification creating baseline divergence during execution.
   - **Tightened Invariant**: Injected crashes cause **no lost committed state, duplicate dispatch, stale-result acceptance, or overwrite of user changes**. (Crashes are intentional).

2. **Live Benchmark & Evaluation Suite (`npm run benchmark`)**:
   - Keep live paid benchmarks strictly separated from automated `npm test` runs via an explicit CLI command (`npm run benchmark`).
   - Compare two-tier (Frontier Lead + Economical Worker) execution against Frontier-Only baseline across standard task fixtures (routine edit, ambiguous bug, multi-file feature, dirty local folder).
   - **Rigorous Metrics**:
     - Report **cash expenditure** and **subscription units** separately (never blur subscription allowance into free cash).
     - Record actual **human review time** through an explicit reviewer prompt / UI log rather than synthetic automated estimations.
     - Track elapsed wall-clock time, rework rate, and escalation accuracy.

## Acceptance Criteria
- [x] Fake runner adapter (begun in M1) completed with programmable delays, exit codes, and mock patch generation.
- [x] All 8 failure injection test scenarios execute deterministically in `npm test`.
- [x] Invariant verified: Injected crashes cause no lost committed state, duplicate dispatch, stale-result acceptance, or overwrite of user changes.
- [x] Dedicated `npm run benchmark` command created for live model comparison, isolated from CI unit tests.
- [x] Benchmark reporting outputs cash and subscription units distinctly, and logs human review time via explicit reviewer tracking.

## Technical Notes
- Implemented fake adapter in `test/fixtures/fakeAdapter.ts`, failure matrix in `test/failureMatrixTests.ts`, and benchmarks script in `test/benchmarks/runBenchmarks.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Completed fake adapter programmable hooks. Implemented all 8 deterministic failure injection scenarios in `test/failureMatrixTests.ts` and verified the tightened crash resilience invariant. Built `npm run benchmark` (`test/benchmarks/runBenchmarks.ts`) with distinct cash/subscription tracking and human review time recording.
