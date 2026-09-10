import type * as vscodeTypes from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Ticket, Assignee, BoardConfig } from './types';
import { ConfigParser } from './configParser';

function getVsCode(): typeof vscodeTypes | undefined {
  try {
    return require('vscode');
  } catch {
    return undefined;
  }
}

export class AgentRunner {
  private static terminals: Map<string, any> = new Map();

  /**
   * Resolves the executable path for the Antigravity CLI (agy).
   * Resolution priority:
   * 1. Explicitly configured path on assignee agentConfig
   * 2. BoardConfig.antigravityPath (from Settings)
   * 3. VS Code configuration 'agenticKanban.antigravityPath'
   * 4. Environment variables AGY_PATH or ANTIGRAVITY_PATH
   * 5. Standard installation paths on Windows/POSIX
   * 6. Fallback to 'agy.exe' (Windows) or 'agy' (POSIX)
   */
  public static resolveAntigravityPath(configuredPath?: string, boardConfig?: BoardConfig): string {
    if (configuredPath && configuredPath.trim()) {
      return configuredPath.trim();
    }
    if (boardConfig?.antigravityPath && boardConfig.antigravityPath.trim()) {
      return boardConfig.antigravityPath.trim();
    }

    try {
      const vscode = getVsCode();
      const vscodeConfig = vscode?.workspace?.getConfiguration?.('agenticKanban')?.get<string>('antigravityPath');
      if (vscodeConfig && vscodeConfig.trim()) {
        return vscodeConfig.trim();
      }
    } catch {
      // Ignored in non-VSCode test harnesses
    }

    if (process.env.AGY_PATH && process.env.AGY_PATH.trim()) {
      return process.env.AGY_PATH.trim();
    }
    if (process.env.ANTIGRAVITY_PATH && process.env.ANTIGRAVITY_PATH.trim()) {
      return process.env.ANTIGRAVITY_PATH.trim();
    }

    // Standard discovery candidates
    const candidates: string[] = [];
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        candidates.push(path.join(localAppData, 'agy', 'bin', 'agy.exe'));
      }
      const userProfile = process.env.USERPROFILE;
      if (userProfile) {
        candidates.push(path.join(userProfile, 'AppData', 'Local', 'agy', 'bin', 'agy.exe'));
      }
      const programFiles = process.env.ProgramFiles;
      if (programFiles) {
        candidates.push(path.join(programFiles, 'agy', 'bin', 'agy.exe'));
      }
    } else {
      const home = process.env.HOME;
      if (home) {
        candidates.push(path.join(home, '.agy', 'bin', 'agy'));
        candidates.push(path.join(home, '.local', 'bin', 'agy'));
      }
      candidates.push('/usr/local/bin/agy');
      candidates.push('/usr/bin/agy');
    }

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return process.platform === 'win32' ? 'agy.exe' : 'agy';
  }

  /**
   * Formats the CLI command string for an agent, performing template substitution,
   * path resolution, and legacy syntax upgrade.
   */
  public static formatCliCommand(
    ticket: Ticket,
    assignee: Assignee,
    boardRoot: string,
    boardConfig?: BoardConfig,
    rawTicketContent?: string
  ): string {
    const config = assignee.agentConfig;
    if (!config) return '';

    const vscode = getVsCode();
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path.dirname(boardRoot);
    const content = rawTicketContent ?? ticket.summary ?? ticket.title;

    // Resolve agy executable path
    let effectiveBoardConfig = boardConfig;
    if (!effectiveBoardConfig) {
      const configPath = path.join(boardRoot, 'config.md');
      if (fs.existsSync(configPath)) {
        try {
          const cfgText = fs.readFileSync(configPath, 'utf8');
          effectiveBoardConfig = ConfigParser.parse(cfgText, 'board');
        } catch {}
      }
    }

    const agyPath = this.resolveAntigravityPath(config.path || config.executable, effectiveBoardConfig);

    const replacements: Record<string, string> = {
      '{ticket_path}': ticket.path,
      '{ticket_rel_path}': ticket.relativePath,
      '{ticket_name}': ticket.filename,
      '{ticket_id}': ticket.id,
      '{ticket_title}': ticket.title,
      '{ticket_summary}': ticket.summary,
      '{ticket_content}': content.replace(/"/g, '\\"').slice(0, 1500),
      '{workspace_root}': workspaceFolder,
      '{board_root}': boardRoot,
      '{column}': ticket.column,
      '{agy_path}': agyPath,
      '{antigravity_path}': agyPath,
      '{executable}': config.path || config.executable || agyPath,
      '{agent_path}': config.path || config.executable || agyPath
    };

    const isAntigravity = assignee.id === 'antigravity-cli' ||
      assignee.id === 'agy' ||
      assignee.name.toLowerCase().includes('antigravity');

    let command = config.command || '';
    if (isAntigravity) {
      if (!command || !command.trim()) {
        command = `& "{agy_path}" -p "Review requirements and implement ticket {ticket_path}: {ticket_title}" --dangerously-skip-permissions`;
      } else if (/^agy\s+chat\b/i.test(command)) {
        // Upgrade legacy 'agy chat' commands to verified '-p' syntax with --dangerously-skip-permissions
        command = command.replace(/^agy\s+chat\b/i, `& "{agy_path}" -p`);
        if (!command.includes('--dangerously-skip-permissions')) {
          command += ' --dangerously-skip-permissions';
        }
      } else if (/^agy\b/i.test(command) && !command.startsWith('&')) {
        // Ensure agy invocation uses the resolved path
        command = command.replace(/^agy\b/i, `& "{agy_path}"`);
      }
    }

    for (const [placeholder, value] of Object.entries(replacements)) {
      const safeValue = (placeholder === '{ticket_title}' || placeholder === '{ticket_summary}' || placeholder === '{ticket_name}')
        ? value.replace(/"/g, '\\"')
        : value;
      command = command.split(placeholder).join(safeValue);
    }

    // On Windows PowerShell, ensure quoted executable path starts with the call operator '&'
    if (process.platform === 'win32') {
      const trimmed = command.trim();
      if (trimmed.startsWith('"') && !trimmed.startsWith('&')) {
        command = '& ' + trimmed;
      }
    }

    return command;
  }

  public static async dispatch(
    ticket: Ticket,
    assignee: Assignee,
    boardRoot: string,
    boardConfig?: BoardConfig
  ): Promise<boolean> {
    const vscode = getVsCode();
    if (assignee.type !== 'agent' || !assignee.agentConfig) {
      vscode?.window.showWarningMessage(`Assignee "${assignee.name}" is not configured as an executable agent.`);
      return false;
    }

    const config = assignee.agentConfig;
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path.dirname(boardRoot);

    // Read full ticket content if needed for substitution
    let ticketContent = '';
    try {
      ticketContent = await fs.promises.readFile(ticket.path, 'utf8');
    } catch {
      ticketContent = ticket.summary || ticket.title;
    }

    if (config.type === 'cli') {
      const command = this.formatCliCommand(ticket, assignee, boardRoot, boardConfig, ticketContent);
      const cwd = config.workingDir ? config.workingDir.replace('{workspace_root}', workspaceFolder).replace('{board_root}', boardRoot) : workspaceFolder;

      const terminalName = `Agent: ${assignee.name}`;
      let terminal = this.terminals.get(terminalName);

      // Check if terminal still exists in active terminals
      const existing = vscode?.window.terminals?.find(t => t.name === terminalName);
      if (!existing) {
        terminal = vscode?.window.createTerminal({
          name: terminalName,
          cwd
        });
        if (terminal) {
          this.terminals.set(terminalName, terminal);
        }
      } else {
        terminal = existing;
      }

      terminal?.show(false);
      if (!existing) {
        await new Promise(r => setTimeout(r, 600));
      }
      terminal?.sendText(command);

      vscode?.window.showInformationMessage(`Dispatched ticket "${ticket.title}" to ${assignee.name}.`);
      return true;
    } else if (config.type === 'vscode-command') {
      const replacements: Record<string, string> = {
        '{ticket_path}': ticket.path,
        '{ticket_rel_path}': ticket.relativePath,
        '{ticket_name}': ticket.filename,
        '{ticket_id}': ticket.id,
        '{ticket_title}': ticket.title,
        '{ticket_summary}': ticket.summary,
        '{ticket_content}': ticketContent.replace(/"/g, '\\"').slice(0, 1500),
        '{workspace_root}': workspaceFolder,
        '{board_root}': boardRoot,
        '{column}': ticket.column
      };

      let prompt = config.prompt || `Please review and work on ticket "${ticket.title}" at: ${ticket.path}\n\nSummary:\n${ticket.summary}`;
      for (const [placeholder, value] of Object.entries(replacements)) {
        prompt = prompt.split(placeholder).join(value);
      }

      // Copy prompt to clipboard
      await vscode?.env.clipboard.writeText(prompt);

      vscode?.window.showInformationMessage(
        `Copied ticket context to clipboard! Triggering ${assignee.name} (${config.command})...`
      );

      try {
        await vscode?.commands.executeCommand(config.command);
      } catch (err: any) {
        vscode?.window.showErrorMessage(`Failed to execute command "${config.command}": ${err?.message || err}`);
      }
      return true;
    }

    return false;
  }
}
