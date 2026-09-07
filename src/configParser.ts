import { BoardConfig, Assignee, AgentRunnerConfig } from './types';
import { OrchestrationConfigParser } from './orchestrator/config/orchestrationConfig';

export class ConfigParser {
  public static parse(content: string, defaultBoardName: string): BoardConfig {
    const config: BoardConfig = {
      name: defaultBoardName,
      columnsOrder: [],
      autoUpdateStatus: true,
      defaultAgent: null,
      assignees: []
    };

    if (!content || !content.trim()) {
      return config;
    }

    // 1. Parse Settings section
    const settingsMatch = content.match(/##\s+Settings\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (settingsMatch) {
      const settingsBlock = settingsMatch[1];
      const lines = settingsBlock.split(/\r?\n/);
      for (const line of lines) {
        // - **Board Name**: ...
        const kvMatch = line.match(/^[-*]\s+\*{0,2}([^:*]+)\*{0,2}\s*:\s*(.+)$/);
        if (kvMatch) {
          const key = kvMatch[1].trim().toLowerCase();
          const val = kvMatch[2].trim();

          if (key.includes('board name')) {
            config.name = val;
          } else if (key.includes('columns order') || key.includes('column order')) {
            config.columnsOrder = val.split(',').map(s => s.trim()).filter(s => s.length > 0);
          } else if (key.includes('auto update status')) {
            config.autoUpdateStatus = val.toLowerCase() !== 'false';
          } else if (key.includes('default agent')) {
            config.defaultAgent = val;
          } else if (key.includes('prompt template') || key.includes('agent prompt')) {
            config.agentPromptTemplate = val.replace(/^["'`](.*)["'`]$/, '$1');
          }
        }
      }
    }

    // 2. Parse Assignees section
    const assigneesMatch = content.match(/##\s+Assignees\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (assigneesMatch) {
      const assigneesBlock = assigneesMatch[1];
      this.parseAssignees(assigneesBlock, config);
    }

    // 3. Parse Prompt Template section if present (takes precedence if section exists)
    const promptMatch = content.match(/##\s+(?:Agent\s+|Task\s+)?Prompt\s+Template\s*\r?\n([\s\S]*?)(?=\r?\n##\s+|$)/i);
    if (promptMatch) {
      const templateContent = promptMatch[1].trim();
      const codeBlockMatch = templateContent.match(/^```(?:markdown|md)?\r?\n([\s\S]*?)\r?\n```$/);
      config.agentPromptTemplate = codeBlockMatch ? codeBlockMatch[1].trim() : templateContent;
    }

    // 4. Parse Orchestration YAML block if present
    try {
      config.orchestration = OrchestrationConfigParser.extractFromMarkdown(content);
    } catch (e) {
      console.warn('Could not parse orchestration block in config.md:', e);
    }

    return config;
  }

  private static parseAssignees(block: string, config: BoardConfig): void {
    // Look for ### Humans or ### Agents sub-sections
    const humanMatch = block.match(/###\s+Humans\s*\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/i);
    if (humanMatch) {
      this.parseUserList(humanMatch[1], 'human', config);
    }

    const agentMatch = block.match(/###\s+Agents\s*\r?\n([\s\S]*?)(?=\r?\n###\s+|$)/i);
    if (agentMatch) {
      this.parseUserList(agentMatch[1], 'agent', config);
    }

    // If no ### Humans/Agents, try generic item parsing
    if (!humanMatch && !agentMatch) {
      this.parseUserList(block, 'human', config);
    }
  }

  private static parseUserList(block: string, defaultType: 'human' | 'agent', config: BoardConfig): void {
    // Matches items starting with - **Name** or - Name
    const itemSplits = block.split(/(?=^[-*]\s+\*{0,2}[A-Za-z0-9])/m);

    for (const item of itemSplits) {
      const trimmed = item.trim();
      if (!trimmed || !trimmed.startsWith('-') && !trimmed.startsWith('*')) continue;

      const lines = trimmed.split(/\r?\n/);
      const headerLine = lines[0];
      const nameMatch = headerLine.match(/^[-*]\s+\*{0,2}(.+?)\*{0,2}(?:\s*\(.*?\))?$/);
      if (!nameMatch) continue;

      const name = nameMatch[1].trim();
      let id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      let role = '';
      let type: 'human' | 'agent' = defaultType;
      let agentType: 'cli' | 'vscode-command' = 'cli';
      let command = '';
      let workingDir: string | undefined;
      let prompt: string | undefined;

      for (let i = 1; i < lines.length; i++) {
        const subLine = lines[i].trim();
        const kv = subLine.match(/^[-*]\s*([^:]+)\s*:\s*(.+)$/);
        if (kv) {
          const k = kv[1].trim().toLowerCase();
          let v = kv[2].trim();
          if ((v.startsWith('`') && v.endsWith('`')) || (v.startsWith('"') && v.endsWith('"'))) {
            v = v.slice(1, -1);
          }

          if (k === 'id') {
            id = v;
          } else if (k === 'role') {
            role = v;
          } else if (k === 'type' || k === 'agenttype') {
            const vLower = v.toLowerCase();
            if (vLower === 'human') {
              type = 'human';
            } else if (vLower === 'agent' || vLower === 'cli' || vLower.includes('vscode')) {
              type = 'agent';
              if (vLower.includes('vscode')) {
                agentType = 'vscode-command';
              } else if (vLower === 'cli') {
                agentType = 'cli';
              }
            }
          } else if (k === 'command' || k === 'cmd') {
            command = v;
          } else if (k === 'workingdir' || k === 'cwd') {
            workingDir = v;
          } else if (k === 'prompt') {
            prompt = v;
          }
        }
      }

      let agentConfig: AgentRunnerConfig | undefined;
      if (type === 'agent') {
        agentConfig = {
          type: agentType,
          command,
          workingDir,
          prompt
        };
      }

      config.assignees.push({
        id,
        name,
        role: role || undefined,
        type,
        agentConfig
      });
    }
  }

  public static generateDefaultConfig(boardName: string): string {
    return `# Board Configuration

## Settings
- **Board Name**: ${boardName}
- **Columns Order**: Backlog, Ongoing, Assistance Required, Blocked, Completed
- **Auto Update Status In File**: true

## Assignees

### Humans
- **Developer**
  - ID: dev
  - Role: Full-stack Developer
  - Type: human

### Agents
- **Claude Code**
  - ID: claude-code
  - Type: cli
  - Command: \`claude -p "Review and implement ticket {ticket_path}"\`

- **Gemini CLI**
  - ID: gemini-cli
  - Type: cli
  - Command: \`gemini --prompt "Please work on ticket {ticket_path}: {ticket_title}"\`

- **Aider**
  - ID: aider
  - Type: cli
  - Command: \`aider --message "Implement ticket requirements in {ticket_path}" {ticket_path}\`

- **IDE Chat (Antigravity / Cursor / Copilot)**
  - ID: ide-chat
  - Type: vscode-command
  - Command: \`workbench.action.chat.open\`
  - Prompt: \`Please work on ticket {ticket_title} located at: {ticket_path}\`
`;
  }
}
