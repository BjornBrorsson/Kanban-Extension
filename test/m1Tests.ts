import * as fs from 'fs';
import * as path from 'path';
import { OrchestratorRuntime } from '../src/orchestrator/core/orchestratorRuntime';
import { FakeDeterministicAdapter } from './fixtures/fakeAdapter';
import { TicketAttemptManager } from '../src/orchestrator/models/ticketAttempt';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM1Tests() {
  console.log('=== Running Milestone M1 Integration Tests ===');

  const testRoot = path.join(__dirname, '..', 'scratch', 'm1-test-workspace');
  fs.mkdirSync(testRoot, { recursive: true });

  // Setup sample file for editing
  const sampleFile = path.join(testRoot, 'Feature.ts');
  fs.writeFileSync(sampleFile, 'export const version = "0.1.0";\n', 'utf8');

  // --- Test 1: Full One Supervised Ticket Loop (ORCH-005, ORCH-006, ORCH-007, ORCH-008) ---
  console.log('\n--- Test 1: Full Supervised Ticket Execution Loop ---');
  const runtime = new OrchestratorRuntime(testRoot);
  await runtime.initialize();

  const fakeAdapter = new FakeDeterministicAdapter();
  fakeAdapter.behavior.patchToGenerate = `--- a/Feature.ts\n+++ b/Feature.ts\n@@ -1 +1 @@\n-export const version = "0.1.0";\n+export const version = "0.2.0";\n`;

  let eventCount = 0;
  const output = await runtime.runAttempt(
    fakeAdapter,
    {
      ticketId: 'ORCH-TEST-01',
      agentId: 'fake-deterministic',
      objective: 'Bump version to 0.2.0',
      targetFiles: [sampleFile],
      verificationCommand: 'node -e "process.exit(0)"' // verification command
    },
    event => {
      eventCount++;
    }
  );

  assert(output.success === true, 'Attempt should succeed');
  assert(output.attempt.status === 'Review', `Expected status Review, got ${output.attempt.status}`);
  assert(output.diff !== undefined && output.diff.includes('0.2.0'), 'Diff should contain modified version');
  assert(output.verificationPassed === true, 'Verification should pass');
  assert(eventCount > 0, 'Execution events should be streamed');
  console.log('✓ One supervised ticket run produced verified patch in Review state.');

  // Test guarded integration
  const manifest = output.attempt.manifest;
  const allocation = {
    attemptId: output.attempt.attemptId,
    workspacePath: path.join(testRoot, '.agentic-kanban', 'worktrees', output.attempt.attemptId),
    strategy: 'snapshot' as const,
    manifest
  };
  // Simulate allocated file change
  const allocatedFile = path.join(allocation.workspacePath, 'Feature.ts');
  fs.writeFileSync(allocatedFile, 'export const version = "0.2.0";\n', 'utf8');

  const integResult = await runtime.workspaceManager.integrate(allocation);
  assert(integResult.success === true, 'Integration should succeed');
  const integratedContent = fs.readFileSync(sampleFile, 'utf8');
  assert(integratedContent.includes('0.2.0'), 'Target file should be updated to 0.2.0');
  console.log('✓ Guarded patch integration applied cleanly to target.');

  // --- Test 2: Crash Detection and Recovery (ORCH-005) ---
  console.log('\n--- Test 2: Crash Survival & Recovery Without Duplicate Execution ---');
  // Simulate an interrupted running attempt
  const crashAttempt = TicketAttemptManager.createAttempt(
    'ORCH-CRASH-01',
    1,
    'fake-deterministic',
    'managed',
    manifest,
    { currency: 'EUR', unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  crashAttempt.status = 'Running';
  TicketAttemptManager.saveAttempt(testRoot, crashAttempt);

  // Reinitialize a new runtime (simulating restart after crash)
  const recoveryRuntime = new OrchestratorRuntime(testRoot);
  const recoveryResult = await recoveryRuntime.initialize();

  assert(recoveryResult.recoveredCount >= 1, 'Should detect at least 1 interrupted attempt');
  const reloaded = TicketAttemptManager.loadAttempt(testRoot, crashAttempt.attemptId);
  assert(reloaded?.status === 'Interrupted', `Crashed attempt should be transitioned to Interrupted, got ${reloaded?.status}`);
  assert(reloaded?.failureReason?.includes('Interrupted') === true, 'Failure reason should document restart');
  console.log('✓ Crash recovery marked in-flight attempt Interrupted without duplicate execution.');

  // --- Test 3: Lease Expiry & Monotonic Generation Protection (ORCH-005) ---
  console.log('\n--- Test 3: Lease Expiry and Stale Generation Protection ---');
  const leaseManager = recoveryRuntime.leaseManager;
  const expiredLease = leaseManager.acquireLease('ORCH-LEASE-01', 10); // 10ms expiry
  await new Promise(r => setTimeout(r, 25)); // wait for expiry

  const validation = leaseManager.validateLease(expiredLease.token, 'ORCH-LEASE-01');
  assert(validation.valid === false, 'Expired lease should be rejected');
  assert(validation.reason?.includes('expired') === true, 'Reason should mention expiration');

  // Stale generation rejection:
  const staleLease = leaseManager.acquireLease('ORCH-STALE-01', 60000);
  const newerLease = leaseManager.acquireLease('ORCH-STALE-01', 60000); // gen 2
  const staleValidation = leaseManager.validateLease(staleLease.token, 'ORCH-STALE-01');
  assert(staleValidation.valid === false, 'Stale generation lease should be rejected');
  assert(staleValidation.reason?.includes('Stale generation') === true, 'Reason should mention stale generation');
  console.log('✓ Stale workers and expired leases reliably rejected.');

  // --- Test 4: Guarded Patch Conflict Detection (ORCH-007) ---
  console.log('\n--- Test 4: Guarded Patch Conflict on Baseline Divergence ---');
  const conflictFile = path.join(testRoot, 'Conflict.ts');
  fs.writeFileSync(conflictFile, 'const x = 1;\n', 'utf8');

  const conflictManifest = await recoveryRuntime.workspaceManager.captureBaseline([conflictFile]);
  const conflictAlloc = await recoveryRuntime.workspaceManager.allocate('attempt-conflict-1', conflictManifest);

  // Worker modifies file in worktree
  const workerFile = path.join(conflictAlloc.workspacePath, 'Conflict.ts');
  fs.writeFileSync(workerFile, 'const x = 2;\n', 'utf8');

  // External user modifies original file in main workspace (baseline divergence!)
  fs.writeFileSync(conflictFile, 'const x = 999; // User edit during run!\n', 'utf8');

  // Integrate should detect divergence and abort safely
  const conflictResult = await recoveryRuntime.workspaceManager.integrate(conflictAlloc);
  assert(conflictResult.success === false, 'Integration should fail on divergence');
  assert(conflictResult.conflictFiles?.includes('Conflict.ts') === true, 'Conflict should list Conflict.ts');

  // Assert user's change was NOT overwritten
  const preservedUserContent = fs.readFileSync(conflictFile, 'utf8');
  assert(preservedUserContent.includes('999'), 'User edit must be preserved without overwrite');
  console.log('✓ Guarded patch prevented overwriting user WIP on baseline divergence.');

  // Clean up
  recoveryRuntime.dispose();
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n=== ALL M1 TESTS PASSED SUCCESSFULLY! ===\n');
}

runM1Tests().catch(err => {
  console.error('M1 Test Failure:', err);
  process.exit(1);
});
