import * as fs from 'fs';
import * as path from 'path';
import { LeadPlanningEngine, PlannedSubtask } from '../src/orchestrator/lead/planningSession';
import { ContextPackager } from '../src/orchestrator/context/contextPackager';
import { DelegationProtocol } from '../src/orchestrator/lead/delegationProtocol';
import { OrchestratorRuntime } from '../src/orchestrator/core/orchestratorRuntime';
import { FakeDeterministicAdapter } from './fixtures/fakeAdapter';
import { TicketParser } from '../src/ticketParser';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM2Tests() {
  console.log('=== Running Milestone M2 Integration Tests ===');

  const testRoot = path.join(__dirname, '..', 'scratch', 'm2-test-workspace');
  fs.mkdirSync(testRoot, { recursive: true });

  // --- Test 1: Lead Planning Session & Cycle Detection (ORCH-009) ---
  console.log('\n--- Test 1: Lead Planning Engine & Dependency Cycle Detection ---');
  const validSubtasks: PlannedSubtask[] = [
    {
      id: 'TASK-101',
      title: 'Database Schema Migration',
      priority: 'P0 — Critical',
      allowedScope: ['src/db/**'],
      objective: 'Add accounts table migration script.',
      acceptanceCriteria: ['Migration runs cleanly', 'Rollback succeeds'],
      blocks: ['TASK-102']
    },
    {
      id: 'TASK-102',
      title: 'User Service Repository',
      priority: 'P1 — Core',
      dependsOn: ['TASK-101'],
      allowedScope: ['src/services/UserService.ts'],
      objective: 'Implement CRUD operations on accounts table.',
      acceptanceCriteria: ['Passes integration tests', 'No SQL injection'],
      verificationCommand: 'node -e "process.exit(0)"'
    }
  ];

  const planResult = LeadPlanningEngine.planGoal('Build User Account Feature', validSubtasks);
  assert(planResult.subtasks.length === 2, 'Should decompose into 2 subtasks');
  assert(planResult.dependencyGraph['TASK-102'].includes('TASK-101'), 'TASK-102 must depend on TASK-101');

  // Verify cycle detection
  const cyclicSubtasks: PlannedSubtask[] = [
    { id: 'A', title: 'Task A', priority: 'P1 — Core', dependsOn: ['B'], allowedScope: [], objective: '', acceptanceCriteria: [] },
    { id: 'B', title: 'Task B', priority: 'P1 — Core', dependsOn: ['C'], allowedScope: [], objective: '', acceptanceCriteria: [] },
    { id: 'C', title: 'Task C', priority: 'P1 — Core', dependsOn: ['A'], allowedScope: [], objective: '', acceptanceCriteria: [] }
  ];
  let cycleDetected = false;
  try {
    LeadPlanningEngine.planGoal('Cyclic Goal', cyclicSubtasks);
  } catch (err: any) {
    cycleDetected = true;
    assert(err.message.includes('Circular dependency detected'), 'Error must report cycle');
  }
  assert(cycleDetected, 'Cyclic dependencies must be rejected');

  // Verify card writing and TicketParser compatibility
  const backlogDir = path.join(testRoot, 'Backlog');
  const writtenFiles = LeadPlanningEngine.writeSubtasksToBoard(backlogDir, planResult);
  assert(writtenFiles.length === 2, 'Should write 2 ticket files');

  const content = fs.readFileSync(writtenFiles[0], 'utf8');
  const parsedCard = TicketParser.parse(writtenFiles[0], content, testRoot, 'Backlog', null);
  assert(parsedCard !== null, 'TicketParser should parse generated card');
  assert(parsedCard?.id === 'TASK-101', `Expected TASK-101, got ${parsedCard?.id}`);
  assert(parsedCard?.acceptanceCriteria.length === 2, 'Acceptance criteria checklist should be parsed');
  console.log('✓ Lead planning decomposition, cycle detection, and markdown authoring verified.');

  // --- Test 2: Bounded Delegation & Scope Enforcement (ORCH-010) ---
  console.log('\n--- Test 2: Bounded Delegation Package & Scope Boundary Enforcement ---');
  const featureFile = path.join(testRoot, 'Feature.ts');
  fs.writeFileSync(featureFile, 'export const active = true;\n', 'utf8');

  const pkg = ContextPackager.packageForWorker({
    ticketId: 'TASK-102',
    attemptId: 'att-m2-001',
    objective: 'Implement user service',
    allowedScope: ['Feature.ts', 'src/services/**'],
    workspaceRoot: testRoot,
    targetFiles: [featureFile]
  });

  assert(pkg.sourceReferences.length === 1, 'Should record 1 source reference');
  assert(pkg.sourceReferences[0].hash.length === 64, 'Source reference must have SHA-256 hash');
  ContextPackager.persistPackage(testRoot, pkg);
  const reloadedPkg = ContextPackager.loadPackage(testRoot, 'att-m2-001');
  assert(reloadedPkg?.ticketId === 'TASK-102', 'Delegation package must reload from disk');

  // Scope validation: allowed changes
  const allowedDiff = `--- a/Feature.ts\n+++ b/Feature.ts\n@@ -1 +1 @@\n-export const active = true;\n+export const active = false;\n`;
  const allowedFiles = DelegationProtocol.extractFilesFromDiff(allowedDiff);
  const validScope = DelegationProtocol.validateScope(allowedFiles, pkg.allowedScope);
  assert(validScope.valid === true, 'In-scope file edit should pass');

  // Scope validation: disallowed out-of-scope changes
  const disallowedDiff = `--- a/src/config/Database.secret\n+++ b/src/config/Database.secret\n@@ -1 +1 @@\n-secret=1\n+secret=2\n`;
  const disallowedFiles = DelegationProtocol.extractFilesFromDiff(disallowedDiff);
  const invalidScope = DelegationProtocol.validateScope(disallowedFiles, pkg.allowedScope);
  assert(invalidScope.valid === false, 'Out-of-scope edit must be rejected');
  assert(invalidScope.violatedFiles.includes('src/config/Database.secret'), 'Violated file must be identified');
  console.log('✓ Bounded delegation packaging and scope boundary enforcement verified.');

  // --- Test 3: Escalation Triggers & Lead Takeover (ORCH-011) ---
  console.log('\n--- Test 3: Escalation Triggers & Lead Checkpoint Takeover ---');
  const runtime = new OrchestratorRuntime(testRoot);
  await runtime.initialize();

  // Evaluate escalation on scope violation
  const esc = runtime.escalationHandler.evaluateEscalationTriggers({
    ticketId: 'TASK-102',
    attemptId: 'att-m2-001',
    workerId: 'worker-small',
    delegationPackage: pkg,
    diff: disallowedDiff
  });
  assert(esc !== null, 'Escalation should trigger on out-of-scope edit');
  assert(esc?.triggerType === 'OUT_OF_SCOPE', `Expected OUT_OF_SCOPE, got ${esc?.triggerType}`);

  // Simulate Lead Takeover: Worker paused, Lead resumes from checkpoint diff
  const manifest = await runtime.workspaceManager.captureBaseline([featureFile]);
  const alloc = await runtime.workspaceManager.allocate('att-m2-001', manifest);

  const workerLease = runtime.leaseManager.acquireLease('TASK-102');
  const leadAdapter = new FakeDeterministicAdapter();
  leadAdapter.behavior.patchToGenerate = `--- a/Feature.ts\n+++ b/Feature.ts\n@@ -1 +1 @@\n-export const active = true;\n+export const active = false; // resolved by lead\n`;

  const takeoverResult = await runtime.escalationHandler.executeLeadTakeover(
    esc!,
    leadAdapter,
    workerLease.token,
    alloc,
    'Lead Takeover: Resolve scope and produce clean patch.'
  );

  assert(takeoverResult.success === true, 'Lead takeover should succeed');
  assert(takeoverResult.outcome === 'RESOLVED_BY_LEAD', 'Outcome must be RESOLVED_BY_LEAD');
  assert(takeoverResult.resolvedPatch?.includes('resolved by lead') === true, 'Lead patch must be captured');
  console.log('✓ Worker escalation halted safely and Lead takeover completed checkpoint resolution.');

  // --- Test 4: Independent Verification & Fresh Review Gating (ORCH-012) ---
  console.log('\n--- Test 4: Independent Verification & Fresh Review Step ---');
  const reviewEvidence = await runtime.reviewManager.runIndependentVerification(
    alloc,
    'TASK-102',
    'node -e "process.exit(0)"'
  );
  assert(reviewEvidence.passed === true, 'Independent verification must pass');
  assert(reviewEvidence.exitCode === 0, 'Exit code must be 0');

  // Fresh Lead Review checks acceptance criteria and diff
  const reviewDecision = runtime.reviewManager.performFreshReview({
    ticketId: 'TASK-102',
    attemptId: 'att-m2-001',
    patchDiff: takeoverResult.resolvedPatch!,
    acceptanceCriteria: ['Passes integration tests', 'No SQL injection'],
    verificationEvidence: reviewEvidence
  });

  assert(reviewDecision.approved === true, 'Review decision must be approved');
  assert(reviewDecision.criteriaChecked.length === 2, 'All 2 criteria must be checked');

  const gateCheck = runtime.reviewManager.canTransitionToDone('att-m2-001');
  assert(gateCheck.allowed === true, 'Gate check should allow transition to Review/Done');
  console.log('✓ Independent verification evidence captured and Fresh Lead Review gated successfully.');

  // --- Test 5: Full Delegated Attempt Execution with Takeover ---
  console.log('\n--- Test 5: Full End-to-End Delegated Attempt with Routine Escalation ---');
  const delegatedFile = path.join(testRoot, 'Service.ts');
  fs.writeFileSync(delegatedFile, 'export function run() { return 1; }\n', 'utf8');

  // Worker intentionally generates failing patch or out-of-scope file
  const workerAdapter = new FakeDeterministicAdapter();
  workerAdapter.behavior.patchToGenerate = `--- a/Unscoped.ts\n+++ b/Unscoped.ts\n@@ -1 +1 @@\n-old\n+new\n`;

  const takeoverLeadAdapter = new FakeDeterministicAdapter();
  takeoverLeadAdapter.behavior.patchToGenerate = `--- a/Service.ts\n+++ b/Service.ts\n@@ -1 +1 @@\n-export function run() { return 1; }\n+export function run() { return 2; }\n`;

  const delegatedOutput = await runtime.runDelegatedAttempt({
    ticketId: 'TASK-103',
    workerAdapter,
    workerId: 'worker-eco',
    leadAdapter: takeoverLeadAdapter,
    leadId: 'lead-frontier',
    objective: 'Update Service return value to 2',
    allowedScope: ['Service.ts'],
    acceptanceCriteria: ['Return value is 2', 'Code passes test'],
    targetFiles: [delegatedFile],
    verificationCommand: 'node -e "process.exit(0)"'
  });

  assert(delegatedOutput.success === true, 'Delegated attempt should succeed after routine lead takeover');
  assert(delegatedOutput.escalation !== undefined, 'Worker escalation must have occurred');
  assert(delegatedOutput.takeoverResult?.success === true, 'Takeover must have succeeded');
  assert(delegatedOutput.reviewDecision?.approved === true, 'Fresh review must have approved');
  assert(delegatedOutput.attempt.status === 'Review', `Attempt status should be Review, got ${delegatedOutput.attempt.status}`);
  console.log('✓ End-to-end delegated attempt handled routine worker escalation and completed with verified review.');

  // Cleanup
  runtime.dispose();
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n=== ALL M2 TESTS PASSED SUCCESSFULLY! ===\n');
}

runM2Tests().catch(err => {
  console.error('M2 Test Failure:', err);
  process.exit(1);
});
