# ORCH-004 — Durable task and attempt data model, frontmatter schema, and migration utility

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-001 |
| **Blocks** | ORCH-005, ORCH-007 |
| **Labels** | `tickets`, `frontmatter`, `schema`, `attempts`, `m0` |
| **Milestone** | M0 — Compatibility and contracts |

## Summary
Design and implement the durable task and attempt data model, extending markdown tickets with optional versioned frontmatter while maintaining strict separation between tickets and execution attempts.

## Description
A single ticket may undergo multiple execution attempts across different agents, models, and checkpoints. The data model must reflect this separation:

1. **Ticket (Authoritative User Intent)**:
   - Resides in Markdown inside column folders.
   - Frontmatter fields (optional): `id`, `parentId`, `dependsOn`, `blocks`, `priority`, `rolePreference`, `policyProfile`, `allowedScope`.
   - Unknown fields must be preserved verbatim.
   - Existing tickets without IDs gain stable IDs only via explicit migration or first managed run.

2. **Attempt (Authoritative Runtime Execution)**:
   - Ephemeral/transactional execution record stored in `.agentic-kanban/runtime/`.
   - Fields: `attemptId`, `ticketId`, `ticketRevision`, `baseRevision` / `contentManifest`, `agentId`, `leaseToken`, `timestamps`, `budgetReservations`, `outcome` (`InProgress`, `Completed`, `Blocked`, `Failed`, `Cancelled`), `patch`, `evidence`, `handoff`.

3. **Reconciliation**:
   - Markdown remains authoritative for workflow location and human intent.
   - Runtime records are authoritative for active execution and leases.
   - Moving a card into `Done` while an attempt is running triggers reconciliation rather than falsely marking unverified work complete.

4. **Runtime Durability Invariant**:
   - The runtime store in `.agentic-kanban/runtime/` is durable across crashes, uncommitted to version control, and never wiped while active attempts or recovery obligations exist.

## Acceptance Criteria
- [x] Frontmatter parser and serializer updated to handle orchestration metadata while preserving unknown keys and markdown formatting.
- [x] TypeScript interfaces created for `Task`, `AttemptRecord`, `AttemptManifest`, and `BudgetReservation`.
- [x] Safe migration utility created to generate stable IDs for unnumbered legacy tickets on demand (`src/orchestrator/models/migration.ts`).
- [x] Reconciliation logic designed for state disagreements between filesystem column moves and active runtime attempts.
- [x] Unit tests for parsing, serialization, and migration safety.

## Technical Notes
- Implement non-destructive AST-based or regex-anchored frontmatter updates so comments and user styling remain intact.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `TicketAttemptManager` in `src/orchestrator/models/ticketAttempt.ts` and `TicketMigrationUtility` in `src/orchestrator/models/migration.ts`. Designed attempt manifest generation, crash-safe atomic attempt record storage, and non-destructive legacy ticket ID assignment preserving markdown formatting and comments. Verified via `test/m0Tests.ts`.
