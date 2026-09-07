# ORCH-012 — Independent deterministic verification and fresh lead review step

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-008, ORCH-010, ORCH-011 |
| **Blocks** | ORCH-017, ORCH-024, ORCH-026 |
| **Labels** | `verification`, `lead`, `review`, `testing`, `evidence`, `m2` |
| **Milestone** | M2 — Lead and worker |

## Summary
Implement deterministic runtime verification commands and an independent fresh lead review step to guarantee that no ticket can be completed based solely on self-reported model claims.

## Description
A core tenet of the AI Orchestrator is: **A persuasive model response must never bypass a configured check or mark an unverified change complete.**

1. **Independent Verification Step**:
   - The runtime (not the model) independently executes the configured verification commands (e.g. `npm test`, `npm run build`, `pytest`, linter).
   - Exit codes, stdout, stderr, and tested commit/revision SHAs are captured in the immutable evidence store.
   - Any source code modifications automatically invalidate prior verification evidence.

2. **Fresh Lead Review Step**:
   - Once automated tests pass, a fresh Lead agent session (unpolluted by the worker's chat history) is launched to perform code review.
   - The Lead compares the generated patch against:
     - Ticket requirements and original acceptance criteria.
     - Project architectural conventions and code quality guidelines.
     - Potential regression risks or edge-case omissions.
   - Lead produces a concise review decision record (Approved / Changes Requested).

3. **Gating Human Review**:
   - Only tickets with both passing automated verification and an Approved lead review enter the `Review` column awaiting final human acceptance.

## Acceptance Criteria
- [x] Runtime-managed verification runner executes build/test scripts independently of the agent subprocess.
- [x] Evidence records link exact file revisions, executed commands, and raw exit codes.
- [x] Fresh Lead review protocol analyzes diff and acceptance criteria fulfillment.
- [x] Automated transition to `Review` column upon successful verification and lead approval.
- [x] Guard preventing cards from being marked `Done` without passing verification evidence.
- [x] Unit tests for verification execution and evidence invalidation on file modification.

## Technical Notes
- Store verification evidence in `.agentic-kanban/runtime/evidence/{attemptId}.json`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `ReviewManager` in `src/orchestrator/review/reviewManager.ts`. Added independent verification command runner capturing immutable evidence in `.agentic-kanban/runtime/evidence/`, fresh lead review protocol evaluating diffs against each acceptance criterion and checking regression markers, and a hard gating guard (`canTransitionToDone`) requiring both passing verification and approved lead review before entering `Review`/`Done`. Verified in `test/m2Tests.ts`.
