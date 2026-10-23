import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BoardManager } from '../boardManager';
import { AgentRunner, LaunchRequest } from '../agentRunner';
import { Board, Ticket } from '../types';
import { AgentProvider, ProviderRegistry, ProviderRole, providerToAssignee } from './providers';
import { JsonFleetStore, ProviderUsage, Session, SessionLauncher, SessionManager } from './sessions';
import { PlanCandidate, PlanDecision, matchProvider, pickReviewer, planWork } from './scheduler';

export interface FleetSettings {
  autopilot: boolean;
  autoReview: boolean;
  orchestratorProviderId: string;
  orchestratorModel: string;
  intervalSeconds: number;
  /** Max sessions the autopilot may start per tick. */
  maxNewPerTick: number;
}

const DEFAULT_SETTINGS: FleetSettings = {
  autopilot: false,
  autoReview: false,
  orchestratorProviderId: '',
  orchestratorModel: '',
  intervalSeconds: 30,
  maxNewPerTick: 3
};

const REVIEW_TASK =
  'Code-review the work done for ticket {ticket_path}: {ticket_title}. Check every acceptance criterion, run the tests, ' +
  'and record findings under the ticket Work Log. Do not start new features. If the work passes, say so in the Work Log.';

/** Starts each session in its own terminal and reports when the terminal / shell command ends. */
class TerminalLauncher implements SessionLauncher {
  private terminals = new Map<string, vscode.Terminal>();
  public manager!: SessionManager;

  constructor(disposables: vscode.Disposable[]) {
    disposables.push(
      vscode.window.onDidCloseTerminal(t => {
        for (const [id, term] of this.terminals) {
          if (term === t) {
            this.terminals.delete(id);
            this.manager.ended(id, t.exitStatus?.code, 'Terminal closed');
          }
        }
      })
    );
    // Shell-integration terminals report the real exit code of the agent command (VS Code 1.93+).
    const onEnd = (vscode.window as any).onDidEndTerminalShellExecution;
    if (typeof onEnd === 'function') {
      disposables.push(
        onEnd((e: any) => {
          for (const [id, term] of this.terminals) {
            if (term === e.terminal) {
              this.manager.ended(id, typeof e.exitCode === 'number' ? e.exitCode : undefined);
            }
          }
        })
      );
    }
  }

  public async launch(session: Session, payload: LaunchRequest): Promise<boolean> {
    if (payload.kind === 'vscode-command') {
      await AgentRunner.launchDefault(payload);
      // An IDE chat has no process we can watch: free the slot right away.
      setTimeout(() => this.manager.ended(session.id, 0, 'Handed to IDE chat'), 0);
      return true;
    }

    const base = `Agent: ${session.providerName} · ${session.ticketId || path.basename(session.ticketPath)}`;
    let name = base;
    let n = 2;
    while (vscode.window.terminals.some(t => t.name === name)) name = `${base} #${n++}`;

    const terminal = vscode.window.createTerminal({ name, cwd: payload.cwd });
    this.terminals.set(session.id, terminal);
    terminal.show(true);

    // Prefer shell integration (gives us the exit code); fall back to a plain sendText after a short wait.
    const deadline = Date.now() + 3000;
    while (!(terminal as any).shellIntegration && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
    const si = (terminal as any).shellIntegration;
    if (si && typeof si.executeCommand === 'function') {
      si.executeCommand(payload.command);
    } else {
      terminal.sendText(payload.command);
    }
    return true;
  }

  public show(session: Session): void {
    const t = this.terminals.get(session.id);
    if (t) t.show(false);
    else vscode.window.showInformationMessage(`No live terminal for this session (${session.status}).`);
  }

  public kill(session: Session): void {
    const t = this.terminals.get(session.id);
    if (t) {
      this.terminals.delete(session.id);
      t.dispose();
    }
  }
}

export class FleetController {
  private static instance: FleetController | undefined;

  public readonly registry: ProviderRegistry;
  public readonly sessions: SessionManager;
  public settings: FleetSettings;
  private readonly settingsPath: string;
  private readonly briefPath: string;
  private timer: NodeJS.Timeout | undefined;
  private reviewed = new Set<string>();
  private changeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.changeEmitter.event;

  public static get(): FleetController | undefined { return FleetController.instance; }

