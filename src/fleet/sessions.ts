import * as fs from 'fs';
import * as path from 'path';
import { AgentProvider, ProviderRole } from './providers';

export type SessionStatus = 'queued' | 'running' | 'finished' | 'failed' | 'cancelled';

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
  retryAt?: number;
  cooldownUntil?: number;
}

const QUICK_FAIL_MS = 20_000;
const COOLDOWN_BASE_MIN = 5;
const COOLDOWN_MAX_MIN = 30;
const DEFAULT_SESSION_TIMEOUT_MIN = 180;

export interface FleetStore {
  load(): { starts: Record<string, number[]> };
  save(data: { starts: Record<string, number[]> }): void;
}

export class JsonFleetStore implements FleetStore {
  constructor(private readonly file: string) {}
  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { starts: raw?.starts && typeof raw.starts === 'object' ? raw.starts : {} };
    } catch {
      return { starts: {} };
    }
  }
  save(data: { starts: Record<string, number[]> }) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(data), 'utf8');
    } catch { /* usage history is best-effort */ }
  }
}

export class SessionManager {
  private sessions: Session[] = [];
  private payloads = new Map<string, { req: SessionRequest }>();
  private starts: Record<string, number[]>;
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
    this.starts = store ? store.load().starts : {};
  }

  public onChange(fn: () => void): void { this.listeners.push(fn); }
  private emit(): void { this.listeners.forEach(fn => { try { fn(); } catch { /* listener errors must not break scheduling */ } }); }

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
      queuedAt: now
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
    this.store?.save({ starts: this.starts });
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
  public ended(sessionId: string, exitCode?: number, note?: string): void {
    const s = this.get(sessionId);
    if (!s || (s.status !== 'running' && s.status !== 'queued')) return;
    const now = this.clock();
    const quick = s.startedAt !== undefined && now - s.startedAt < QUICK_FAIL_MS;

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
    this.sessions = this.sessions.filter(s => s.status === 'running' || s.status === 'queued' || (s.endedAt || 0) > cutoff);
    if (this.sessions.length !== before) this.emit();
  }
}
