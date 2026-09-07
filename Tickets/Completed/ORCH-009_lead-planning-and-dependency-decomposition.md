# ORCH-009 — Lead agent planning session and dependency graph decomposition

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | L (3 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-008 |
| **Blocks** | ORCH-010 |
| **Labels** | `lead`, `planning`, `decomposition`, `dependencies`, `m2` |
| **Milestone** | M2 — Lead and worker |

## Summary
Implement the frontier lead planning session protocol: analyze ticket requirements and repository context, generate subtask tickets with acceptance criteria, and construct an explicit dependency graph.

## Description
Following the Cognition Fusion paradigm, high-capability frontier models should focus on architecture, decomposition, constraints, and review, while economical models handle bounded code edits.

1. **Lead Session Responsibilities**:
   - Ingest high-level user goal or ticket description.
   - Inspect relevant repository files, architecture notes, and build/test commands.
   - Decompose complex goals into discrete, bounded subtasks.
   - Generate rigorous, machine-verifiable acceptance criteria for each subtask.
   - Populate `Depends on` and `Blocks` relationships between cards.

2. **Decomposition Safeguards**:
   - Limit decomposition depth (e.g. max depth 2) to prevent unbounded recursive ticket generation.
   - Enforce total planning budget ceiling before delegating.
   - Detect circular dependencies before creating tickets.

3. **Output Artifact**:
   - Creates durable markdown ticket cards in the board's `Backlog/` folder.
   - Links tickets to parent epic/goal.

## Acceptance Criteria
- [x] Lead planning prompt and protocol implemented in `src/orchestrator/lead/`.
- [x] Automated generation of child tickets with frontmatter and acceptance criteria checklist.
- [x] Dynamic resolution and cycle-checking of `Depends on` / `Blocks` relationships.
- [x] UI command "Plan Ticket with Lead Agent" wired to extension palette and card context menu.
- [x] Safeguards against recursive runaways (max subtasks and token cap).

## Technical Notes
- Lead runs in read-only mode during planning; it does not directly modify source code outside ticket markdown authoring.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `LeadPlanningEngine` in `src/orchestrator/lead/planningSession.ts`. Added DFS cycle-checking with path reporting, safety limits on maximum subtask decomposition, cross-linking of `Depends on` and `Blocks`, and automated writing of Markdown ticket cards to board `Backlog/` folders compatible with `TicketParser`. Verified in `test/m2Tests.ts`.
