import * as fs from 'fs';
import * as path from 'path';
import { SubtaskRouter } from '../src/orchestrator/scheduler/subtaskRouter';
import { LeadPlanningEngine } from '../src/orchestrator/lead/planningSession';
import { OrchestratorRuntime } from '../src/orchestrator/core/orchestratorRuntime';
import { RunnerAdapter, AttemptContext, ExecutionResult, ExecutionTier } from '../src/orchestrator/adapters/types';
import { TaskCategory, ModelTierProfile, SubtaskRoutingConfig } from '../src/orchestrator/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

class MockRunnerAdapter implements RunnerAdapter {
  public readonly id = 'mock-adapter';
  public readonly tier: ExecutionTier = 'T0_HEURISTIC';

  public async start(context: AttemptContext): Promise<{ executionId: string }> {
    return { executionId: `exec-${context.attemptId}` };
  }

  public async collectResult(executionId: string): Promise<ExecutionResult> {
    return {
      success: true,
      exitCode: 0,
      stdout: 'Executed mock task successfully',
      patch: ''
    };
  }

  public async cancel(): Promise<void> {}
}

async function runSubtaskRouterTests() {
  console.log('=== Running Sub-Model Router & Dispatcher Tests ===');

  // --- Test 1: Task Category Classification Heuristics & Labels ---
  console.log('\n--- Test 1: Task Category Classification Heuristics & Labels ---');

  // Label-based classification
  assert(
    SubtaskRouter.classify({ labels: ['discovery', 'probe'] }) === 'discovery',
    'Labels with discovery/probe should classify as discovery'
  );
  assert(
    SubtaskRouter.classify({ labels: ['architecture', 'design'] }) === 'architecture',
    'Labels with architecture/design should classify as architecture'
  );
  assert(
    SubtaskRouter.classify({ labels: ['verify', 'qa'] }) === 'verification',
    'Labels with verify/qa should classify as verification'
  );
  assert(
    SubtaskRouter.classify({ labels: ['quick-fix', 'typo'] }) === 'quick-fix',
    'Labels with quick-fix/typo should classify as quick-fix'
  );
  assert(
    SubtaskRouter.classify({ labels: ['refactor', 'cleanup'] }) === 'refactor',
    'Labels with refactor should classify as refactor'
  );

  // Text heuristics classification
  assert(
    SubtaskRouter.classify({
      title: 'Locate endpoints',
      objective: 'Search codebase for all REST API route declarations'
    }) === 'discovery',
    'Search/locate keywords should classify as discovery'
  );

  assert(
    SubtaskRouter.classify({
      title: 'State Machine Decomposition',
      objective: 'High-level design and schema blueprint for multi-tenant isolation'
    }) === 'architecture',
    'Decomposition and blueprint keywords should classify as architecture'
  );

  assert(
    SubtaskRouter.classify({
      title: 'Run Integration Tests',
      objective: 'Assert all regression suites and validate API contracts'
    }) === 'verification',
    'Assert and validate test keywords should classify as verification'
  );

  assert(
    SubtaskRouter.classify({
      title: 'Fix typo in docstring',
      objective: 'Correct typo and whitespace formatting in markdown header'
    }) === 'quick-fix',
    'Typo and formatting keywords should classify as quick-fix'
  );

  assert(
    SubtaskRouter.classify({
      title: 'Restructure helper files',
      objective: 'Decouple legacy utilities and clean up circular dependencies'
    }) === 'refactor',
    'Decouple and restructure keywords should classify as refactor'
  );

  assert(
    SubtaskRouter.classify({
      title: 'Add JWT Auth handler',
      objective: 'Implement OAuth2 token refresh logic and persist tokens'
    }) === 'implementation',
    'Default standard tasks should classify as implementation'
  );

  console.log('✔ Classification tests passed');

  // --- Test 2: Model Resolution with Default & Custom Profiles ---
  console.log('\n--- Test 2: Model Resolution with Default & Custom Profiles ---');

  const defaultDiscRes = SubtaskRouter.resolveModel('discovery');
  assert(defaultDiscRes.effectiveTierId === 'fast-discovery', 'Default discovery should route to fast-discovery');
  assert(defaultDiscRes.profile.costTier === 'free', 'fast-discovery should be free/cheap tier');
  assert(!defaultDiscRes.isFallback, 'Default discovery route should not be fallback');

  const defaultArchRes = SubtaskRouter.resolveModel('architecture');
  assert(defaultArchRes.effectiveTierId === 'deep-reasoner', 'Default architecture should route to deep-reasoner');
  assert(defaultArchRes.profile.costTier === 'high', 'deep-reasoner should be high-reasoning tier');

  const defaultImplRes = SubtaskRouter.resolveModel('implementation');
  assert(defaultImplRes.effectiveTierId === 'standard-coder', 'Default implementation should route to standard-coder');

  // Custom routing table
  const customRouting: SubtaskRoutingConfig = {
    defaultTier: 'custom-pro',
    categoryRoutes: {
      discovery: 'local-mistral',
      architecture: 'custom-pro'
    },
    fallbackTier: 'custom-pro'
  };

  const customProfiles: ModelTierProfile[] = [
    {
      id: 'local-mistral',
      name: 'Mistral 7B Local',
      model: 'mistral:7b',
      provider: 'ollama',
      costTier: 'free'
    },
    {
      id: 'custom-pro',
      name: 'Gemini 1.5 Pro',
      model: 'gemini-1.5-pro',
      provider: 'google-genai',
      costTier: 'high'
    }
  ];

  const customDiscRes = SubtaskRouter.resolveModel('discovery', customRouting, customProfiles);
  assert(customDiscRes.effectiveTierId === 'local-mistral', 'Custom routing should route discovery to local-mistral');
  assert(customDiscRes.profile.model === 'mistral:7b', 'Custom profile model should match');

  // Fallback when requested tier doesn't exist
  const missingTierRouting: SubtaskRoutingConfig = {
    defaultTier: 'custom-pro',
    categoryRoutes: {
      discovery: 'non-existent-tier'
    },
    fallbackTier: 'custom-pro'
  };

  const fallbackRes = SubtaskRouter.resolveModel('discovery', missingTierRouting, customProfiles);
  assert(fallbackRes.isFallback === true, 'Missing tier must trigger fallback');
  assert(fallbackRes.effectiveTierId === 'custom-pro', 'Should fall back to fallbackTier custom-pro');
  assert(fallbackRes.reason?.includes('not found'), 'Fallback reason should document missing tier');

  console.log('✔ Model resolution and fallback tests passed');

  // --- Test 3: Local-Only Board Policy Gating ---
  console.log('\n--- Test 3: Local-Only Board Policy Gating ---');

  // Architecture prefers deep-reasoner (cloud), but localOnly policy is set:
  const localOnlyRes = SubtaskRouter.resolveModel(
    'architecture',
    SubtaskRouter.DEFAULT_ROUTING,
    SubtaskRouter.DEFAULT_PROFILES,
    { localOnly: true }
  );

  assert(localOnlyRes.effectiveTierId === 'fast-discovery', 'localOnly policy must reroute to local/free tier');
  assert(localOnlyRes.isFallback === true, 'localOnly reroute must flag isFallback = true');
  assert(localOnlyRes.reason?.includes('localOnly'), 'Reason must explain localOnly policy enforcement');

  console.log('✔ Policy gating tests passed');

  // --- Test 4: Lead Planning Session Auto-Tagging & Plan Export ---
  console.log('\n--- Test 4: Lead Planning Session Auto-Tagging & Plan Export ---');

  const rawSubtasks = [
    {
      id: 'TASK-1',
      title: 'Locate Indexing Code',
      priority: 'P1 — Core' as const,
      allowedScope: ['src/**'],
      objective: 'Research and locate indexing options in codebase',
      acceptanceCriteria: ['Files mapped']
    },
    {
      id: 'TASK-2',
      title: 'Design Architecture',
      priority: 'P0 — Critical' as const,
      allowedScope: ['src/index/**'],
      objective: 'High-level design and blueprint for inverted index architecture',
      acceptanceCriteria: ['Schema finalized']
    },
    {
      id: 'TASK-3',
      title: 'Implement Core Indexer',
      priority: 'P1 — Core' as const,
      allowedScope: ['src/index/**'],
      objective: 'Implement core indexer and querying algorithms',
      acceptanceCriteria: ['Passes unit tests']
    },
    {
      id: 'TASK-4',
      title: 'Validate Benchmarks',
      priority: 'P2 — Important' as const,
      allowedScope: ['test/**'],
      objective: 'Write performance verification benchmark tests and validate contracts',
      acceptanceCriteria: ['Benchmarks pass']
    },
    {
      id: 'TASK-5',
      title: 'Fix Typo in Config',
      priority: 'P3 — Minor' as const,
      allowedScope: ['config/**'],
      objective: 'Fix typo and whitespace formatting in markdown comments',
      acceptanceCriteria: ['Lint clean']
    }
  ];

  const plan = LeadPlanningEngine.planGoal('Build High Performance Search Feature', rawSubtasks);

  assert(plan.subtasks.length === 5, 'Plan should contain 5 subtasks');
  assert(plan.subtasks[0].category === 'discovery', 'Subtask 0 should be categorized as discovery');
  assert(plan.subtasks[0].modelTier === 'fast-discovery', 'Subtask 0 should be assigned fast-discovery tier');

  assert(plan.subtasks[1].category === 'architecture', 'Subtask 1 should be categorized as architecture');
  assert(plan.subtasks[1].modelTier === 'deep-reasoner', 'Subtask 1 should be assigned deep-reasoner tier');

  assert(plan.subtasks[2].category === 'implementation', 'Subtask 2 should be categorized as implementation');
  assert(plan.subtasks[2].modelTier === 'standard-coder', 'Subtask 2 should be assigned standard-coder tier');

  assert(plan.subtasks[3].category === 'verification', 'Subtask 3 should be categorized as verification');
  assert(plan.subtasks[3].modelTier === 'standard-coder', 'Subtask 3 should be assigned standard-coder tier');

  assert(plan.subtasks[4].category === 'quick-fix', 'Subtask 4 should be categorized as quick-fix');
  assert(plan.subtasks[4].modelTier === 'fast-discovery', 'Subtask 4 should be assigned fast-discovery tier');

  const markdownTicket0 = LeadPlanningEngine.formatTicketMarkdown(plan.subtasks[0], plan.epicOrGoal);
  assert(markdownTicket0.includes('| **Category** | `discovery` |'), 'Markdown table must include Category');
  assert(markdownTicket0.includes('| **Model Tier** | `fast-discovery` |'), 'Markdown table must list fast-discovery tier');

  const markdownTicket1 = LeadPlanningEngine.formatTicketMarkdown(plan.subtasks[1], plan.epicOrGoal);
  assert(markdownTicket1.includes('| **Category** | `architecture` |'), 'Markdown table must include Category');
  assert(markdownTicket1.includes('| **Model Tier** | `deep-reasoner` |'), 'Markdown table must list deep-reasoner tier');

  console.log('✔ Lead planning auto-tagging and markdown export tests passed');

  // --- Test 5: Orchestrator Runtime Dispatch Integration ---
  console.log('\n--- Test 5: Orchestrator Runtime Dispatch Integration ---');

  const testRoot = path.join(__dirname, '..', 'scratch', 'subtask-router-test-ws');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  const runtime = new OrchestratorRuntime(testRoot);
  await runtime.initialize();

  const mockAdapter = new MockRunnerAdapter();
  const dispatchResult = await runtime.runAttempt(mockAdapter, {
    ticketId: 'ticket-discovery-probe',
    agentId: 'worker-1',
    objective: 'Search files and locate schema references',
    labels: ['discovery']
  });

  assert(dispatchResult.success === true, 'Attempt should execute successfully');
  assert(dispatchResult.modelResolution !== undefined, 'modelResolution must be returned');
  assert(dispatchResult.modelResolution?.category === 'discovery', 'Task category should be discovery');
  assert(dispatchResult.modelResolution?.effectiveTierId === 'fast-discovery', 'Effective tier should be fast-discovery');
  assert(dispatchResult.attempt.taskCategory === 'discovery', 'AttemptRecord must persist taskCategory');
  assert(dispatchResult.attempt.modelTier === 'fast-discovery', 'AttemptRecord must persist modelTier');

  console.log('✔ Orchestrator runtime dispatch integration tests passed');

  console.log('\n=== All Sub-Model Router & Dispatcher Tests Passed! ===\n');
}

runSubtaskRouterTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
