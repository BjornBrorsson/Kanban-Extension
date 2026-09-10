/**
 * AI Orchestrator Core Types & Contracts (Headless)
 *
 * NOTE: This module is strictly decoupled from the VS Code API so that
 * the orchestration runtime can run headless, as a local daemon, or in CLI tooling.
 *
 * Invariant: The runtime store (.agentic-kanban/runtime/) is durable across crashes,
 * uncommitted to version control (gitignored), and never wiped while active attempts
 * or recovery obligations exist.
 */

export type ExecutionTier = 'managed' | 'assisted';

export interface PolicyConfig {
  allowedExecution: ('local' | 'verified-eu' | 'unrestricted')[];
  unknownDestination: 'deny' | 'allow';
  allowedDataClasses?: string[];
  allowedEndpoints?: string[];
}

export interface BoardPoliciesConfig {
  euOnly?: boolean;
  localOnly?: boolean;
  strictMode?: boolean;
  allowedDataClasses?: string[];
  allowedEndpoints?: string[];
}

export interface BudgetConfig {
  dailyCurrency?: string;
  dailyLimit?: number;
  reserveForReview?: number;
  batchCeiling?: number;
  maxPerTicketSpend?: number;
}

export type TaskCategory =
  | 'discovery'
  | 'architecture'
  | 'implementation'
  | 'verification'
  | 'refactor'
  | 'quick-fix'
  | 'escalation';

export interface ModelTierProfile {
  id: string;
  name: string;
  model: string;
  provider: 'ollama' | 'openai-compatible' | 'anthropic' | 'gemini' | 'cli-bridge';
  costTier: 'free' | 'low' | 'medium' | 'high';
  maxInputTokens?: number;
  maxOutputTokens?: number;
  temperature?: number;
  recommendedFor?: TaskCategory[];
}

export interface SubtaskRoutingConfig {
  defaultTier: string;
  categoryRoutes?: Partial<Record<TaskCategory, string>>;
  fallbackTier?: string;
}

export interface RoleBindings {
  lead?: string;
  worker?: string;
  reviewer?: string;
}

export interface OrchestrationSettings {
  enabled: boolean;
  profile?: string;
  maxConcurrentWorkers?: number;
  completionTarget?: 'reviewed-patch' | 'local-build' | 'pr';
  retryLimit?: number;
}

export interface OrchestrationConfig {
  schemaVersion: 1;
  orchestration: OrchestrationSettings;
  roles?: RoleBindings;
  policies?: Record<string, PolicyConfig>;
  budgets?: BudgetConfig;
  modelTiers?: ModelTierProfile[];
  subtaskRouting?: SubtaskRoutingConfig;
}

export type AttemptOutcome =
  | 'Pending'
  | 'Running'
  | 'Review'
  | 'Completed'
  | 'Blocked'
  | 'Failed'
  | 'Cancelled'
  | 'CancellationUnconfirmed'
  | 'Interrupted';

export interface BudgetReservation {
  currency?: string;
  unitsReserved: number;
  unitsSpentReported: number;
  unitsSpentEstimated: number;
  isSubscriptionQuota: boolean;
}

export interface AttemptManifest {
  baseRevision: string;
  fileHashes: Record<string, string>;
  manifestTimestamp: number;
}

export interface AttemptRecord {
  attemptId: string;
  ticketId: string;
  generation: number;
  status: AttemptOutcome;
  agentId: string;
  tier: ExecutionTier;
  leaseToken?: string;
  leaseExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  manifest: AttemptManifest;
  budgetReservation: BudgetReservation;
  patchUnified?: string;
  evidencePath?: string;
  handoffPath?: string;
  exitCode?: number;
  failureReason?: string;
  taskCategory?: TaskCategory;
  modelTier?: string;
}

export interface TicketFrontmatterExtension {
  id?: string;
  parentId?: string;
  dependsOn?: string[];
  blocks?: string[];
  priority?: string;
  rolePreference?: 'lead' | 'worker';
  policyProfile?: string;
  allowedScope?: string[];
  [key: string]: any;
}
