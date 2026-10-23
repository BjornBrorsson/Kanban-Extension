import * as fs from 'fs';
import * as path from 'path';
import { AgentProvider, ProviderRole } from './providers';

export type SessionStatus = 'queued' | 'running' | 'finished' | 'failed' | 'cancelled' | 'interrupted';

/** Why a session was interrupted: decides whether it may be resumed automatically. */
export type InterruptKind = 'host-closed' | 'user-closed' | 'queued-lost' | 'usage-limit';

export interface Session {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  role: ProviderRole;
  ticketPath: string;
  ticketId: string;
  ticketTitle: string;
  boardId: string;
  status: SessionStatus;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  exitCode?: number;
  note?: string;
  /** Conversation id handed to the agent CLI ({session_id}) so a later resume continues the same thread. */
  agentSessionId?: string;
  /** 1 for a first run, +1 for every resume/restart of the same work. */
  attempt?: number;
  resumedFrom?: string;
  /** Set once a follow-up session has been started for this one (hides Resume, blocks double resumes). */
  resumedBy?: string;
  interruptKind?: InterruptKind;
  /** Set when the session ran in a background (hidden) terminal. Use Open terminal to reveal and type into it. */
  hidden?: boolean;
  /** The agent appears to be waiting for the user (permission prompt, login, question...). */
  attention?: string;
  /** Usage-limit details when interruptKind is 'usage-limit'. */
  limit?: { model?: string; resetAt?: number };
  /** Epoch ms after which an auto-resume should happen (usage reset). */
  resumeAfter?: number;
}

export interface SessionRequest {
  provider: AgentProvider;
  model: string;
  role: ProviderRole;
  ticketPath: string;
  ticketId: string;
  ticketTitle: string;
  boardId: string;
  /** Opaque launch payload handed back to the launcher when the session starts. */
  payload: any;
  /** When false the request is rejected instead of queued if the provider is at capacity. */
  queueIfBusy?: boolean;
  agentSessionId?: string;
  attempt?: number;
  resumedFrom?: string;
  /** Run in a background terminal (revealed on demand). */
  hidden?: boolean;
}

export interface SessionLauncher {
  launch(session: Session, payload: any): Promise<boolean>;
  show(session: Session): void;
  kill(session: Session): void;
}

export type ProviderState = 'ready' | 'busy' | 'throttled' | 'cooldown' | 'disabled';

export interface StartCheck {
  ok: boolean;
  state: ProviderState;
  reason?: string;
  /** Earliest time (ms epoch) a new session could start, when known. */
  retryAt?: number;
}

export interface ProviderUsage {
  providerId: string;
  state: ProviderState;
  reason?: string;
  running: number;
  queued: number;
  maxParallel: number;
  startsInWindow: number;
  maxSessionsPerWindow: number;
  windowMinutes: number;
  /** 0-100, or null when the provider has no window cap. */
  pct: number | null;
  /** Models currently blocked by a usage limit. `until` is when they should be back (assumed when unknown). */
  blockedModels: { model: string; until: number; unknown: boolean }[];
  retryAt?: number;
  cooldownUntil?: number;
}

const QUICK_FAIL_MS = 20_000;
const COOLDOWN_BASE_MIN = 5;
const COOLDOWN_MAX_MIN = 30;
const DEFAULT_SESSION_TIMEOUT_MIN = 180;

export interface ModelBlock { until: number; unknown: boolean; reason?: string }

export interface FleetData {
  starts: Record<string, number[]>;
  sessions?: Session[];
  blocks?: Record<string, ModelBlock>;
}

export interface FleetStore {
  load(): FleetData;
  save(data: FleetData): void;
}

export class JsonFleetStore implements FleetStore {
  constructor(private readonly file: string) {}
  load(): FleetData {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return {
        starts: raw?.starts && typeof raw.starts === 'object' ? raw.starts : {},
        sessions: Array.isArray(raw?.sessions) ? raw.sessions : [],
        blocks: raw?.blocks && typeof raw.blocks === 'object' ? raw.blocks : {}
      };
    } catch {
      return { starts: {}, sessions: [] };
    }
  }
  save(data: FleetData) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // write-then-rename so a crash mid-save can never leave a truncated file
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch { /* usage history is best-effort */ }
  }
}

