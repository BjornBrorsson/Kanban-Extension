import { RunnerAdapter, AdapterCapabilities, AttemptContext, ExecutionEvent, CancellationResult, AttemptResult } from '../../src/orchestrator/adapters/types';

export interface FakeAdapterBehavior {
  delayMs?: number;
  exitCode?: number;
  patchToGenerate?: string;
  simulateCrash?: boolean;
  simulateRateLimit?: boolean;
  simulateMalformedPatch?: boolean;
  simulateCancellationHang?: boolean;
  unresolvedQuestions?: string[];
  reportedCost?: {
    currency?: string;
    units: number;
    isSubscriptionUnits: boolean;
  };
}

export class FakeDeterministicAdapter implements RunnerAdapter {
  public readonly id = 'fake-deterministic';
  public readonly name = 'Deterministic Fake Adapter';
  public readonly tier = 'managed';

  private activeExecutions: Map<string, { context: AttemptContext; cancelled: boolean }> = new Map();
  public behavior: FakeAdapterBehavior = {
    delayMs: 10,
    exitCode: 0,
    patchToGenerate: `--- a/README.md\n+++ b/README.md\n@@ -1,3 +1,4 @@\n # Title\n+Added line by Fake Deterministic Worker\n`,
    reportedCost: { currency: 'EUR', units: 0.05, isSubscriptionUnits: false }
  };

  public async probe(): Promise<AdapterCapabilities> {
    return {
      tier: 'managed',
      installed: true,
      version: '1.0.0-fake',
      detectedPath: '/fake/bin/runner',
      supportsStructuredOutput: true,
      supportsResumableSessions: true,
      supportsTokenReporting: true,
      supportsCostLimits: true,
      supportsModelSelection: true,
      supportsNetworkRestrictions: true,
      supportsToolWhitelisting: true,
      notes: 'Fake deterministic test adapter for CI and failure simulation'
    };
  }

  public async start(
    context: AttemptContext,
    onEvent?: (event: ExecutionEvent) => void
  ): Promise<{ pid?: number; executionId: string }> {
    const executionId = `exec_${context.attemptId}_${Date.now()}`;
    const pid = 999000 + Math.floor(Math.random() * 1000);
    this.activeExecutions.set(executionId, { context, cancelled: false });

    if (onEvent) {
      onEvent({
        type: 'status_change',
        timestamp: Date.now(),
        message: `Starting fake execution for ticket ${context.ticketId}`
      });
      onEvent({
        type: 'stdout',
        timestamp: Date.now(),
        message: `Inspecting target files: ${JSON.stringify(context.targetFiles || [])}`
      });
    }

    return { pid, executionId };
  }

  public async collectResult(executionId: string): Promise<AttemptResult> {
    const exec = this.activeExecutions.get(executionId);
    if (!exec) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (this.behavior.delayMs && this.behavior.delayMs > 0) {
      await new Promise(r => setTimeout(r, this.behavior.delayMs));
    }

    if (exec.cancelled) {
      return {
        success: false,
        exitCode: 130,
        errorMessage: 'Execution was cancelled by user.'
      };
    }

    if (this.behavior.simulateRateLimit) {
      return {
        success: false,
        exitCode: 429,
        errorMessage: 'Provider HTTP 429: Rate limit exceeded (sliding window throttled).'
      };
    }

    if (this.behavior.simulateCrash) {
      // Simulates sudden process crash before result commitment
      throw new Error('SIGKILL: Runner process terminated abruptly.');
    }

    if (this.behavior.simulateMalformedPatch) {
      return {
        success: true,
        exitCode: 0,
        patch: 'MALFORMED PATCH CORRUPTED HEADER &&*&@#',
        reportedUsage: this.behavior.reportedCost
      };
    }

    const exitCode = this.behavior.exitCode !== undefined ? this.behavior.exitCode : 0;
    const isSuccess = exitCode === 0;

    return {
      success: isSuccess,
      exitCode,
      patch: isSuccess ? this.behavior.patchToGenerate : undefined,
      evidence: [
        { command: 'npm test', exitCode: isSuccess ? 0 : 1, output: isSuccess ? 'All checks passed.' : 'Assertion error in test suite.' }
      ],
      reportedUsage: this.behavior.reportedCost,
      unresolvedQuestions: this.behavior.unresolvedQuestions,
      rawOutput: `Worker execution complete with exit code ${exitCode}.`
    };
  }

  public async cancel(executionId: string): Promise<CancellationResult> {
    const exec = this.activeExecutions.get(executionId);
    if (!exec) {
      return { confirmed: true, reason: 'Already terminated or unknown' };
    }

    if (this.behavior.simulateCancellationHang) {
      return {
        confirmed: false,
        reason: 'Process ignored SIGTERM and cancellation timed out.'
      };
    }

    exec.cancelled = true;
    return {
      confirmed: true,
      reason: 'SIGTERM acknowledged and process terminated cleanly.'
    };
  }
}
