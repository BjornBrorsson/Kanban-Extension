import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BoardManager } from '../boardManager';
import { AgentRunner, LaunchRequest } from '../agentRunner';
import { Board, Ticket } from '../types';
import { AgentProvider, ProviderRegistry, ProviderRole, providerToAssignee } from './providers';
import { JsonFleetStore, ProviderUsage, Session, SessionLauncher, SessionManager } from './sessions';
import { detectAll, detectOne } from './detect';
import { claim, findMessageBoard, readClaims, release } from './messageBoard';
import { LimitInfo, detectAttention, detectLimit, pickFallback } from './limits';
import { CatalogIndex, CatalogStore, parseCopilotPolicy, providerPatches } from './catalog';
import { JsonSpeedStore, SpeedBook } from './speed';
import { Objective, OptimizerContext, estimateRun } from './optimizer';
import { PlanCandidate, PlanDecision, matchProvider, pickReviewer, planWork } from './scheduler';

export interface FleetSettings {
  autopilot: boolean;
  autoReview: boolean;
  orchestratorProviderId: string;
  orchestratorModel: string;
  intervalSeconds: number;
  /** Max sessions the autopilot may start per tick. */
  maxNewPerTick: number;
  /** Automatically resume sessions that were interrupted by a crash/PC/editor close or failed with an error. */
  autoResume: boolean;
  /** How many times the same work may be auto-resumed before waiting for a human. */
  maxAutoRetries: number;
  /** When a model hits its usage limit: continue on another capable model, or wait for the reset. */
  autoFailover: boolean;
  /** Run automated sessions (autopilot, resume, failover, review) in hidden terminals; reveal them with Open terminal. */
  backgroundTerminals: boolean;
  /** Flag a running session as needing you after this many minutes without output. */
  idleMinutes: number;
  /** What the orchestrator optimises: balanced, cost (cheapest) or speed (fastest). */
  objective: Objective;
  /** How many versions of each model family stay visible after curating the catalog. */
  keepModelVersions: number;
}

const DEFAULT_SETTINGS: FleetSettings = {
  autopilot: false,
  autoReview: false,
  orchestratorProviderId: '',
  orchestratorModel: '',
  intervalSeconds: 30,
  maxNewPerTick: 3,
  autoResume: false,
  maxAutoRetries: 2,
  autoFailover: true,
  backgroundTerminals: true,
  idleMinutes: 10,
  objective: 'balanced',
  keepModelVersions: 2
};

const RESUME_TASK =
  'You were interrupted while working on ticket {ticket_path}: {ticket_title} (network error, crash, or the editor/PC closed). ' +
  'Check the ticket Work Log and the git status/diff to see what is already done, then continue from where you stopped. ' +
  'Do not redo finished work. If everything is already complete, verify it and say so in the Work Log.';

const REVIEW_TASK =
  'Code-review the work done for ticket {ticket_path}: {ticket_title}. Check every acceptance criterion, run the tests, ' +
  'and record findings under the ticket Work Log. Do not start new features. If the work passes, say so in the Work Log.';

/** Starts each session in its own terminal and reports when the terminal / shell command ends. */
class TerminalLauncher implements SessionLauncher {
  private terminals = new Map<string, vscode.Terminal>();
  public manager!: SessionManager;
  /** Set while the editor is closing so vanishing terminals are not mistaken for user action. */
  public shuttingDown = false;
  public onLimit?: (s: Session, info: LimitInfo) => void;
  public onAttention?: (s: Session, text: string | undefined) => void;
  public modelsFor?: (providerId: string) => string[];
  private lastOutput = new Map<string, number>();

  public lastOutputAt(id: string): number | undefined { return this.lastOutput.get(id); }
  public hasTerminal(id: string): boolean { return this.terminals.has(id); }

