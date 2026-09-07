import * as fs from 'fs';
import * as path from 'path';
import { RuntimeJournal } from '../core/runtimeJournal';
import { LeaseManager } from '../core/leaseManager';
import { WorkspaceManager, WorkspaceAllocation } from '../workspaces/workspaceManager';
import { RunnerAdapter } from '../adapters/types';
import { DelegationPackage } from '../context/contextPackager';
import { DelegationProtocol } from './delegationProtocol';

export type EscalationTriggerType =
  | 'OUT_OF_SCOPE'
  | 'RETRY_LIMIT_EXCEEDED'
  | 'VERIFICATION_FAILED'
  | 'STALLED'
  | 'AMBIGUITY_DETECTED'
  | 'ARCHITECTURAL_DECISION';

export interface EscalationRecord {
  escalationId: string;
  ticketId: string;
  attemptId: string;
  timestamp: number;
  triggerType: EscalationTriggerType;
  message: string;
  workerId: string;
  checkpointDiff?: string;
  failingChecks?: { command: string; output: string }[];
  violatedFiles?: string[];
  resolved: boolean;
  resolutionStrategy?: 'CLARIFY_AND_RETRY' | 'LEAD_TAKEOVER' | 'HUMAN_ASSISTANCE_REQUIRED';
  resolutionNotes?: string;
}

export interface TakeoverResult {
  success: boolean;
  resolvedPatch?: string;
  leadAttemptId?: string;
  outcome: 'RESOLVED_BY_LEAD' | 'NEEDS_HUMAN_ASSISTANCE' | 'FAILED';
  errorMessage?: string;
}

export class EscalationHandler {
  constructor(
    public readonly workspaceRoot: string,
    public readonly journal: RuntimeJournal,
    public readonly leaseManager: LeaseManager,
    public readonly workspaceManager: WorkspaceManager
  ) {}

  /**
   * Evaluates whether an attempt should trigger escalation based on execution results.
   */
  public evaluateEscalationTriggers(params: {
    ticketId: string;
    attemptId: string;
    workerId: string;
    delegationPackage: DelegationPackage;
    diff?: string;
    verificationResult?: { passed: boolean; error?: string; command?: string };
    consecutiveFailures?: number;
    maxRetries?: number;
    errorText?: string;
  }): EscalationRecord | null {
    const { ticketId, attemptId, workerId, delegationPackage, diff, verificationResult, consecutiveFailures = 0, maxRetries = 2, errorText } = params;

    // Check 1: Scope violation
    if (diff) {
      const modifiedFiles = DelegationProtocol.extractFilesFromDiff(diff);
      const scopeCheck = DelegationProtocol.validateScope(modifiedFiles, delegationPackage.allowedScope);
      if (!scopeCheck.valid) {
        return this.createEscalationRecord({
          ticketId,
          attemptId,
          workerId,
          triggerType: 'OUT_OF_SCOPE',
          message: scopeCheck.reason || 'Worker edited files outside allowed scope.',
          checkpointDiff: diff,
          violatedFiles: scopeCheck.violatedFiles
        });
      }
    }

    // Check 2: Verification failure retry limit exceeded
    if (verificationResult && !verificationResult.passed) {
      if (consecutiveFailures >= maxRetries) {
        return this.createEscalationRecord({
          ticketId,
          attemptId,
          workerId,
          triggerType: 'RETRY_LIMIT_EXCEEDED',
          message: `Worker exceeded retry limit (${maxRetries}) on verification failure.`,
          checkpointDiff: diff,
          failingChecks: verificationResult.command ? [{ command: verificationResult.command, output: verificationResult.error || '' }] : undefined
        });
      }
    }

    // Check 3: Explicit ambiguity / error keyword
    if (errorText) {
      const lower = errorText.toLowerCase();
      if (lower.includes('ambiguous') || lower.includes('architectural decision') || lower.includes('clarification needed')) {
        return this.createEscalationRecord({
          ticketId,
          attemptId,
          workerId,
          triggerType: 'AMBIGUITY_DETECTED',
          message: `Worker requested clarification: ${errorText}`,
          checkpointDiff: diff
        });
      }
    }

    return null;
  }

