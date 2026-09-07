import * as fs from 'fs';
import * as path from 'path';
import { AttemptRecord, AttemptOutcome } from '../types';
import { TicketAttemptManager } from '../models/ticketAttempt';

export interface JournalEntry {
  timestamp: number;
  type:
    | 'LOCK_ACQUIRED'
    | 'LOCK_RELEASED'
    | 'ATTEMPT_CREATED'
    | 'ATTEMPT_TRANSITION'
    | 'LEASE_ACQUIRED'
    | 'LEASE_EXPIRED'
    | 'CRASH_DETECTED'
    | 'RECOVERY_COMPLETE'
    | 'ESCALATION_TRIGGERED'
    | 'LEAD_TAKEOVER_STARTED'
    | 'REVIEW_COMPLETED';
  ticketId?: string;
  attemptId?: string;
  fromStatus?: AttemptOutcome;
  toStatus?: AttemptOutcome;
  details?: Record<string, any>;
}

export interface WorkspaceLock {
  pid: number;
  ownerId: string;
  acquiredAt: number;
}

export class RuntimeJournal {
  private readonly runtimeDir: string;
  private readonly lockFile: string;
  private readonly journalFile: string;
  private isOwner: boolean = false;
  private currentOwnerId: string = '';

  constructor(private readonly workspaceRoot: string) {
    this.runtimeDir = TicketAttemptManager.getRuntimeStoreDir(workspaceRoot);
    this.lockFile = path.join(this.runtimeDir, 'workspace.lock');
    this.journalFile = path.join(this.runtimeDir, 'journal.jsonl');
    this.ensureGitIgnore();
  }

  /**
   * Ensures .agentic-kanban/ is added to .gitignore if workspace is a git repo.
   */
  private ensureGitIgnore(): void {
    try {
      const gitIgnorePath = path.join(this.workspaceRoot, '.gitignore');
      if (fs.existsSync(path.join(this.workspaceRoot, '.git'))) {
        let content = '';
        if (fs.existsSync(gitIgnorePath)) {
          content = fs.readFileSync(gitIgnorePath, 'utf8');
        }
        if (!content.includes('.agentic-kanban')) {
          const suffix = content.endsWith('\n') || !content ? '' : '\n';
          fs.writeFileSync(gitIgnorePath, `${content}${suffix}# Agentic Kanban local runtime store\n.agentic-kanban/\n`, 'utf8');
        }
      }
    } catch {
      // Ignore non-fatal gitignore updates
    }
  }

  /**
   * Acquires the exclusive workspace owner lock.
   * Stale lock recovery: If recorded process is no longer running, the stale lock is safely replaced.
   */
  public acquireWorkspaceLock(ownerId: string = `process_${process.pid}`): boolean {
    if (fs.existsSync(this.lockFile)) {
      try {
        const lockContent = fs.readFileSync(this.lockFile, 'utf8');
        const lock: WorkspaceLock = JSON.parse(lockContent);

        if (this.isPidAlive(lock.pid)) {
          if (lock.ownerId === ownerId || lock.pid === process.pid) {
            this.isOwner = true;
            this.currentOwnerId = ownerId;
            return true;
          }
          // Lock held by active external process
          return false;
        } else {
          // Stale lock from crashed process
          this.logEntry({
            timestamp: Date.now(),
            type: 'CRASH_DETECTED',
            details: { previousPid: lock.pid, previousOwner: lock.ownerId, action: 'recovering_stale_lock' }
          });
        }
      } catch {
        // Corrupted lock file, overwrite
      }
    }

    const lockData: WorkspaceLock = {
      pid: process.pid,
      ownerId,
      acquiredAt: Date.now()
    };

    const tempLock = `${this.lockFile}.tmp`;
    fs.writeFileSync(tempLock, JSON.stringify(lockData, null, 2), 'utf8');
    fs.renameSync(tempLock, this.lockFile);

    this.isOwner = true;
    this.currentOwnerId = ownerId;

    this.logEntry({
      timestamp: Date.now(),
      type: 'LOCK_ACQUIRED',
      details: { pid: process.pid, ownerId }
    });

    return true;
  }

  /**
   * Releases workspace lock.
   */
  public releaseWorkspaceLock(): void {
    if (this.isOwner && fs.existsSync(this.lockFile)) {
      try {
        fs.unlinkSync(this.lockFile);
        this.logEntry({
          timestamp: Date.now(),
          type: 'LOCK_RELEASED',
          details: { ownerId: this.currentOwnerId }
        });
      } catch {}
      this.isOwner = false;
    }
  }

  /**
   * Appends an immutable log entry to journal.jsonl.
   */
  public logEntry(entry: JournalEntry): void {
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.journalFile, line, 'utf8');
    } catch {
      // Append failure fallback
    }
  }

  /**
   * Transitions an attempt's state atomically in the durable store.
   */
  public transitionAttempt(
    attemptId: string,
    toStatus: AttemptOutcome,
    extra?: Partial<AttemptRecord>
  ): AttemptRecord {
    const attempt = TicketAttemptManager.loadAttempt(this.workspaceRoot, attemptId);
    if (!attempt) {
      throw new Error(`Cannot transition non-existent attempt: ${attemptId}`);
    }

    const fromStatus = attempt.status;
    attempt.status = toStatus;
    attempt.updatedAt = Date.now();

    if (toStatus === 'Running' && !attempt.startedAt) {
      attempt.startedAt = Date.now();
    }
    if ((toStatus === 'Completed' || toStatus === 'Failed' || toStatus === 'Cancelled') && !attempt.completedAt) {
      attempt.completedAt = Date.now();
    }

    if (extra) {
      Object.assign(attempt, extra);
    }

    TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);

    this.logEntry({
      timestamp: Date.now(),
      type: 'ATTEMPT_TRANSITION',
      ticketId: attempt.ticketId,
      attemptId,
      fromStatus,
      toStatus,
      details: extra
    });

    return attempt;
  }

  /**
   * Scans store for active attempts interrupted by crash/restart.
   */
  public scanInterruptedAttempts(): AttemptRecord[] {
    const attemptsDir = path.join(this.runtimeDir, 'attempts');
    if (!fs.existsSync(attemptsDir)) return [];

    const interrupted: AttemptRecord[] = [];
    const files = fs.readdirSync(attemptsDir).filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));

    for (const f of files) {
      try {
        const data = fs.readFileSync(path.join(attemptsDir, f), 'utf8');
        const attempt: AttemptRecord = JSON.parse(data);
        if (attempt.status === 'Running' || attempt.status === 'Pending') {
          interrupted.push(attempt);
        }
      } catch {}
    }

    return interrupted;
  }

  /**
   * Checks if PID is active on current OS.
   */
  public isPidAlive(pid: number): boolean {
    try {
      // Sending signal 0 checks for process existence without killing it
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      return err.code === 'EPERM'; // Exists but permissions deny signaling
    }
  }

  public getRuntimeDir(): string {
    return this.runtimeDir;
  }
}