  public static init(context: vscode.ExtensionContext): FleetController {
    if (!FleetController.instance) {
      FleetController.instance = new FleetController(context);
    }
    return FleetController.instance;
  }

  private constructor(context: vscode.ExtensionContext) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || context.globalStorageUri.fsPath;
    const dir = path.join(root, '.agentic-kanban');
    this.settingsPath = path.join(dir, 'fleet.json');
    this.briefPath = path.join(dir, 'runtime', 'orchestrator-brief.md');
    this.registry = new ProviderRegistry(root);
    this.settings = this.loadSettings();

    const launcher = new TerminalLauncher(context.subscriptions);
    this.sessions = new SessionManager(
      id => this.registry.list().find(p => p.id === id),
      launcher,
      new JsonFleetStore(path.join(dir, 'runtime', 'fleet-usage.json'))
    );
    launcher.manager = this.sessions;

    // Everything that starts an agent (card buttons, assign menu) now goes through the session manager.
    AgentRunner.launcher = async (req: LaunchRequest) => {
      const provider = this.registry.get(req.assignee.id);
      if (!provider) return AgentRunner.launchDefault(req);
      const board = BoardManager.getInstance().findBoardForTicketPath(req.ticket.path);
      await this.startSession(provider, req.model || provider.defaultModel, 'worker', req.ticket, board?.id || '', req);
      return true;
    };

    this.sessions.onChange(() => {
      this.maybeAutoReview();
      this.changeEmitter.fire();
    });
    this.registry.onChange(() => this.changeEmitter.fire());

    this.restartTimer();
    context.subscriptions.push({ dispose: () => this.timer && clearInterval(this.timer) });
  }

  // ---------------------------------------------------------------- settings

  private loadSettings(): FleetSettings {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(this.settingsPath, 'utf8')) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  public saveSettings(patch: Partial<FleetSettings>): FleetSettings {
    const next = { ...this.settings, ...patch };
    next.intervalSeconds = Math.min(3600, Math.max(10, Math.round(Number(next.intervalSeconds)) || 30));
    next.maxNewPerTick = Math.min(20, Math.max(1, Math.round(Number(next.maxNewPerTick)) || 3));
    this.settings = next;
    try {
      fs.mkdirSync(path.dirname(this.settingsPath), { recursive: true });
      fs.writeFileSync(this.settingsPath, JSON.stringify(next, null, 2), 'utf8');
    } catch (e) {
      console.warn('[Agentic Kanban] Could not save fleet settings:', e);
    }
    this.restartTimer();
    this.changeEmitter.fire();
    return next;
  }