export class SessionManager {
  private sessions: Session[] = [];
  private payloads = new Map<string, { req: SessionRequest }>();
  private starts: Record<string, number[]>;
  private blocks: Record<string, ModelBlock> = {};
  private cooldownUntil = new Map<string, number>();
  private quickFails = new Map<string, number>();
  private listeners: (() => void)[] = [];
  private seq = 0;

  constructor(
    private readonly getProvider: (id: string) => AgentProvider | undefined,
    private readonly launcher: SessionLauncher,
    private readonly store?: FleetStore,
    private readonly clock: () => number = Date.now,
    private readonly sessionTimeoutMinutes: number = DEFAULT_SESSION_TIMEOUT_MIN
  ) {
    const saved = store ? store.load() : { starts: {}, sessions: [] };
    this.starts = saved.starts;
    this.blocks = saved.blocks || {};
    // Sessions that were running or queued when the editor/PC stopped have no process any more: keep them as
    // "interrupted" so they can be resumed instead of silently disappearing.
    for (const s of saved.sessions || []) {
      if (s.status === 'running' || s.status === 'queued') {
        s.interruptKind = s.status === 'queued' ? 'queued-lost' : 'host-closed';
        s.note = s.status === 'queued'
          ? 'Was queued when the editor closed'
          : 'Interrupted: the editor or PC closed while this agent was running';
        s.status = 'interrupted';
        s.endedAt = this.clock();
      }
      this.sessions.push(s);
    }
    if (saved.sessions?.some(x => x.status === 'interrupted')) this.persist();
  }

  private persist(): void {
    this.store?.save({ starts: this.starts, sessions: this.sessions, blocks: this.blocks });
  }

  public onChange(fn: () => void): void { this.listeners.push(fn); }
  private emit(): void {
    this.persist();
    this.listeners.forEach(fn => { try { fn(); } catch { /* listener errors must not break scheduling */ } });
  }

  public list(): Session[] { return this.sessions.map(s => ({ ...s })); }
  public get(id: string): Session | undefined { return this.sessions.find(s => s.id === id); }
  public active(): Session[] { return this.sessions.filter(s => s.status === 'running' || s.status === 'queued'); }
  public activeForTicket(ticketPath: string): Session | undefined {
    const key = path.resolve(ticketPath).toLowerCase();
    return this.active().find(s => path.resolve(s.ticketPath).toLowerCase() === key);
  }

  private startsInWindow(p: AgentProvider, now: number): number[] {
    const since = now - p.windowMinutes * 60_000;
    return (this.starts[p.id] || []).filter(t => t > since);
  }

  /** Can this provider start another session right now? Never throws. */
  public canStart(p: AgentProvider, now: number = this.clock()): StartCheck {
    if (!p.enabled) return { ok: false, state: 'disabled', reason: 'Provider is disabled' };

    const cd = this.cooldownUntil.get(p.id) || 0;
    if (cd > now) {
      return { ok: false, state: 'cooldown', reason: 'Cooling down after a failed start (possible rate limit)', retryAt: cd };
    }

    if (p.models.length && p.models.every(m => this.modelBlock(p.id, m, now))) {
      const untils = p.models.map(m => this.modelBlock(p.id, m, now)!.until);
      return { ok: false, state: 'throttled', reason: 'Every model is at its usage limit', retryAt: Math.min(...untils) };
    }

    const running = this.sessions.filter(s => s.providerId === p.id && s.status === 'running').length;
    if (running >= p.maxParallel) {
      return { ok: false, state: 'busy', reason: `${running}/${p.maxParallel} parallel sessions in use` };
    }

    const recent = this.startsInWindow(p, now);
    if (p.maxSessionsPerWindow > 0) {
      const allowed = Math.max(1, Math.floor(p.maxSessionsPerWindow * (1 - p.safetyMarginPct / 100)));
      if (recent.length >= allowed) {
        const oldest = Math.min(...recent);
        return {
          ok: false, state: 'throttled',
          reason: `${recent.length}/${p.maxSessionsPerWindow} sessions used in the last ${p.windowMinutes} min (keeping ${p.safetyMarginPct}% headroom)`,
          retryAt: oldest + p.windowMinutes * 60_000
        };
      }
    }

    const last = recent.length ? Math.max(...recent) : 0;
    const readyAt = last + p.minSpacingSeconds * 1000;
    if (p.minSpacingSeconds > 0 && last && readyAt > now) {
      return { ok: false, state: 'throttled', reason: `Spacing starts by ${p.minSpacingSeconds}s`, retryAt: readyAt };
    }

    return { ok: true, state: 'ready' };
  }

