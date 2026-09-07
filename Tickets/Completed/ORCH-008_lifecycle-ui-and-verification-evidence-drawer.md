# ORCH-008 — Lifecycle UI, card attempt state, and verification evidence drawer

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-005, ORCH-006, ORCH-007 |
| **Blocks** | ORCH-009, ORCH-012 |
| **Labels** | `ui`, `webview`, `drawer`, `evidence`, `diff`, `m1` |
| **Milestone** | M1 — One supervised task |

## Summary
Enhance the Webview Kanban board with live execution badges, attempt status indicators, spend/reserve tracking, and an expandable ticket drawer displaying patch diffs, test logs, and verification evidence.

## Description
Humans must be able to observe, inspect, and intervene in agent execution without needing to read raw terminal dumps or parse conversation logs.

1. **Card Visual Enhancements**:
   - Role / Provider badge (e.g. `Lead: Claude 3.7`, `Worker: Gemma 4 / Ollama`).
   - Live Attempt State badge (`Ready`, `Running Attempt #2`, `Review`, `Failed`, `Blocked`).
   - Budget indicator: Spent vs Reserved vs Unknown currency / token counts.
   - Last meaningful event summary (e.g. "Running test suite", "Patch generated (3 files)").

2. **Ticket Evidence Drawer / Modal**:
   - **Plan Tab**: Structured task breakdown and acceptance criteria.
   - **Diff Tab**: Syntax-highlighted unified diff of generated changes against the baseline.
   - **Verification Tab**: Execution log of test/build commands, exit codes, and timestamps.
   - **Decisions & Handoffs Tab**: Chronological list of lead/worker handoffs and architectural decisions.

3. **Interactive Actions**:
   - "Review Patch", "Apply to Main", "Retry from Checkpoint", "Cancel Attempt", "Escalate".

## Acceptance Criteria
- [x] Card UI updated to render live attempt indicators and provider badges.
- [x] Ticket detail drawer/modal updated with Diff viewer, Verification tab, and Decisions tab.
- [x] Webview receives real-time execution events from the orchestrator runtime.
- [x] Visual distinction between Managed runs (verified evidence) and Assisted runs (unverified).
- [x] Responsive UI styling consistent with existing dark/light VS Code theme variables.

## Technical Notes
- Implement lightweight diff rendering in `src/webview/app.js` or via standard diff HTML formatting.
- Ensure state updates from the extension host do not cause UI stutter or loss of card scroll position.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Enhanced Webview Kanban cards and detail drawer in `src/webview/app.js` and `src/webview/styles.css`. Added card attempt badges with tier indication (`[managed]` vs `[assisted]`), live status coloring (`Running`, `Review`, `Failed`, `Interrupted`), and an Evidence & Verification section in the ticket drawer displaying patch diffs with syntax line coloring (`.diff-add`, `.diff-del`), verification command output logs, failure reasons, and action buttons (`Apply Patch`, `Retry Attempt`). Verified build and asset synchronization via `npm run build`.
