# AGENTS.md — Agentic Kanban Operating Rules

> **Target Audience**: AI Agents (Antigravity CLI, Claude Code, Cline, Devin, GitHub Copilot, Cursor, Aider, OpenHands) and human collaborators.

---

## 1. Core Philosophy: Filesystem as Single Source of Truth

This project uses **Agentic Kanban** for all task tracking, roadmaps, and execution coordination.
- **No Database / No Proprietary APIs**: The board is 100% native filesystem directories and Markdown files.
- **Designed for Agents First, Humans Second**: As an AI agent, you can discover, inspect, claim, update, and finalize tasks using standard file and git commands (`view_file`, `replace_file_content`, `git mv`).
- **Real-Time Synchronized**: Moving or updating Markdown files on disk instantly updates the VS Code extension UI via `FileSystemWatcher`.

---

## 2. Directory Structure & Board Organization

The board root is located at `Tickets/`.

```text
Tickets/
├── 00_Plan.md                   <-- High-level roadmap, epics, architecture vision
├── config.md                    <-- Team config (assignees, runners, multi-model routing)
│
├── Backlog/                     <-- Planned work (unclaimed)
│   ├── Whatwhy.md               <-- Column guidance
│   ├── Needs further specification/ <-- Draft tickets needing requirements refinement
│   └── Ready/                   <-- Fully specified tickets ready for immediate pickup
│
├── Ongoing/                     <-- Active tasks currently in progress
│   └── Whatwhy.md
│
├── Assistance Required/         <-- Blocker requiring human review, credentials, or answers
│   └── Whatwhy.md
│
├── Blocked/                     <-- Work halted due to dependencies or external issues
│   └── Whatwhy.md
│
└── Completed/                   <-- Verified, finished tickets with checked criteria
    └── Whatwhy.md
```

---

## 3. Standard Agent Operating Protocol

1. **Discover & Inspect**: Check `Tickets/Backlog/` (or `Tickets/Backlog/Ready/`). Verify all prerequisite tickets listed in `| **Depends on** |` are already in `Tickets/Completed/`.
2. **Claim the Ticket**:
   - Move the ticket into `Tickets/Ongoing/` (`git mv Tickets/Backlog/Ready/ticket.md Tickets/Ongoing/`).
   - Set `| **Status** | Ongoing |` and `| **Assignee** | <YourName> |` in the metadata table.
   - Add initial timestamped entry under `## Work Log`.
3. **Specify Requirements (if needed)**:
   - Flesh out `## Summary`, technical specifications, and checkbox criteria (`- [ ]`).
4. **Implement within Bounded Scope**:
   - Write clean, targeted code that fulfills the acceptance criteria.
5. **Verify & Test**:
   - Run the project's test suite and verification commands.
   - Check off each criterion (`- [x]`) as verified.
6. **Blockers & Assistance**:
   - If human input or credentials are needed, move ticket to `Tickets/Assistance Required/` and log details.
   - If blocked by another ticket, move to `Tickets/Blocked/` and log details.
7. **Finalize & Complete**:
   - Move ticket to `Tickets/Completed/`.
   - Update metadata table: `| **Status** | Completed |`.
   - Add final closing entry in `## Work Log`.