  private restartTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => { void this.tick(); }, this.settings.intervalSeconds * 1000);
  }

  /** Seeds the registry from legacy config.md agents the first time (so existing boards keep working). */
  public seedFromBoards(boards: Board[]): void {
    for (const b of boards) {
      this.registry.seedFromAssignees(b.config.assignees);
    }
  }

  // ---------------------------------------------------------------- starting sessions

  public async startSession(
    provider: AgentProvider,
    model: string,
    role: ProviderRole,
    ticket: Ticket,
    boardId: string,
    prebuilt?: LaunchRequest,
    task?: string,
    queueIfBusy = true
  ): Promise<Session | undefined> {
    const board = (boardId && BoardManager.getInstance().getBoard(boardId)) ||
      BoardManager.getInstance().findBoardForTicketPath(ticket.path);
    const boardRoot = board?.rootPath || path.dirname(ticket.path);

    let payload = prebuilt;
    if (!payload || task) {
      if (role !== 'worker' && !provider.command.includes('{task}')) {
        vscode.window.showWarningMessage(
          `${provider.name} uses a custom command without {task}, so it cannot act as ${role}. Add {task} to its command in Agent Providers.`
        );
        return undefined;
      }
      payload = (await AgentRunner.prepareLaunch(ticket, providerToAssignee(provider), boardRoot, board?.config, {
        model,
        modelFlag: provider.modelFlag,
        task
      })) || undefined;
    }
    if (!payload) return undefined;

    const session = await this.sessions.request({
      provider, model, role,
      ticketPath: ticket.path,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      boardId: board?.id || boardId,
      payload,
      queueIfBusy
    });

    if (session.status === 'queued') {
      vscode.window.showInformationMessage(`${provider.name} is at capacity — "${ticket.title}" queued. ${session.note || ''}`.trim());
    } else if (session.status === 'cancelled') {
      vscode.window.showWarningMessage(session.note || `${provider.name} could not start the session.`);
    } else if (session.status === 'running') {
      vscode.window.showInformationMessage(`Dispatched "${ticket.title}" to ${provider.name}${model ? ` (${model})` : ''}.`);
    }
    return session;
  }

  /** Assign menu / card action: run a ticket on a specific provider + model. */
  public async dispatchTicket(boardId: string, ticket: Ticket, providerId: string, model?: string): Promise<boolean> {
    const provider = this.registry.get(providerId);
    if (!provider) {
      vscode.window.showErrorMessage(`Agent provider "${providerId}" not found. Open Agent Providers to configure it.`);
      return false;
    }
    if (!provider.enabled) {
      vscode.window.showWarningMessage(`${provider.name} is disabled in Agent Providers.`);
      return false;
    }
    const chosen = model && (provider.models.length === 0 || provider.models.includes(model)) ? model : provider.defaultModel;
    return !!(await this.startSession(provider, chosen, 'worker', ticket, boardId));
  }

  // ---------------------------------------------------------------- planning

  public candidates(): PlanCandidate[] {
    const out: PlanCandidate[] = [];
    for (const board of BoardManager.getInstance().getAllBoards()) {
      for (const col of board.columns) {
        if (!/^backlog$/i.test(col.name)) continue;
        for (const t of col.tickets) {
          // Only tickets a human has marked Ready are fair game for the scheduler.
          if (t.subfolder && /^ready$/i.test(t.subfolder)) {
            out.push({ ticket: t, boardId: board.id, boardRoot: board.rootPath });
          }
        }
      }
    }
    return out;
  }

  public plan(): PlanDecision[] {
    return planWork(this.candidates(), this.registry.list(), this.sessions, { maxNew: this.settings.maxNewPerTick * 3 });
  }

  public usage(): ProviderUsage[] {
    return this.registry.list().map(p => this.sessions.usage(p));
  }

  private findTicket(ticketPath: string): { ticket: Ticket; board: Board } | undefined {
    const key = path.resolve(ticketPath).toLowerCase();
    for (const board of BoardManager.getInstance().getAllBoards()) {
      for (const col of board.columns) {
        const t = col.tickets.find(x => path.resolve(x.path).toLowerCase() === key);
        if (t) return { ticket: t, board };
      }
    }
    return undefined;
  }

  /** Executes one plan decision: assign, move to Ongoing when a slot is free, and start (or queue) the session. */
  public async execute(decision: PlanDecision): Promise<boolean> {
    const found = this.findTicket(decision.ticketPath);
    const provider = this.registry.get(decision.providerId);
    if (!found || !provider) return false;
    const bm = BoardManager.getInstance();

    await bm.assignTicket(found.board.id, found.ticket.path, provider.name);
    let ticket = found.ticket;
    if (decision.startsNow) {
      const ongoing = found.board.columns.find(c => /ongoing|in progress/i.test(c.name));
      if (ongoing && await bm.moveTicket(found.board.id, found.ticket.path, ongoing.name, null)) {
        ticket = this.findTicket(path.join(found.board.rootPath, ongoing.name, path.basename(found.ticket.path)))?.ticket || ticket;
      }
    }
    return !!(await this.startSession(provider, decision.model, 'worker', ticket, found.board.id));
  }

  public async runPlan(): Promise<number> {
    let started = 0;
    for (const d of this.plan().slice(0, this.settings.maxNewPerTick)) {
      if (await this.execute(d)) started++;
    }
    return started;
  }

  public async tick(): Promise<void> {
    await this.sessions.tick();
    this.sessions.prune();
    if (this.settings.autopilot) {
      await this.runPlan();
    }
    this.changeEmitter.fire();
  }

  // ---------------------------------------------------------------- reviews & orchestrator agent

  public async requestReview(sessionId: string): Promise<boolean> {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    const found = this.findTicket(s.ticketPath);
    if (!found) {
      vscode.window.showWarningMessage('Ticket for this session was not found on the board (it may have moved or been deleted).');
      return false;
    }
    const reviewer = pickReviewer(this.registry.list(), this.sessions, s.providerId);
    if (!reviewer) {
      vscode.window.showWarningMessage('No reviewer-capable provider is available. Enable the "reviewer" role on a provider with a {task} command.');
      return false;
    }
    return !!(await this.startSession(reviewer, reviewer.defaultModel, 'reviewer', found.ticket, found.board.id, undefined, REVIEW_TASK));
  }

  private maybeAutoReview(): void {
    if (!this.settings.autoReview) return;
    for (const s of this.sessions.list()) {
      if (s.role === 'worker' && s.status === 'finished' && !this.reviewed.has(s.id)) {
        this.reviewed.add(s.id);
        void this.requestReview(s.id);
      }
    }
  }

  /** Writes a capacity/board brief and asks the chosen orchestrator provider to set assignees on Ready tickets. */
  public async askOrchestrator(): Promise<boolean> {
    const provider = this.registry.get(this.settings.orchestratorProviderId);
    if (!provider) {
      vscode.window.showWarningMessage('Pick an orchestrator agent first (Orchestrator view → Orchestrator agent).');
      return false;
    }
    const boards = BoardManager.getInstance().getAllBoards();
    const board = boards[0];
    if (!board) return false;

    const providers = this.registry.list();
    const usage = this.usage();
    const lines: string[] = [
      '# Orchestrator brief',
      '',
      'You are the orchestrator for this Agentic Kanban workspace. Your job: decide which agent should take each Ready ticket.',
      '',
      '## Rules',
      '- Only edit the `| **Assignee** |` row (and optionally add a `model:<name>` label) of tickets in `Backlog/Ready/`.',
      '- Assign to a provider by its exact name from the table below. Never exceed a provider\'s free capacity.',
      '- Prefer cheaper/faster models for small tickets and stronger models for architecture or risky changes.',
      '- Leave tickets you are unsure about unassigned and say why in `00_Plan.md`. Do not start implementing anything yourself.',
      '- The autopilot / "Run plan" button will start the sessions; do not launch other agents.',
      '',
      '## Provider capacity',
      '| Provider | Account | State | Running | Window usage | Models | Roles |',
      '|---|---|---|---|---|---|---|'
    ];
    for (const p of providers) {
      const u = usage.find(x => x.providerId === p.id)!;
      lines.push(
        `| ${p.name} | ${p.account || '-'} | ${u.state} | ${u.running}/${u.maxParallel} | ` +
        `${u.pct === null ? 'unlimited' : `${u.startsInWindow}/${u.maxSessionsPerWindow} per ${u.windowMinutes}m`} | ` +
        `${p.models.join(', ') || '-'} | ${p.roles.join(', ')} |`
      );
    }
    lines.push('', '## Ready tickets');
    const cands = this.candidates();
    if (!cands.length) lines.push('(none)');
    for (const c of cands) {
      lines.push(`- ${c.ticket.id || path.basename(c.ticket.path)} — ${c.ticket.title} [${c.ticket.priority}] (${c.ticket.path})` +
        ` assignee: ${c.ticket.assignee || 'unassigned'}`);
    }

    fs.mkdirSync(path.dirname(this.briefPath), { recursive: true });
    fs.writeFileSync(this.briefPath, lines.join('\n'), 'utf8');

    const planTicket: Ticket = {
      id: 'ORCHESTRATE', filename: path.basename(this.briefPath), path: this.briefPath,
      relativePath: path.relative(board.rootPath, this.briefPath), column: 'Backlog', subfolder: null,
      title: 'Orchestration planning', summary: 'Assign Ready tickets to agents', description: '', status: 'Ongoing',
      priority: 'P1', epic: null, type: 'Architecture', estimate: null, milestone: null, assignee: provider.name,
      dependsOn: [], blocks: [], labels: [], acceptanceCriteria: [], progress: { done: 0, total: 0 },
      mtime: Date.now(), hasWorkLog: false
    };
    const task = `Read ${this.briefPath} and follow its instructions to assign the Ready tickets.`;
    const model = this.settings.orchestratorModel || provider.defaultModel;
    return !!(await this.startSession(provider, model, 'orchestrator', planTicket, board.id, undefined, task));
  }

  public providerForAssignee(name: string | null | undefined): AgentProvider | undefined {
    return matchProvider(this.registry.list(), name);
  }
}
