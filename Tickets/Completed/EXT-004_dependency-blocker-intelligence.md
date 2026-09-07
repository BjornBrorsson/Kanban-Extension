# EXT-004 — Dependency & blocker intelligence (Depends on / Blocks)

| Field | Value |
|-------|-------|
| **Epic** | C — Workflow Intelligence & Safety |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2–3 days) |
| **Status** | Completed |
| **Depends on** | EXT-000 |
| **Blocks** | — |
| **Labels** | `dependencies`, `blockers`, `graph`, `badges` |
| **Milestone** | v0.2.0 |

## Summary
Add dependency resolution and blocker warning badges to ticket cards based on `| **Depends on** |` and `| **Blocks** |` table fields.

## Description
Many tickets specify dependencies on prior tasks (e.g. `Depends on: EXT-000, EXT-001`). 
If a ticket is in `Backlog` or `Ongoing`, but its dependencies are **not yet in `Completed`**:
1. Render an amber or red **"Blocked by EXT-000"** badge on the ticket card.
2. Hovering or clicking the badge displays a popover showing the status of the blocking tickets.
3. In the ticket detail modal, render clickable links to jump directly to the blocking tickets.
4. Highlight circular dependencies if detected.
5. In the Multi-Board Overview, add a "Dependency Warnings" metric or filter.

## Acceptance Criteria
- [x] Board model builds a lookup map of all ticket IDs -> current column.
- [x] Ticket cards display a warning badge when any ticket in `dependsOn` is not in a completed column.
- [x] Hovering over the badge shows which specific tickets are unfinished.
- [x] Detail modal provides clickable links to inspect dependency tickets.
- [x] Agent prompt generator warns if trying to dispatch an agent on a blocked ticket.

## Work Log
- **2026-09-04**: Drafted requirements and added ticket to Ready backlog.
- **2026-09-07**: Added cross-board dependency resolution in `boardDiscovery.ts`, populated `ticket.unresolvedDependencies`, rendered blocker warning badges (`⛔ Blocked`) on ticket cards with hover tooltips, rendered clickable dependency chips and circular blocker warnings in detail modal, and injected prerequisite warnings into agent task prompt.