  // ---------------------------------------------------------------- model usage limits

  private blockKey(providerId: string, model: string): string { return `${providerId}::${model}`; }

  /** Active block for this model, if any. Expired blocks are dropped lazily. */
  public modelBlock(providerId: string, model: string, now: number = this.clock()): ModelBlock | undefined {
    const key = this.blockKey(providerId, model);
    const b = this.blocks[key];
    if (!b) return undefined;
    if (b.until <= now) { delete this.blocks[key]; return undefined; }
    return b;
  }

  public blockedModels(providerId: string, now: number = this.clock()): { model: string; until: number; unknown: boolean }[] {
    const prefix = `${providerId}::`;
    return Object.keys(this.blocks)
      .filter(k => k.startsWith(prefix))
      .map(k => ({ model: k.slice(prefix.length), b: this.modelBlock(providerId, k.slice(prefix.length), now) }))
      .filter(x => !!x.b)
      .map(x => ({ model: x.model, until: x.b!.until, unknown: x.b!.unknown }));
  }

  /** Block a model until its reset time; with no known reset it is assumed back after `assumeMinutes` and re-probed. */
  public blockModel(providerId: string, model: string, resetAt?: number, assumeMinutes = 30): ModelBlock {
    const now = this.clock();
    const block: ModelBlock = resetAt && resetAt > now
      ? { until: resetAt, unknown: false }
      : { until: now + assumeMinutes * 60_000, unknown: true };
    this.blocks[this.blockKey(providerId, model)] = block;
    this.persist();
    return block;
  }

  /** A running session reported a usage limit: stop tracking it as running and remember the model is exhausted. */
  public limitHit(id: string, info: { model?: string; resetAt?: number; excerpt?: string }): ModelBlock | undefined {
    const s = this.get(id);
    if (!s || (s.status !== 'running' && s.status !== 'queued')) return undefined;
    const model = info.model || s.model;
    const block = this.blockModel(s.providerId, model, info.resetAt);
    s.limit = { model, resetAt: info.resetAt };
    s.resumeAfter = info.resetAt;
    this.interrupt(id, 'usage-limit', `Usage limit reached${model ? ` on ${model}` : ''}${info.excerpt ? `: ${info.excerpt}` : ''}`);
    return block;
  }

  public setAttention(id: string, text?: string): void {
    const s = this.get(id);
    if (!s || s.attention === text) return;
    s.attention = text;
    this.emit();
  }

  /** How many sessions could start right now without breaking any limit (0 when throttled/busy/cooling). */
  public headroom(p: AgentProvider, now: number = this.clock()): number {
    if (!this.canStart(p, now).ok) return 0;
    const running = this.sessions.filter(x => x.providerId === p.id && x.status === 'running').length;
    let room = p.maxParallel - running;
    if (p.maxSessionsPerWindow > 0) {
      const allowed = Math.max(1, Math.floor(p.maxSessionsPerWindow * (1 - p.safetyMarginPct / 100)));
      room = Math.min(room, allowed - this.startsInWindow(p, now).length);
    }
    if (p.minSpacingSeconds > 0) room = Math.min(room, 1);
    return Math.max(0, room);
  }

  public usage(p: AgentProvider, now: number = this.clock()): ProviderUsage {
    const check = this.canStart(p, now);
    const recent = this.startsInWindow(p, now).length;
    return {
      providerId: p.id,
      state: check.state,
      reason: check.reason,
      running: this.sessions.filter(s => s.providerId === p.id && s.status === 'running').length,
      queued: this.sessions.filter(s => s.providerId === p.id && s.status === 'queued').length,
      maxParallel: p.maxParallel,
      startsInWindow: recent,
      maxSessionsPerWindow: p.maxSessionsPerWindow,
      windowMinutes: p.windowMinutes,
      pct: p.maxSessionsPerWindow > 0 ? Math.min(100, Math.round((recent / p.maxSessionsPerWindow) * 100)) : null,
      blockedModels: this.blockedModels(p.id, now),
      retryAt: check.retryAt,
      cooldownUntil: this.cooldownUntil.get(p.id)
    };
  }