  /**
   * Creates, logs, and persists an escalation record.
   */
  public createEscalationRecord(data: {
    ticketId: string;
    attemptId: string;
    workerId: string;
    triggerType: EscalationTriggerType;
    message: string;
    checkpointDiff?: string;
    failingChecks?: { command: string; output: string }[];
    violatedFiles?: string[];
  }): EscalationRecord {
    const escalationId = `esc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const record: EscalationRecord = {
      escalationId,
      ticketId: data.ticketId,
      attemptId: data.attemptId,
      timestamp: Date.now(),
      triggerType: data.triggerType,
      message: data.message,
      workerId: data.workerId,
      checkpointDiff: data.checkpointDiff,
      failingChecks: data.failingChecks,
      violatedFiles: data.violatedFiles,
      resolved: false
    };

    // Log to runtime journal
    this.journal.logEntry({
      timestamp: record.timestamp,
      type: 'ESCALATION_TRIGGERED',
      ticketId: data.ticketId,
      attemptId: data.attemptId,
      details: {
        escalationId,
        triggerType: data.triggerType,
        workerId: data.workerId,
        message: data.message
      }
    });

    // Save escalation record to disk
    const escDir = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'escalations');
    if (!fs.existsSync(escDir)) {
      fs.mkdirSync(escDir, { recursive: true });
    }
    fs.writeFileSync(path.join(escDir, `${escalationId}.json`), JSON.stringify(record, null, 2), 'utf8');

    return record;
  }

  /**
   * Executes Lead Checkpoint Takeover:
   * 1. Atomically revokes worker's write lease.
   * 2. Acquires fresh attempt lease for Lead.
   * 3. Invokes Lead adapter with the worker's checkpoint diff and failing check context.
   * 4. If Lead resolves it, updates escalation record and returns resolved patch.
   */
  public async executeLeadTakeover(
    escalation: EscalationRecord,
    leadAdapter: RunnerAdapter,
    workerLeaseToken: string,
    allocation: WorkspaceAllocation,
    leadObjectiveOverride?: string
  ): Promise<TakeoverResult> {
    // 1. Atomically revoke worker write lease
    this.leaseManager.revokeLease(workerLeaseToken, 'lead_takeover');

    // 2. Acquire fresh attempt lease for Lead with new monotonic generation
    const leadLease = this.leaseManager.acquireLease(escalation.ticketId);

    this.journal.logEntry({
      timestamp: Date.now(),
      type: 'LEAD_TAKEOVER_STARTED',
      ticketId: escalation.ticketId,
      attemptId: escalation.attemptId,
      details: {
        escalationId: escalation.escalationId,
        leadGeneration: leadLease.generation
      }
    });

    // 3. Invoke Lead adapter
    const leadObjective = leadObjectiveOverride ||
      `Lead Takeover for ticket ${escalation.ticketId}: Resolve blocker (${escalation.triggerType}): ${escalation.message}. Resume from checkpoint diff.`;

    try {
      const startResult = await leadAdapter.start({
        ticketId: escalation.ticketId,
        attemptId: `lead-takeover-${escalation.attemptId}`,
        objective: leadObjective,
        workspaceRoot: allocation.workspacePath,
        role: 'lead',
        allocatedBudget: { currency: 'EUR', maxUnits: 2 }
      });

      const result = await leadAdapter.collectResult(startResult.executionId);

      // Validate lead lease
      const leaseCheck = this.leaseManager.validateLease(leadLease.token, escalation.ticketId, leadLease.generation);
      if (!leaseCheck.valid) {
        return {
          success: false,
          outcome: 'FAILED',
          errorMessage: `Lead lease expired or invalid: ${leaseCheck.reason}`
        };
      }

      if (result.success) {
        escalation.resolved = true;
        escalation.resolutionStrategy = 'LEAD_TAKEOVER';
        escalation.resolutionNotes = 'Lead successfully resolved the blocker and produced a verified patch.';

        this.updateEscalationRecord(escalation);
        this.leaseManager.revokeLease(leadLease.token, 'lead_takeover_completed');

        return {
          success: true,
          resolvedPatch: result.patch || this.workspaceManager.captureDiff(allocation),
          leadAttemptId: `lead-takeover-${escalation.attemptId}`,
          outcome: 'RESOLVED_BY_LEAD'
        };
      } else {
        // Lead also failed to resolve -> escalate to human assistance
        escalation.resolved = false;
        escalation.resolutionStrategy = 'HUMAN_ASSISTANCE_REQUIRED';
        escalation.resolutionNotes = `Lead takeover could not automatically resolve issue: ${result.errorMessage}`;
        this.updateEscalationRecord(escalation);
        this.leaseManager.revokeLease(leadLease.token, 'escalated_to_human');

        return {
          success: false,
          outcome: 'NEEDS_HUMAN_ASSISTANCE',
          errorMessage: result.errorMessage || 'Automated lead resolution failed.'
        };
      }
    } catch (err: any) {
      this.leaseManager.revokeLease(leadLease.token, 'lead_takeover_error');
      return {
        success: false,
        outcome: 'FAILED',
        errorMessage: `Lead takeover error: ${err.message}`
      };
    }
  }

  private updateEscalationRecord(record: EscalationRecord): void {
    const escDir = path.join(this.workspaceRoot, '.agentic-kanban', 'runtime', 'escalations');
    const filePath = path.join(escDir, `${record.escalationId}.json`);
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
    }
  }
}
