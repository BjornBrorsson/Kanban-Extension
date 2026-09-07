# ORCH-003 — Adapter capability probes and execution contract specification

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-001 |
| **Blocks** | ORCH-006, ORCH-019 |
| **Labels** | `adapters`, `probes`, `contracts`, `cli`, `m0` |
| **Milestone** | M0 — Compatibility and contracts |

## Summary
Define a vendor-neutral runner adapter interface with explicit capability discovery (`probe`, `start`, `observe`, `cancel`, `collectResult`) and implement honest capability tiering (`managed` vs `assisted`).

## Description
Different AI CLI tools and IDE extensions possess drastically different capabilities. We must avoid making false promises about third-party tools (e.g. inventing flags or assuming subscription access implies programmatic control).

The runner adapter contract must specify:
```typescript
export interface RunnerAdapter {
  readonly id: string;
  readonly name: string;
  readonly tier: ExecutionTier;
  probe(): Promise<AdapterCapabilities>;
  start(context: AttemptContext, onEvent?: (event: ExecutionEvent) => void): Promise<{ pid?: number; executionId: string }>;
  cancel(executionId: string): Promise<CancellationResult>;
  collectResult(executionId: string): Promise<AttemptResult>;
  resume?(executionId: string, message?: string): Promise<void>;
}
```

Two distinct integration tiers:
1. **Managed**: The runtime can observe complete process lifecycle, stream logs, detect real exits, and retrieve structured output/patches. Eligible for unattended execution when policies and budgets are enforceable.
2. **Assisted**: Dispatch launches an external terminal or IDE chat session, but cannot prove lifecycle or usage. The ticket remains awaiting reported results and manual verification.

This ticket also implements dynamic capability probes for installed tools:
- Cline CLI
- GitHub Copilot CLI
- Devin CLI
- Claude Code / Aider / Gemini CLI

## Acceptance Criteria
- [x] TypeScript contract interfaces defined in `src/orchestrator/adapters/types.ts`.
- [x] Explicit `AdapterCapabilities` model: structured output, session resumption, token/cost reporting, hard cost limit enforcement, model switching, network/tool restrictions.
- [x] Capability probe runner implemented to inspect local binaries against actual installed versions (`src/orchestrator/adapters/capabilityProbe.ts`).
- [x] UI / config diagnostics report unsupported capabilities honestly rather than failing silently.
- [x] Unit tests for probe detection and capability matrix evaluation.

## Technical Notes
- Do not invent hypothetical CLI flags. Only test against documented, verified flags of installed tools.
- Probe outputs should be cacheable with manual refresh option.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented adapter contract types in `src/orchestrator/adapters/types.ts` and automated cross-platform discovery runner in `src/orchestrator/adapters/capabilityProbe.ts`. Established honest tiering between managed and assisted runners across Cline, GitHub Copilot CLI, Devin CLI, Claude Code, Aider, and Gemini CLI. Added unit tests in `test/m0Tests.ts`.