  /** Starts the session now if the provider has capacity, otherwise queues it (or rejects when queueIfBusy is false). */
  public async request(req: SessionRequest): Promise<Session> {
    const existing = this.activeForTicket(req.ticketPath);
    if (existing && existing.providerId === req.provider.id && existing.role === req.role) {
      return existing;
    }

    const now = this.clock();
    const session: Session = {
      id: `s${now.toString(36)}${(++this.seq).toString(36)}`,
      providerId: req.provider.id,
      providerName: req.provider.name,
      model: req.model,
      role: req.role,
      ticketPath: req.ticketPath,
      ticketId: req.ticketId,
      ticketTitle: req.ticketTitle,
      boardId: req.boardId,
      status: 'queued',
      queuedAt: now,
      agentSessionId: req.agentSessionId,
      attempt: req.attempt ?? 1,
      resumedFrom: req.resumedFrom,
      hidden: req.hidden
    };
    this.sessions.push(session);
    this.payloads.set(session.id, { req });

    const check = this.canStart(req.provider, now);
    if (check.ok) {
      await this.start(session);
    } else if (req.queueIfBusy === false) {
      session.status = 'cancelled';
      session.endedAt = now;
      session.note = `Not started: ${check.reason}`;
      this.payloads.delete(session.id);
    } else {
      session.note = `Queued: ${check.reason}`;
    }
    this.emit();
    return session;
  }

  private async start(session: Session): Promise<void> {
    const entry = this.payloads.get(session.id);
    const provider = this.getProvider(session.providerId);
    if (!entry || !provider) {
      this.finish(session, 'failed', undefined, 'Provider no longer exists');
      return;
    }
    const now = this.clock();
    session.status = 'running';
    session.startedAt = now;
    session.note = undefined;
    (this.starts[provider.id] ||= []).push(now);
    this.trimHistory(provider, now);
    this.persist();
    this.emit();

    let ok = false;
    try {
      ok = await this.launcher.launch(session, entry.req.payload);
    } catch (e: any) {
      session.note = `Launch error: ${e?.message || e}`;
    }
    if (!ok && session.status === 'running') {
      this.finish(session, 'failed', undefined, session.note || 'Launcher could not start the session');
    }
  }

  private trimHistory(p: AgentProvider, now: number): void {
    const keep = now - Math.max(p.windowMinutes, 60) * 60_000;
    this.starts[p.id] = (this.starts[p.id] || []).filter(t => t > keep);
  }

  /** Called by the launcher when the agent process/terminal ends. exitCode may be unknown. */
  public ended(sessionId: string, exitCode?: number, note?: string, terminalClosed = false): void {
    const s = this.get(sessionId);
    if (!s || (s.status !== 'running' && s.status !== 'queued')) return;
    const now = this.clock();
    const quick = s.startedAt !== undefined && now - s.startedAt < QUICK_FAIL_MS;

    if (exitCode === undefined && terminalClosed) {
      // The terminal vanished without the agent reporting a result: that is an interruption, not a success.
      this.interrupt(s.id, 'user-closed', note || 'Terminal closed before the agent finished');
      return;
    }

    if (exitCode !== undefined && exitCode !== 0) {
      this.finish(s, 'failed', exitCode, note || `Exited with code ${exitCode}`);
      if (quick) this.enterCooldown(s.providerId, now);
    } else {
      this.finish(s, 'finished', exitCode, note);
      if (exitCode === 0) this.quickFails.set(s.providerId, 0);
    }
    void this.pump();
  }

  private enterCooldown(providerId: string, now: number): void {
    const n = (this.quickFails.get(providerId) || 0) + 1;
    this.quickFails.set(providerId, n);
    const minutes = Math.min(COOLDOWN_MAX_MIN, COOLDOWN_BASE_MIN * 2 ** (n - 1));
    this.cooldownUntil.set(providerId, now + minutes * 60_000);
  }

  /** Marks a live session interrupted (resumable). Does not touch the terminal. */
  public interrupt(id: string, kind: InterruptKind, note?: string): void {
    const s = this.get(id);
    if (!s || (s.status !== 'running' && s.status !== 'queued')) return;
    s.status = 'interrupted';
    s.interruptKind = kind;
    s.endedAt = this.clock();
    if (note) s.note = note;
    this.payloads.delete(s.id);
    this.emit();
    void this.pump();
  }

