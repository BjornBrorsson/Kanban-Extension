# ORCH-005 — Transactional runtime journal, local SQLite store, and lease manager

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-004, ORCH-002 |
| **Blocks** | ORCH-006, ORCH-007, ORCH-008, ORCH-014 |
| **Labels** | `runtime`, `journal`, `sqlite`, `leases`, `concurrency`, `m1` |
| **Milestone** | M1 — One supervised task |

## Summary
Implement the transactional runtime journal and active lease manager in `.agentic-kanban/runtime/` using an embedded SQLite database or a crash-safe append-only filesystem journal, ensuring monotonic attempt generations and single-owner workspace execution while preserving the 100% filesystem-native nature of the board.

## Description
To guarantee that cards and execution attempts never suffer from race conditions, orphaned processes, or duplicate runs after an editor restart:

1. **Storage Architecture & Boundary**:
   - **Board is strictly filesystem-native**: Cards, columns, configuration, and human-readable decisions remain 100% Markdown files. No database is ever needed to read, clone, or manage the board.
   - **Runtime store is an ephemeral execution engine**: Resides in `.agentic-kanban/runtime/` (automatically added to `.gitignore`). Uses a local SQLite store or crash-safe write-ahead log (WAL) file strictly for ephemeral runtime locks, lease expiration heartbeats, monotonic attempt generations, and crash recovery.

2. **Core Responsibilities**:
   - **Workspace Ownership**: Single runtime lock file per workspace. Only one active orchestrator process owns execution.
   - **Lease Management**: Expiring heartbeated lease tokens per attempt. A stale worker whose lease expired cannot commit results.
   - **Monotonic Generations**: Every attempt increments the generation counter for that ticket. Stale attempt results are rejected.
   - **State Machine Transitions**: Backlog → Ready → Running → Review → Done, with explicit Blocked, Failed, and Cancelled outcomes.
   - **Crash Recovery**: On startup, detect active attempts. If the runner cannot be reconnected, mark the attempt interrupted and inspect the workspace before retrying.

3. **Deterministic Authority**:
   - Runtime records are authoritative for active execution and in-flight locks; markdown remains authoritative for user intent and column location.

4. **Incremental Test Harness**:
   - Introduce the initial fake runner adapter in `test/fixtures/fakeAdapter.ts` (beginning the test infrastructure finalized in ORCH-025) to test lease expiration and state machine races reliably in automated tests.

## Acceptance Criteria
- [x] Ephemeral runtime store initialized at `.agentic-kanban/runtime/` (SQLite or crash-safe WAL journal) without introducing database dependencies to board markdown files.
- [x] Single runtime owner lock mechanism implemented with stale lock recovery.
- [x] Attempt state machine transitions enforced deterministically with audit timestamps.
- [x] Monotonic attempt generation numbers and expiring lease heartbeat system implemented.
- [x] Crash recovery routine detects interrupted runs upon extension restart.
- [x] Initial deterministic fake adapter created to verify lease expiry, race prevention, and crash recovery in automated unit tests.

## Technical Notes
- Prefer an embedded zero-dependency/WASM SQLite driver (e.g. `sql.js` or `better-sqlite3` abstraction) or an append-only JSONL WAL journal file with atomic rename guarantees.
- Board discovery and standard extension operation must never fail if the `.agentic-kanban/runtime/` directory is deleted or absent.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented crash-safe `RuntimeJournal` with atomic workspace locking (`workspace.lock`), write-ahead log (`journal.jsonl`), and startup crash recovery scanner transitioning interrupted runs to `Interrupted`. Implemented `LeaseManager` tracking active attempt leases, monotonic generation increments, heartbeat renewals, and stale worker rejection. Implemented initial `FakeDeterministicAdapter` in `test/fixtures/fakeAdapter.ts` to simulate runs, delays, failures, and cancellation. Verified via `test/m1Tests.ts`.
