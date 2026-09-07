# ORCH-010 — Bounded delegation protocol, structured handoff format, and context packaging

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-006, ORCH-007, ORCH-009 |
| **Blocks** | ORCH-011, ORCH-012 |
| **Labels** | `delegation`, `handoff`, `worker`, `context`, `m2` |
| **Milestone** | M2 — Lead and worker |

## Summary
Define and implement the structured delegation protocol between Lead and Worker agents, creating reproducible, bounded handoff packages that convey objectives, constraints, diffs, and exact test assertions.

## Description
Cross-agent delegation must not rely on hidden conversational state or giant chat transcript dumps. Instead, each handoff is an authoritative, immutable context artifact.

1. **Handoff Packet Structure**:
   ```typescript
   export interface DelegationPackage {
     ticketId: string;
     attemptId: string;
     objective: string;
     allowedScope: string[]; // Glob patterns of allowed files
     constraints: string[];
     sourceReferences: { path: string; hash: string }[];
     baseRevision: string;
     currentDiff?: string;
     failingChecks?: { command: string; output: string }[];
     openQuestions?: string[];
     allocatedBudget: { currency?: string; maxUnits: number };
     nextSuggestedAction: string;
   }
   ```

2. **Execution Scope Boundaries**:
   - The worker is restricted to editing files matching `allowedScope`.
   - The worker cannot modify project-wide configuration or escalation policies.
   - The worker returns unified diffs, test logs, and remaining budget status.

3. **Artifact Persistence**:
   - Store concise handoff records in `.agentic-kanban/runtime/handoffs/` or attached to ticket history.

## Acceptance Criteria
- [x] Structured `DelegationPackage` schema defined and validated.
- [x] Packaging engine gathers target file hashes, test command results, and constraint rules.
- [x] Worker invocation receives the structured package via runner adapter interface.
- [x] File boundary enforcement verifies worker modifications stay within `allowedScope`.
- [x] Unit tests for context packaging and boundary violation detection.

## Technical Notes
- Reuse native agent sessions when running on the same provider; perform clean artifact handoff when transferring across different providers/models.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `ContextPackager` in `src/orchestrator/context/contextPackager.ts` generating immutable `DelegationPackage` records with SHA-256 source file references and persisting them to `.agentic-kanban/runtime/handoffs/`. Implemented `DelegationProtocol` in `src/orchestrator/lead/delegationProtocol.ts` providing glob/prefix/exact pattern matching and strict file boundary enforcement over unified diffs. Verified in `test/m2Tests.ts`.
