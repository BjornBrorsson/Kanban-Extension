# ORCH-018 — Headless runtime daemon and standalone CLI client

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-005, ORCH-017 |
| **Blocks** | ORCH-020 |
| **Labels** | `daemon`, `cli`, `headless`, `persistence`, `m4` |
| **Milestone** | M4 — Overnight queues |

## Summary
Decouple the orchestrator runtime into a headless local daemon process with a standalone CLI client (`kanban-orch` / `agy-kanban`), allowing execution queues to persist when VS Code is closed.

## Description
Long-running agent workflows and overnight batches should not terminate abruptly just because a user closes their IDE or restarts VS Code.

1. **Decoupled Architecture**:
   - The runtime engine runs as a lightweight local Node.js process.
   - IPC via local HTTP server bound strictly to `127.0.0.1` with a cryptographically generated bearer auth token.
   - The VS Code extension connects to this daemon as a client. If the extension is opened while the daemon is running, it connects and renders live execution immediately.

2. **Standalone CLI Client**:
   - Commands:
     - `kanban-orch status`: Display active queues, attempts, leases, and spent budgets.
     - `kanban-orch run [--board <path>]`: Start scheduler loop.
     - `kanban-orch pause`: Pause queue.
     - `kanban-orch resume`: Resume queue.
     - `kanban-orch cancel <ticketId> [attemptId]`: Cancel active attempt.
     - `kanban-orch review <ticketId>`: Display diff and verification logs.

3. **Lifecycle Management**:
   - Extension can automatically start the daemon on demand or shut it down when configured.

## Acceptance Criteria
- [x] Core orchestrator runtime packaged as a standalone headless Node.js daemon.
- [x] Local IPC channel (Named Pipe / Domain Socket / HTTP on 127.0.0.1) implemented with authentication token.
- [x] Standalone CLI executable created with status, queue control, and review commands.
- [x] VS Code extension attaches seamlessly to running daemon without restarting active tasks.
- [x] Clean graceful shutdown handling SIGINT and SIGTERM.

## Technical Notes
- Implemented `OrchestratorDaemon` in `src/orchestrator/daemon/orchestratorDaemon.ts`, `DaemonClient` in `src/orchestrator/daemon/daemonClient.ts`, and CLI entrypoint in `src/orchestrator/cli/orchestratorCli.ts`. Ephemeral auth token and port persisted in `.agentic-kanban/runtime/daemon.json`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `OrchestratorDaemon` HTTP IPC server with bearer token auth, `DaemonClient` for remote connection, and `runCli` standalone CLI tool supporting `status`, `run`, `pause`, `resume`, `cancel`, and `review`. Verified via `test/m4Tests.ts`.
