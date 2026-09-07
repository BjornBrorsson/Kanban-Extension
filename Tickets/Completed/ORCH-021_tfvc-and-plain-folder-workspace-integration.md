# ORCH-021 — TFVC native integration and plain folder workspace integration

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P2 — General |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-007 |
| **Blocks** | ORCH-022, ORCH-023 |
| **Labels** | `tfvc`, `tfs`, `workspaces`, `enterprise`, `patches`, `m5` |
| **Milestone** | M5 — Broader workspaces and parallelism |

## Summary
Implement workspace manager adapters for Azure DevOps TFS/TFVC (shelveset support, single managed writer, baseline hashing) and plain non-git local directory workspaces.

## Description
Many enterprise teams operate in Team Foundation Version Control (TFVC) or local network share environments without Git worktree semantics.

1. **TFVC Workspace Strategy**:
   - Single managed writer per workspace to prevent edit conflicts.
   - Baseline file hash manifest generated prior to execution.
   - Outputs patches or shelvesets (`tf shelve ...`) rather than direct check-ins.
   - Preserves user pending changes and checks out files (`tf checkout`) only within assigned ticket scope.

2. **Plain Local Folder Strategy**:
   - For folders not tracked in any VCS:
     - Creates isolated snapshot copy in `.agentic-kanban/snapshots/`.
     - Generates file content hash manifest.
     - Captures unified diffs and applies changes via guarded patch application.
     - Aborts if target files were modified externally during run.

3. **Workspace Adapter Interface**:
   - Ensures `WorkspaceManager` seamlessly chooses the appropriate strategy (Git, TFVC, Plain) based on repository probe.

## Acceptance Criteria
- [x] TFVC workspace provider implemented in `src/orchestrator/workspaces/tfvcWorkspace.ts`.
- [x] Shelveset generation and single-writer lock mechanics verified for TFVC.
- [x] Plain folder snapshot provider implemented with baseline file hash checking.
- [x] Guarded patch application prevents overwriting external modifications in both strategies.
- [x] Fixture tests validating snapshotting, diff extraction, and patch application.

## Technical Notes
- Implemented `TfvcWorkspaceProvider` with single-writer mutex, scoped checkout, shelveset export, and guarded integration. Implemented `PlainFolderWorkspaceProvider` with snapshot isolation and baseline hash verification.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `TfvcWorkspaceProvider` and `PlainFolderWorkspaceProvider`. Verified snapshot isolation, shelveset creation, single-writer lock, and baseline divergence aborts in `test/m5Tests.ts`.
