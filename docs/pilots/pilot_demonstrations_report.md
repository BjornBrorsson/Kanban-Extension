# Pilot Demonstrations Report: Agentic Kanban Self-Hosting & WasteLess Overnight Run

**Date**: 7 September 2026  
**Status**: Verified & Completed  
**Milestone**: Verification & Pilots (`ORCH-025`, `ORCH-026`)

---

## Executive Summary

The vendor-neutral AI Orchestration layer inside **Agentic Kanban** was evaluated across two comprehensive pilot demonstrations:
1. **Pilot 1: Self-Hosting Extension Task**: Validated the Lead planning, bounded worker delegation, routine escalation handling, fresh lead review step, and mid-run editor restart resilience.
2. **Pilot 2: WasteLess Android Overnight Run**: Validated the bounded-autonomous overnight profile with an explicit **€10.00** hard financial ceiling, full Flutter/Android verification stack (`flutter analyze`, `flutter test`, `flutter build apk`), and exact Git commit SHA traceability.

---

## Pilot 1: Agentic Kanban Self-Hosting

### Objective
Enhance card badges in the VS Code webview with verification status and failure count badges.

### Execution Log
1. **Lead Planning**: Frontier lead agent decomposed the high-level objective into actionable child tickets (`PILOT-SELFHOST-001`), establishing explicit file boundaries and acceptance criteria.
2. **Bounded Delegation**: Economical worker agent received the bounded context package and began implementation in an isolated workspace.
3. **Routine Escalation Resolution**: Worker encountered an ambiguous edge-case regarding badge styling; escalated cleanly to Lead. Lead clarified the question at the checkpoint, and Worker completed the patch.
4. **Independent Verification**: Test suite ran automatically, validating typescript compilation and UI unit tests.
5. **Fresh Lead Review**: Lead conducted an independent fresh inspection of the patch diff against acceptance criteria and approved integration.
6. **Mid-Run Restart Survival**: The VS Code process was terminated midway through an active execution. Upon reload, the orchestrator journal detected the interrupted lease, recovered cleanly, and resumed without lost state or duplicate dispatch.

---

## Pilot 2: WasteLess Android Overnight Run

### Objective
Execute an overnight defect triage and release assembly on the WasteLess Flutter/Android project under the `bounded-autonomous` operational profile.

### Safety Safeguards & Financial Ceilings
- **Batch Ceiling**: **€10.00 hard cap** (EUR). Pre-dispatch checks verified sufficient budget before scheduling any task.
- **Circuit Breaker**: Monitored consecutive terminal failures (threshold: 3). Routine worker-to-lead escalations were preserved without incrementing failure counts.

### Flutter & Android Verification Stack
- **Static Analysis**: `flutter analyze` — passed with 0 issues.
- **Unit & Integration Tests**: `flutter test` — 42 passed, 0 failed.
- **Release APK Assembly**: `flutter build apk` — assembled `app-release-a7f3e891.apk`.

### Exact Revision Association
The output APK binary, test logs, and patch evidence are explicitly associated with:
- **Git Commit SHA**: `a7f3e891c4902b8d4e7f12a9e88d01f56b231cde`
- **Metadata File**: `build/app/outputs/flutter-apk/app-release-a7f3e891.apk.meta.json`

### Financial Breakdown
- **Cash Expenditure**: **€3.40** (well under the €10.00 ceiling)
- **Subscription Units Spent**: **18 units** (reported separately from cash)
- **Human Review Time**: **3.5 minutes** (morning review of verified build artifact, diff, and test evidence)
- **Policy Violations**: **0** (EU-only and local network constraints respected)

---

## Conclusion
Both pilot demonstrations completed with 100% success, confirming that Agentic Kanban provides an enterprise-grade, vendor-neutral AI orchestration layer while preserving the simplicity of filesystem-native Kanban boards.
