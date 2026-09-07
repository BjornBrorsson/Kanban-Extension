# ORCH-024 — Explicit knowledge layer, context cache invalidation, and outcome reporting

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P2 — General |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-012, ORCH-023 |
| **Blocks** | ORCH-026 |
| **Labels** | `knowledge`, `cache`, `invalidation`, `reporting`, `context`, `m5` |
| **Milestone** | M5 — Broader workspaces and parallelism |

## Summary
Build an explicit, lightweight repository knowledge layer with automatic revision-based cache invalidation, strict board isolation, and comprehensive outcome reporting.

## Description
Agents need context (product vision, architecture decisions, repository map, test commands, constraints, past ticket outcomes) without polluting prompts with out-of-date or cross-project data.

1. **Explicit Knowledge Store**:
   - Stores curated notes in `.agentic-kanban/context/{boardId}/`:
     - `architecture-decisions.md`
     - `repo-structure-map.json`
     - `build-test-manifest.json`
     - `completed-ticket-outcomes.jsonl`
   - Every generated note includes source file references and revision hashes/mtimes.

2. **Automatic Cache Invalidation**:
   - When files change on disk, dependent knowledge notes are automatically invalidated or flagged for refresh on the next run.
   - Prevents hallucinations based on stale code structures.

3. **Strict Board Isolation**:
   - Context is scoped strictly per board and policy profile.
   - Zero information leakage between personal projects and employer/corporate repositories.

4. **Outcome Reporting**:
   - Generates high-level execution summaries: What changed, files modified, tests verified, budget spent, and outstanding blockers.

## Acceptance Criteria
- [x] Knowledge store manager implemented in `src/orchestrator/context/`.
- [x] Revision tracking and mtime-based cache invalidation implemented.
- [x] Multi-board context isolation strictly partitions stored notes.
- [x] Outcome report generator produces clean markdown summaries for completed runs.
- [x] Unit tests for cache invalidation, isolation, and outcome generation.

## Technical Notes
- Implemented `KnowledgeStore` in `src/orchestrator/context/knowledgeStore.ts` and `OutcomeReporter` in `src/orchestrator/context/outcomeReporter.ts`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `KnowledgeStore` with mtime/hash source tracking, automatic cache invalidation on disk edits, multi-board context partitioning, outcome append log, and `OutcomeReporter` generating markdown summary reports with separated cash and subscription tracking. Verified in `test/m5Tests.ts`.
