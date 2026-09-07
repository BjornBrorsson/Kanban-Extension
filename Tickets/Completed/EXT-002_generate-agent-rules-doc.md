# EXT-002 — Auto-generate AGENT.md / system rules for the workspace

| Field | Value |
|-------|-------|
| **Epic** | B — Agent & Human Interaction Ergonomics |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | S (1 day) |
| **Status** | Completed |
| **Depends on** | EXT-000 |
| **Blocks** | — |
| **Labels** | `agent-rules`, `agent-md`, `scaffolding`, `ai-native` |
| **Milestone** | v0.2.0 |

## Summary
Add a command and UI button to generate or update an `AGENT.md` (or `.agents/rules/kanban.md`) file in the workspace root, instructing any connected AI agent on how to interact with the Kanban board.

## Description
AI agents (Devin, Antigravity, Claude Code, Cursor) automatically read root files such as `AGENT.md` or `.agents/rules/` to understand project operating rules. 

This feature introduces:
- Command: `Agentic Kanban: Generate Agent Rules (AGENT.md)`
- A button in the board navigation bar next to "Plan" and "Config".
- It inspects the current board's columns and generates instructions tailored to the board's actual directory names:
  - Explains where tickets are located.
  - Instructs how to move tickets to `Ongoing/` when starting work.
  - Instructs how to record entries in `## Work Log`.
  - Instructs how to check off acceptance criteria and move tickets to `Completed/` upon verification.
  - Explains that if blocked, move the ticket to `Assistance Required/` or `Blocked/` with details.

## Acceptance Criteria
- [x] Command `agenticKanban.generateAgentRules` registered.
- [x] Generates clean, token-efficient Markdown instructions matching the board's columns.
- [x] Prompts user if `AGENT.md` already exists to confirm overwrite or append.
- [x] Also supports writing to `.agents/rules/kanban.md` if an `.agents/` folder exists.
- [x] UI button in the Webview header triggers rule generation.

## Work Log
- **2026-09-04**: Drafted requirements and added ticket to Ready backlog.
- **2026-09-07**: Registered `agenticKanban.generateAgentRules` command, added header UI button in webview, added column-aware Markdown generator supporting root `AGENT.md` and `.agents/rules/kanban.md` with overwrite/append confirmation prompt.
