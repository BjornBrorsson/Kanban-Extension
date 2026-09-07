import * as fs from 'fs';
import * as path from 'path';
import { PlainFolderWorkspaceProvider } from '../src/orchestrator/workspaces/plainFolderWorkspace';
import { TfvcWorkspaceProvider } from '../src/orchestrator/workspaces/tfvcWorkspace';
import { MultiWorktreeAllocator } from '../src/orchestrator/workspaces/worktreeAllocator';
import { SerializedIntegrationPipeline } from '../src/orchestrator/workspaces/integrationPipeline';
import { KnowledgeStore } from '../src/orchestrator/context/knowledgeStore';
import { OutcomeReporter } from '../src/orchestrator/context/outcomeReporter';
import { TicketAttemptManager } from '../src/orchestrator/models/ticketAttempt';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM5Tests() {
  console.log('=== Running Milestone M5 Integration Tests ===');

  const testRoot = path.join(__dirname, '..', 'scratch', 'm5-test-workspace');
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  // --- Test 1: Plain Folder Workspace & Baseline Divergence Guarding (ORCH-021) ---
  console.log('\n--- Test 1: Plain Folder Workspace Provider & Divergence Guarding ---');
  const plainWs = path.join(testRoot, 'plain-ws');
  fs.mkdirSync(plainWs, { recursive: true });

  const plainFile = path.join(plainWs, 'index.txt');
  fs.writeFileSync(plainFile, 'Initial plain content\n', 'utf8');

  const plainProvider = new PlainFolderWorkspaceProvider(plainWs);
  const plainManifest = await plainProvider.captureBaseline([plainFile]);
  const plainAlloc = await plainProvider.allocateSnapshot('att-plain-01', plainManifest);

  assert(fs.existsSync(plainAlloc.workspacePath), 'Snapshot dir should exist');
  const snapFile = path.join(plainAlloc.workspacePath, 'index.txt');
  assert(fs.existsSync(snapFile), 'Target file should be copied into snapshot');

  // Modify file in snapshot
  fs.writeFileSync(snapFile, 'Modified in snapshot\n', 'utf8');

  // Integrate back
  const plainIntegResult = await plainProvider.integrateSnapshot(plainAlloc);
  assert(plainIntegResult.success === true, 'Plain snapshot integration should succeed when target unchanged');
  assert(fs.readFileSync(plainFile, 'utf8') === 'Modified in snapshot\n', 'Changes must be reflected in main workspace');

  // Baseline divergence test: External modification during attempt
  const plainManifest2 = await plainProvider.captureBaseline([plainFile]);
  const plainAlloc2 = await plainProvider.allocateSnapshot('att-plain-02', plainManifest2);
  const snapFile2 = path.join(plainAlloc2.workspacePath, 'index.txt');
  fs.writeFileSync(snapFile2, 'Worker modification\n', 'utf8');

  // External edit to main file
  fs.writeFileSync(plainFile, 'External user WIP edit\n', 'utf8');

  const plainConflictResult = await plainProvider.integrateSnapshot(plainAlloc2);
  assert(plainConflictResult.success === false, 'Integration must abort on baseline divergence');
  assert(plainConflictResult.errorMessage?.includes('Plain folder conflict') === true, 'Conflict message emitted');
  assert(fs.readFileSync(plainFile, 'utf8') === 'External user WIP edit\n', 'User WIP must NOT be overwritten');
  console.log('✓ Plain folder snapshotting, integration, and divergence protection verified.');

  // --- Test 2: TFVC Workspace Provider & Shelvesets (ORCH-021) ---
  console.log('\n--- Test 2: TFVC Workspace Provider, Single-Writer Lock, & Shelvesets ---');
  const tfvcWs = path.join(testRoot, 'tfvc-ws');
  fs.mkdirSync(tfvcWs, { recursive: true });

  const tfvcFile = path.join(tfvcWs, 'Module.cs');
  fs.writeFileSync(tfvcFile, '// Original TFVC file\n', 'utf8');

  const tfvcProvider = new TfvcWorkspaceProvider(tfvcWs);
  assert(tfvcProvider.acquireWriterLock('att-tfvc-01') === true, 'First writer acquires lock');
  assert(tfvcProvider.acquireWriterLock('att-tfvc-02') === false, 'Second writer blocked by single-writer lock');

  const checkoutRes = await tfvcProvider.checkoutScopedFiles([tfvcFile]);
  assert(checkoutRes.success === true && checkoutRes.checkedOut.length === 1, 'Scoped files checked out');

  const tfvcManifest = await tfvcProvider.captureBaseline([tfvcFile]);
  const tfvcAlloc = {
    attemptId: 'att-tfvc-01',
    workspacePath: path.join(tfvcWs, '.agentic-kanban', 'worktrees', 'att-tfvc-01'),
    strategy: 'snapshot' as const,
    manifest: tfvcManifest
  };
  fs.mkdirSync(tfvcAlloc.workspacePath, { recursive: true });
  const tfvcAllocFile = path.join(tfvcAlloc.workspacePath, 'Module.cs');
  fs.writeFileSync(tfvcAllocFile, '// Modified by AI agent\n', 'utf8');

  // Create shelveset
  const shelveset = await tfvcProvider.createShelveset('ORCH-TFVC-101', tfvcAlloc);
  assert(shelveset.files.includes('Module.cs'), 'Shelveset records modified Module.cs');
  assert(fs.existsSync(shelveset.outputPath), 'Shelveset metadata JSON file written');

  // Integrate and release lock
  const tfvcInteg = await tfvcProvider.integrate(tfvcAlloc);
  assert(tfvcInteg.success === true, 'TFVC integration succeeds');
  assert(tfvcProvider.hasWriterLock('att-tfvc-01') === false, 'Writer lock released upon completion');
  console.log('✓ TFVC single-writer lock, scoped checkout, shelveset generation, and integration verified.');

  // --- Test 3: Multi-Worktree Allocator & Parallelism Invariants (ORCH-022) ---
  console.log('\n--- Test 3: Multi-Worktree Allocator & Parallel Worker Isolation ---');
  const multiWs = path.join(testRoot, 'multi-ws');
  fs.mkdirSync(multiWs, { recursive: true });

  const fileA = path.join(multiWs, 'featureA.ts');
  const fileB = path.join(multiWs, 'featureB.ts');
  fs.writeFileSync(fileA, 'const A = 1;\n', 'utf8');
  fs.writeFileSync(fileB, 'const B = 2;\n', 'utf8');

  const allocator = new MultiWorktreeAllocator(multiWs);

  const manifestA = TicketAttemptManager.createManifest('base', [fileA]);
  const manifestB = TicketAttemptManager.createManifest('base', [fileB]);

  // Worker 1 allocations on featureA
  const alloc1 = await allocator.allocateWorktree({
    attemptId: 'worker-1',
    ticketId: 'TICK-PAR-01',
    manifest: manifestA,
    targetFiles: ['featureA.ts']
  });
  assert(fs.existsSync(alloc1.workspacePath), 'Worker 1 worktree created');

  // Worker 2 allocations on featureB (parallel independent task)
  const alloc2 = await allocator.allocateWorktree({
    attemptId: 'worker-2',
    ticketId: 'TICK-PAR-02',
    manifest: manifestB,
    targetFiles: ['featureB.ts']
  });
  assert(fs.existsSync(alloc2.workspacePath), 'Worker 2 worktree created concurrently');
  assert(allocator.getActiveLeases().length === 2, 'Two parallel worker leases active');

  // Worker 3 attempts to touch featureA (collision)
  const collisionCheck = allocator.canAllocate({ attemptId: 'worker-3', targetFiles: ['featureA.ts'] });
  assert(collisionCheck.allowed === false, 'Overlapping target file must be blocked by exclusive file lock');
  assert(collisionCheck.reason?.includes('Scope collision') === true, 'Reason mentions scope collision');

  // Concurrent Read-Only Lead Planning session on featureA
  const leadCheck = allocator.canAllocate({ attemptId: 'lead-planner', targetFiles: ['featureA.ts'], isReadOnly: true });
  assert(leadCheck.allowed === true, 'Read-only Lead planning allowed alongside active worker');

  const leadAlloc = await allocator.allocateWorktree({
    attemptId: 'lead-planner',
    ticketId: 'TICK-LEAD-PLAN',
    manifest: manifestA,
    targetFiles: ['featureA.ts'],
    isReadOnly: true
  });
  assert(leadAlloc.strategy === 'snapshot', 'Read-only lead allocated isolated snapshot');

  // Cleanup
  allocator.cleanupWorktree('worker-1');
  allocator.cleanupWorktree('worker-2');
  allocator.cleanupWorktree('lead-planner');
  assert(allocator.getActiveLeases().length === 0, 'All worktrees cleaned up');
  console.log('✓ Multi-worktree parallel allocation, scope collision prevention, and read-only Lead planning verified.');

  // --- Test 4: Serialized Integration Pipeline with Regression Replay (ORCH-023) ---
  console.log('\n--- Test 4: Serialized Integration Pipeline & Regression Check Replay ---');
  const integWs = path.join(testRoot, 'integ-ws');
  fs.mkdirSync(integWs, { recursive: true });

  const codeFile = path.join(integWs, 'calc.js');
  fs.writeFileSync(codeFile, 'function add(a, b) { return a + b; }\nmodule.exports = { add };\n', 'utf8');

  const pipeline = new SerializedIntegrationPipeline(integWs);
  const integManifest = TicketAttemptManager.createManifest('base', [codeFile]);

  // Case 1: Clean integration with passing verification test
  const integAlloc1: any = {
    attemptId: 'att-integ-pass',
    workspacePath: path.join(integWs, 'scratch-alloc1'),
    manifest: integManifest
  };
  fs.mkdirSync(integAlloc1.workspacePath, { recursive: true });
  fs.writeFileSync(path.join(integAlloc1.workspacePath, 'calc.js'), 'function add(a, b) { return a + b; }\nfunction sub(a, b) { return a - b; }\nmodule.exports = { add, sub };\n', 'utf8');

  const passResult = await pipeline.enqueueIntegration({
    ticketId: 'TICK-INT-01',
    attemptId: 'att-integ-pass',
    allocation: integAlloc1,
    verificationCommands: ['node -e "const { add, sub } = require(\'./calc.js\'); if (add(1, 2) !== 3 || sub(5, 2) !== 3) process.exit(1);"']
  });

  assert(passResult.status === 'success', 'Clean integration with passing verification must succeed');
  assert(passResult.replayedVerificationPassed === true, 'Replay test passed');

  // Case 2: Regression Check Replay Failure -> Rollback
  const currentContent = fs.readFileSync(codeFile, 'utf8');
  const integManifest2 = TicketAttemptManager.createManifest('base', [codeFile]);
  const integAlloc2: any = {
    attemptId: 'att-integ-fail',
    workspacePath: path.join(integWs, 'scratch-alloc2'),
    manifest: integManifest2
  };
  fs.mkdirSync(integAlloc2.workspacePath, { recursive: true });
  // Introduces broken code
  fs.writeFileSync(path.join(integAlloc2.workspacePath, 'calc.js'), 'function add(a, b) { return a * b; }\nmodule.exports = { add };\n', 'utf8');

  const failResult = await pipeline.enqueueIntegration({
    ticketId: 'TICK-INT-02',
    attemptId: 'att-integ-fail',
    allocation: integAlloc2,
    verificationCommands: ['node -e "const { add } = require(\'./calc.js\'); if (add(1, 2) !== 3) process.exit(1);"']
  });

  assert(failResult.status === 'regression_failure', 'Regression failure detected on combined state');
  assert(failResult.replayedVerificationPassed === false, 'Replay test failed');
  // Invariant: Workspace must be rolled back to pristine pre-integration content!
  assert(fs.readFileSync(codeFile, 'utf8') === currentContent, 'Workspace rolled back cleanly after regression failure');
  console.log('✓ Serialized integration, divergence check, and automatic regression rollback verified.');

  // --- Test 5: Knowledge Store & Cache Invalidation (ORCH-024) ---
  console.log('\n--- Test 5: Explicit Knowledge Store, Revision Invalidation, & Outcome Reporting ---');
  const kStore = new KnowledgeStore(testRoot);

  const srcFile = path.join(testRoot, 'arch_source.ts');
  fs.writeFileSync(srcFile, '// Architecture definitions v1\n', 'utf8');

  // Save note with source file ref
  kStore.saveNote('board-alpha', 'architecture-decisions.md', '# Architecture Decisions\nUse modular pipelines.', [srcFile]);
  assert(kStore.isCacheValid('board-alpha', 'architecture-decisions.md') === true, 'Cache valid initially');
  assert(kStore.getNote('board-alpha', 'architecture-decisions.md')?.includes('modular pipelines') === true, 'Note content retrieved');

  // Multi-board isolation: board-beta cannot see board-alpha notes
  assert(kStore.getNote('board-beta', 'architecture-decisions.md') === null, 'Board isolation: note not visible to board-beta');

  // Modify underlying source file -> Cache must automatically invalidate!
  fs.writeFileSync(srcFile, '// Architecture definitions v2 (modified!)\n', 'utf8');
  assert(kStore.isCacheValid('board-alpha', 'architecture-decisions.md') === false, 'Cache invalidated automatically upon source modification');
  assert(kStore.getNote('board-alpha', 'architecture-decisions.md') === null, 'Invalidated note returns null to trigger refresh');

  // Completed ticket outcomes
  kStore.appendTicketOutcome('board-alpha', {
    ticketId: 'ORCH-021',
    attemptId: 'att-021',
    timestamp: Date.now(),
    summary: 'Implemented TFVC & plain folder workspace providers',
    filesModified: ['src/orchestrator/workspaces/tfvcWorkspace.ts'],
    testPassed: true,
    costReported: 0.5
  });

  const outcomes = kStore.getTicketOutcomes('board-alpha');
  assert(outcomes.length === 1, 'One ticket outcome recorded');
  assert(outcomes[0].ticketId === 'ORCH-021', 'Ticket ID matches');

  // Outcome Reporter
  const report = OutcomeReporter.generateReport({
    boardId: 'board-alpha',
    runId: 'run-overnight-001',
    startTime: Date.now() - 30000,
    endTime: Date.now(),
    tickets: [
      {
        ticketId: 'ORCH-021',
        title: 'TFVC & Plain Folder Workspaces',
        status: 'Completed',
        filesModified: ['src/orchestrator/workspaces/tfvcWorkspace.ts', 'plainFolderWorkspace.ts'],
        testPassed: true,
        replayPassed: true
      },
      {
        ticketId: 'ORCH-022',
        title: 'Multi-Worktree Parallelism',
        status: 'Completed',
        filesModified: ['src/orchestrator/workspaces/worktreeAllocator.ts'],
        testPassed: true,
        replayPassed: true
      }
    ],
    cashSpent: 1.25,
    cashCurrency: 'EUR',
    subscriptionUnitsSpent: 15,
    blockers: []
  });

  assert(report.includes('# Run Outcome Report — board-alpha'), 'Report title present');
  assert(report.includes('Cash Spent') && report.includes('EUR 1.25'), 'Cash spent recorded');
  assert(report.includes('Subscription Allowance Spent') && report.includes('15 units'), 'Subscription units recorded separately');
  assert(report.includes('Zero outstanding blockers'), 'Zero blockers noted');
  console.log('✓ Knowledge store revision invalidation, board isolation, and outcome reporting verified.');

  console.log('\n=== All Milestone M5 Tests Passed Successfully ===');
}

runM5Tests().catch(err => {
  console.error('Milestone M5 Test Failed:', err);
  process.exit(1);
});
