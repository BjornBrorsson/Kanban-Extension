# Board Configuration

This configuration file defines board behavior, humans, and AI agents for this Tickets board.
AI agents and humans can reference or edit this file.

## Settings
- **Board Name**: Example Project Board
- **Columns Order**: Backlog, Ongoing, Assistance Required, Blocked, Completed
- **Auto Update Status In File**: true
- **Default Agent**: cline-ollama

## Assignees

### Humans
- **Björn**
  - ID: `bjorn`
  - Role: Project Lead & Reviewer
  - Type: human

### Agents

- **Cline CLI (Ollama - Gemma 4 E4B)**
  - ID: `cline-ollama`
  - Type: cli
  - Command: `cline -P ollama -m gemma4:e4b "Please review requirements and implement ticket {ticket_path}: {ticket_title}"`
  - WorkingDir: `{workspace_root}`

- **Antigravity CLI**
  - ID: `antigravity-cli`
  - Type: cli
  - Command: `agy chat "Review requirements and implement ticket {ticket_path}: {ticket_title}"`
  - WorkingDir: `{workspace_root}`

- **Devin CLI**
  - ID: `devin-cli`
  - Type: cli
  - Command: `devin -p "Please review and work on ticket {ticket_path}: {ticket_title}"`
  - WorkingDir: `{workspace_root}`

- **GitHub Copilot CLI**
  - ID: `copilot-cli`
  - Type: cli
  - Command: `copilot -p "Please implement ticket {ticket_path}: {ticket_title}" --allow-all`
  - WorkingDir: `{workspace_root}`

- **Claude Code**
  - ID: `claude-code`
  - Type: cli
  - Command: `claude -p "Review and implement ticket {ticket_path}"`
  - WorkingDir: `{workspace_root}`

- **Gemini CLI**
  - ID: `gemini-cli`
  - Type: cli
  - Command: `gemini --prompt "Please work on ticket {ticket_path}: {ticket_title}"`
  - WorkingDir: `{workspace_root}`

- **Aider**
  - ID: `aider`
  - Type: cli
  - Command: `aider --message "Implement ticket requirements in {ticket_path}" {ticket_path}`
  - WorkingDir: `{workspace_root}`

- **VS Code / IDE Assistant (Antigravity / Cursor / Copilot)**
  - ID: `ide-chat`
  - Type: vscode-command
  - Command: `workbench.action.chat.open`
  - Prompt: `Please review and work on ticket '{ticket_title}' located at: {ticket_path}\n\nTicket Summary:\n{ticket_content}`
