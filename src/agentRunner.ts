import type * as vscodeTypes from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Ticket, Assignee, BoardConfig } from './types';
import { ConfigParser } from './configParser';
import { ShellKind, detectShellKind, escapeForDoubleQuotes } from './shellEscape';
import { isTrusted } from './fleet/trust';

export interface LaunchRequest {
  kind: 'cli' | 'vscode-command';
  ticket: Ticket;
  assignee: Assignee;
  command: string;
  cwd: string;
  prompt?: string;
  model?: string;
}

export const DEFAULT_TASK = 'Review requirements and implement ticket {ticket_path}: {ticket_title}';

export interface FormatOptions {
  /** Instruction text substituted for {task} (defaults to implementing the ticket). */
  task?: string;
  /** True when the working folder is a workspace you marked trusted; adds `trustFlag` to the command. */
  trusted?: boolean;
  trustFlag?: string;
  /** Workspaces marked trusted in the extension; prepareLaunch checks the agent's working folder against them. */
  trustedRoots?: string[];
  /** Reasoning level for {effort_args}, with its CLI flag (e.g. --reasoning-effort). */
  effort?: string;
  effortFlag?: string;
  /** Conversation id for {session_id}; only a UUID-shaped value is accepted. */
  sessionId?: string;
  model?: string;
  /** e.g. `--model`; used for {model_args} and appended when the template has no model placeholder. */
  modelFlag?: string;
  shell?: ShellKind;
}

/** Model ids reach a shell unquoted, so only a conservative character set is accepted. */
export const SESSION_ID_PATTERN = /^[0-9a-fA-F-]{8,64}$/;
export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\/@+-]*$/;

function getVsCode(): typeof vscodeTypes | undefined {
  try {
    return require('vscode');
  } catch {
    return undefined;
  }
}

