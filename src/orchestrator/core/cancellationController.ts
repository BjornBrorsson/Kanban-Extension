import * as cp from 'child_process';
import { RunnerAdapter } from '../adapters/types';
import { LeaseManager } from './leaseManager';
import { RuntimeJournal } from './runtimeJournal';
import { BudgetManager } from '../policy/budgetManager';

export interface CancellationResult {
  confirmed: boolean;
  attemptId: string;
  ticketId: string;
  durationMs: number;
  pidKilled?: number;
  status: 'CANCELLED_CONFIRMED' | 'CANCELLATION_UNCONFIRMED';
  message: string;
}

export class CancellationController {
  constructor(
    public readonly journal: RuntimeJournal,
    public readonly leaseManager: LeaseManager,
    public readonly budgetManager: BudgetManager
  ) {}

  /**
   * Checks whether a system process PID is alive.
   */
  public static isPidAlive(pid: number): boolean {
    try {
      if (process.platform === 'win32') {
        const out = cp.execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out.includes(String(pid));
      } else {
        process.kill(pid, 0);
        return true;
      }
    } catch {
      return false;
    }
  }

  /**
   * Coordinated attempt cancellation:
   * 1. Issues cancellation to runner adapter.
   * 2. Asserts process termination via PID checks.
   * 3. If confirmed dead, releases budget reservation and revokes attempt lease.
   * 4. If unconfirmed, retains reservation and marks CancellationUnconfirmed.
   */
  public async cancelAttempt(params: {
    ticketId: string;
    attemptId: string;
    executionId: string;
    adapter: RunnerAdapter;
    leaseToken: string;
    pid?: number;
    timeoutMs?: number;
  }): Promise<CancellationResult> {
    const { ticketId, attemptId, executionId, adapter, leaseToken, pid, timeoutMs = 3000 } = params;
    const start = Date.now();

    // 1. Issue cancellation signal to adapter
    let confirmed = true;
    try {
      const adapterRes = await adapter.cancel(executionId);
      if (adapterRes && adapterRes.confirmed === false) {
        confirmed = false;
      }
    } catch {
      confirmed = false;
    }
    if (pid) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (!CancellationController.isPidAlive(pid)) {
          confirmed = true;
          break;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      if (CancellationController.isPidAlive(pid)) {
        // Fallback: Force kill
        try {
          if (process.platform === 'win32') {
            cp.execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
          } else {
            process.kill(-pid, 'SIGKILL');
          }
        } catch {}

        confirmed = !CancellationController.isPidAlive(pid);
      }
    }

    const durationMs = Date.now() - start;

    if (confirmed) {
      // Confirmed cancelled: transition to Cancelled, release budget, revoke lease
      try {
        this.journal.transitionAttempt(attemptId, 'Cancelled', {
          failureReason: 'Cancelled by user / orchestrator.'
        });
      } catch {
        this.journal.logEntry({
          timestamp: Date.now(),
          type: 'ATTEMPT_TRANSITION',
          ticketId,
          attemptId,
          toStatus: 'Cancelled',
          details: { reason: 'Cancelled before persistence' }
        });
      }
      this.budgetManager.releaseReservation(attemptId);
      this.leaseManager.revokeLease(leaseToken, 'cancelled_confirmed');

      return {
        confirmed: true,
        attemptId,
        ticketId,
        durationMs,
        pidKilled: pid,
        status: 'CANCELLED_CONFIRMED',
        message: 'Attempt successfully cancelled and process termination confirmed.'
      };
    } else {
      // Unconfirmed: Retain reservation to prevent duplicate budget spend
      try {
        this.journal.transitionAttempt(attemptId, 'Failed', {
          failureReason: 'Cancellation unconfirmed: Process failed to terminate within deadline.'
        });
      } catch {
        this.journal.logEntry({
          timestamp: Date.now(),
          type: 'ATTEMPT_TRANSITION',
          ticketId,
          attemptId,
          toStatus: 'Failed',
          details: { reason: 'Cancellation unconfirmed before persistence' }
        });
      }

      return {
        confirmed: false,
        attemptId,
        ticketId,
        durationMs,
        pidKilled: pid,
        status: 'CANCELLATION_UNCONFIRMED',
        message: 'Cancellation unconfirmed: Process may still be running; retained reservation.'
      };
    }
  }
}
