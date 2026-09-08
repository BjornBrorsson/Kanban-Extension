In this document, the project's overall plan and architecture is laid out. It is intended to be read by AI Agents and humans starting work in the project to align on what the goal is and what is being built.

# 00 - Project Goal & Architecture: Agentic Kanban

## 1. Vision & Core Philosophy
Our goal: to build a VS Code / Codium based extension for use in VS Code, Devin, Antigravity, Cursor, etc. that uses filesystem folders and markdown files for project management in a kanban style, designed for **AI agents first, humans second**.

### The "Agents First, Humans Second" Principle
- **For AI Agents**: Project management should be frictionless and native to their operating environment. Agents do not need complex API tokens or proprietary database clients. They simply:
  - Read ticket specifications formatted in standard Markdown (`.md`).
  - Move tickets between folders using filesystem operations (`git mv`, `mv`).
  - Append work logs and check off acceptance criteria directly in files.
- **For Humans**: Visualizing complex parallel work and organizing tasks across projects is vastly easier with a responsive, modern Kanban UI:
  - Interactive drag-and-drop boards that immediately move files on disk.
  - Subfolder filtering, full-text search, tag and priority chips.
  - Multi-board overview to monitor parallel agent streams across repositories.
  - Direct dispatch buttons to assign tickets to humans or launch CLI/GUI AI agents.

---

## 2. Directory & Data Structure

The extension does not require an external database or proprietary store. The filesystem is the single source of truth.

```text
<Workspace Root>/
  ├── <Project / Folder>/
  │   └── Tickets/                   <-- Board Root (auto-discovered)
  │       ├── 00_Plan.md             <-- Board-level Plan & Architecture document
  │       ├── config.md              <-- Board settings, assignees (humans & agents), runner templates
  │       │
  │       ├── Backlog/               <-- Column 1
  │       │   ├── Whatwhy.md         <-- Column Guidance (displayed in UI header/tooltip)
  │       │   ├── Needs further specification/ <-- Subfolder filter / Sub-status
  │       │   │   ├── Whatwhy.md
  │       │   │   └── ticket-092.md
  │       │   └── Ready/             <-- Subfolder filter / Sub-status
  │       │       ├── Whatwhy.md
  │       │       └── ticket-070.md
  │       │
  │       ├── Ongoing/               <-- Column 2
  │       │   ├── Whatwhy.md
  │       │   └── ticket-019.md
  │       │
  │       ├── Assistance Required/   <-- Column 3
  │       │   ├── Whatwhy.md
  │       │   └── ticket-001.md
  │       │
  │       ├── Blocked/               <-- Column 4
  │       │   └── Whatwhy.md
  │       │
  │       └── Completed/             <-- Column 5
  │           ├── Whatwhy.md
  │           └── ticket-001_bootstrap.md
```

### Hierarchy Rules:
1. **Board Root**: Any directory matching the configured pattern (default: `**/Tickets`, `**/tickets`, or directories with `config.md`).
2. **Columns**: Every immediate subdirectory inside the Board Root forms a Kanban column.
3. **Subfolders / Swimlanes**: Subdirectories within a column act as sub-statuses and filter categories.
4. **Tickets**: All `.md` files within columns or subfolders (excluding ignored meta-files).
5. **Meta-Files**:
   - `Whatwhy.md` / `README.md`: Explains the purpose of the folder to AI agents and renders as column guidance tooltips in the UI.
   - `00_Plan.md` or `00_*.md`: Represents high-level board planning/specs.
   - `config.md`: Configures assignees, agents, and custom options.

---

## 3. Ticket Formats & Parsing

The parser supports three complementary ticket authoring styles:
1. **Markdown Table Specs** (as seen in `ticket-019.md` and `ticket-070.md`):
   ```markdown
   # DEMO-019 — Title

   | Field | Value |
   |---|---|
   | **Epic** | C — Test Data |
   | **Priority** | P0 — Critical |
   | **Status** | Ongoing |
   | **Assignee** | Claude Code |
   | **Labels** | `cleanup`, `audit` |
   ```
2. **YAML Frontmatter**:
   ```markdown
   ---
   title: "Provision local GPU host"
   priority: P0
   assignee: bjorn
   tags: ["gpu", "infra"]
   ---
   ```
3. **Freeform / Heuristic Markdown**:
   - First `# Header` becomes the title.
   - Fallback to humanized filename if no header is present.
   - Checkboxes `- [ ]` vs `- [x]` compute completion progress automatically.

---

## 4. Agent & Human Collaboration (`config.md`)

Boards contain a `config.md` that maps team members and agent dispatch profiles:
- **Humans**: Identified with names, emails, or handles.
- **CLI Agents**: Defines executable commands with parameter substitution (e.g. `claude -p "Work on {ticket_path}"`, `gemini -p "{ticket_path}"`, `aider --message "{ticket_path}"`).
- **IDE GUI Agents**: Configured with VS Code command triggers (e.g. `workbench.action.chat.open`, Cursor chat, etc.).

---

## 5. Multi-Project & Multi-Board Management
For users working across multiple projects in a single workspace:
- The extension automatically discovers all boards.
- An **Aggregated Overview** provides:
  - Global metrics across all projects.
  - A real-time tracker of all parallel ongoing work across agents.
  - Quick alerts for blocked cards or items needing human assistance.
