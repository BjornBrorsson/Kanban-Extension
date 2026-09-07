export type ExecutionProfileType = 'plan-only' | 'supervised' | 'bounded-autonomous';

export interface AutonomousProfileConfig {
  profile: ExecutionProfileType;
  maxBatchCeilingCurrency?: number; // e.g. €10.00
  batchCurrency?: string;
  circuitBreakerThreshold?: number; // default: 3 consecutive terminal failures
  maxCompletedTickets?: number; // max tickets to process per run
}

export interface BlockedInterventionItem {
  ticketId: string;
  attemptId: string;
  timestamp: number;
  reason: string;
  actionablePrompt: string;
}

export class AutonomousProfileManager {
  private consecutiveTerminalFailures: number = 0;
  private totalBatchSpent: number = 0;
  private totalCompletedTickets: number = 0;
  private interventionQueue: BlockedInterventionItem[] = [];

  constructor(public readonly config: AutonomousProfileConfig) {}

  /**
   * Evaluates whether the next task can be scheduled under the active execution profile.
   * Pre-dispatch check: Halts immediately if batch ceiling would be exceeded or circuit breaker tripped.
   */
  public canDispatchNext(requestedCost: number = 1.0): { allowed: boolean; reason?: string } {
    if (this.config.profile === 'plan-only') {
      return { allowed: false, reason: 'Profile is plan-only: Code execution is disabled.' };
    }

    // Circuit breaker check
    const threshold = this.config.circuitBreakerThreshold || 3;
    if (this.consecutiveTerminalFailures >= threshold) {
      return {
        allowed: false,
        reason: `Circuit breaker tripped: ${this.consecutiveTerminalFailures} consecutive terminal task failures occurred.`
      };
    }

    // Batch limit check
    if (this.config.maxCompletedTickets && this.totalCompletedTickets >= this.config.maxCompletedTickets) {
      return {
        allowed: false,
        reason: `Batch limit reached: Maximum ticket limit of ${this.config.maxCompletedTickets} completed.`
      };
    }

    // Batch currency ceiling check
    if (this.config.maxBatchCeilingCurrency) {
      if (this.totalBatchSpent + requestedCost > this.config.maxBatchCeilingCurrency) {
        return {
          allowed: false,
          reason: `Batch ceiling reached: Total batch spend (${this.totalBatchSpent.toFixed(2)} + ${requestedCost.toFixed(2)}) exceeds ceiling of ${this.config.maxBatchCeilingCurrency.toFixed(2)} ${this.config.batchCurrency || 'EUR'}.`
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records task outcome.
   * Note: Routine worker-to-lead escalation is EXPECTED behavior and does NOT increment terminal failures!
   */
  public recordTaskOutcome(params: {
    ticketId: string;
    attemptId: string;
    success: boolean;
    actualSpent: number;
    wasRoutineEscalation?: boolean;
    terminalFailureReason?: string;
  }): void {
    this.totalBatchSpent += params.actualSpent;

    if (params.success) {
      this.consecutiveTerminalFailures = 0; // Reset circuit breaker
      this.totalCompletedTickets++;
    } else {
      // Routine escalation to lead is NOT a failure
      if (params.wasRoutineEscalation) {
        return;
      }

      this.consecutiveTerminalFailures++;
      if (params.terminalFailureReason) {
        this.interventionQueue.push({
          ticketId: params.ticketId,
          attemptId: params.attemptId,
          timestamp: Date.now(),
          reason: params.terminalFailureReason,
          actionablePrompt: `Task ${params.ticketId} encountered a terminal failure: ${params.terminalFailureReason}. Please inspect workspace or clarify requirements.`
        });
      }
    }
  }

  public getInterventionQueue(): BlockedInterventionItem[] {
    return [...this.interventionQueue];
  }

  public getStatus(): {
    profile: ExecutionProfileType;
    consecutiveFailures: number;
    totalSpent: number;
    completedCount: number;
    circuitBreakerTripped: boolean;
    interventionsCount: number;
  } {
    const threshold = this.config.circuitBreakerThreshold || 3;
    return {
      profile: this.config.profile,
      consecutiveFailures: this.consecutiveTerminalFailures,
      totalSpent: this.totalBatchSpent,
      completedCount: this.totalCompletedTickets,
      circuitBreakerTripped: this.consecutiveTerminalFailures >= threshold,
      interventionsCount: this.interventionQueue.length
    };
  }
}
