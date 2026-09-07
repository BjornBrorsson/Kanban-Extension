import * as crypto from 'crypto';
import { RuntimeJournal } from './runtimeJournal';
import { TicketAttemptManager } from '../models/ticketAttempt';
import { AttemptRecord } from '../types';

export interface LeaseInfo {
  token: string;
  attemptId: string;
  ticketId: string;
  generation: number;
  expiresAt: number;
  heartbeatIntervalMs: number;
}

export class LeaseManager {
  private activeLeases: Map<string, LeaseInfo> = new Map();
  private ticketGenerations: Map<string, number> = new Map();

  constructor(
    private readonly workspaceRoot: string,
    private readonly journal: RuntimeJournal,
    private readonly defaultLeaseDurationMs: number = 30000
  ) {}

  /**
   * Acquires or increments generation for a ticket and issues an expiring lease token.
   */
  public acquireLease(ticketId: string, durationMs?: number): LeaseInfo {
    const currentGen = (this.ticketGenerations.get(ticketId) || 0) + 1;
    this.ticketGenerations.set(ticketId, currentGen);

    const token = `lease_${ticketId}_g${currentGen}_${crypto.randomBytes(6).toString('hex')}`;
    const expiresAt = Date.now() + (durationMs || this.defaultLeaseDurationMs);

    const lease: LeaseInfo = {
      token,
      attemptId: '', // Assigned upon attempt creation
      ticketId,
      generation: currentGen,
      expiresAt,
      heartbeatIntervalMs: Math.floor((durationMs || this.defaultLeaseDurationMs) / 3)
    };

    this.activeLeases.set(token, lease);
    this.journal.logEntry({
      timestamp: Date.now(),
      type: 'LEASE_ACQUIRED',
      ticketId,
      details: { token, generation: currentGen, expiresAt }
    });

    return lease;
  }

  /**
   * Associates a lease with its attempt record.
   */
  public bindAttempt(token: string, attempt: AttemptRecord): void {
    const lease = this.activeLeases.get(token);
    if (lease) {
      lease.attemptId = attempt.attemptId;
      attempt.leaseToken = token;
      attempt.leaseExpiresAt = lease.expiresAt;
      TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);
    }
  }

  /**
   * Extends lease expiration (heartbeat).
   */
  public heartbeat(token: string, extendMs?: number): boolean {
    const lease = this.activeLeases.get(token);
    if (!lease) return false;

    // Check if lease has already expired
    if (Date.now() > lease.expiresAt) {
      this.revokeLease(token, 'lease_expired_before_heartbeat');
      return false;
    }

    lease.expiresAt = Date.now() + (extendMs || this.defaultLeaseDurationMs);
    return true;
  }

  /**
   * Validates that a worker's lease is active, unexpired, and matches current ticket generation.
   * Stale workers with an outdated generation are rejected.
   */
  public validateLease(token: string, ticketId: string, expectedGeneration?: number): { valid: boolean; reason?: string } {
    const lease = this.activeLeases.get(token);
    if (!lease) {
      return { valid: false, reason: 'Lease token not found or already revoked.' };
    }

    if (lease.ticketId !== ticketId) {
      return { valid: false, reason: `Lease ticket mismatch: ${lease.ticketId} vs ${ticketId}` };
    }

    if (Date.now() > lease.expiresAt) {
      this.revokeLease(token, 'lease_expired');
      return { valid: false, reason: 'Lease has expired.' };
    }

    const currentTicketGen = this.ticketGenerations.get(ticketId) || 0;
    if (lease.generation < currentTicketGen) {
      return { valid: false, reason: `Stale generation: lease is generation ${lease.generation}, current is ${currentTicketGen}.` };
    }

    if (expectedGeneration !== undefined && lease.generation !== expectedGeneration) {
      return { valid: false, reason: `Generation mismatch: expected ${expectedGeneration}, got ${lease.generation}.` };
    }

    return { valid: true };
  }

  /**
   * Revokes a lease token.
   */
  public revokeLease(token: string, reason: string = 'manual_revocation'): void {
    const lease = this.activeLeases.get(token);
    if (lease) {
      this.activeLeases.delete(token);
      this.journal.logEntry({
        timestamp: Date.now(),
        type: 'LEASE_EXPIRED',
        ticketId: lease.ticketId,
        attemptId: lease.attemptId,
        details: { token, reason }
      });
    }
  }

  public getGeneration(ticketId: string): number {
    return this.ticketGenerations.get(ticketId) || 0;
  }

  public listActiveLeases(): LeaseInfo[] {
    return Array.from(this.activeLeases.values()).filter(l => Date.now() <= l.expiresAt);
  }
}
