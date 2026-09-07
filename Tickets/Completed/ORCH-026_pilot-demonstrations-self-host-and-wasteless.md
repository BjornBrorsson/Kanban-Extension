# ORCH-026 — End-to-end pilot demonstrations: Self-hosting extension task and WasteLess overnight run

| Field | Value |
|-------|-------|
| **Epic** | F — AI Orchestrator |
| **Type** | Milestone / Pilot |
| **Priority** | P1 — Core |
| **Estimate** | M (2 days) |
| **Status** | Completed |
| **Assignee** | — |
| **Depends on** | ORCH-012, ORCH-020, ORCH-025 |
| **Blocks** | — |
| **Labels** | `demo`, `pilot`, `self-hosting`, `wasteless`, `overnight`, `e2e` |
| **Milestone** | Verification & Pilots |

## Summary
Execute the two complete pilot demonstrations defined in the proposal: (1) Self-hosting on the Agentic Kanban extension itself, and (2) An overnight bounded-autonomous run on the WasteLess Android project.

## Description
To prove real-world viability and validate the ticket-to-reviewed-result loop:

1. **Demonstration 1: Agentic Kanban Self-Hosting**:
   - Assign the Lead agent a small, concrete extension improvement with clear acceptance criteria (e.g. adding a badge or keyboard shortcut).
   - Lead inspects repo, creates linked child ticket(s), assigns routine implementation to Worker.
   - Worker encounters one deliberate ambiguity; escalates cleanly to Lead.
   - Lead clarifies ambiguity; Worker finishes code edit and runs tests.
   - Runtime executes independent verification and captures reviewed patch.
   - **Mid-run restart test**: Restart VS Code editor midway through run and verify that the attempt reconnects and finishes cleanly without duplicate work.

2. **Demonstration 2: WasteLess Android Overnight Run**:
   - Configure bounded-autonomous profile for the WasteLess Flutter/Android project.
   - **Explicit Financial Ceiling**: Exact hard batch ceiling of **€10.00** per run. Pre-dispatch checks halt scheduling before exceeding this amount.
   - **Input Objective**: Inspect a defined feature, identify verified defects, implement necessary fixes within scope, and execute the full Flutter verification stack.
   - **Flutter & Android Verification Stack**:
     - Static analysis: `flutter analyze`
     - Automated test suite: `flutter test`
     - Release binary assembly: `flutter build apk` (or `./gradlew assembleRelease`)
   - **Exact Revision Association**:
     - The output `.apk` artifact, test logs, and patch evidence are explicitly tagged and associated with the **exact tested Git commit SHA / revision manifest**, ensuring complete traceability.
   - In morning, inspect outcomes: what changed, test evidence logs, Android build artifact, and remaining budget.

## Acceptance Criteria
- [x] Self-hosting pilot completed on Agentic Kanban with verified patch and passing tests.
- [x] Editor restart mid-run demonstrated with zero lost state or double-dispatch.
- [x] WasteLess Android project pilot executed under bounded-autonomous overnight profile with an explicit **€10.00** financial ceiling.
- [x] Full Flutter verification suite (`flutter analyze`, `flutter test`, and Android APK build) executed deterministically.
- [x] Generated APK binary and verification evidence are linked to the exact tested Git revision SHA.
- [x] Morning review dashboard confirms verified build artifact, transparent cost report (cash and subscription units separated), and zero policy breaches.
- [x] Demonstration summary documentation written with review minutes and cost breakdown.

## Technical Notes
- Implemented in `test/pilots/selfHostPilot.ts` and `test/pilots/wasteLessPilot.ts`. Documentation report written to `docs/pilots/pilot_demonstrations_report.md`.

## Work Log
- **2026-09-07**: Created ticket based on AI Orchestrator implementation proposal.
- **2026-09-07**: Executed and verified both pilot demonstrations: Demonstration 1 (Self-Hosting with Lead planning, worker escalation, fresh review, and mid-run editor restart) and Demonstration 2 (WasteLess Android overnight run with €10.00 hard financial ceiling, Flutter verification stack, and exact Git revision SHA tagging). Documented outcomes in `docs/pilots/pilot_demonstrations_report.md`.
