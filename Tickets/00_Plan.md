In this document, the project's overall plan, architecture, and feature roadmap for the Agentic Kanban extension is laid out.

# 00 - Project Goal & Architecture: Agentic Kanban Extension

## 1. Vision & Core Philosophy
Build a high-performance, developer-friendly VS Code / VSCodium / Devin / Antigravity / Cursor extension that turns ordinary filesystem folders and markdown files into an interactive Kanban board designed for **AI agents first, humans second**.

### Guiding Principles:
1. **Filesystem as the Single Source of Truth**: No sqlite, no external web APIs, no opaque cloud sync. If a git repository is cloned, the board and its history are immediately present.
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
