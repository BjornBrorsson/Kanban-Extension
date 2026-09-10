import { RuntimeJournal } from './runtimeJournal';
import { LeaseManager } from './leaseManager';
import { WorkspaceManager, WorkspaceAllocation } from '../workspaces/workspaceManager';
import { RunnerAdapter, AttemptContext, ExecutionEvent } from '../adapters/types';
import { TicketAttemptManager } from '../models/ticketAttempt';
import { AttemptRecord, AttemptOutcome, BoardPoliciesConfig, TaskCategory, ModelTierProfile, SubtaskRoutingConfig } from '../types';
import { ContextPackager, DelegationPackage } from '../context/contextPackager';
import { DelegationProtocol } from '../lead/delegationProtocol';
import { EscalationHandler, EscalationRecord, TakeoverResult } from '../lead/escalationHandler';
import { ReviewManager, VerificationEvidence, ReviewDecisionRecord } from '../review/reviewManager';
import { PolicyEngine } from '../policy/policyEngine';
import { BudgetManager, ReservationResult } from '../policy/budgetManager';
import { EgressController } from '../policy/egressController';
import { CancellationController, CancellationResult } from './cancellationController';
import { SubtaskRouter, ModelResolutionResult } from '../scheduler/subtaskRouter';

export interface ExecutionAttemptOptions {
  ticketId: string;
  agentId: string;
  role?: 'lead' | 'worker';
  objective: string;
  targetFiles?: string[];
  verificationCommand?: string;
  autoIntegrate?: boolean;
  policies?: BoardPoliciesConfig;
  budgetRequested?: number;
  category?: TaskCategory;
  modelTier?: string;
  routingConfig?: SubtaskRoutingConfig;
  modelTiers?: ModelTierProfile[];
  labels?: string[];
}

export interface ExecutionAttemptOutput {
  success: boolean;
  attempt: AttemptRecord;
  diff?: string;
  verificationPassed?: boolean;
  integrated?: boolean;
  reservation?: ReservationResult;
  errorMessage?: string;
  modelResolution?: ModelResolutionResult;
}

export interface DelegatedAttemptOptions {
  ticketId: string;
  workerAdapter: RunnerAdapter;
  workerId: string;
  leadAdapter?: RunnerAdapter;
  leadId?: string;
  objective: string;
  allowedScope: string[];
  acceptanceCriteria: string[];
  targetFiles?: string[];
  verificationCommand?: string;
  autoIntegrate?: boolean;
  maxRetries?: number;
  policies?: BoardPoliciesConfig;
  budgetRequested?: number;
  category?: TaskCategory;
  modelTier?: string;
  routingConfig?: SubtaskRoutingConfig;
  modelTiers?: ModelTierProfile[];
  labels?: string[];
}

export interface DelegatedAttemptOutput {
  success: boolean;
  attempt: AttemptRecord;
  diff?: string;
  delegationPackage: DelegationPackage;
  escalation?: EscalationRecord;
  takeoverResult?: TakeoverResult;
  verificationEvidence?: VerificationEvidence;
  reviewDecision?: ReviewDecisionRecord;
  reservation?: ReservationResult;
  integrated?: boolean;
  errorMessage?: string;
  modelResolution?: ModelResolutionResult;
}

export class OrchestratorRuntime {
  public readonly journal: RuntimeJournal;
  public readonly leaseManager: LeaseManager;
  public readonly workspaceManager: WorkspaceManager;
  public readonly escalationHandler: EscalationHandler;
  public readonly reviewManager: ReviewManager;
  public readonly budgetManager: BudgetManager;
  public readonly egressController: EgressController;
  public readonly cancellationController: CancellationController;

  constructor(public readonly workspaceRoot: string) {
    this.journal = new RuntimeJournal(workspaceRoot);
    this.leaseManager = new LeaseManager(workspaceRoot, this.journal);
    this.workspaceManager = new WorkspaceManager(workspaceRoot);
    this.escalationHandler = new EscalationHandler(workspaceRoot, this.journal, this.leaseManager, this.workspaceManager);
    this.reviewManager = new ReviewManager(workspaceRoot);
    this.budgetManager = new BudgetManager(workspaceRoot);
    this.egressController = new EgressController(workspaceRoot);
    this.cancellationController = new CancellationController(this.journal, this.leaseManager, this.budgetManager);
  }

