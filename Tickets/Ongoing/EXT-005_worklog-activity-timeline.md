# EXT-005 — Multi-Board "Work Log" live activity timeline

| Field | Value |
|-------|-------|
| **Epic** | D — Overview & Team Visibility |
| **Type** | Feature |
| **Priority** | P2 |
| **Estimate** | M (2 days) |
| **Status** | Ongoing |
| **Depends on** | EXT-000 |
| **Blocks** | — |
| **Labels** | `work-log`, `timeline`, `audit-trail`, `multi-board` |
| **Milestone** | v0.2.0 |

## Summary
Add an aggregated chronological "Work Log / Audit Trail" timeline feed in the Multi-Board Overview tab, parsing dated work log entries from all tickets across the workspace.

## Description
When multiple AI agents and humans are working across different boards, the user needs a quick daily audit trail of what was done without inspecting every individual markdown file.

Every ticket typically contains:
```markdown
## Work Log
- **2026-09-04**: Implemented RPC parameter fix...
- **2026-09-03**: Ran unit test suite...
```

This feature:
1. Scans `## Work Log` across all tickets during board scanning.
2. Extracts dated items with ticket ID, board name, and entry text.
3. Renders a modern, timeline feed in the **Workspace Overview**:
   - Filterable by date (Today, Yesterday, Past 7 Days).
   - Filterable by Board or Assignee.
   - Clickable entries that open the corresponding ticket.

## Acceptance Criteria
- [ ] Parser extracts dated entries from `## Work Log` sections.
- [ ] `MultiBoardOverview` data structure includes `recentWorkLogs: WorkLogEntry[]`.
- [ ] Overview dashboard displays a "Workspace Activity Feed" section below the Parallel Work grid.
- [ ] Each entry displays: Date, Board Name, Ticket Title/ID, and Log Snippet.
- [ ] Clicking an entry opens the markdown file at the work log line.

## Work Log
- **2026-09-04**: Drafted requirements and added ticket to Ready backlog.
