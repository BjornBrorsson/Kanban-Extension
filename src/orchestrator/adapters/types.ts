/**
 * Runner Adapter Interfaces and Execution Contracts
 */

export type ExecutionTier = 'managed' | 'assisted';

export interface AdapterCapabilities {
  tier: ExecutionTier;
  installed: boolean;
  version?: string;
  detectedPath?: string;
  supportsStructuredOutput: boolean;
  supportsResumableSessions: boolean;
  supportsTokenReporting: boolean;
  supportsCostLimits: boolean;
  supportsModelSelection: boolean;
  supportsNetworkRestrictions: boolean;
  supportsToolWhitelisting: boolean;
  notes?: string;
}

export interface AttemptContext {
  ticketId: string;
  attemptId: string;
  objective: string;
  workspaceRoot: string;
  targetFiles?: string[];
  role: 'lead' | 'worker';
  model?: string;
  allowedScope?: string[];
  allocatedBudget?: {
    currency?: string;
    maxUnits: number;
    isSubscriptionUnits?: boolean;
  };
}

export type ExecutionEventType =
  | 'stdout'
  | 'stderr'
  | 'status_change'
  | 'tool_call'
  | 'checkpoint'
  | 'error';

export interface ExecutionEvent {
  type: ExecutionEventType;
  timestamp: number;
  message: string;
  data?: any;
}

export interface CancellationResult {
  confirmed: boolean;
  terminatedPid?: number;
  reason?: string;
}

export interface AttemptResult {
  success: boolean;
  exitCode: number;
  patch?: string;
  evidence?: {
    command: string;
    exitCode: number;
    output: string;
  }[];
  reportedUsage?: {
    currency?: string;
    units: number;
    isSubscriptionUnits: boolean;
  };
  unresolvedQuestions?: string[];
  rawOutput?: string;
  errorMessage?: string;
}

export interface RunnerAdapter {
  readonly id: string;
  readonly name: string;
  readonly tier: ExecutionTier;

  probe(): Promise<AdapterCapabilities>;
  start(
    context: AttemptContext,
    onEvent?: (event: ExecutionEvent) => void
  ): Promise<{ pid?: number; executionId: string }>;
  cancel(executionId: string): Promise<CancellationResult>;
  collectResult(executionId: string): Promise<AttemptResult>;
  resume?(executionId: string, message?: string): Promise<void>;
}
