import { RunnerAdapter, AdapterCapabilities, AttemptContext, ExecutionEvent, CancellationResult, AttemptResult } from './types';

export interface AssistedDispatchHandler {
  dispatch(context: AttemptContext): Promise<{ success: boolean; message?: string }>;
}

export class AssistedBridgeAdapter implements RunnerAdapter {
  public readonly id: string;
  public readonly name: string;
  public readonly tier = 'assisted';

  constructor(
    id: string,
    name: string,
    private readonly handler: AssistedDispatchHandler
  ) {
    this.id = id;
    this.name = name;
  }

  public async probe(): Promise<AdapterCapabilities> {
    return {
      tier: 'assisted',
      installed: true,
      supportsStructuredOutput: false,
      supportsResumableSessions: false,
      supportsTokenReporting: false,
      supportsCostLimits: false,
      supportsModelSelection: false,
      supportsNetworkRestrictions: false,
      supportsToolWhitelisting: false,
      notes: 'Assisted dispatch opens terminal or IDE chat; cannot prove process lifecycle or usage automatically.'
    };
  }

  public async start(
    context: AttemptContext,
    onEvent?: (event: ExecutionEvent) => void
  ): Promise<{ pid?: number; executionId: string }> {
    const executionId = `assisted_${context.attemptId}_${Date.now()}`;

    if (onEvent) {
      onEvent({
        type: 'status_change',
        timestamp: Date.now(),
        message: `Dispatched assisted attempt for ${context.ticketId}. Waiting for reported result.`
      });
    }

    await this.handler.dispatch(context);
    return { executionId };
  }

  public async collectResult(executionId: string): Promise<AttemptResult> {
    // Assisted runs cannot prove completion automatically; they require reported results and verification
    return {
      success: false,
      exitCode: 1,
      errorMessage: 'Assisted run awaiting manual confirmation and independent verification.'
    };
  }

  public async cancel(executionId: string): Promise<CancellationResult> {
    return {
      confirmed: true,
      reason: 'Assisted session marked cancelled in runtime.'
    };
  }
}
