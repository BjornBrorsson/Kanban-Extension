# Sub-model orchestrator and dispatcher

| Field | Value |
|-------|-------|
| **Epic** | Multi-Model Routing & Subagent Harness |
| **Type** | Architecture & Feature |
| **Priority** | High |
| **Status** | Completed |
| **Assignee** | Antigravity CLI |
| **Estimate** | L (3–5 days) |
| **Labels** | `orchestrator`, `subagents`, `routing`, `models`, `budget` |

## Summary
Build a sub-model orchestrator and dispatcher harness that routes subtasks to the most cost-effective and capable model for each phase of work:
- **Fast & Cheap Models** (e.g., Gemma 4 E4B, Claude 3.5 Haiku, Gemini 2.5 Flash): Codebase discovery, file searching, symbol indexing, and simple mechanical refactors.
- **Deep Reasoning / Architectural Models** (e.g., Fable/Astra, Claude 3.7 Sonnet Thinking, Gemini 2.0 Pro): High-level decomposition, architecture planning, complex edge-case resolution, and escalations.
- **Specialized Coding Models**: Feature implementation within bounded scopes.
- **Independent Review Models**: Strict policy, regression, and security verification.

---

## Technical Specification

### 1. Model Tier Profiles in `config.md`
Define available model endpoints with capability profiles and cost classes:
```yaml
orchestration:
  enabled: true
  modelTiers:
    - id: fast-discovery
      name: Gemma 4 E4B (Local)
      model: gemma4:e4b
      provider: ollama
      costTier: free
      recommendedFor: [discovery, quick-fix]

    - id: deep-reasoner
      name: Fable / Astra (Deep Reasoning)
      model: astra-reasoning-v1
      provider: openai-compatible
      costTier: high
      recommendedFor: [architecture, escalation]

    - id: standard-coder
      name: Claude 3.7 Sonnet / Copilot
      model: claude-3-7-sonnet
      provider: anthropic
      costTier: medium
      recommendedFor: [implementation, review]
```

### 2. Subtask Routing Matrix
Configure which model tier executes each task category, with automatic fallback:
```yaml
  subtaskRouting:
    defaultTier: standard-coder
    categoryRoutes:
      discovery: fast-discovery
      architecture: deep-reasoner
      escalation: deep-reasoner
      implementation: standard-coder
      verification: standard-coder
    fallbackTier: standard-coder
```

### 3. Classification Engine (`SubtaskRouter`)
- Evaluates planned subtasks or ticket descriptions.
- Detects intent using keywords, file patterns, and labels:
  - Read-only search, grep, and file inspection ➔ `discovery`
  - High-level decomposition, schema design, cycle resolution ➔ `architecture`
  - Editing bounded source files ➔ `implementation`
  - Running test suites, diff auditing, and policy check ➔ `verification`
- Selects the target model tier while honoring `policies` (e.g. EU-only data boundary or Local-only restriction) and `budgetManager` constraints.

---

## Acceptance Criteria
- [x] Technical requirements and routing architecture specified.
- [x] Schema extensions for `ModelTierProfile` and `SubtaskRoutingConfig` added to `src/orchestrator/types.ts` and parsed in `orchestrationConfig.ts`.
- [x] `SubtaskRouter` implemented with task classification, model resolution, policy gating, and fallback selection.
- [x] Lead Planning Engine (`planningSession.ts`) tags decomposed subtasks with category suggestions and target model tiers.
- [x] Dispatch loop in `orchestratorRuntime.ts` dynamically routes subagent execution to the resolved model tier adapter.
- [x] Comprehensive unit tests added verifying classification accuracy, policy gating (e.g., local-only overrides), budget limits, and fallback resilience.

---

## Definition of Done
Subtasks in an orchestration plan are automatically assigned to the optimal model tier based on task type; discovery tasks leverage fast/cheap local models, architectural tasks route to high-reasoning models, and full test suite passes with zero regressions.

---

## Work Log
- **2026-09-08**: Formulated initial vision. Moved ticket to `Ongoing`. Analyzed CLI runner behavior and authored comprehensive architectural specification and implementation plan.
- **2026-09-08**: Implemented sub-model orchestrator and dispatcher subsystem: added `TaskCategory`, `ModelTierProfile`, and `SubtaskRoutingConfig` to orchestration configuration parser; created `SubtaskRouter` with semantic heuristic classification, policy gating, and resilient fallback; integrated routing into `LeadPlanningEngine` and `OrchestratorRuntime`; authored comprehensive unit tests in `test/subtaskRouterTests.ts` and verified 100% pass across all test suites, pilots, and failure matrix.
- **2026-09-08**: Validated end-to-end multi-model routing across board configs. Moved ticket to `Completed`.
