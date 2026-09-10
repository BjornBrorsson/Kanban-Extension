# Antigravity CLI Dispatch with Custom Path Configuration

| Field | Value |
|---|---|
| **Epic** | Epic F / Agent Runner Ergonomics |
| **Type** | Feature |
| **Priority** | High |
| **Status** | Completed |
| **Assignee** | Antigravity CLI |
| **Estimate** | S (1 day) |
| **Depends on** | — |
| **Blocks** | — |
| **Labels** | `agents`, `antigravity`, `cli`, `dispatch`, `configuration` |

## Summary
Ensure agent dispatch for Antigravity CLI uses the verified CLI execution syntax:
`& "<path-to-agy>" -p "<task>" --dangerously-skip-permissions`
and can be configured in `config.md` (either globally in `## Settings` via `Antigravity Path` or per-agent in `### Agents` via `Path:` / `Executable:`) while automatically resolving to standard installation locations (e.g. `%LOCALAPPDATA%\agy\bin\agy.exe`) if no custom path is provided.

## Requirements & Scope / Technical Specification
1. **Types & Config Schema**:
   - Add `antigravityPath?: string` to `BoardConfig`.
   - Add `path?: string` to `AgentRunnerConfig`.
2. **Config Parsing**:
   - Support `Antigravity Path` / `Agy Path` in `## Settings`.
   - Support `Path:` / `Executable:` / `Bin:` under agent items in `### Agents`.
   - Update default generated config and example boards with `{agy_path}` template.
3. **Agent Runner & Path Resolution**:
   - Implement `AgentRunner.resolveAntigravityPath(configuredPath?, boardConfig?)`.
   - Priority order: Agent `path` -> Board `antigravityPath` -> VS Code config -> Environment vars -> Standard paths (`%LOCALAPPDATA%\agy\bin\agy.exe`, `~/.agy/bin/agy`) -> Fallback `agy`.
   - Add `{agy_path}`, `{antigravity_path}`, `{executable}` template placeholders in `AgentRunner.dispatch`.
   - Support legacy upgrade: automatically transform outdated `agy chat ...` to `-p ... --dangerously-skip-permissions`.
   - Pass `boardConfig` from `WebviewPanel` to `AgentRunner.dispatch`.
4. **Orchestrator Adapter & Probes**:
   - Add `AntigravityManagedAdapter` supporting `-p` and `--dangerously-skip-permissions`.
   - Add `antigravity-cli` to `KNOWN_RUNNERS` in `CapabilityProbe`.
5. **Testing**:
   - Unit test config parsing, path resolution, and command interpolation.
   - Verify full test suite passes with zero regressions.

## Acceptance Criteria
- [x] Requirements specified
- [x] ConfigParser parses `Antigravity Path` from `## Settings` and `Path:` from `### Agents`
- [x] `AgentRunner.resolveAntigravityPath` resolves configured paths or auto-detects `agy.exe` on Windows/POSIX
- [x] `AgentRunner.dispatch` supports `{agy_path}` and executes `& "<path>" -p <task> --dangerously-skip-permissions`
- [x] Legacy `agy chat` invocations upgraded to `-p ... --dangerously-skip-permissions`
- [x] `Tickets/config.md` updated with Antigravity path and dispatch command
- [x] `AntigravityManagedAdapter` and `KNOWN_RUNNERS` support added to orchestrator
- [x] All test suites pass without regression

## Work Log
- **2026-09-10**: Claimed ticket. Analyzed codebase, created implementation plan, and specified requirements.
- **2026-09-10**: Implemented path resolution, config parser enhancements, formatCliCommand with PowerShell call operator '&' and --dangerously-skip-permissions, AntigravityManagedAdapter, and test suite. All tests pass. Moved ticket to Completed.
