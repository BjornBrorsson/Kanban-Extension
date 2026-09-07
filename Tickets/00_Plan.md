In this document, the project's overall plan, architecture, and feature roadmap for the Agentic Kanban extension is laid out.

# 00 - Project Goal & Architecture: Agentic Kanban Extension

## 1. Vision & Core Philosophy
Build a high-performance, developer-friendly VS Code / VSCodium / Devin / Antigravity / Cursor extension that turns ordinary filesystem folders and markdown files into an interactive Kanban board designed for **AI agents first, humans second**.

### Guiding Principles:
1. **Filesystem as the Single Source of Truth**: The board, its tickets, columns, history, and configuration are 100% filesystem-native Markdown files and folders—no database, no external web APIs, and no opaque cloud sync required to read or manage the board. If a git repository is cloned, the board and its history are immediately present. (Active, in-flight execution state—such as process leases, monotonic attempt generations, and crash recovery—is managed locally in an ignored runtime store like `.agentic-kanban/runtime/`, keeping the board itself completely database-free).
2. **Frictionless for AI Agents**: Agents read tickets using standard file-reading tools and move them across columns using standard file operations (`git mv`, `mv`).
3. **Ergonomic for Humans**: Humans organize, drag-and-drop, filter by subfolder/tag/priority, track parallel agent execution, and dispatch CLI/GUI agents directly from the UI.
4. **Resilient & Schema-Agnostic**: Works with markdown tables, YAML frontmatter, checklists, and freeform markdown.

---

## 2. Roadmap & Epics

- **Epic A — Foundation & Bootstrap (v0.1.0)**: Core extension scaffolding, TypeScript architecture, Webview UI, drag-and-drop file mover, real-time filesystem watcher, and multi-board discovery. *(Completed)*
- **Epic B — Human & Agent Interaction Ergonomics**: "Copy Agent Prompt" button, interactive checklist toggling in UI, and one-click workspace `AGENT.md` rule generation.
- **Epic C — Workflow Intelligence & Safety**: Dependency graph resolution (`Depends on` / `Blocks`), blocker alert badges, and circular dependency detection.
- **Epic D — Overview & Team Visibility**: Multi-board Work Log chronological activity feed and parallel agent monitoring dashboard.
- **Epic E — Ticket Authoring & Templates**: Template-based ticket creation (`.templates/`), auto-id numbering, and batch actions.
- **Epic F — AI Orchestrator: Vendor-Neutral Multi-Agent Execution Loop**: Expand from passive board to active orchestration layer. Frontier lead agent breaks down outcomes into bounded tasks, economical worker agents execute changes, and deterministic runtime handles leases, budgets, EU/local policies, isolated workspaces, and verification before completion.
  - *M0: Compatibility & Contracts* (`ORCH-001` – `ORCH-004`): Versioned config schema, adapter capability probes, durable ticket/attempt schema. *(Completed)*
  - *M1: One Supervised Task* (`ORCH-005` – `ORCH-008`): Transactional runtime journal, first managed adapter, workspace baseline & guarded patches, lifecycle UI. Initiates the deterministic fake adapter test harness. *(Completed)*
  - *M2: Lead and Worker* (`ORCH-009` – `ORCH-012`): Lead planning, bounded delegation handoffs, escalation/takeover, fresh independent review. *(Completed)*
  - *M3: Policy & Budget Reliability* (`ORCH-013` – `ORCH-016`): Provider eligibility (EU/local), atomic quota reservations, egress controls, crash resilience. *(Completed)*
  - *M4: Overnight Queues* (`ORCH-017` – `ORCH-020`): Dependency scheduler, headless runtime daemon & CLI client, additional managed adapters, bounded autonomous profile. *(Completed)*
  - *M5: Broader Workspaces & Parallelism* (`ORCH-021` – `ORCH-024`): TFVC & local folders, parallel isolated workers, serialized integration & regression replay, knowledge cache. *(Completed)*
  - *Verification & Pilots* (`ORCH-025` – `ORCH-026`): Complete deterministic failure matrix, live model benchmark suite, Self-Hosting & WasteLess overnight pilots. *(Completed)*


