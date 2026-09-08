# Agentic Kanban (Folders & Markdown)

> **Folder & Markdown-based project management for VS Code, Codium, Devin, Antigravity, and Cursor — designed for AI agents first, humans second.**

[![Visual Studio Code](https://img.shields.io/badge/VS%20Code-Compatible-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![Built for AI Agents](https://img.shields.io/badge/AI%20Agents-First-8b5cf6)](#)
[![Filesystem Native](https://img.shields.io/badge/Filesystem-Single%20Source%20of%20Truth-10b981)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 💡 The Philosophy: Agents First, Humans Second

Most project management tools require external APIs, proprietary cloud sync, and complex schemas that trap task data in walled gardens. 

**Agentic Kanban** turns your ordinary filesystem into a living Kanban board:
- **For AI Agents**: Simple, native, and token-efficient. Agents read Markdown tickets (`.md`), move files between folders (`git mv Tickets/Backlog/ticket.md Tickets/Ongoing/`), and update work logs directly on disk without requiring specialized MCP plugins or web APIs.
- **For Humans**: An interactive, glassmorphic Kanban board with drag-and-drop, full-text search, subfolder filter chips, multi-board/multi-project workspace overviews, and direct agent dispatch buttons.
- **Real-Time Live Sync**: When an AI agent moves or edits a file in the background, the UI updates instantly via VS Code's `FileSystemWatcher` without losing drag state or scroll position.

---

## 📂 Directory Structure

No database required. Your folder structure **is** your board:

```text
MyProject/
  └── Tickets/                         <-- Board Root (auto-discovered)
      ├── 00_Plan.md                   <-- High-level board specs / architecture
      ├── config.md                    <-- Team config (humans + agents + runner templates)
      │
      ├── Backlog/                     <-- Column 1
      │   ├── Whatwhy.md               <-- Column Guidance (displayed in UI header tooltip)
      │   ├── Needs further specification/ <-- Subfolder filter / Sub-status
      │   │   ├── Whatwhy.md
      │   │   └── Example_ticket-092.md
      │   └── Ready/                   <-- Subfolder filter / Sub-status
      │       ├── Whatwhy.md
      │       └── Example_ticket-070.md
      │
      ├── Ongoing/                     <-- Column 2
      │   ├── Whatwhy.md
      │   └── Example_ticket-019.md
      │
      ├── Assistance Required/         <-- Column 3
      │   ├── Whatwhy.md
      │   └── Example_ticket-001.md
      │
      ├── Blocked/                     <-- Column 4
      │   └── Whatwhy.md
      │
      └── Completed/                   <-- Column 5
          ├── Whatwhy.md
          └── Example_ticket-bootstrap.md
```

### Folder Rules:
1. **Board Root**: Any directory named `Tickets` (or matching configured `agenticKanban.boardPatterns`). Multiple boards in multi-project workspaces are automatically discovered and aggregated!
2. **Columns**: Immediate subdirectories under `Tickets/` (e.g. `Backlog`, `Ongoing`, `Assistance Required`, `Blocked`, `Completed`). Name them anything you like!
3. **Subfolder Filters**: Subdirectories inside columns act as sub-statuses and toggleable filter chips (e.g. `Needs further specification`, `Ready`).
4. **Column Guidance (`Whatwhy.md`)**: Any `Whatwhy.md` or `README.md` file inside a column or subfolder is rendered as a clean column header guidance tooltip `(i)` instead of cluttering your board with cards.
5. **Tickets**: Any `.md` file inside a column or subfolder.

---

## 📝 Ticket Formats

The parser automatically detects:
- **Markdown Tables**:
  ```markdown
  # DEMO-019 — Cleanup + audit-trail framework

  | Field | Value |
  |---|---|
  | **Epic** | C — Test Data |
  | **Priority** | P0 — Critical |
  | **Status** | Ongoing |
  | **Assignee** | Claude Code |
  | **Labels** | `cleanup`, `audit` |
  ```
- **YAML Frontmatter**:
  ```markdown
  ---
  id: "DEMO-020"
  title: "Provision local GPU host"
  priority: "P0"
  assignee: "bjorn"
  labels: ["gpu", "infra"]
  ---
  ```
- **Freeform Markdown**:
  First `# Header` becomes the title, and the first paragraph becomes the summary.
- **Acceptance Criteria Checklists**:
  Checkboxes (`- [ ]` and `- [x]`) automatically calculate a progress bar badge (`3/5`).

---

## 🤖 Agent & Human Collaboration (`config.md`)

Place a `config.md` at the board root to configure team members and agent dispatch profiles:

```markdown
# Board Configuration

## Settings
- **Board Name**: Main Engine Board
- **Columns Order**: Backlog, Ongoing, Assistance Required, Blocked, Completed
- **Auto Update Status In File**: true
- **Default Agent**: claude-code

## Assignees

### Humans
- **Björn**
  - ID: `bjorn`
  - Role: Project Lead & Reviewer
  - Type: human

### Agents
- **Claude Code**
  - ID: `claude-code`
  - Type: cli
  - Command: `claude -p "Review and implement ticket {ticket_path}"`

- **Gemini CLI**
  - ID: `gemini-cli`
  - Type: cli
  - Command: `gemini --prompt "Work on ticket {ticket_path}: {ticket_title}"`

- **Aider**
  - ID: `aider`
  - Type: cli
  - Command: `aider --message "Solve {ticket_path}" {ticket_path}`

- **IDE Chat (Antigravity / Cursor / Copilot)**
  - ID: `ide-chat`
  - Type: vscode-command
  - Command: `workbench.action.chat.open`
  - Prompt: `Please review and work on ticket '{ticket_title}' at: {ticket_path}`
```

### Dispatching an Agent:
- When a ticket has an agent assigned, a **"Run Agent"** button appears directly on the card and in the detail modal.
- For **CLI Agents**: Spawns an integrated VS Code terminal (e.g. `Agent: Claude Code`) and executes the command with `{ticket_path}`, `{ticket_title}`, etc. substituted.
- For **IDE GUI Agents**: Copies the ticket prompt to the clipboard and triggers the IDE chat window!

---

## 🌐 Multi-Board & Workspace Overview

Have multiple projects with separate `Tickets/` folders in your workspace?
- Switch between boards using the top navigation dropdown.
- Switch to the **Workspace Overview** dashboard to see:
  - Total tickets, ongoing work, and blocked cards across **all** boards.
  - **Parallel Active Work Feed**: View every card currently in `Ongoing` or `Assistance Required` across all projects in one unified view!

---

## 🚀 Building & Testing

```bash
# Install dependencies
npm install

# Build extension and bundle webview assets
npm run build

# Run unit and integration tests
npm test

# Watch mode for development
npm run watch
```

Press `F5` in VS Code to launch the Extension Development Host!

---

## 📦 Creating a VSIX Package

To package the extension into a standalone `.vsix` installer for distribution, local testing, or manual installation:

```bash
# Build production bundle and package into .vsix
npm run package
```

This runs the build pipeline, bundles webview styles and scripts into `dist/`, and uses `@vscode/vsce` to assemble `agentic-kanban-<version>.vsix`.

### Installing Your `.vsix`

**Via Terminal:**
- **VS Code**:
  ```bash
  code --install-extension agentic-kanban-1.0.0.vsix
  ```
- **VS Code Insiders**:
  ```bash
  code-insiders --install-extension agentic-kanban-1.0.0.vsix
  ```
- **Devin Desktop / Windsurf**:
  ```bash
  devin-desktop --install-extension agentic-kanban-1.0.0.vsix
  ```
- **VSCodium**:
  ```bash
  codium --install-extension agentic-kanban-1.0.0.vsix
  ```

> *Tip for Windows PowerShell: If the path contains spaces, wrap it in double quotes (e.g., `code --install-extension "C:\My Projects\agentic-kanban-1.0.0.vsix"`).*

**Via GUI:**
1. Open the Extensions sidebar (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Click the **`...`** (Views and More Actions) menu in the top-right corner of the Extensions panel.
3. Select **Install from VSIX...**
4. Browse to and select your `.vsix` file.
5. Reload the editor window (`Ctrl+Shift+P` ➔ **Developer: Reload Window**).

---

## 📄 License

This project is open-source software licensed under the [MIT License](LICENSE).
