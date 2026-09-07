# EXT-001 — "Copy Agent Task Prompt" clipboard button on ticket cards

| Field | Value |
|-------|-------|
| **Epic** | B — Agent & Human Interaction Ergonomics |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | S (1 day) |
| **Status** | Completed |
| **Assignee** | Antigravity CLI |
| **Depends on** | EXT-000 |
| **Blocks** | — |
| **Labels** | `clipboard`, `agent-handoff`, `prompting`, `ui` |
| **Milestone** | v0.2.0 |

## Summary
Add a one-click "Copy Task Prompt" button on each ticket card and in the ticket detail modal that copies a structured, context-rich prompt tailored for pasting into Antigravity, Cursor, Devin, Claude, or Copilot.

## Description
When humans want to hand a ticket to an AI chat agent without running a CLI command, typing out file paths, requirements, and workflow instructions is repetitive. 

This feature adds a small clipboard icon button to every ticket card and detail modal. Clicking it formats and copies:
```markdown
Please review and work on ticket **{id}: {title}** located at `{relative_path}`.

### Summary
{summary}

### Key Acceptance Criteria
- [ ] {criteria_1}
...

### Instructions
1. Inspect the codebase and execute the necessary changes.
2. Verify that all acceptance criteria are met and pass tests.
3. Record your timestamped progress under `## Work Log` in the ticket file.
4. Move the ticket to `Tickets/Completed/` once done.
```

## Acceptance Criteria
- [x] Clipboard button added to card hover actions alongside "Open File" and "Run Agent".
- [x] Clipboard button added to the ticket detail modal footer.
- [x] Toast notification appears in VS Code confirming the prompt was copied.
- [x] Prompt includes relative ticket path, title, ID, summary, and criteria.
- [x] Custom prompt template can optionally be configured in `config.md`.

## Technical Notes
- Webview sends message `{ type: 'copyAgentPrompt', ticket }` to extension host.
- Extension host uses `vscode.env.clipboard.writeText(formattedPrompt)` and `vscode.window.showInformationMessage`.

## Work Log
- **2026-09-04**: Drafted requirements and added ticket to Ready backlog.
- **2026-09-07**: Implemented "Copy Agent Task Prompt" feature across backend and webview:
  - Created `PromptFormatter` supporting default structured prompts with relative path resolution, acceptance criteria checklist, and customizable templates.
  - Added support for custom prompt templates in `ConfigParser` via `## Settings` or dedicated `## Prompt Template` sections.
  - Added clipboard button to card hover actions (`.copy-prompt-btn`) and detail modal footer (`#btnCopyPromptModal`).
  - Added `copyAgentPrompt` handler in `webviewPanel.ts` with VS Code clipboard write and information toast.
  - Hardened `AgentRunner` CLI command substitution by escaping double quotes in ticket titles.
  - Added comprehensive unit tests in `test/runParserTests.ts` covering default template, custom template, edge cases, and config parsing.
