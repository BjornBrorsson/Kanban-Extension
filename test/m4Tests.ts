import * as fs from 'fs';
import * as path from 'path';
import { DependencyScheduler } from '../src/orchestrator/scheduler/dependencyScheduler';
import { ConcurrencyQueue } from '../src/orchestrator/scheduler/concurrencyQueue';
import { AutonomousProfileManager } from '../src/orchestrator/scheduler/autonomousProfile';
import { ClineManagedAdapter } from '../src/orchestrator/adapters/clineAdapter';
import { CopilotCliAdapter } from '../src/orchestrator/adapters/copilotCliAdapter';
import { DevinCliAdapter } from '../src/orchestrator/adapters/devinCliAdapter';
import { AntigravityManagedAdapter } from '../src/orchestrator/adapters/antigravityAdapter';
import { OrchestratorDaemon } from '../src/orchestrator/daemon/orchestratorDaemon';
import { DaemonClient } from '../src/orchestrator/daemon/daemonClient';
import { runCli } from '../src/orchestrator/cli/orchestratorCli';
import { FakeDeterministicAdapter } from './fixtures/fakeAdapter';
import { Ticket } from '../src/types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM4Tests() {
  console.log('=== Running Milestone M4 Integration Tests ===');

  const testRoot = path.join(__dirname, '..', 'scratch', 'm4-test-workspace');
  fs.mkdirSync(testRoot, { recursive: true });

  // --- Test 1: Dependency Scheduler & Topological DAG Ordering (ORCH-017) ---
  console.log('\n--- Test 1: Dependency Scheduler & DAG Ordering ---');
  const ticketA: Ticket = {
    id: 'TICK-A',
    title: 'Core Architecture',
    status: 'Ready',
    column: 'Ready',
    priority: 'P1',
    dependsOn: [],
    filePath: '/tmp/a.md'
  };
  const ticketB: Ticket = {
    id: 'TICK-B',
    title: 'Database Layer',
    status: 'Ready',
    column: 'Ready',
    priority: 'P1',
    dependsOn: ['TICK-A'],
    filePath: '/tmp/b.md'
  };
  const ticketC: Ticket = {
    id: 'TICK-C',
    title: 'API Endpoints',
    status: 'Ready',
    column: 'Ready',
    priority: 'P2',
    dependsOn: ['TICK-B'],
    filePath: '/tmp/c.md'
  };

  const ticketsMap = new Map<string, Ticket[]>();
  ticketsMap.set('board-alpha', [ticketA, ticketB, ticketC]);

  // Initially only TICK-A has all dependencies met
  const readyInitially = DependencyScheduler.getReadyTasks(ticketsMap, new Set());
  assert(readyInitially.length === 1, 'Only TICK-A should be ready initially');
  assert(readyInitially[0].ticket.id === 'TICK-A', 'Ready task must be TICK-A');

  // Once TICK-A completed, TICK-B becomes ready
  const readyAfterA = DependencyScheduler.getReadyTasks(ticketsMap, new Set(['TICK-A']));
  assert(readyAfterA.length === 1, 'Only TICK-B should be ready after TICK-A');
  assert(readyAfterA[0].ticket.id === 'TICK-B', 'Ready task must be TICK-B');

  // Topological sorting verification
  const order = DependencyScheduler.computeTopologicalOrder([ticketC, ticketA, ticketB]);
  assert(order[0] === 'TICK-A' && order[1] === 'TICK-B' && order[2] === 'TICK-C', 'Topological sort must order A -> B -> C');

  // Cycle detection
  const cyclicA: Ticket = { id: 'CYC-A', title: 'A', status: 'Ready', column: 'Ready', priority: 'P1', dependsOn: ['CYC-B'], filePath: '' };
  const cyclicB: Ticket = { id: 'CYC-B', title: 'B', status: 'Ready', column: 'Ready', priority: 'P1', dependsOn: ['CYC-A'], filePath: '' };
  let cycleThrew = false;
  try {
    DependencyScheduler.computeTopologicalOrder([cyclicA, cyclicB]);
  } catch (e: any) {
    cycleThrew = true;
    assert(e.message.includes('Cyclic dependency'), 'Cycle detection must report cyclic dependency');
  }
  assert(cycleThrew, 'Cycle detection must throw for circular dependencies');
  console.log('✓ Multi-board dependency resolution and DAG ordering verified.');

  // --- Test 2: Fair-Share Concurrency Queue (ORCH-017) ---
  console.log('\n--- Test 2: Fair-Share Concurrency Queue & Pause/Resume ---');
  const queue = new ConcurrencyQueue({ maxGlobalWorkers: 2, maxWorkersPerBoard: 1 });

  assert(queue.canDispatch('board-1') === true, 'Board 1 should be dispatchable');
  assert(queue.acquireSlot('board-1') === true, 'Acquiring slot for Board 1 should succeed');
  assert(queue.canDispatch('board-1') === false, 'Board 1 should NOT be dispatchable (exceeds max 1 per board)');
  assert(queue.canDispatch('board-2') === true, 'Board 2 should be dispatchable (global active: 1 < 2)');

  assert(queue.acquireSlot('board-2') === true, 'Acquiring slot for Board 2 should succeed');
  assert(queue.canDispatch('board-3') === false, 'Global limit reached (2/2 active)');

  // Release board 1 slot
  queue.releaseSlot('board-1');
  assert(queue.canDispatch('board-1') === true, 'Board 1 can dispatch again after release');

  // Pause queue
  queue.pause();
  assert(queue.canDispatch('board-1') === false, 'Paused queue blocks all dispatch');
  assert(queue.selectNextTask(readyInitially) === null, 'selectNextTask returns null when paused');

  // Resume queue
  queue.resume();
  assert(queue.canDispatch('board-1') === true, 'Resumed queue permits dispatch');
  queue.releaseSlot('board-2'); // reset
  console.log('✓ Fair-share concurrency limits and pause/resume controls verified.');

  // --- Test 3: Additional Runner Adapters (ORCH-019) ---
  console.log('\n--- Test 3: Validated Runner Adapters (Cline, Copilot CLI, Devin CLI) ---');
  const clineAdapter = new ClineManagedAdapter('cline');
  assert(clineAdapter.name === 'cline', 'Cline adapter name correct');
  assert(clineAdapter.tier === 'managed', 'Cline adapter tier is managed');

  const copilotAdapter = new CopilotCliAdapter('gh');
  assert(copilotAdapter.name === 'github-copilot-cli', 'Copilot CLI adapter name correct');

  const devinAdapter = new DevinCliAdapter('devin');
  assert(devinAdapter.name === 'devin-cli', 'Devin CLI adapter name correct');

  const antigravityAdapter = new AntigravityManagedAdapter('agy');
  assert(antigravityAdapter.name === 'Antigravity CLI', 'Antigravity adapter name correct');
  assert(antigravityAdapter.tier === 'managed', 'Antigravity adapter tier is managed');
  console.log('✓ Additional runner adapters instantiated and configured.');

  // --- Test 4: Bounded Autonomous Execution Profile & Safeguards (ORCH-020) ---
  console.log('\n--- Test 4: Bounded Autonomous Execution Profile & Safeguards ---');
  const profileMgr = new AutonomousProfileManager({
    profile: 'bounded-autonomous',
    maxBatchCeilingCurrency: 5.0,
    batchCurrency: 'EUR',
    circuitBreakerThreshold: 3,
    maxCompletedTickets: 2
  });

  // Pre-dispatch budget bounding: €1.00 allowed
  const check1 = profileMgr.canDispatchNext(1.0);
  assert(check1.allowed === true, 'Dispatch under budget ceiling allowed');

  // Over budget ceiling: €6.00 requested with €5.00 cap
  const checkOver = profileMgr.canDispatchNext(6.0);
  assert(checkOver.allowed === false, 'Dispatch exceeding batch budget ceiling blocked');
  assert(checkOver.reason?.includes('Batch ceiling reached') === true, 'Reason mentions batch ceiling');

  // Invariant: Routine worker-to-lead escalations DO NOT increment failure count or trip breaker
  profileMgr.recordTaskOutcome({
    ticketId: 'TICK-ESC-01',
    attemptId: 'att-01',
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: true
  });
  assert(profileMgr.getStatus().consecutiveFailures === 0, 'Routine escalation must NOT increment terminal failure count');

  // Terminal failures: 3 consecutive terminal failures trip circuit breaker
  profileMgr.recordTaskOutcome({
    ticketId: 'TICK-FAIL-01',
    attemptId: 'att-f1',
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: false,
    terminalFailureReason: 'Compilation failed unrecoverably'
  });
  profileMgr.recordTaskOutcome({
    ticketId: 'TICK-FAIL-02',
    attemptId: 'att-f2',
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: false,
    terminalFailureReason: 'Git conflict on main'
  });
  assert(profileMgr.canDispatchNext(1.0).allowed === true, 'Still allowed at 2 failures');

  profileMgr.recordTaskOutcome({
    ticketId: 'TICK-FAIL-03',
    attemptId: 'att-f3',
    success: false,
    actualSpent: 0.5,
    wasRoutineEscalation: false,
    terminalFailureReason: 'Uncaught segfault'
  });

  const breakerCheck = profileMgr.canDispatchNext(1.0);
  assert(breakerCheck.allowed === false, 'Circuit breaker must trip after 3 terminal failures');
  assert(breakerCheck.reason?.includes('Circuit breaker tripped') === true, 'Reason states circuit breaker tripped');
  assert(profileMgr.getInterventionQueue().length === 3, 'Intervention queue must record 3 blocked items');
  console.log('✓ Autonomous profile safeguards: budget ceiling, circuit breaker, and intervention queue verified.');

  // --- Test 5: Headless Runtime Daemon & Standalone CLI (ORCH-018) ---
  console.log('\n--- Test 5: Headless Runtime Daemon & Standalone CLI ---');
  const daemonRoot = path.join(testRoot, 'daemon-ws');
  fs.mkdirSync(daemonRoot, { recursive: true });

  const fakeAdapter = new FakeDeterministicAdapter('fake-daemon-worker', 'worker');
  const daemon = new OrchestratorDaemon({
    workspaceRoot: daemonRoot,
    defaultAdapter: fakeAdapter
  });

  const daemonInfo = await daemon.start(0);
  assert(daemonInfo.port > 0, 'Daemon must listen on an ephemeral port');
  assert(fs.existsSync(daemon.getDaemonInfoPath()), 'daemon.json must be written to runtime dir');

  const client = new DaemonClient(daemonRoot);
  const isRunning = await client.isDaemonRunning();
  assert(isRunning === true, 'DaemonClient must verify daemon is running');

  // Status check over IPC
  const status = await client.getStatus();
  assert(status.running === true, 'Status reports daemon running');
  assert(status.scheduler.paused === false, 'Queue initially unpaused');

  // Pause / Resume over IPC
  await client.pause();
  const pausedStatus = await client.getStatus();
  assert(pausedStatus.scheduler.paused === true, 'Queue pause propagated over IPC');

  await client.resume();
  const resumedStatus = await client.getStatus();
  assert(resumedStatus.scheduler.paused === false, 'Queue resume propagated over IPC');

  // Standalone CLI testing
  const cliStatus = await runCli(['status'], daemonRoot);
  assert(cliStatus.exitCode === 0, 'CLI status command succeeds');
  assert(cliStatus.output.includes('Daemon PID:'), 'CLI output contains daemon PID');

  const cliJson = await runCli(['status', '--json'], daemonRoot);
  assert(cliJson.exitCode === 0, 'CLI JSON status succeeds');
  const parsedJson = JSON.parse(cliJson.output);
  assert(parsedJson.running === true, 'CLI JSON status reports running: true');

  const cliPause = await runCli(['pause'], daemonRoot);
  assert(cliPause.exitCode === 0, 'CLI pause command succeeds');

  const cliResume = await runCli(['resume'], daemonRoot);
  assert(cliResume.exitCode === 0, 'CLI resume command succeeds');

  // Graceful shutdown
  await daemon.shutdown();
  assert(!fs.existsSync(daemon.getDaemonInfoPath()), 'daemon.json must be removed after graceful shutdown');
  const runningAfterShutdown = await client.isDaemonRunning();
  assert(runningAfterShutdown === false, 'DaemonClient reports stopped after shutdown');
  console.log('✓ Headless runtime daemon, IPC client, and standalone CLI verified.');

  console.log('\n=== All Milestone M4 Tests Passed Successfully ===');
}

runM4Tests().catch(err => {
  console.error('Milestone M4 Test Failed:', err);
  process.exit(1);
});