export class AgentRunner {
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
    rawTicketContent?: string,
    options: FormatOptions = {}
  ): string {
    const config = assignee.agentConfig;
    if (!config) return '';

    const vscode = getVsCode();
    const shell: ShellKind = options.shell || detectShellKind(vscode?.env?.shell);
    const esc = (v: string) => escapeForDoubleQuotes(v, shell);
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

    // Ticket-derived text is untrusted (any agent or contributor can write a ticket): escape it for the
    // target shell so a title like  x"; rm -rf ~; "  or  $(cmd)  stays inert inside the quoted prompt.
    const model = options.model && MODEL_ID_PATTERN.test(options.model) ? options.model : '';
    const modelArgs = model && options.modelFlag ? `${options.modelFlag} ${model}` : '';
    const effort = options.effort && /^[a-z]+$/.test(options.effort) ? options.effort : '';
    const effortArgs = effort && options.effortFlag ? `${options.effortFlag} ${effort}` : '';

    // {task} is the instruction text (implement / review / plan). Its own placeholders are expanded with raw
    // values first, then the whole sentence is escaped once.
    const rawTask = (options.task || DEFAULT_TASK)
      .replace(/\{ticket_path\}/g, () => ticket.path)
      .replace(/\{ticket_title\}/g, () => ticket.title)
      .replace(/\{ticket_id\}/g, () => ticket.id);

    const replacements: Record<string, string> = {
      '{task}': esc(rawTask),
      '{ticket_path}': esc(ticket.path),
      '{ticket_rel_path}': esc(ticket.relativePath),
      '{ticket_name}': esc(ticket.filename),
      '{ticket_id}': esc(ticket.id),
      '{ticket_title}': esc(ticket.title),
      '{ticket_summary}': esc(ticket.summary),
      '{ticket_content}': esc(content.slice(0, 1500)),
      '{workspace_root}': esc(workspaceFolder),
      '{board_root}': esc(boardRoot),
      '{column}': esc(ticket.column),
      '{model}': model,
      '{session_id}': options.sessionId && SESSION_ID_PATTERN.test(options.sessionId) ? options.sessionId : '',
      '{model_args}': modelArgs,
      '{effort_args}': effortArgs,
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

    // A model was chosen but the template has no placeholder for it: append the provider's model flag.
    if (modelArgs && !command.includes('{model_args}') && !command.includes('{model}')) {
      command = `${command.trimEnd()} ${modelArgs}`;
    }

    // Workspace trusted in the extension: tell the agent to skip its own trust check (flag is provider-defined, never user text).
    if (options.trusted && options.trustFlag && /^[\w =.-]+$/.test(options.trustFlag) && !command.includes(options.trustFlag)) {
      command = `${command.trimEnd()} ${options.trustFlag}`;
    }

    // A reasoning level was chosen but the template has no placeholder: append the effort flag.
    if (effortArgs && !command.includes('{effort_args}')) {
      command = `${command.trimEnd()} ${effortArgs}`;
    }

    // Single pass: a substituted value is never re-scanned, so ticket text containing "{model}" etc. stays literal.
    command = command.replace(/\{[a-z_]+\}/g, m => (m in replacements ? replacements[m] : m));
    command = command.replace(/ {2,}/g, ' ').trim();

    // A detected/configured executable path replaces a bare tool name at the start of the command, so the
    // agent starts even when its folder is missing from the editor's PATH.
    const exePath = config.path || config.executable;
    const first = command.match(/^([A-Za-z][\w.-]*)(?=\s|$)/);
    if (exePath && first && path.basename(exePath).replace(/\.[^.]+$/, '').toLowerCase() === first[1].toLowerCase()) {
      const quoted = `"${exePath}"`;
      command = (shell === 'powershell' ? '& ' : '') + quoted + command.slice(first[1].length);
    }

    // On Windows PowerShell, ensure quoted executable path starts with the call operator '&'
    if (process.platform === 'win32' && shell === 'powershell') {
      const trimmed = command.trim();
      if (trimmed.startsWith('"') && !trimmed.startsWith('&')) {
        command = '& ' + trimmed;
      }
    }

    return command;
  }

  /** Resolves everything needed to start an agent for a ticket (command text, cwd, prompt) without starting it. */
  public static async prepareLaunch(
    ticket: Ticket,
    assignee: Assignee,
    boardRoot: string,
    boardConfig?: BoardConfig,
    options: FormatOptions = {}
  ): Promise<LaunchRequest | null> {
    const vscode = getVsCode();
    if (assignee.type !== 'agent' || !assignee.agentConfig) {
      vscode?.window.showWarningMessage(`Assignee "${assignee.name}" is not configured as an executable agent.`);
      return null;
    }

    const config = assignee.agentConfig;
    const workspaceFolder = vscode?.workspace?.workspaceFolders?.[0]?.uri.fsPath || path.dirname(boardRoot);

    let ticketContent = '';
    try {
      ticketContent = await fs.promises.readFile(ticket.path, 'utf8');
    } catch {
      ticketContent = ticket.summary || ticket.title;
    }

    if (config.type === 'cli') {
      const cwd = config.workingDir ? config.workingDir.replace('{workspace_root}', workspaceFolder).replace('{board_root}', boardRoot) : workspaceFolder;
      const trusted = options.trustedRoots ? isTrusted(options.trustedRoots, cwd) : options.trusted;
      const command = this.formatCliCommand(ticket, assignee, boardRoot, boardConfig, ticketContent, { ...options, trusted });
      return { kind: 'cli', ticket, assignee, command, cwd, model: options.model };
    }

    if (config.type === 'vscode-command') {
      // The prompt goes to the clipboard / chat box, not a shell, so no shell escaping applies.
      const replacements: Record<string, string> = {
        '{ticket_path}': ticket.path,
        '{ticket_rel_path}': ticket.relativePath,
        '{ticket_name}': ticket.filename,
        '{ticket_id}': ticket.id,
        '{ticket_title}': ticket.title,
        '{ticket_summary}': ticket.summary,
        '{ticket_content}': ticketContent.slice(0, 1500),
        '{workspace_root}': workspaceFolder,
        '{board_root}': boardRoot,
        '{column}': ticket.column,
        '{model}': options.model || ''
      };
      let prompt = config.prompt || `Please review and work on ticket "${ticket.title}" at: ${ticket.path}

Summary:
${ticket.summary}`;
      for (const [placeholder, value] of Object.entries(replacements)) {
        prompt = prompt.split(placeholder).join(value);
      }
      return { kind: 'vscode-command', ticket, assignee, command: config.command, cwd: workspaceFolder, prompt, model: options.model };
    }

    return null;
  }

  /** Optional hook (set by the fleet controller) that tracks each launch as a session. */
  public static launcher?: (req: LaunchRequest) => Promise<boolean>;

  public static async dispatch(
    ticket: Ticket,
    assignee: Assignee,
    boardRoot: string,
    boardConfig?: BoardConfig,
    options: FormatOptions = {}
  ): Promise<boolean> {
    const req = await this.prepareLaunch(ticket, assignee, boardRoot, boardConfig, options);
    if (!req) return false;
    return this.launcher ? this.launcher(req) : this.launchDefault(req);
  }

  /** Fallback launcher: a fresh terminal per dispatch (never type a new command into a still-running agent). */
  public static async launchDefault(req: LaunchRequest): Promise<boolean> {
    const vscode = getVsCode();
    if (req.kind === 'cli') {
      const base = `Agent: ${req.assignee.name} · ${req.ticket.id || req.ticket.filename}`;
      let name = base;
      let n = 2;
      while (vscode?.window.terminals?.some(t => t.name === name)) name = `${base} #${n++}`;
      const terminal = vscode?.window.createTerminal({ name, cwd: req.cwd });
      if (!terminal) return false;
      terminal.show(false);
      await new Promise(r => setTimeout(r, 600));
      terminal.sendText(req.command);
      vscode?.window.showInformationMessage(`Dispatched ticket "${req.ticket.title}" to ${req.assignee.name}.`);
      return true;
    }
    await vscode?.env.clipboard.writeText(req.prompt || '');
    vscode?.window.showInformationMessage(`Copied ticket context to clipboard! Triggering ${req.assignee.name} (${req.command})...`);
    try {
      await vscode?.commands.executeCommand(req.command);
    } catch (err: any) {
      vscode?.window.showErrorMessage(`Failed to execute command "${req.command}": ${err?.message || err}`);
    }
    return true;
  }
}
