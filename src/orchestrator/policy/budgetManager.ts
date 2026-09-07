import * as fs from 'fs';
import * as path from 'path';

export interface BudgetAccount {
  currency: string;
  totalCeiling: number;
  totalSpentReported: number;
  totalSpentEstimated: number;
  totalReserved: number;
  isSubscriptionQuota: boolean;
}

export interface AttemptReservation {
  ticketId: string;
  attemptId: string;
  amount: number;
  currency: string;
  timestamp: number;
  leadReviewReserved: number;
  workerReserved: number;
  reconciled: boolean;
}

export interface RateLimitWindow {
  maxRpm: number;
  maxTpm?: number;
  requestTimestamps: number[];
  tokenCounts: { timestamp: number; tokens: number }[];
}

export interface ReservationResult {
  allowed: boolean;
  reservation?: AttemptReservation;
  remainingBefore: number;
  remainingAfter?: number;
  reason?: string;
}

export class BudgetManager {
  private readonly storePath: string;
  private accounts: Map<string, BudgetAccount> = new Map();
  private activeReservations: Map<string, AttemptReservation> = new Map();
  private rateLimits: Map<string, RateLimitWindow> = new Map();

  constructor(public readonly workspaceRoot: string) {
    this.storePath = path.join(workspaceRoot, '.agentic-kanban', 'runtime', 'budgets.json');
    this.loadState();
  }

  /**
   * Initializes or updates a budget account.
   */
  public registerAccount(account: BudgetAccount): void {
    this.accounts.set(account.currency.toUpperCase(), account);
    this.saveState();
  }

  public getAccount(currency: string): BudgetAccount {
    const key = currency.toUpperCase();
    if (!this.accounts.has(key)) {
      this.accounts.set(key, {
        currency: key,
        totalCeiling: 100.0, // Default ceiling
        totalSpentReported: 0,
        totalSpentEstimated: 0,
        totalReserved: 0,
        isSubscriptionQuota: false
      });
    }
    return this.accounts.get(key)!;
  }

  /**
   * Atomically reserves funds before dispatch.
   * Pre-dispatch check: Halts immediately if available funds < reservation.
   * Enforces Lead Review reserve priority (holds minimum reserve for final review).
   */
  public reserve(params: {
    ticketId: string;
    attemptId: string;
    totalAmount: number;
    currency?: string;
    leadReviewPortion?: number;
  }): ReservationResult {
    const currency = (params.currency || 'EUR').toUpperCase();
    const account = this.getAccount(currency);

    const available = account.totalCeiling - (account.totalSpentReported + account.totalSpentEstimated + account.totalReserved);

    if (available < params.totalAmount) {
      return {
        allowed: false,
        remainingBefore: available,
        reason: `Budget exhausted: Available ${available.toFixed(2)} ${currency} is less than requested reservation ${params.totalAmount.toFixed(2)} ${currency}.`
      };
    }

    const leadReviewReserved = params.leadReviewPortion || Math.min(params.totalAmount * 0.3, 0.5);
    const workerReserved = Math.max(0, params.totalAmount - leadReviewReserved);

    account.totalReserved += params.totalAmount;

    const reservation: AttemptReservation = {
      ticketId: params.ticketId,
      attemptId: params.attemptId,
      amount: params.totalAmount,
      currency,
      timestamp: Date.now(),
      leadReviewReserved,
      workerReserved,
      reconciled: false
    };

    this.activeReservations.set(params.attemptId, reservation);
    this.saveState();

    return {
      allowed: true,
      reservation,
      remainingBefore: available,
      remainingAfter: available - params.totalAmount
    };
  }

  /**
   * Reconciles actual spending when attempt completes.
   * Decrements reservation and increments spent account balance.
   */
  public reconcile(params: {
    attemptId: string;
    actualSpent: number;
    isReported?: boolean;
  }): void {
    const reservation = this.activeReservations.get(params.attemptId);
    if (!reservation || reservation.reconciled) {
      return;
    }

    const account = this.getAccount(reservation.currency);
    account.totalReserved = Math.max(0, account.totalReserved - reservation.amount);

    if (params.isReported) {
      account.totalSpentReported += params.actualSpent;
    } else {
      account.totalSpentEstimated += params.actualSpent;
    }

    reservation.reconciled = true;
    this.activeReservations.delete(params.attemptId);
    this.saveState();
  }

  /**
   * Releases full reservation if attempt cancelled or aborted before execution.
   */
  public releaseReservation(attemptId: string): void {
    const reservation = this.activeReservations.get(attemptId);
    if (reservation && !reservation.reconciled) {
      const account = this.getAccount(reservation.currency);
      account.totalReserved = Math.max(0, account.totalReserved - reservation.amount);
      this.activeReservations.delete(attemptId);
      this.saveState();
    }
  }

  /**
   * Checks rate limit for a provider (RPM / TPM sliding window).
   */
  public checkRateLimit(providerId: string, maxRpm: number, tokensRequested?: number, maxTpm?: number): boolean {
    const now = Date.now();
    let window = this.rateLimits.get(providerId);
    if (!window) {
      window = { maxRpm, maxTpm, requestTimestamps: [], tokenCounts: [] };
      this.rateLimits.set(providerId, window);
    }

    // Prune requests older than 60 seconds
    window.requestTimestamps = window.requestTimestamps.filter(t => now - t < 60000);
    window.tokenCounts = window.tokenCounts.filter(t => now - t.timestamp < 60000);

    if (window.requestTimestamps.length >= maxRpm) {
      return false; // RPM exceeded
    }

    if (maxTpm && tokensRequested) {
      const currentTokens = window.tokenCounts.reduce((sum, t) => sum + t.tokens, 0);
      if (currentTokens + tokensRequested > maxTpm) {
        return false; // TPM exceeded
      }
    }

    window.requestTimestamps.push(now);
    if (tokensRequested) {
      window.tokenCounts.push({ timestamp: now, tokens: tokensRequested });
    }

    return true;
  }

  private loadState(): void {
    if (fs.existsSync(this.storePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.storePath, 'utf8'));
        if (raw.accounts) {
          for (const acc of raw.accounts) {
            this.accounts.set(acc.currency, acc);
          }
        }
      } catch {}
    }
  }

  private saveState(): void {
    const dir = path.dirname(this.storePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      accounts: Array.from(this.accounts.values()),
      reservations: Array.from(this.activeReservations.values()),
      updatedAt: Date.now()
    };
    fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf8');
  }
}
