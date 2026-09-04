# EXT-003 — Interactive checklist checkbox toggling in Kanban UI

| Field | Value |
|-------|-------|
| **Epic** | B — Agent & Human Interaction Ergonomics |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | M (2 days) |
| **Status** | Ongoing |
| **Depends on** | EXT-000 |
| **Blocks** | — |
| **Labels** | `checklists`, `acceptance-criteria`, `file-sync`, `ui` |
| **Milestone** | v0.2.0 |

## Summary
Enable clicking on acceptance criteria checkboxes in the ticket detail modal (and optionally mini expandable card checklists) to toggle `- [ ]` and `- [x]` directly in the markdown file on disk.

## Description
Currently, acceptance criteria checkboxes in the ticket detail modal are `disabled` (read-only display). 
When humans review an AI agent's work, they should be able to click any checkbox to toggle its state:
- Clicking an unchecked box changes `- [ ] Requirement` to `- [x] Requirement` in the `.md` file.
- The progress bar and count (e.g. `2/5` -> `3/5`) update immediately with optimistic local state.
- File watcher detects the change and keeps state synchronized.
- When an AI agent checks the file, it sees the human's approved criteria.

## Acceptance Criteria
- [ ] Checkboxes in `ticketDetailModal` are interactive.
- [ ] Toggling a checkbox sends `{ type: 'toggleCriterion', ticketPath, index, done }` to extension host.
- [ ] Extension host locates the Nth `- [ ]` or `- [x]` in the file and updates it in place.
- [ ] Optimistic update in UI updates the progress bar immediately without closing the modal.
- [ ] Works with criteria located in `## Acceptance Criteria` as well as arbitrary checklists in the document.

## Technical Notes
- Regex replacement should locate the exact occurrence by line or index to avoid touching unrelated checklists in description sections.

## Work Log
- **2026-09-04**: Drafted requirements and added ticket to Ready backlog.
