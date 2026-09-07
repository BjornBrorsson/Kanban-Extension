# ORCH-006 — First managed runner adapter and assisted dispatch bridge

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-003, ORCH-005 |
| **Blocks** | ORCH-008, ORCH-010, ORCH-016 |
| **Labels** | `adapters`, `runners`, `managed`, `assisted`, `m1` |
| **Milestone** | M1 — One supervised task |

## Summary
Implement the first genuine managed runner adapter capable of supervised execution, process monitoring, and structured patch extraction, alongside an assisted bridge for existing CLI/IDE templates.

## Description
To run an honest end-to-end loop without relying on manual copy-pasting, we need at least one managed adapter that satisfies the full `RunnerAdapter` contract:

1. **Selection of First Managed Adapter**:
   - Based on capability probes from ORCH-003 (e.g. Cline headless CLI or Copilot CLI or an Antigravity/Aider subprocess with streaming JSON-RPC / stdout event parsing).
   - Must support process observation, exit code tracking, cancellation signal propagation, and structured patch/artifact collection.

2. **Assisted Dispatch Bridge**:
   - For runners that only launch a terminal or open an IDE chat tab (such as `workbench.action.chat.open`), wrap them in an `AssistedBridgeAdapter`.
   - The UI and runtime explicitly display these as "Assisted / Awaiting Report".
   - Assisted runs are barred from unattended overnight execution and do not masquerade as verified supervised runs.

3. **Execution Context**:
   - Pass ticket objective, constraints, working tree path, and lease token into the runner invocation.

## Acceptance Criteria
- [x] First managed runner adapter implemented and verified on local machine.
- [x] Process start, stdout/stderr event streaming, error capture, and clean exit detection implemented.
- [x] Cancellation method implemented that terminates runner subprocess trees reliably.
- [x] Assisted bridge adapter implemented for legacy CLI/IDE chat templates.
- [x] Integration tests verifying lifecycle events, process termination, and structured output capture.

## Technical Notes
- Implement cross-platform process tree killing (e.g. `tree-kill` or native Windows `taskkill /pid ... /T /F`).
- Keep runner processes isolated from the VS Code extension host process.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `ManagedProcessAdapter` in `src/orchestrator/adapters/managedProcessAdapter.ts` supporting full subprocess spawning, PID tracking, live stdout/stderr event streaming, output capture, and cross-platform process tree termination (`taskkill` on Windows, `SIGTERM/SIGKILL` on POSIX). Implemented `AssistedBridgeAdapter` in `src/orchestrator/adapters/assistedBridgeAdapter.ts` for unmanaged terminal/IDE actions with explicit manual completion semantics. Integrated `FakeDeterministicAdapter` for deterministic CI execution. Verified via `test/m1Tests.ts`.