  /**
   * Initializes runtime and performs startup crash recovery.
   */
  public async initialize(): Promise<{ recoveredCount: number }> {
    this.journal.acquireWorkspaceLock();
    const interrupted = this.journal.scanInterruptedAttempts();

    for (const attempt of interrupted) {
      this.journal.transitionAttempt(attempt.attemptId, 'Interrupted', {
        failureReason: 'Interrupted by extension restart or crash.'
      });
      this.workspaceManager.cleanup(attempt.attemptId);
    }

    if (interrupted.length > 0) {
      this.journal.logEntry({
        timestamp: Date.now(),
        type: 'RECOVERY_COMPLETE',
        details: { count: interrupted.length }
      });
    }

    return { recoveredCount: interrupted.length };
  }

  /**
   * Executes a single supervised ticket attempt from start to verified patch.
   */
  public async runAttempt(
    adapter: RunnerAdapter,
    options: ExecutionAttemptOptions,
    onEvent?: (event: ExecutionEvent) => void
  ): Promise<ExecutionAttemptOutput> {
    const { ticketId, agentId, objective, targetFiles = [], verificationCommand, autoIntegrate } = options;

    // 0. Pre-dispatch checks: Policy eligibility, Subtask routing & Budget reservation
    if (options.policies) {
      const policyCheck = PolicyEngine.evaluateEligibility({
        providerId: agentId,
        policies: options.policies,
        role: options.role || 'worker'
      });
      if (!policyCheck.eligible) {
        this.egressController.logAudit({
          timestamp: Date.now(),
          ticketId,
          attemptId: 'pre-dispatch',
          providerId: agentId,
          action: 'dispatch_request',
          targetEndpoint: policyCheck.provider.endpointHost,
          allowed: false,
          policyRule: policyCheck.violations.join('; ')
        });
        return {
          success: false,
          attempt: { ticketId, status: 'Blocked', failureReason: policyCheck.violations.join('; ') } as any,
          errorMessage: `Policy violation: ${policyCheck.violations.join('; ')}`
        };
      }
    }

    const taskCategory = options.category || SubtaskRouter.classify({
      title: ticketId,
      objective,
      labels: options.labels,
      allowedScope: targetFiles
    });
    const modelResolution = SubtaskRouter.resolveModel(
      taskCategory,
      options.routingConfig,
      options.modelTiers,
      options.policies
    );

    const budgetRequested = options.budgetRequested || 1.0;
    const reservation = this.budgetManager.reserve({
      ticketId,
      attemptId: `temp-${ticketId}-${Date.now()}`,
      totalAmount: budgetRequested
    });
    if (!reservation.allowed) {
      return {
        success: false,
        attempt: { ticketId, status: 'Blocked', failureReason: reservation.reason } as any,
        reservation,
        errorMessage: reservation.reason,
        modelResolution
      };
    }

    // 1. Acquire attempt lease with monotonic generation
    const lease = this.leaseManager.acquireLease(ticketId);

    // 2. Capture baseline manifest
    const manifest = await this.workspaceManager.captureBaseline(targetFiles);

    // 3. Create and persist attempt record
    const attempt = TicketAttemptManager.createAttempt(
      ticketId,
      lease.generation,
      agentId,
      adapter.tier,
      manifest,
      { currency: 'EUR', unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false },
      { taskCategory, modelTier: modelResolution.effectiveTierId }
    );
    this.leaseManager.bindAttempt(lease.token, attempt);
    TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);

