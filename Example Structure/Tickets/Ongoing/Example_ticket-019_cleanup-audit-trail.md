# ATF-019 — Cleanup + audit-trail framework (track + verify mutations)

| Field | Value |
|-------|-------|
| **Epic** | C — Test Data, Isolation & Cleanup |
| **Type** | Runner / Data Integrity |
| **Priority** | P0 — Critical |
| **Estimate** | L (4–6 days) |
| **Status** | Backlog |
| **Depends on** | ATF-010, ATF-016 |
| **Blocks** | ATF-038, ATF-040 |
| **Labels** | `cleanup`, `audit`, `data-integrity` |
| **Milestone** | M1 |

## Summary
Record every data mutation a test makes (and its cleanup), then verify cleanup actually happened — satisfying "insert/update, clean up afterwards, leave an audit trail."

## Description
Each executor reports `audit[]` entries `{op, table, key, before, after}`. The framework persists them to `C000000_ATF_Audit`, runs the test's cleanup, then verifies the touched keys are gone/restored. A test that leaves residue is flagged.

## Acceptance Criteria
- [ ] Mutations captured with before/after into the `Audit` table.
- [ ] Cleanup step per test; cleanup runs even if asserts failed.
- [ ] Post-cleanup verification; residue → explicit warning/fail on the run.
- [ ] Audit survives the run and is viewable in the dashboard drill-in.
- [ ] Works in both ephemeral and persistent modes.

## Technical Notes
- For SD-driven writes, capture audit via SQL before/after snapshots around the step.

## Definition of Done
- A test that creates + deletes a case shows full audit and passes cleanup verification; an intentionally leaky test is flagged.

## Work Log
- **2026-07-01**: Implemented the core framework in `Atf.Runner.psm1`: `Write-AtfAudit` (persists `{op, table, key, before, after}` to `C000000_ATF_Audit`, gracefully degrading to in-memory-only when no RunId is available), `Invoke-AtfCleanupEntity` (delete by table+key), `Test-AtfCleanupVerified` (post-cleanup residue check), and `Invoke-AtfCleanupAndVerify` (orchestrates both + flags `CleanupVerified` on the audit row, skipping anything tagged `operation = 'existing'`). Wired into `Invoke-AtfSeed`. Added Pester coverage (mocked `Invoke-SQL`). Left Ongoing: no live run has exercised the delete + verify path against a real database yet, and SD-driven (non-`Invoke-AtfSeed`) mutations still need explicit self-cleaning steps per the authoring guide rather than automatic framework coverage.

## Completion Summary
