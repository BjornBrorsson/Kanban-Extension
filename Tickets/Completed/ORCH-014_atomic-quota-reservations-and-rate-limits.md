# ORCH-014 — Atomic quota reservations, rate limits, and hard budget cost bounding

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-005, ORCH-013 |
| **Blocks** | ORCH-015, ORCH-016, ORCH-017 |
| **Labels** | `budgets`, `quotas`, `reservations`, `rate-limits`, `hard-limits`, `m3` |
| **Milestone** | M3 — Policy and budget reliability |

## Summary
Implement atomic cross-board quota reservations, rate-limiting, and hard cost bounding, ensuring concurrent runs cannot overspend budgets and opaque runners cannot run unattended.

## Description
Post-hoc cost estimation or killing a process after it breaches a threshold is not a true financial cap. Strict budget governance requires:

1. **Atomic Pre-Dispatch Reservations**:
   - Before launching an attempt, atomically reserve the maximum permitted attempt allowance from the shared provider budget across all boards.
   - If remaining budget < reservation amount, dispatch is blocked.
   - Reconcile actual reported usage upon completion; release unspent reserved funds.
   - Retain reservations for runs whose termination is unconfirmed.
   - Always reserve sufficient allowance for the final Lead review before spending the Worker allowance!

2. **Accounting Granularity**:
   - Distinguish:
     - **Reported**: Explicit token/cost figures returned by provider API.
     - **Estimated**: Cost calculated from prompt/response token heuristics.
     - **Reserved**: Capacity temporarily locked for active attempts.
     - **Unknown**: Runners providing zero usage metrics.
   - Track bundled subscription usage separately from pay-as-you-go cash spend. Never display subscription quotas as "free" or "unlimited".

3. **Hard-Limit Rule for Unattended Mode**:
   - Opaque runners lacking programmable token/cost limits cannot qualify for unattended strict cost-capped mode.
   - They may only run in Assisted mode or with explicit human supervision.

4. **Rate Limits & Concurrency**:
   - Token-per-minute (TPM) and request-per-minute (RPM) tracking with sliding window reset timers.

## Acceptance Criteria
- [x] Atomic budget reservation manager implemented in `src/orchestrator/policy/budgetManager.ts`.
- [x] Reservation held across active attempts and reconciled accurately upon process termination.
- [x] Capacity reservation guarantees minimum funds remain for final Lead review step.
- [x] Opaque runners disqualified from unattended strict-budget execution profiles.
- [x] Rate-limiting leaky bucket / sliding window algorithm prevents provider throttling.
- [x] Unit tests for concurrent race prevention, budget exhaustion, and reservation recovery.

## Technical Notes
- Implement atomic reservation operations inside SQLite transactions to prevent race conditions across parallel boards.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `BudgetManager` in `src/orchestrator/policy/budgetManager.ts`. Added pre-dispatch check halting execution before launch when budget is exhausted, atomic quota reservations holding minimum funds for final Lead review, spending reconciliation distinguishing reported vs estimated spend, and sliding-window RPM/TPM rate limiting. Verified in `test/m3Tests.ts`.
