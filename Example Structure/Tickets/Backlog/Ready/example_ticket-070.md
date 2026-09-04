# ATF-070 — RPC command-specific payload templates for complex writes

| Field | Value |
|-------|-------|
| **Epic** | N — Live-Run Hardening & Defect Triage |
| **Type** | Improvement |
| **Priority** | P1 — Core |
| **Estimate** | L (4–6 days) |
| **Status** | Backlog |
| **Depends on** | ATF-063, ATF-064, ATF-065 |
| **Blocks** | — |
| **Labels** | `generator`, `rpc`, `payloads`, `fixtures` |
| **Milestone** | M3 |

## Summary
781 of the RPC failures in run `b9cd453d` are `"Parameter error"` — the server accepted the call but rejected the parameter list. The generator emits generic `paramN=1` list/scalar payloads that don't match the command's real signature (especially complex `actionitem_*`/`creditdebt.*`/`journals.*` write commands that expect structured `list`/`idlist` argument objects).

## Description
- The RPC parameter JSON is generated from `rpc.index` type hints; for many commands the real contract is a named `VariantIDList`/`VariantList` structure, not a flat `paramN` array. The current `rpc.paramN` fallback (`1`) produces well-typed but semantically wrong arguments.
- Fix approach: build a **per-command payload template registry** — a small map of command → parameter object shape (names, types, valid values) sourced from (a) service-definition `<rpcfunc>` signatures, (b) observed valid calls in existing SDs/testcases, and (c) the RPC index metadata. Where no template exists, mark the command `needs_validation` rather than firing a guessed payload.

## Acceptance Criteria
- [ ] A `rpc-payload-templates` registry (JSON) maps known commands to their parameter shapes; the generator emits the template-shaped body instead of generic `paramN`.
- [ ] Commands with no known-good template emit `needs_validation`/`skipped` (reason `rpc_payload_unknown`) rather than `paramN` guesses.
- [ ] At least the high-frequency failing commands (`admin.actions.actionitem_insert`/`update`, `actionpackage_*`, `creditdebt.*`, `journals.*` writes) get real templates.
- [ ] Re-run: `Parameter error` count drops materially; commands that still fail do so for genuine data reasons, not wrong-shaped arguments.

## Technical Notes
- RPC param conversion is in `ConvertTo-AtfRpcVariant` (`Atf.Runner.psm1` ~L654-725); the JSON parameter shape is emitted by the generator (`generate_test_catalog.py` RPC body builder) — the fix is generator-side, the runner already converts `idlist`/`list`/typed scalars.
- Source of truth for signatures: the RPC index (names/types) plus existing service definitions that invoke these commands — prefer mining real `<rpccall>`/`<modulecall>` usage in `Kundanpassningar`/testcases for concrete valid parameter lists.
- Keep templates in a separate data file (like `fixture-catalog.json`) so they're reviewable and extendable without touching the generator code.

## Definition of Done
- The 781-strong `Parameter error` cluster is materially reduced on a targeted re-run; unknown-signature commands are cleanly gated, not executed with guesses.

## Work Log
- 2026-09-04 — Created ticket from full-run `b9cd453d` analysis (781 RPC "Parameter error" failures from generic paramN payloads).