  /** Editor is closing: everything still live becomes resumable on the next start. */
  public shutdown(): void {
    for (const s of this.sessions.filter(x => x.status === 'running' || x.status === 'queued')) {
      s.status = 'interrupted';
      s.interruptKind = s.startedAt ? 'host-closed' : 'queued-lost';
      s.endedAt = this.clock();
      s.note = 'Interrupted: the editor closed while this agent was running';
    }
    this.persist();
  }

  /** Sessions the user can pick up again: interrupted or failed, and not already resumed. */
  public resumable(): Session[] {
    return this.sessions.filter(s => (s.status === 'interrupted' || s.status === 'failed') && !s.resumedBy);
  }

  public markResumed(oldId: string, newId: string): void {
    const s = this.get(oldId);
    if (s) { s.resumedBy = newId; this.emit(); }
  }

  /** Dismiss an interrupted/failed session ("it was actually done"): hides Resume without running anything. */
  public dismiss(id: string): void {
    const s = this.get(id);
    if (s && (s.status === 'interrupted' || s.status === 'failed')) {
      s.status = 'finished';
      s.note = (s.note ? s.note + ' · ' : '') + 'Dismissed';
      this.emit();
    }
  }

  private finish(s: Session, status: SessionStatus, exitCode?: number, note?: string): void {
    s.status = status;
    s.endedAt = this.clock();
    if (exitCode !== undefined) s.exitCode = exitCode;
    if (note) s.note = note;
    this.payloads.delete(s.id);
    this.emit();
  }

  public markFinished(id: string): void {
    const s = this.get(id);
    if (s && s.status === 'running') {
      this.finish(s, 'finished', undefined, 'Marked finished manually');
      void this.pump();
    }
  }

  public cancel(id: string): void {
    const s = this.get(id);
    if (!s) return;
    if (s.status === 'running') {
      try { this.launcher.kill(s); } catch { /* terminal may already be gone */ }
      this.finish(s, 'cancelled', undefined, 'Cancelled by user');
      void this.pump();
    } else if (s.status === 'queued') {
      this.finish(s, 'cancelled', undefined, 'Cancelled by user');
    }
  }

  public show(id: string): void {
    const s = this.get(id);
    if (s) this.launcher.show(s);
  }

  /** Starts queued sessions (oldest first) wherever capacity has opened up. Safe to call often. */
  public async pump(): Promise<void> {
    const now = this.clock();
    for (const s of this.sessions.filter(x => x.status === 'queued').sort((a, b) => a.queuedAt - b.queuedAt)) {
      const p = this.getProvider(s.providerId);
      if (!p) { this.finish(s, 'failed', undefined, 'Provider no longer exists'); continue; }
      const check = this.canStart(p, now);
      if (check.ok) {
        await this.start(s);
      } else {
        const note = `Queued: ${check.reason}`;
        if (s.note !== note) { s.note = note; this.emit(); }
      }
    }
  }

  /** Periodic housekeeping: start queued work and retire sessions that clearly outlived any real run. */
  public async tick(): Promise<void> {
    const now = this.clock();
    for (const s of this.sessions.filter(x => x.status === 'running')) {
      if (s.startedAt && now - s.startedAt > this.sessionTimeoutMinutes * 60_000) {
        this.finish(s, 'finished', undefined, `Assumed finished after ${this.sessionTimeoutMinutes} min`);
      }
    }
    await this.pump();
  }

  /** Drops finished sessions older than `keepMinutes` so the list stays readable. */
  public prune(keepMinutes = 240): void {
    const cutoff = this.clock() - keepMinutes * 60_000;
    const before = this.sessions.length;
    const keepRecoverable = this.clock() - 7 * 24 * 60 * 60_000;
    this.sessions = this.sessions.filter(s =>
      s.status === 'running' || s.status === 'queued' ||
      (s.endedAt || 0) > cutoff ||
      ((s.status === 'interrupted' || s.status === 'failed') && !s.resumedBy && (s.endedAt || 0) > keepRecoverable));
    if (this.sessions.length !== before) this.emit();
  }
}
