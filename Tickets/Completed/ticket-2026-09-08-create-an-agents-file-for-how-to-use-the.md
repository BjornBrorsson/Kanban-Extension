# Create an agents file for how to use the board/tickets

| Field | Value |
|-------|-------|
| **Epic** | B — Agent & Human Interaction Ergonomics |
| **Type** | Documentation & Feature |
| **Priority** | Normal |
| **Status** | Completed |
| **Assignee** | Antigravity CLI |
| **Estimate** | S (1 day) |
| **Labels** | `agents`, `agent-rules`, `documentation`, `workflow`, `kanban` |

## Summary
Establish a comprehensive, standardized agents guidance file (`AGENTS.md` and `AGENT.md`) in the repository root and update the extension generator to instruct AI agents (Antigravity CLI, Claude Code, Cline, Devin, GitHub Copilot, Cursor, etc.) on how to read, manage, move, and resolve tickets and navigate the Agentic Kanban board.

## Requirements & Scope
1. **Repository Root Agent Rules (`AGENTS.md`)**:
   - Provide a clear, authoritative instruction manual for any AI agent working in this repository or any project using Agentic Kanban.
   - Detail the board folder layout (`Tickets/Backlog/`, `Tickets/Ongoing/`, `Tickets/Assistance Required/`, `Tickets/Blocked/`, `Tickets/Completed/`).
   - Define subfolder filter conventions (`Needs further specification/`, `Ready/`).
   - Define column guidance files (`Whatwhy.md`) and high-level architectural plans (`00_Plan.md`).
   - Define the standard ticket file naming convention, metadata schema (tables & YAML frontmatter), acceptance criteria format (`- [ ]`), and timestamped `## Work Log`.
   - Prescribe the step-by-step operating protocol: Discover -> Claim (`Ongoing`) -> Log Progress -> Verify -> Complete (`Completed`), plus escalation paths (`Assistance Required` / `Blocked`).
   - Explain board configuration (`config.md`), agent assignees, runner command substitution, and multi-model tier routing (`fast-discovery`, `standard-coder`, `deep-reasoner`).
   - Detail safe filesystem and Git practices (`git mv`, non-destructive edits).
2. **Compatibility & Aliasing**:
   - Provide `AGENT.md` (mirroring or linking `AGENTS.md`) to support tools expecting singular naming.
   - Provide an example `AGENTS.md` in `Example Structure/`.
3. **Extension Rule Generator (`generateAgentRules`)**:
   - Update `boardManager.ts` to recognize and default to `AGENTS.md` while gracefully respecting `AGENT.md` or `.agents/rules/kanban.md`.
   - Update UI tooltips/labels in `package.json` and `src/webviewPanel.ts` if needed.
4. **Verification & Testing**:
   - Run the full test suite (`npm test`) to verify all builds and unit/integration tests pass without regressions.
   - Verify that all criteria are checked and documented in the Work Log.

## Acceptance Criteria
- [x] Requirements specified
- [x] Implemented
- [x] Tested

## Work Log
- **2026-09-10**: Investigated ticket requirements and existing board conventions. Formulated comprehensive technical specification, board lifecycle protocol, and updated ticket with acceptance criteria.
- **2026-09-10**: Implemented `AGENTS.md` in repository root with full operating manual for AI agents; created `AGENT.md` backwards-compatibility alias and `Example Structure/AGENTS.md`; updated `BoardManager.generateAgentRules` to prefer `AGENTS.md` with fallback to `AGENT.md`; updated webview UI and command definitions. Added Test 18 in `test/runParserTests.ts` and verified 100% pass across all unit tests, integration tests, pilots, and deterministic failure matrix.
- **2026-09-10**: Verified all criteria satisfied. Moved ticket to `Completed`.