    // 4. Allocate isolated workspace
    let currentAttempt = attempt;
    let allocation: WorkspaceAllocation;
    try {
      allocation = await this.workspaceManager.allocate(attempt.attemptId, manifest);
    } catch (err: any) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Failed', { failureReason: `Workspace allocation failed: ${err.message}` });
      this.leaseManager.revokeLease(lease.token);
      return { success: false, attempt: currentAttempt, errorMessage: err.message };
    }

    // 5. Transition to Running
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Running');

    // 6. Start runner adapter
    const attemptContext: AttemptContext = {
      ticketId,
      attemptId: attempt.attemptId,
      objective,
      workspaceRoot: allocation.workspacePath,
      targetFiles,
      role: options.role || 'worker',
      allocatedBudget: { currency: 'EUR', maxUnits: 1 }
    };

    let executionId: string;
    try {
      const startResult = await adapter.start(attemptContext, event => {
        if (onEvent) onEvent(event);
      });
      executionId = startResult.executionId;
    } catch (err: any) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Failed', { failureReason: `Adapter failed to start: ${err.message}` });
      this.workspaceManager.cleanup(attempt.attemptId);
      this.leaseManager.revokeLease(lease.token);
      return { success: false, attempt: currentAttempt, errorMessage: err.message };
    }

    // 7. Collect runner result
    const result = await adapter.collectResult(executionId);

    // 8. Validate lease before accepting result
    const leaseCheck = this.leaseManager.validateLease(lease.token, ticketId, lease.generation);
    if (!leaseCheck.valid) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Failed', {
        failureReason: `Lease validation failed: ${leaseCheck.reason}`
      });
      this.workspaceManager.cleanup(attempt.attemptId);
      return { success: false, attempt: currentAttempt, errorMessage: leaseCheck.reason };
    }

    if (!result.success) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Failed', {
        failureReason: result.errorMessage || 'Runner execution failed.'
      });
      this.workspaceManager.cleanup(attempt.attemptId);
      this.leaseManager.revokeLease(lease.token);
      return { success: false, attempt: currentAttempt, errorMessage: result.errorMessage };
    }

    // 9. Capture diff
    const diff = result.patch || this.workspaceManager.captureDiff(allocation);

    // 10. Independent verification if command provided
    let verificationPassed = true;
    if (verificationCommand) {
      const verResult = await this.workspaceManager.verify(allocation, verificationCommand);
      verificationPassed = verResult.passed;
      if (!verificationPassed) {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Failed', {
          failureReason: `Independent verification failed (${verificationCommand}): ${verResult.stderr || verResult.stdout}`
        });
        this.workspaceManager.cleanup(attempt.attemptId);
        this.leaseManager.revokeLease(lease.token);
        return { success: false, attempt: currentAttempt, diff, verificationPassed: false, errorMessage: 'Verification failed.' };
      }
    }

    // 11. Transition to Review
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Review', {
      patchUnified: diff
    });

    let integrated = false;
    if (autoIntegrate) {
      const integResult = await this.workspaceManager.integrate(allocation);
      integrated = integResult.success;
      if (integrated) {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Completed');
      } else {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Blocked', {
          failureReason: integResult.errorMessage
        });
      }
    }

    this.leaseManager.revokeLease(lease.token, 'attempt_completed');
    if (reservation.reservation) {
      this.budgetManager.reconcile({
        attemptId: reservation.reservation.attemptId,
        actualSpent: budgetRequested * 0.5,
        isReported: true
      });
    }

    return {
      success: true,
      attempt: currentAttempt,
      diff,
      verificationPassed,
      integrated,
      reservation,
      modelResolution
    };
  }

  /**
   * Executes a bounded delegated attempt:
   * 1. Packages context into immutable DelegationPackage with allowedScope.
   * 2. Runs worker in isolated workspace.
   * 3. Validates scope on worker's patch.
   * 4. Evaluates escalation triggers (scope violation, verification failure).
   * 5. If escalated and leadAdapter is provided, executes Lead Checkpoint Takeover.
   * 6. Runs independent verification & fresh lead review.
   * 7. Transitions attempt to Review (or Completed if autoIntegrate).
   */
  public async runDelegatedAttempt(
    options: DelegatedAttemptOptions,
    onEvent?: (event: ExecutionEvent) => void
  ): Promise<DelegatedAttemptOutput> {
    const {
      ticketId,
      workerAdapter,
      workerId,
      leadAdapter,
      objective,
      allowedScope,
      acceptanceCriteria,
      targetFiles = [],
      verificationCommand,
      autoIntegrate,
      maxRetries = 1
    } = options;

    // 0. Pre-dispatch checks: Policy eligibility & Budget reservation
    if (options.policies) {
      const workerPolicyCheck = PolicyEngine.evaluateEligibility({
        providerId: workerId,
        policies: options.policies,
        role: 'worker'
      });
      if (!workerPolicyCheck.eligible) {
        return {
          success: false,
          attempt: { ticketId, status: 'Blocked', failureReason: workerPolicyCheck.violations.join('; ') } as any,
          delegationPackage: null as any,
          errorMessage: `Worker policy violation: ${workerPolicyCheck.violations.join('; ')}`
        };
      }
    }

    const taskCategory = options.category || SubtaskRouter.classify({
      title: ticketId,
      objective,
      labels: options.labels,
      allowedScope
    });
    const modelResolution = SubtaskRouter.resolveModel(
      taskCategory,
      options.routingConfig,
      options.modelTiers,
      options.policies
    );

    const budgetRequested = options.budgetRequested || 1.0;
    const reservation = this.budgetManager.reserve({
      ticketId,
      attemptId: `temp-del-${ticketId}-${Date.now()}`,
      totalAmount: budgetRequested
    });
    if (!reservation.allowed) {
      return {
        success: false,
        attempt: { ticketId, status: 'Blocked', failureReason: reservation.reason } as any,
        delegationPackage: null as any,
        reservation,
        errorMessage: reservation.reason,
        modelResolution
      };
    }

    // 1. Acquire attempt lease
    const lease = this.leaseManager.acquireLease(ticketId);

    // 2. Baseline manifest & workspace allocation
    const manifest = await this.workspaceManager.captureBaseline(targetFiles);
    const attempt = TicketAttemptManager.createAttempt(
      ticketId,
      lease.generation,
      workerId,
      workerAdapter.tier,
      manifest,
      { currency: 'EUR', unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false },
      { taskCategory, modelTier: modelResolution.effectiveTierId }
    );
    this.leaseManager.bindAttempt(lease.token, attempt);
    TicketAttemptManager.saveAttempt(this.workspaceRoot, attempt);

    let currentAttempt = attempt;
    const allocation = await this.workspaceManager.allocate(attempt.attemptId, manifest);

    // 3. Package bounded delegation context
    const delegationPackage = ContextPackager.packageForWorker({
      ticketId,
      attemptId: attempt.attemptId,
      objective,
      allowedScope,
      workspaceRoot: this.workspaceRoot,
      targetFiles,
      budget: { currency: 'EUR', maxUnits: 1 }
    });
    ContextPackager.persistPackage(this.workspaceRoot, delegationPackage);

    // 4. Transition to Running
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Running');

    // 5. Run worker adapter
    let workerSuccess = false;
    let workerDiff = '';
    let errorMessage: string | undefined;

    try {
      const startResult = await workerAdapter.start({
        ticketId,
        attemptId: attempt.attemptId,
        objective,
        workspaceRoot: allocation.workspacePath,
        targetFiles,
        role: 'worker',
        allocatedBudget: { currency: 'EUR', maxUnits: 1 }
      }, onEvent);

      const result = await workerAdapter.collectResult(startResult.executionId);
      workerSuccess = result.success;
      workerDiff = result.patch || this.workspaceManager.captureDiff(allocation);
      if (!workerSuccess) {
        errorMessage = result.errorMessage;
      }
    } catch (err: any) {
      workerSuccess = false;
      errorMessage = err.message;
    }

    let finalDiff = workerDiff;
    let escalation: EscalationRecord | undefined;
    let takeoverResult: TakeoverResult | undefined;

    // 6. Test verification if command provided
    let verResult = { passed: true, error: undefined as string | undefined, command: verificationCommand };
    if (verificationCommand) {
      const execVer = await this.workspaceManager.verify(allocation, verificationCommand);
      verResult = {
        passed: execVer.passed,
        error: execVer.passed ? undefined : (execVer.stderr || execVer.stdout),
        command: verificationCommand
      };
    }

    // 7. Check for escalation triggers (scope breach, verification failure, or worker failure)
    const triggeredEsc = this.escalationHandler.evaluateEscalationTriggers({
      ticketId,
      attemptId: attempt.attemptId,
      workerId,
      delegationPackage,
      diff: finalDiff,
      verificationResult: verResult,
      consecutiveFailures: verResult.passed && workerSuccess ? 0 : 1,
      maxRetries,
      errorText: errorMessage
    });

    if (triggeredEsc) {
      escalation = triggeredEsc;

      // Routine worker escalation is expected: do NOT count as failed if handled
      if (leadAdapter) {
        takeoverResult = await this.escalationHandler.executeLeadTakeover(
          escalation,
          leadAdapter,
          lease.token,
          allocation
        );

        if (takeoverResult.success && takeoverResult.resolvedPatch) {
          finalDiff = takeoverResult.resolvedPatch;
          // Re-verify after lead takeover
          if (verificationCommand) {
            const reVer = await this.workspaceManager.verify(allocation, verificationCommand);
            verResult = {
              passed: reVer.passed,
              error: reVer.passed ? undefined : (reVer.stderr || reVer.stdout),
              command: verificationCommand
            };
          }
        } else {
          currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Blocked', {
            failureReason: `Escalated to Lead: ${takeoverResult.errorMessage || escalation.message}`
          });
          this.workspaceManager.cleanup(attempt.attemptId);
          return {
            success: false,
            attempt: currentAttempt,
            delegationPackage,
            escalation,
            takeoverResult,
            errorMessage: takeoverResult.errorMessage || escalation.message
          };
        }
      } else {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Blocked', {
          failureReason: `Worker escalated without lead available: ${escalation.message}`
        });
        this.workspaceManager.cleanup(attempt.attemptId);
        this.leaseManager.revokeLease(lease.token);
        return {
          success: false,
          attempt: currentAttempt,
          delegationPackage,
          escalation,
          errorMessage: escalation.message
        };
      }
    }

    // 8. Run independent verification evidence capture
    let verificationEvidence: VerificationEvidence | undefined;
    if (verificationCommand) {
      verificationEvidence = await this.reviewManager.runIndependentVerification(
        allocation,
        ticketId,
        verificationCommand
      );
    } else {
      verificationEvidence = {
        attemptId: attempt.attemptId,
        ticketId,
        timestamp: Date.now(),
        command: 'none',
        passed: true,
        exitCode: 0,
        stdout: 'No verification command specified',
        stderr: ''
      };
      this.reviewManager.persistEvidence(verificationEvidence);
    }

    // 9. Run Fresh Lead Review
    const reviewDecision = this.reviewManager.performFreshReview({
      ticketId,
      attemptId: attempt.attemptId,
      reviewerId: options.leadId || 'fresh-lead-reviewer',
      patchDiff: finalDiff,
      acceptanceCriteria,
      verificationEvidence
    });

    // 10. Gating check
    const gate = this.reviewManager.canTransitionToDone(attempt.attemptId);
    if (!gate.allowed) {
      currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Failed', {
        failureReason: `Fresh review gating failed: ${gate.reason}`
      });
      this.workspaceManager.cleanup(attempt.attemptId);
      this.leaseManager.revokeLease(lease.token);
      return {
        success: false,
        attempt: currentAttempt,
        diff: finalDiff,
        delegationPackage,
        escalation,
        takeoverResult,
        verificationEvidence,
        reviewDecision,
        errorMessage: gate.reason
      };
    }

    // 11. Transition to Review
    currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Review', {
      patchUnified: finalDiff
    });

    let integrated = false;
    if (autoIntegrate) {
      const integResult = await this.workspaceManager.integrate(allocation);
      integrated = integResult.success;
      if (integrated) {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Completed');
      } else {
        currentAttempt = this.journal.transitionAttempt(attempt.attemptId, 'Blocked', {
          failureReason: integResult.errorMessage
        });
      }
    }

    this.leaseManager.revokeLease(lease.token, 'attempt_completed');
    if (reservation.reservation) {
      this.budgetManager.reconcile({
        attemptId: reservation.reservation.attemptId,
        actualSpent: budgetRequested * 0.5,
        isReported: true
      });
    }

    return {
      success: true,
      attempt: currentAttempt,
      diff: finalDiff,
      delegationPackage,
      escalation,
      takeoverResult,
      verificationEvidence,
      reviewDecision,
      reservation,
      integrated,
      modelResolution
    };
  }

  /**
   * Cancels an active attempt with confirmed process termination and budget release.
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
    return this.cancellationController.cancelAttempt(params);
  }

  public dispose(): void {
    this.journal.releaseWorkspaceLock();
  }
}
