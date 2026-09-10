# Board Configuration: Agentic Kanban Development

This file configures the Kanban board for developing the Agentic Kanban extension itself.

## Settings
- **Board Name**: Kanban Extension (Core)
- **Columns Order**: Backlog, Ongoing, Assistance Required, Blocked, Completed
- **Auto Update Status In File**: true
- **Default Agent**: cline-ollama
- **Antigravity Path**: C:\Users\BjörnBrorsson\AppData\Local\agy\bin\agy.exe

## Assignees

### Humans
- **Björn**
  - ID: `bjorn`
  - Role: Project Lead & Architecture
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
  - Path: `C:\Users\BjörnBrorsson\AppData\Local\agy\bin\agy.exe`
  - Command: `& "{agy_path}" -p "Review requirements and implement ticket {ticket_path}: {ticket_title}" --dangerously-skip-permissions`
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
  - Command: `claude -p "Review requirements and implement ticket {ticket_path}"`
  - WorkingDir: `{workspace_root}`

- **Gemini CLI**
  - ID: `gemini-cli`
  - Type: cli
  - Command: `gemini --prompt "Work on ticket {ticket_path}: {ticket_title}"`
  - WorkingDir: `{workspace_root}`

- **Aider**
  - ID: `aider`
  - Type: cli
  - Command: `aider --message "Implement ticket requirements in {ticket_path}" {ticket_path}`
  - WorkingDir: `{workspace_root}`

- **IDE Chat (Antigravity / Cursor / Copilot)**
  - ID: `ide-chat`
  - Type: vscode-command
  - Command: `workbench.action.chat.open`
  - Prompt: `Please review and work on ticket '{ticket_title}' located at: {ticket_path}\n\nTicket Summary:\n{ticket_content}`

## Orchestration & Multi-Model Routing

```yaml
schemaVersion: 1
orchestration:
  enabled: true
  maxConcurrentWorkers: 2
  completionTarget: reviewed-patch
  retryLimit: 2

roles:
  lead: ide-chat
  worker: cline-ollama
  reviewer: ide-chat

modelTiers:
  - id: fast-discovery
    name: Gemma 4 E4B (Local / Fast)
    model: gemma4:e4b
    provider: ollama
    costTier: free
    recommendedFor: [discovery, quick-fix]

  - id: deep-reasoner
    name: Fable / Astra (Deep Reasoning)
    model: astra-reasoning-v1
    provider: openai-compatible
    costTier: high
    recommendedFor: [architecture, escalation]

  - id: standard-coder
    name: Claude 5 Sonnet / Copilot
    model: claude-5-sonnet
    provider: anthropic
    costTier: medium
    recommendedFor: [implementation, verification, refactor]

subtaskRouting:
  defaultTier: standard-coder
  categoryRoutes:
    discovery: fast-discovery
    quick-fix: fast-discovery
    architecture: deep-reasoner
    escalation: deep-reasoner
    implementation: standard-coder
    verification: standard-coder
    refactor: standard-coder
  fallbackTier: standard-coder
```

