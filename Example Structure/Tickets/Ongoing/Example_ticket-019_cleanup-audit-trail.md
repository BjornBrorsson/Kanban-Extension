# DEMO-019 — Cleanup + audit-trail framework (track + verify mutations)

| Field | Value |
|-------|-------|
| **Epic** | C — Test Data, Isolation & Cleanup |
| **Type** | Data Integrity |
| **Priority** | P0 — Critical |
| **Estimate** | L (4–6 days) |
| **Status** | Ongoing |
| **Depends on** | DEMO-010, DEMO-016 |
| **Blocks** | DEMO-038, DEMO-040 |
| **Labels** | `cleanup`, `audit`, `data-integrity` |
| **Milestone** | M1 |

## Summary
Record data mutations made during test runs and background executions, verify that cleanup routines run, and maintain a structured audit trail.

## Description
Each worker reports audit records `{operation, table, key, beforeState, afterState}`. The framework persists them to a structured audit store, executes cleanup routines after each run, and verifies that temporary records were removed. Any run that leaves residue triggers a warning.

## Acceptance Criteria
- [ ] Mutations captured with before/after state into the audit log.
- [ ] Cleanup step executed per task; cleanup runs even if earlier assertions fail.
- [ ] Post-cleanup verification validates that temporary test records are removed.
- [ ] Audit summary survives the run and is inspectable in dashboard reports.
- [ ] Works in both ephemeral in-memory and persistent filesystem modes.

## Technical Notes
- Implement snapshot-based verification around stateful operations.
- Ensure teardown routines handle partially initialized state gracefully.

## Definition of Done
A task that creates and deletes entities produces a complete audit log and passes cleanup verification; leftover state is flagged.

## Work Log
- Implemented core audit event logger and in-memory buffer.
- Added teardown verification hooks.
- Currently testing residue detection across edge-case failure scenarios.

## Completion Summary
