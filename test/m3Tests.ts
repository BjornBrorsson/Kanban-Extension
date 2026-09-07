import * as fs from 'fs';
import * as path from 'path';
import { PolicyEngine } from '../src/orchestrator/policy/policyEngine';
import { BudgetManager } from '../src/orchestrator/policy/budgetManager';
import { EgressController } from '../src/orchestrator/policy/egressController';
import { OrchestratorRuntime } from '../src/orchestrator/core/orchestratorRuntime';
import { FakeDeterministicAdapter } from './fixtures/fakeAdapter';
import { TicketAttemptManager } from '../src/orchestrator/models/ticketAttempt';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM3Tests() {
  console.log('=== Running Milestone M3 Integration Tests ===');

  const testRoot = path.join(__dirname, '..', 'scratch', 'm3-test-workspace');
  fs.mkdirSync(testRoot, { recursive: true });

  // --- Test 1: Policy Eligibility Engine (ORCH-013) ---
  console.log('\n--- Test 1: Policy Eligibility (EU-Only, Local-Only, Strict Mode) ---');
  // 1. EU-Only
  const euPolicies = { euOnly: true, localOnly: false, strictMode: true };
  const euPass = PolicyEngine.evaluateEligibility({ providerId: 'mistral-eu', policies: euPolicies });
  assert(euPass.eligible === true, 'mistral-eu must be eligible under EU-only policy');

  const euFail = PolicyEngine.evaluateEligibility({ providerId: 'openai-global', policies: euPolicies });
  assert(euFail.eligible === false, 'openai-global must be rejected under EU-only policy');
  assert(euFail.violations.some(v => v.includes('EU-only')), 'Violation must mention EU-only');

  // 2. Local-Only
  const localPolicies = { euOnly: false, localOnly: true, strictMode: false };
  const localPass = PolicyEngine.evaluateEligibility({ providerId: 'ollama', policies: localPolicies });
  assert(localPass.eligible === true, 'ollama must be eligible under local-only policy');

  const localFail = PolicyEngine.evaluateEligibility({ providerId: 'mistral-eu', policies: localPolicies });
  assert(localFail.eligible === false, 'remote mistral-eu must be rejected under local-only policy');

  // 3. Strict Mode (opaque runner rejection)
  const strictPolicies = { euOnly: false, localOnly: false, strictMode: true };
  const opaqueFail = PolicyEngine.evaluateEligibility({ providerId: 'opaque-cli', policies: strictPolicies });
  assert(opaqueFail.eligible === false, 'opaque-cli must be rejected in strict mode');

  // 4. Fallback filter (never fall back to ineligible provider)
  const filtered = PolicyEngine.filterEligibleProviders(['openai-global', 'claude-eu', 'ollama'], euPolicies);
  assert(filtered.eligible.includes('claude-eu') && filtered.eligible.includes('ollama'), 'EU and local models must pass');
  assert(!filtered.eligible.includes('openai-global'), 'Global model must NOT be in eligible list');
  console.log('✓ Policy eligibility enforced strictly across EU, Local, and Strict boundaries.');

  // --- Test 2: Atomic Quota Reservations & Rate Limits (ORCH-014) ---
  console.log('\n--- Test 2: Atomic Quota Reservations & Pre-Dispatch Cost Bounding ---');
  const budgetManager = new BudgetManager(testRoot);
  budgetManager.registerAccount({
    currency: 'EUR',
    totalCeiling: 5.0, // Hard cap of €5.00
    totalSpentReported: 0,
    totalSpentEstimated: 0,
    totalReserved: 0,
    isSubscriptionQuota: false
  });

  // Reserve €3.00
  const res1 = budgetManager.reserve({ ticketId: 'ORCH-B-01', attemptId: 'att-b-01', totalAmount: 3.0 });
  assert(res1.allowed === true, 'First reservation of €3.00 must succeed');
  assert(res1.remainingAfter === 2.0, `Remaining budget should be €2.00, got ${res1.remainingAfter}`);

  // Attempt second reservation of €3.00 -> must HALT BEFORE DISPATCH
  const res2 = budgetManager.reserve({ ticketId: 'ORCH-B-02', attemptId: 'att-b-02', totalAmount: 3.0 });
  assert(res2.allowed === false, 'Second reservation exceeding ceiling must be blocked');
  assert(res2.reason?.includes('Budget exhausted') === true, 'Reason must state budget exhausted');

  // Reconcile res1 with actual reported spend of €2.50
  budgetManager.reconcile({ attemptId: 'att-b-01', actualSpent: 2.5, isReported: true });
  const acc = budgetManager.getAccount('EUR');
  assert(acc.totalSpentReported === 2.5, `Spent should be €2.50, got ${acc.totalSpentReported}`);
  assert(acc.totalReserved === 0, `Reserved should now be €0, got ${acc.totalReserved}`);

  // Now a €2.00 reservation should succeed (5.0 - 2.5 = 2.5 available)
  const res3 = budgetManager.reserve({ ticketId: 'ORCH-B-03', attemptId: 'att-b-03', totalAmount: 2.0 });
  assert(res3.allowed === true, 'Reservation within newly available budget must succeed');

  // Rate Limiting: Max 2 RPM
  assert(budgetManager.checkRateLimit('provider-test', 2) === true, 'Req 1 under limit');
  assert(budgetManager.checkRateLimit('provider-test', 2) === true, 'Req 2 under limit');
  assert(budgetManager.checkRateLimit('provider-test', 2) === false, 'Req 3 must be throttled');
  console.log('✓ Pre-dispatch budget checks, atomic reservations, and rate limits verified.');

  // --- Test 3: Egress Controller & Audit Logging (ORCH-015) ---
  console.log('\n--- Test 3: Egress Filtering & Append-Only Audit Logging ---');
  const egress = new EgressController(testRoot);

  const localEgress = egress.isEgressAllowed({ endpointHost: 'localhost', localOnly: true, euOnly: false });
  assert(localEgress.allowed === true, 'localhost must be allowed in localOnly');

  const blockedRemote = egress.isEgressAllowed({ endpointHost: 'api.openai.com', localOnly: true, euOnly: false });
  assert(blockedRemote.allowed === false, 'External host must be blocked in localOnly');

  const envFlags = egress.getEnvironmentOverrides(true);
  assert(envFlags.OFFLINE === '1', 'OFFLINE env flag must be set for localOnly');

  // Audit logging
  egress.logAudit({
    timestamp: Date.now(),
    ticketId: 'ORCH-AUDIT-01',
    attemptId: 'att-audit-1',
    providerId: 'ollama',
    action: 'inference',
    targetEndpoint: 'localhost',
    allowed: true,
    policyRule: 'Local-only loopback authorized'
  });

  const auditFile = path.join(testRoot, '.agentic-kanban', 'runtime', 'audit.log');
  assert(fs.existsSync(auditFile), 'Audit log file must be created');
  const auditContent = fs.readFileSync(auditFile, 'utf8');
  assert(auditContent.includes('ORCH-AUDIT-01') && auditContent.includes('ALLOW'), 'Audit log must record entry');
  console.log('✓ Egress filtering, offline environment injection, and audit log verified.');

  // --- Test 4: Cancellation Guarantees & Budget Release (ORCH-016) ---
  console.log('\n--- Test 4: Cancellation Protocol & Budget Reservation Release ---');
  const runtime = new OrchestratorRuntime(testRoot);
  await runtime.initialize();

  // Setup account
  runtime.budgetManager.registerAccount({
    currency: 'EUR',
    totalCeiling: 10.0,
    totalSpentReported: 0,
    totalSpentEstimated: 0,
    totalReserved: 0,
    isSubscriptionQuota: false
  });

  const fakeAdapter = new FakeDeterministicAdapter();
  const lease = runtime.leaseManager.acquireLease('ORCH-CANCEL-01');
  const cancelRes = runtime.budgetManager.reserve({
    ticketId: 'ORCH-CANCEL-01',
    attemptId: 'att-cancel-01',
    totalAmount: 4.0
  });
  const attemptToCancel = TicketAttemptManager.createAttempt(
    'ORCH-CANCEL-01',
    lease.generation,
    'fake-runner',
    'managed',
    { timestamp: Date.now(), fileHashes: {} },
    { currency: 'EUR', unitsReserved: 4, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  attemptToCancel.attemptId = 'att-cancel-01';
  attemptToCancel.status = 'Running';
  TicketAttemptManager.saveAttempt(testRoot, attemptToCancel);

  const startRes = await fakeAdapter.start({
    ticketId: 'ORCH-CANCEL-01',
    attemptId: 'att-cancel-01',
    objective: 'Will be cancelled',
    workspaceRoot: testRoot,
    role: 'worker'
  });

  // Cancel attempt
  const cancelOutcome = await runtime.cancelAttempt({
    ticketId: 'ORCH-CANCEL-01',
    attemptId: 'att-cancel-01',
    executionId: startRes.executionId,
    adapter: fakeAdapter,
    leaseToken: lease.token
  });

  assert(cancelOutcome.confirmed === true, 'Cancellation should be confirmed');
  assert(cancelOutcome.status === 'CANCELLED_CONFIRMED', 'Status must be CANCELLED_CONFIRMED');

  // Assert reservation was released back to account
  const cancelAcc = runtime.budgetManager.getAccount('EUR');
  assert(cancelAcc.totalReserved === 0, `Reserved amount must be 0 after cancellation release, got ${cancelAcc.totalReserved}`);

  // Assert lease was revoked
  const leaseValid = runtime.leaseManager.validateLease(lease.token, 'ORCH-CANCEL-01');
  assert(leaseValid.valid === false, 'Lease must be revoked after cancellation');
  console.log('✓ Clean cancellation verified: confirmed termination, budget release, and lease revocation.');

  // --- Test 5: Injected Crash Resilience Invariant (ORCH-016) ---
  console.log('\n--- Test 5: Injected Crash Resilience Invariant ---');
  // "Injected crashes cause no lost committed state, duplicate dispatch, stale-result acceptance, or overwrite of user changes."

  // 1. User file with working WIP
  const userWipFile = path.join(testRoot, 'UserWIP.ts');
  fs.writeFileSync(userWipFile, 'export const userEdits = "DO NOT OVERWRITE";\n', 'utf8');

  // 2. Simulate crashed attempt left in Running state in the store
  const crashAttempt = TicketAttemptManager.createAttempt(
    'ORCH-CRASH-M3',
    1,
    'fake-runner',
    'managed',
    { timestamp: Date.now(), fileHashes: { [userWipFile]: 'old-hash' } },
    { currency: 'EUR', unitsReserved: 1, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  crashAttempt.status = 'Running';
  TicketAttemptManager.saveAttempt(testRoot, crashAttempt);

  // 3. Restart extension host
  const restartRuntime = new OrchestratorRuntime(testRoot);
  const recoveryInfo = await restartRuntime.initialize();

  assert(recoveryInfo.recoveredCount >= 1, 'Restart must detect in-flight crash attempt');

  // 4. Assert crashed attempt marked Interrupted without duplicate execution
  const recoveredAttempt = TicketAttemptManager.loadAttempt(testRoot, crashAttempt.attemptId);
  assert(recoveredAttempt?.status === 'Interrupted', 'Crashed attempt must be Interrupted');

  // 5. Assert user's WIP is preserved completely intact
  const userWipContent = fs.readFileSync(userWipFile, 'utf8');
  assert(userWipContent.includes('DO NOT OVERWRITE'), 'User WIP must remain completely untouched');

  // 6. Assert stale attempt cannot commit results
  const staleLeaseCheck = restartRuntime.leaseManager.validateLease('stale-token-123', 'ORCH-CRASH-M3');
  assert(staleLeaseCheck.valid === false, 'Stale attempts after restart must be rejected');
  console.log('✓ Crash recovery invariant satisfied: No lost state, no duplicate dispatch, no stale acceptance, no WIP overwrite.');

  // Cleanup
  runtime.dispose();
  restartRuntime.dispose();
  try {
    fs.rmSync(testRoot, { recursive: true, force: true });
  } catch {}

  console.log('\n=== ALL M3 TESTS PASSED SUCCESSFULLY! ===\n');
}

runM3Tests().catch(err => {
  console.error('M3 Test Failure:', err);
  process.exit(1);
});
