# ORCH-002 — Versioned config schema and backward-compatible parser

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P0 — Critical |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-001 |
| **Blocks** | ORCH-005, ORCH-013 |
| **Labels** | `config`, `yaml`, `schema`, `m0` |
| **Milestone** | M0 — Compatibility and contracts |

## Summary
Extend `config.md` parsing with an optional schema-versioned fenced YAML block defining orchestration settings, capabilities, policies, budgets, and role bindings, while preserving human-readable markdown prose.

## Description
To support deterministic orchestration, `config.md` must support structured orchestration configuration without breaking existing markdown-based board settings.

A versioned fenced YAML block will be recognized:
```markdown
```yaml
schemaVersion: 1
orchestration:
  enabled: false
  profile: work-eu
  maxConcurrentWorkers: 1
  completionTarget: reviewed-patch
  retryLimit: 1
roles:
  lead: approved-frontier
  worker: approved-economical
policies:
  work-eu:
    allowedExecution: [local, verified-eu]
    unknownDestination: deny
budgets:
  dailyCurrency: EUR
  dailyLimit: 5
  reserveForReview: 1
```
```

The parser must:
1. Extract and validate this YAML block if present.
2. Ensure `orchestration.enabled` defaults to `false`.
3. Support secret references (retrieving actual keys from OS credential store / environment, not storing plain text secrets in markdown).
4. Preserve existing `# Board Configuration`, `## Settings`, and `## Assignees` parsing without regressions.

## Acceptance Criteria
- [x] Schema validator created for `schemaVersion: 1` orchestration configuration.
- [x] `ConfigParser` updated to parse fenced YAML orchestration block without disturbing legacy markdown sections.
- [x] Graceful fallback when YAML block is absent or invalid (with diagnostic warnings).
- [x] Secrets separation: credentials referenced by key ID rather than inline secrets.
- [x] Unit tests covering valid, missing, partial, and malformed YAML configuration blocks.

## Technical Notes
- Implementation located in `src/orchestrator/config/` or integrated cleanly into `configParser.ts`.
- Ensure JSON/YAML schema definition is exported for documentation and tooling.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `OrchestrationConfigParser` in `src/orchestrator/config/orchestrationConfig.ts`. Updated `src/configParser.ts` and `src/types.ts` to integrate versioned YAML schema validation (`schemaVersion: 1`, `roles`, `policies`, `budgets`) while guaranteeing 100% backward compatibility for boards without orchestration blocks. Added comprehensive test coverage in `test/m0Tests.ts`.
