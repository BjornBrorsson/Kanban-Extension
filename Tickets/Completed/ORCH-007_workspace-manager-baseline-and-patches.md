# ORCH-007 — Workspace manager: baseline hashing, snapshotting, and guarded patch integration

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-004, ORCH-005 |
| **Blocks** | ORCH-008, ORCH-010, ORCH-021, ORCH-022 |
| **Labels** | `workspaces`, `git`, `worktrees`, `patches`, `safety`, `m1` |
| **Milestone** | M1 — One supervised task |

## Summary
Build the core Workspace Manager abstraction (`baseline`, `allocate`, `diff`, `verify`, `integrate`) to guarantee that agents edit in isolated workspaces without ever overwriting or destroying user WIP.

## Description
A cardinal requirement is: **Never reset or overwrite the user's working tree, and never lose uncommitted WIP.**

The Workspace Manager must provide:
1. **Workspace Lifecycle Interface**:
   - `baseline()`: Compute content hashes / Git commit SHA of the starting state.
   - `allocate()`: Prepare an isolated execution workspace.
   - `diff()`: Capture the unified diff / patch between the baseline and the current attempt output.
   - `verify()`: Run verification commands against the workspace.
   - `integrate()`: Safely merge or apply the patch to the target branch.

2. **Git & Dirty WIP Handling**:
   - **Clean Git**: Create an isolated Git worktree or branch for managed editing.
   - **Dirty / Unpushed Git**: Explicitly snapshot the selected working state (including intended untracked files) and record its manifest hash. Never assume a clean HEAD worktree contains uncommitted user edits!
   - **Plain Local Folder**: Create an isolated snapshot copy with baseline file hashes.

3. **Guarded Patch Application**:
   - Before applying a patch to the main workspace, verify that the target files still match their expected baseline hashes.
   - If the user or another process touched the files during the run, pause integration and report the conflict.

## Acceptance Criteria
- [x] `WorkspaceManager` interface and Git implementation created.
- [x] Snapshotting mechanism for dirty/untracked files with manifest hashing implemented.
- [x] Isolated worktree creation and cleanup implemented.
- [x] Guarded patch application verifies target baseline match before applying changes.
- [x] Conflict detection pauses integration safely without corrupting files.
- [x] Unit and fixture tests simulating clean Git, dirty Git, and conflict divergence.

## Technical Notes
- Implement in `src/orchestrator/workspaces/`.
- Ensure all temporary worktrees and patch files reside in ignored paths (e.g. `.agentic-kanban/worktrees/`).

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `WorkspaceManager` in `src/orchestrator/workspaces/workspaceManager.ts`. Added support for Git repository detection, worktree allocation, file snapshotting with SHA-256 baseline hashing, independent test/verification command runner (`verify`), unified diff generation (`diff`), and guarded patch integration (`integrate`). Verified that external edits to baseline files during execution trigger conflict aborts without touching or corrupting user working trees. Tested in `test/m1Tests.ts`.