  constructor(disposables: vscode.Disposable[]) {
    disposables.push(
      vscode.window.onDidCloseTerminal(t => {
        for (const [id, term] of this.terminals) {
          if (term === t) {
            this.terminals.delete(id);
            if (!this.shuttingDown) this.manager.ended(id, t.exitStatus?.code, 'Terminal closed', true);
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

    // Background sessions run in a hidden terminal; "Open terminal" reveals it so you can read it or type to the agent.
    const hidden = !!session.hidden;
    const terminal = vscode.window.createTerminal({ name, cwd: payload.cwd, hideFromUser: hidden } as vscode.TerminalOptions);
    this.terminals.set(session.id, terminal);
    if (!hidden) terminal.show(true);

    // Prefer shell integration (gives us the exit code); fall back to a plain sendText after a short wait.
    const deadline = Date.now() + 3000;
    while (!(terminal as any).shellIntegration && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
    }
    const si = (terminal as any).shellIntegration;
    if (si && typeof si.executeCommand === 'function') {
      const exec = si.executeCommand(payload.command);
      void this.watch(session, exec);
    } else {
      terminal.sendText(payload.command);
    }
    return true;
  }

  /** Reads the agent's output (shell integration) to spot usage limits and prompts that need a human. */
  private async watch(session: Session, exec: any): Promise<void> {
    if (!exec || typeof exec.read !== 'function') return;
    let buf = '';
    let limitFired = false;
    try {
      for await (const chunk of exec.read() as AsyncIterable<string>) {
        this.lastOutput.set(session.id, Date.now());
        buf = (buf + chunk).slice(-8000);
        if (!limitFired) {
          const models = this.modelsFor?.(session.providerId) || [];
          const info = detectLimit(buf.slice(-2500), models.length ? models : [session.model]);
          if (info) { limitFired = true; this.onLimit?.(session, info); }
        }
        const attention = detectAttention(buf.slice(-800));
        if (attention) this.onAttention?.(session, attention);
        else if (chunk.length > 40) this.onAttention?.(session, undefined);
      }
    } catch { /* terminal closed mid-stream */ }
  }

  public show(session: Session): void {
    const t = this.terminals.get(session.id);
    if (t) t.show(false);
    else vscode.window.showInformationMessage(`No live terminal for this session (${session.status}). Use Resume to continue it in a new terminal.`);
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
  private autoHandled = new Set<string>();
  private limitResolved = new Set<string>();
  private attentionNotified = new Map<string, number>();
  private resumeTimers: NodeJS.Timeout[] = [];
  private readonly launcher: TerminalLauncher;
  public readonly catalogStore: CatalogStore;
  public catalog: CatalogIndex;
  public readonly speed: SpeedBook;
  private speedRecorded = new Set<string>();
  private changeEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.changeEmitter.event;

  public static get(): FleetController | undefined { return FleetController.instance; }

  /** The BACF Message Board folder for this workspace, if the add-on is installed. */
  public messageBoardDir(): string | undefined {
    const roots = [
      ...(vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath),
      ...BoardManager.getInstance().getAllBoards().map(b => b.rootPath)
    ];
    return findMessageBoard(roots);
  }

  private sessionClaims = new Map<string, { key: string; agent: string }>();

  /**
   * Message Board Rule 0: an agent session claims its ticket (lease lock, same format as claim.py) so other
   * agents see it, renews it while running and releases it when the session ends.
   */
  private syncClaims(): void {
    const dir = this.messageBoardDir();
    if (!dir) return;
    for (const s of this.sessions.list()) {
      const key = s.ticketId || path.basename(s.ticketPath, '.md');
      const tracked = this.sessionClaims.get(s.id);
      if (s.status === 'running' && !tracked) {
        const agent = s.providerName;
        const r = claim(dir, key, agent, `Orchestrator session (${s.model || 'default model'}): ${s.ticketTitle}`, s.ticketId, 60);
        if (r.ok) this.sessionClaims.set(s.id, { key, agent });
      } else if (tracked && s.status !== 'running') {
        release(dir, tracked.key, tracked.agent);
        this.sessionClaims.delete(s.id);
      }
    }
  }

  private renewClaims(): void {
    const dir = this.messageBoardDir();
    if (!dir) return;
    for (const [id, c] of this.sessionClaims) {
      const s = this.sessions.get(id);
      if (s && s.status === 'running') claim(dir, c.key, c.agent, `Orchestrator session: ${s.ticketTitle}`, s.ticketId, 60);
    }
  }

  /** Is another agent already working on this ticket according to the board? (Never blocks your own provider.) */
  private claimedByOther(ticket: Ticket, agent: string): string | undefined {
    const dir = this.messageBoardDir();
    if (!dir) return undefined;
    const key = ticket.id || path.basename(ticket.path, '.md');
    const held = readClaims(dir).find(c => !c.expired && c.key.toLowerCase() === key.toLowerCase() && c.agent !== agent);
    return held?.agent;
  }

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
    this.catalogStore = new CatalogStore(root);
    this.catalog = new CatalogIndex(this.catalogStore.loadCatalog());
    this.speed = new SpeedBook(new JsonSpeedStore(path.join(dir, 'runtime', 'speed.json')));

    const launcher = new TerminalLauncher(context.subscriptions);
    this.sessions = new SessionManager(
      id => this.registry.list().find(p => p.id === id),
      launcher,
      new JsonFleetStore(path.join(dir, 'runtime', 'fleet-usage.json'))
    );
    launcher.manager = this.sessions;
    this.launcher = launcher;
    launcher.modelsFor = id => this.registry.get(id)?.models || [];
    launcher.onLimit = (s, info) => { void this.handleLimit(s.id, info); };
    launcher.onAttention = (s, text) => this.handleAttention(s.id, text);

    // Everything that starts an agent (card buttons, assign menu) now goes through the session manager.
    AgentRunner.launcher = async (req: LaunchRequest) => {
      const provider = this.registry.get(req.assignee.id);
      if (!provider) return AgentRunner.launchDefault(req);
      const board = BoardManager.getInstance().findBoardForTicketPath(req.ticket.path);
      // Rebuilt by startSession so the provider's {session_id} / model placeholders are always filled.
      await this.startSession(provider, req.model || provider.defaultModel, 'worker', req.ticket, board?.id || '');
      return true;
    };

    this.sessions.onChange(() => {
      this.syncClaims();
      this.learnSpeeds();
      this.maybeAutoReview();
      this.scheduleAutoResumes();
      this.changeEmitter.fire();
    });
    this.registry.onChange(() => this.changeEmitter.fire());

    this.restartTimer();
    context.subscriptions.push({
      dispose: () => {
        if (this.timer) clearInterval(this.timer);
        this.resumeTimers.forEach(clearTimeout);
        // Editor closing: whatever is still running becomes resumable on the next start.
        launcher.shuttingDown = true;
        this.sessions.shutdown();
      }
    });
    setTimeout(() => this.recoverOnStartup(), 3000);
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

  // ---------------------------------------------------------------- auto-detection

  /** Finds installed agent CLIs and Ollama models; adds missing providers and fills empty paths. */
  public async autoDetect(addMissing = true): Promise<{ added: number; updated: number; summary: string }> {
    const found = await detectAll();
    const before = this.registry.list();
    const added = addMissing ? this.registry.addDetected(found) : [];
    let updated = 0;
    for (const p of before) {
      const d = found.find(x => x.kind === p.kind);
      if (!d) continue;
      const needsPath = !!d.path && !p.path;
      const needsModels = !!d.models?.length && JSON.stringify(d.models) !== JSON.stringify(p.models);
      if (needsPath || needsModels) {
        this.registry.applyDetection(p.id, d);
        updated++;
      }
    }
    const names = found.map(d => d.kind).join(', ') || 'nothing';
    return {
      added: added.length,
      updated,
      summary: `Auto-detect found: ${names}. Added ${added.length} provider(s), updated ${updated}.`
    };
  }

  public async detectFor(id: string): Promise<string> {
    const p = this.registry.get(id);
    if (!p) return 'Provider not found.';
    const d = await detectOne(p.kind);
    if (!d.path && !d.models?.length) return `Could not find ${p.name} on this machine (looked on PATH and common install folders).`;
    this.registry.applyDetection(p.id, d);
    return `${p.name}: ${d.path ? `found at ${d.path}` : 'no executable found'}${d.models?.length ? `, ${d.models.length} model(s) detected` : ''}.`;
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
    queueIfBusy = true,
    extra: { agentSessionId?: string; attempt?: number; resumedFrom?: string; assignee?: ReturnType<typeof providerToAssignee>; hidden?: boolean } = {}
  ): Promise<Session | undefined> {
    const agentSessionId = extra.agentSessionId || randomUUID();
    const holder = this.claimedByOther(ticket, provider.name);
    if (holder && holder !== provider.name) {
      vscode.window.showWarningMessage(`"${ticket.title}" is claimed by ${holder} on the Message Board. Release the claim there (or pick another ticket) before starting ${provider.name}.`);
      return undefined;
    }
    if (model && this.sessions.modelBlock(provider.id, model)) {
      const alt = provider.models.find(m => !this.sessions.modelBlock(provider.id, m));
      if (!alt) {
        vscode.window.showWarningMessage(`${provider.name} · ${model} is at its usage limit and no other model of this provider is available right now.`);
        return undefined;
      }
      vscode.window.showInformationMessage(`${model} is at its usage limit; using ${alt} instead.`);
      model = alt;
    }
    const board = (boardId && BoardManager.getInstance().getBoard(boardId)) ||
      BoardManager.getInstance().findBoardForTicketPath(ticket.path);
    const boardRoot = board?.rootPath || path.dirname(ticket.path);

    let payload = prebuilt;
    if (!payload || task || extra.assignee) {
      if (role !== 'worker' && !provider.command.includes('{task}')) {
        vscode.window.showWarningMessage(
          `${provider.name} uses a custom command without {task}, so it cannot act as ${role}. Add {task} to its command in Agent Providers.`
        );
        return undefined;
      }
      payload = (await AgentRunner.prepareLaunch(ticket, extra.assignee || providerToAssignee(provider), boardRoot, board?.config, {
        model,
        modelFlag: provider.modelFlag,
        task,
        sessionId: agentSessionId
      })) || undefined;
    }
    if (!payload) return undefined;

    const run = estimateRun(ticket, provider, model, this.optimizerBase());
    const session = await this.sessions.request({
      provider, model, role,
      points: run.points,
      estCost: run.estCost,
      estMinutes: Math.round(run.estMinutes),
      ticketPath: ticket.path,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      boardId: board?.id || boardId,
      payload,
      queueIfBusy,
      agentSessionId,
      attempt: extra.attempt,
      resumedFrom: extra.resumedFrom,
      hidden: extra.hidden
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
    return planWork(this.candidates(), this.registry.list(), this.sessions, {
      maxNew: this.settings.maxNewPerTick * 3,
      optimizer: this.optimizerBase()
    });
  }

  private optimizerBase(): OptimizerContext {
    return { catalog: this.catalog, speed: this.speed, bench: this.catalogStore.loadBench(), objective: this.settings.objective };
  }

  /** Feeds finished sessions into the speed book so duration predictions improve with use. */
  private learnSpeeds(): void {
    for (const s of this.sessions.list()) {
      if (s.status !== 'finished' || s.role !== 'worker' || this.speedRecorded.has(s.id)) continue;
      this.speedRecorded.add(s.id);
      if (!s.startedAt || !s.endedAt || !s.points || (s.exitCode !== undefined && s.exitCode !== 0) || /dismissed|manually/i.test(s.note || '')) continue;
      const minutes = (s.endedAt - s.startedAt) / 60_000;
      if (minutes >= 1) this.speed.record(s.providerId, s.model, s.points, minutes);
    }
  }

  /**
   * Re-reads every provider's models (CLI / API), curates them into the catalog (categories, prices, hides superseded
   * versions) and optionally writes the result into the providers' model lists.
   */
  public async refreshCatalog(applyToProviders = false): Promise<string> {
    const raws = await this.catalogStore.refreshRaw(this.registry.list());
    const catalog = this.catalogStore.curateSaved(this.settings.keepModelVersions);
    this.catalog = new CatalogIndex(catalog);
    let applied = 0;
    if (applyToProviders) {
      for (const patch of providerPatches(this.registry.list(), catalog)) {
        const p = this.registry.get(patch.id);
        if (p) { this.registry.upsert({ ...p, models: patch.models, defaultModel: patch.defaultModel, modelTiers: patch.modelTiers }); applied++; }
      }
    }
    const hidden = catalog.models.filter(m => m.hidden).length;
    const failed = raws.filter(r => !r.ok).map(r => r.providerName);
    this.changeEmitter.fire();
    return `Model catalog updated: ${catalog.models.length - hidden} shown, ${hidden} hidden` +
      `${applied ? `; applied to ${applied} provider(s)` : ''}${failed.length ? `. Could not list: ${failed.join(', ')}` : ''}.`;
  }

  /** Saves a pasted model list (e.g. Copilot's model-policy page) for a provider and re-curates. */
  public async importModels(providerId: string, text: string): Promise<string> {
    const p = this.registry.get(providerId);
    if (!p) return 'Provider not found.';
    const probe = parseCopilotPolicy(text);
    const n = probe.length || text.split(/\r?\n/).filter(l => l.trim()).length;
    if (!text.trim() || !n) return 'The clipboard has no model list to import.';
    this.catalogStore.saveImport(p.id, text);
    const summary = await this.refreshCatalog(false);
    const on = probe.filter(m => m.enabled).length;
    return `Imported ${probe.length ? `${probe.length} models for ${p.name} (${on} enabled)` : `a model list for ${p.name}`}. ${summary}`;
  }

  /** Compact view of the catalog for the UI. */
  public catalogSummary(): any {
    const c = this.catalog.catalog;
    if (!c) return { generatedAt: 0, models: [] };
    return {
      generatedAt: c.generatedAt,
      keep: c.keepVersionsPerFamily,
      models: c.models.map(m => ({
        providerId: m.providerId, id: m.id, label: m.label, tier: m.tier, category: m.category, hidden: m.hidden, reason: m.hiddenReason,
        inPerM: m.pricing?.inPerM, outPerM: m.pricing?.outPerM, free: !!m.pricing?.free, priceSource: m.pricing?.source,
        efforts: Object.keys(m.effortVariants)
      }))
    };
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
    return !!(await this.startSession(provider, decision.model, 'worker', ticket, found.board.id, undefined, undefined, true, { hidden: this.settings.backgroundTerminals }));
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
    this.checkIdle();
    this.renewClaims();
    if (this.settings.autopilot) {
      await this.runPlan();
    }
    this.changeEmitter.fire();
  }

  // ---------------------------------------------------------------- usage limits & needing a human

  /**
   * A model hit its usage limit. Find another model that is free, has capacity and is capable enough for this
   * ticket and carry on there; otherwise wait for the reset (if the message gave one) or tell the user.
   */
  public async handleLimit(sessionId: string, info: LimitInfo): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== 'running') return;
    const model = info.model || s.model;
    const label = `${s.providerName}${model ? ' \u00b7 ' + model : ''}`;
    const found = this.findTicket(s.ticketPath) || this.findTicketById(s.ticketId);

    this.sessions.limitHit(sessionId, info);
    const cur = this.sessions.get(sessionId)!;
    const resetText = info.resetAt ? ` Usage resets around ${new Date(info.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '';

    if (this.settings.autoFailover && found && s.role !== 'orchestrator') {
      const fb = pickFallback(this.registry.list(), this.sessions, { providerId: s.providerId, model, role: s.role }, found.ticket);
      if (fb) {
        this.limitResolved.add(sessionId);
        vscode.window.showInformationMessage(
          `${label} hit its usage limit. Continuing "${s.ticketTitle}" on ${fb.provider.name} \u00b7 ${fb.model || 'default'} (capable enough: tier ${fb.tier}).`
        );
        this.launcher.kill(cur);
        await this.resumeSession(sessionId, 'resume', { provider: fb.provider, model: fb.model, background: s.hidden });
        return;
      }
    }

    this.limitResolved.add(sessionId);
    if (this.settings.autoFailover && info.resetAt) {
      this.sessions.setAttention(sessionId, undefined);
      vscode.window.showInformationMessage(
        `${label} hit its usage limit and no other model is capable enough right now.${resetText} The orchestrator will continue "${s.ticketTitle}" after the reset.`
      );
      this.scheduleAutoResumes();
      return;
    }
    this.escalate(sessionId, `${label} hit its usage limit on "${s.ticketTitle}". ` +
      (this.settings.autoFailover ? 'No other model is capable enough and no reset time was reported.' : 'Auto-failover is off.') +
      ' Resume it when usage is available, or switch it to another agent.');
  }

  /** The orchestrator cannot fix this: flag the session and tell the user how to get into it. */
  private escalate(sessionId: string, message: string): void {
    this.sessions.setAttention(sessionId, message);
    const buttons = this.launcher.hasTerminal(sessionId) ? ['Open terminal', 'Open Orchestrator'] : ['Open Orchestrator'];
    void vscode.window.showWarningMessage(message, ...buttons).then(pick => {
      if (pick === 'Open terminal') this.sessions.show(sessionId);
      else if (pick === 'Open Orchestrator') void vscode.commands.executeCommand('agenticKanban.openOrchestrator');
    });
  }

  private handleAttention(sessionId: string, text: string | undefined): void {
    const s = this.sessions.get(sessionId);
    if (!s || s.status !== 'running') return;
    this.sessions.setAttention(sessionId, text);
    if (!text) return;
    const last = this.attentionNotified.get(sessionId) || 0;
    if (Date.now() - last < 5 * 60_000) return;
    this.attentionNotified.set(sessionId, Date.now());
    void vscode.window.showWarningMessage(`${s.providerName} needs you on "${s.ticketTitle}": ${text}`, 'Open terminal').then(pick => {
      if (pick === 'Open terminal') this.sessions.show(sessionId);
    });
  }

  private checkIdle(): void {
    const limitMs = this.settings.idleMinutes * 60_000;
    if (limitMs <= 0) return;
    for (const s of this.sessions.list().filter(x => x.status === 'running')) {
      const last = this.launcher.lastOutputAt(s.id);
      if (last && Date.now() - last > limitMs && !s.attention) {
        this.handleAttention(s.id, `No output for ${this.settings.idleMinutes} min \u2014 it may be waiting for you or stuck.`);
      }
    }
  }

  // ---------------------------------------------------------------- recovery

  private findTicketById(ticketId: string): { ticket: Ticket; board: Board } | undefined {
    if (!ticketId) return undefined;
    for (const board of BoardManager.getInstance().getAllBoards()) {
      for (const col of board.columns) {
        const t = col.tickets.find(x => x.id === ticketId);
        if (t) return { ticket: t, board };
      }
    }
    return undefined;
  }

  /**
   * Continues interrupted/failed work. "resume" keeps the agent's conversation when the provider has a
   * resumeCommand ({session_id}); otherwise (or for "restart") the agent is re-run and told to check the
   * ticket Work Log and git state first, so progress on disk is never thrown away.
   */
  public async resumeSession(
    id: string,
    mode: 'resume' | 'restart' = 'resume',
    opts: { provider?: AgentProvider; model?: string; background?: boolean } = {}
  ): Promise<boolean> {
    const s = this.sessions.get(id);
    if (!s || s.resumedBy) return false;
    const provider = opts.provider || this.registry.get(s.providerId);
    if (!provider) {
      vscode.window.showWarningMessage('That provider no longer exists. Re-create it in Agent Providers to resume.');
      return false;
    }
    if (s.role === 'orchestrator') {
      this.sessions.dismiss(id);
      return this.askOrchestrator();
    }
    const found = this.findTicket(s.ticketPath) || this.findTicketById(s.ticketId);
    if (!found) {
      vscode.window.showWarningMessage(`Ticket "${s.ticketTitle}" was not found on any board (moved or deleted?), so it cannot be resumed.`);
      return false;
    }

    if (s.status === 'running') {
      this.sessions.interrupt(id, 'user-closed', 'Interrupted by you to resume');
      this.launcher.kill(s);
    }

    // A session that never started has no conversation to continue.
    // Handing work to a different provider cannot continue its conversation: it re-reads the ticket and git state instead.
    const handoff = !!opts.provider && opts.provider.id !== s.providerId;
    const effective: 'resume' | 'restart' = mode === 'resume' && s.startedAt && !handoff ? 'resume' : 'restart';
    const agentSessionId = effective === 'resume' && s.agentSessionId ? s.agentSessionId : randomUUID();
    const base = providerToAssignee(provider);
    let assignee = base;
    let task: string | undefined;
    if (effective === 'resume') {
      task = RESUME_TASK;
      if (provider.resumeCommand) {
        assignee = { ...base, agentConfig: { ...base.agentConfig!, command: provider.resumeCommand } };
      }
    } else if (handoff && s.startedAt) {
      task = RESUME_TASK;
    } else if (s.role === 'reviewer') {
      task = REVIEW_TASK;
    }

    const next = await this.startSession(provider, opts.model || (handoff ? provider.defaultModel : s.model) || provider.defaultModel, s.role, found.ticket, found.board.id, undefined, task, true, {
      agentSessionId,
      attempt: (s.attempt || 1) + 1,
      resumedFrom: s.id,
      assignee,
      hidden: opts.background ?? s.hidden
    });
    if (next) this.sessions.markResumed(s.id, next.id);
    return !!next;
  }

  public async resumeAll(): Promise<number> {
    let n = 0;
    for (const s of this.sessions.resumable()) {
      if (await this.resumeSession(s.id)) n++;
    }
    return n;
  }

  /** Is it safe to resume this one without asking? (crash/PC/editor close, or an error exit — never a user closing the terminal.) */
  private autoResumable(s: Session): boolean {
    if (!this.settings.autoResume || s.resumedBy || this.autoHandled.has(s.id)) return false;
    if ((s.attempt || 1) > this.settings.maxAutoRetries) return false;
    const crashed = s.status === 'interrupted' && (s.interruptKind === 'host-closed' || s.interruptKind === 'queued-lost');
    const errored = s.status === 'failed' && s.exitCode !== undefined;
    if (!crashed && !errored) return false;
    // Never resume work whose ticket is already Completed.
    const found = this.findTicket(s.ticketPath) || this.findTicketById(s.ticketId);
    return !!found && !/completed|done/i.test(found.ticket.column);
  }

  /** Auto-resume with a growing delay so a flaky network is not hammered (and rate limits are respected). */
  private scheduleAutoResumes(): void {
    for (const s of this.sessions.resumable()) {
      // Usage-limit waits: continue on the same model once its reset time has passed.
      if (s.interruptKind === 'usage-limit') {
        if (this.settings.autoFailover && s.resumeAfter && this.limitResolved.has(s.id) && !this.autoHandled.has(s.id)) {
          this.autoHandled.add(s.id);
          const wait = Math.max(0, s.resumeAfter + 30_000 - Date.now());
          this.resumeTimers.push(setTimeout(() => {
            const cur = this.sessions.get(s.id);
            if (cur && !cur.resumedBy) void this.resumeSession(s.id, 'resume', { background: this.settings.backgroundTerminals });
          }, wait));
        }
        continue;
      }
      if (!this.autoResumable(s)) continue;
      this.autoHandled.add(s.id);
      const delayMs = s.status === 'interrupted' ? 2000 : Math.min(10, 2 * (s.attempt || 1)) * 60_000;
      const t = setTimeout(() => {
        const cur = this.sessions.get(s.id);
        if (cur && !cur.resumedBy) void this.resumeSession(s.id, 'resume', { background: this.settings.backgroundTerminals });
      }, delayMs);
      this.resumeTimers.push(t);
    }
  }

  /** On editor start: tell the user what was interrupted (and resume it if auto-resume is on). */
  private recoverOnStartup(): void {
    // Sessions waiting on a usage reset keep waiting across restarts.
    for (const s of this.sessions.resumable()) {
      if (s.interruptKind === 'usage-limit') this.limitResolved.add(s.id);
    }
    this.scheduleAutoResumes();
    const pending = this.sessions.resumable().filter(s => s.status === 'interrupted' && s.interruptKind !== 'usage-limit');
    if (!pending.length) return;
    if (this.settings.autoResume) {
      this.scheduleAutoResumes();
      vscode.window.showInformationMessage(`Resuming ${pending.length} agent session(s) interrupted by the last shutdown.`);
      return;
    }
    void vscode.window.showWarningMessage(
      `${pending.length} agent session(s) were interrupted when the editor or PC closed.`,
      'Resume all', 'Open Orchestrator'
    ).then(pick => {
      if (pick === 'Resume all') void this.resumeAll();
      else if (pick === 'Open Orchestrator') void vscode.commands.executeCommand('agenticKanban.openOrchestrator');
    });
  }

  // ---------------------------------------------------------------- reviews & orchestrator agent

  public async requestReview(sessionId: string, background = false): Promise<boolean> {
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
    return !!(await this.startSession(reviewer, reviewer.defaultModel, 'reviewer', found.ticket, found.board.id, undefined, REVIEW_TASK, true, { hidden: background }));
  }

  private maybeAutoReview(): void {
    if (!this.settings.autoReview) return;
    for (const s of this.sessions.list()) {
      if (s.role === 'worker' && s.status === 'finished' && !this.reviewed.has(s.id)) {
        this.reviewed.add(s.id);
        void this.requestReview(s.id, this.settings.backgroundTerminals);
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
