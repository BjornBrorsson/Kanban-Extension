import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Ticket, Assignee } from './types';

export class AgentRunner {
  private static terminals: Map<string, vscode.Terminal> = new Map();

  public static async dispatch(ticket: Ticket, assignee: Assignee, boardRoot: string): Promise<boolean> {
    if (assignee.type !== 'agent' || !assignee.agentConfig) {
      vscode.window.showWarningMessage(`Assignee "${assignee.name}" is not configured as an executable agent.`);
      return false;
    }

    const config = assignee.agentConfig;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || path.dirname(boardRoot);

    // Read full ticket content if needed for substitution
    let ticketContent = '';
    try {
      ticketContent = await fs.promises.readFile(ticket.path, 'utf8');
    } catch {
      ticketContent = ticket.summary || ticket.title;
    }

    // Prepare template replacements
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

    if (config.type === 'cli') {
      let command = config.command;
      for (const [placeholder, value] of Object.entries(replacements)) {
        const safeValue = (placeholder === '{ticket_title}' || placeholder === '{ticket_summary}' || placeholder === '{ticket_name}')
          ? value.replace(/"/g, '\\"')
          : value;
        command = command.split(placeholder).join(safeValue);
      }

      const cwd = config.workingDir ? config.workingDir.replace('{workspace_root}', workspaceFolder).replace('{board_root}', boardRoot) : workspaceFolder;

      const terminalName = `Agent: ${assignee.name}`;
      let terminal = this.terminals.get(terminalName);

      // Check if terminal still exists in active terminals
      const existing = vscode.window.terminals.find(t => t.name === terminalName);
      if (!existing) {
        terminal = vscode.window.createTerminal({
          name: terminalName,
          cwd
        });
        this.terminals.set(terminalName, terminal);
      } else {
        terminal = existing;
      }

      terminal.show(false);
      if (!existing) {
        await new Promise(r => setTimeout(r, 600));
      }
      terminal.sendText(command);

      vscode.window.showInformationMessage(`Dispatched ticket "${ticket.title}" to ${assignee.name}.`);
      return true;
    } else if (config.type === 'vscode-command') {
      let prompt = config.prompt || `Please review and work on ticket "${ticket.title}" at: ${ticket.path}\n\nSummary:\n${ticket.summary}`;
      for (const [placeholder, value] of Object.entries(replacements)) {
        prompt = prompt.split(placeholder).join(value);
      }

      // Copy prompt to clipboard
      await vscode.env.clipboard.writeText(prompt);

      vscode.window.showInformationMessage(
        `Copied ticket context to clipboard! Triggering ${assignee.name} (${config.command})...`
      );

      try {
        await vscode.commands.executeCommand(config.command);
      } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to execute command "${config.command}": ${err?.message || err}`);
      }
      return true;
    }

    return false;
  }
}
