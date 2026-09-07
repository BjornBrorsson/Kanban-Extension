# ORCH-001 — Inspect source, config, and dispatch baseline for orchestration compatibility

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Architecture / Spike |
| **Priority** | P0 — Critical |
| **Estimate** | S (1 day) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | EXT-000, EXT-001 |
| **Blocks** | ORCH-002, ORCH-003, ORCH-004 |
| **Labels** | `orchestrator`, `audit`, `compatibility`, `m0` |
| **Milestone** | M0 — Compatibility and contracts |

## Summary
Perform a comprehensive audit of existing extension source code, config parsing, ticket parsing, and CLI/IDE dispatch mechanisms to establish integration boundaries and guarantee 100% backward compatibility for existing boards.

## Description
The expansion of Agentic Kanban into an AI Orchestrator requires establishing an execution runtime around existing foundations (filesystem folders as columns, Markdown tickets, `config.md`, direct CLI/IDE dispatch).

Before introducing any orchestration code, we must inspect:
1. `src/configParser.ts`: How markdown headings and tables are parsed, and how settings and runner commands are extracted.
2. `src/ticketParser.ts`: How frontmatter, tables, checklists, and metadata are extracted and updated.
3. `src/boardDiscovery.ts` & `src/boardManager.ts`: How boards, columns, and subfolders are scanned and watched.
4. `src/agentRunner.ts`: How CLI commands and IDE chat actions are dispatched.

Orchestration must be strictly opt-in on a per-board basis. Existing boards with no orchestration settings in `config.md` must continue to behave exactly as they do today.

## Acceptance Criteria
- [x] Audit report document drafted detailing current parser behaviors, data structures, and dispatch lifecycles.
- [x] Boundary interfaces defined between extension host UI and the new headless runtime (`src/orchestrator/types.ts`).
- [x] Verification that existing boards without orchestration settings load without warnings, errors, or behavioral changes.
- [x] Baseline test cases added to `test/` verifying backward compatibility with standard boards.

## Technical Notes
- Follow internal module layout design: `orchestrator/core`, `orchestrator/config`, `orchestrator/adapters`, `orchestrator/policy`, `orchestrator/workspaces`, `orchestrator/context`.
- Ensure no hard dependency on VS Code API is introduced inside the core orchestrator modules.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Completed architecture audit across extension host and parser subsystems. Established decoupled headless type definitions in `src/orchestrator/types.ts` without `vscode` imports. Verified that existing non-orchestrated boards load with zero regressions.
