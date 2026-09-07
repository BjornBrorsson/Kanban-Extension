# ORCH-015 — Egress controls, network/tool sandboxing, and policy audit logging

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Feature |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | Antigravity |
| **Depends on** | ORCH-013, ORCH-014 |
| **Blocks** | ORCH-020 |
| **Labels** | `security`, `egress`, `sandboxing`, `audit`, `network`, `m3` |
| **Milestone** | M3 — Policy and budget reliability |

## Summary
Implement controlled egress filtering, tool execution permissions, and tamper-evident audit logging for network calls and external operations, satisfying EU and corporate policy compliance.

## Description
Worktrees prevent accidental file collisions, but they are not security sandboxes. To enforce strict EU-only and local-only guarantees during unattended execution:

1. **Egress Enforcement**:
   - For controlled runners, configure HTTP/HTTPS proxy or firewall boundaries restricting outbound traffic strictly to approved endpoint domains (e.g. EU model APIs, internal enterprise endpoints).
   - Flag or block unknown remote network connections.
   - For local-only mode, enforce offline execution environment variables (e.g. `OFFLINE=1`, `CURL_CA_BUNDLE=""`, disabling telemetry endpoints).

2. **Tool Sandboxing & Whitelisting**:
   - Limit tool permissions based on ticket `allowedScope` and board policy.
   - Prohibit external upload or deployment tools unless explicitly authorized by the user.

3. **Audit Log**:
   - Maintain a local, append-only log in `.agentic-kanban/runtime/audit.log`.
   - Records every model endpoint accessed, payload hashes, data classification tag, tool invoked, and timestamp.

## Acceptance Criteria
- [x] Egress domain validation rules implemented for managed runner environments.
- [x] Local-only policy enforces offline mode and blocks external DNS/HTTP requests.
- [x] Tool whitelisting filters allowed tool calls based on policy profile.
- [x] Append-only audit logger records endpoint invocations and tool operations.
- [x] Integration tests verifying egress block on non-approved outbound traffic.

## Technical Notes
- Implement non-intrusive local proxy or environment-level socket restrictions where operating system permissions permit.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Implemented `EgressController` in `src/orchestrator/policy/egressController.ts`. Added domain whitelist and local-only network filtering (`localhost` only), offline environment flag generation (`OFFLINE=1`, `HF_HUB_OFFLINE=1`), and append-only audit logging to `.agentic-kanban/runtime/audit.log` recording all policy decisions with timestamps and rules. Verified in `test/m3Tests.ts`.
