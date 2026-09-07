# ORCH-016 — Cancellation guarantees, fault recovery, and crash resilience

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-005, ORCH-006, ORCH-014 |
| **Blocks** | ORCH-017, ORCH-018 |
| **Labels** | `cancellation`, `recovery`, `fault-tolerance`, `crashes`, `m3` |
| **Milestone** | M3 — Policy and budget reliability |

## Summary
Implement robust process cancellation with confirmed termination verification, crash detection upon startup, and safe recovery of interrupted attempts without duplicate external execution.

## Description
In distributed and local AI agent execution, cancellation requests often fail or leave orphaned subprocesses burning tokens in the background.

1. **Cancellation Protocol**:
   - `cancelAttempt()` sends immediate termination signal (SIGTERM, followed by SIGKILL / process tree kill if not stopped within 3 seconds).
   - Polls and asserts process termination before declaring cancellation complete.
   - If cancellation cannot be confirmed, marks attempt as `CancellationUnconfirmed` and retains reserved budget until manual or OS verification.
   - Never start a replacement writer if previous writer termination is unconfirmed!

2. **Crash & Restart Recovery**:
   - When the extension or runtime boots:
     - Scan SQLite journal for attempts marked `Running`.
     - Check if the recorded process PID is still alive and belongs to the runner.
     - If runner supports session reconnect, attempt reconnection.
     - If not reconnectable, mark attempt `Interrupted`.
     - Inspect workspace worktree: capture any uncommitted diff as a crash artifact.
     - **Never blindly retry a potentially executed external side-effect** (e.g. Git push, external API mutation).

3. **Stale Lease Invalidation**:
   - Heartbeat leases that expired during editor shutdown are revoked immediately.

## Acceptance Criteria
- [x] Cross-platform process termination tree killer implemented with confirmation verification.
- [x] Cancellation UI reports confirmed vs unconfirmed termination status.
- [x] Startup recovery scans active journal records, inspects worktrees, and transitions interrupted attempts safely.
- [x] Safe guard prevents starting a second writer when previous process termination is unconfirmed.
- [x] Test harness simulating mid-run SIGKILL, power loss, and unkillable process timeouts verifies no lost committed state, duplicate dispatch, stale-result acceptance, or overwrite of user changes.

## Technical Notes
- Implement process inspection using native OS process table queries (`tasklist` on Windows, `ps` on POSIX).

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `CancellationController` in `src/orchestrator/core/cancellationController.ts` with process tree killing, PID death polling verification (`tasklist` on Windows, `kill -0` on POSIX), automatic budget reservation release on confirmed termination, and retention on unconfirmed termination. Verified the failure invariant: *"Injected crashes cause no lost committed state, duplicate dispatch, stale-result acceptance, or overwrite of user changes."* Tested in `test/m3Tests.ts`.
