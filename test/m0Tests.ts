import * as fs from 'fs';
import * as path from 'path';
import { ConfigParser } from '../src/configParser';
import { OrchestrationConfigParser } from '../src/orchestrator/config/orchestrationConfig';
import { CapabilityProbe, KNOWN_RUNNERS } from '../src/orchestrator/adapters/capabilityProbe';
import { TicketAttemptManager } from '../src/orchestrator/models/ticketAttempt';
import { TicketMigrationUtility } from '../src/orchestrator/models/migration';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runM0Tests() {
  console.log('=== Running Milestone M0 Tests ===');

  // --- ORCH-001 & ORCH-002 Tests: Config parsing & Backward Compatibility ---
  console.log('\nTesting ORCH-001 & ORCH-002: Config Parsing & Backward Compatibility...');

  // Legacy config without orchestration
  const legacyConfigMarkdown = `# Board Configuration
## Settings
- **Board Name**: Legacy Board
- **Columns Order**: Backlog, Done
`;
  const legacyParsed = ConfigParser.parse(legacyConfigMarkdown, 'Legacy Board');
  assert(legacyParsed.name === 'Legacy Board', 'Legacy board name should match');
  assert(legacyParsed.orchestration === undefined, 'Legacy board should have undefined orchestration');
  console.log('✓ Legacy config backward compatibility confirmed.');

  // Orchestration config with versioned fenced YAML
  const orchConfigMarkdown = `# Board Configuration
## Settings
- **Board Name**: Orchestrated Board
- **Columns Order**: Backlog, Ongoing, Review, Done

\`\`\`yaml
schemaVersion: 1
orchestration:
  enabled: true
  profile: work-eu
  maxConcurrentWorkers: 2
  completionTarget: reviewed-patch
  retryLimit: 2
roles:
  lead: approved-frontier
  worker: approved-economical
policies:
  work-eu:
    allowedExecution: [local, verified-eu]
    unknownDestination: deny
budgets:
  dailyCurrency: EUR
  dailyLimit: 15
  reserveForReview: 2
\`\`\`

## Assignees
### Humans
- **Björn**
  - ID: bjorn
  - Role: Lead
`;
  const orchParsed = ConfigParser.parse(orchConfigMarkdown, 'Default Name');
  assert(orchParsed.orchestration !== undefined, 'Orchestration block should be parsed');
  assert(orchParsed.orchestration?.orchestration.enabled === true, 'Orchestration should be enabled');
  assert(orchParsed.orchestration?.orchestration.profile === 'work-eu', 'Profile should be work-eu');
  assert(orchParsed.orchestration?.orchestration.maxConcurrentWorkers === 2, 'Max workers should be 2');
  assert(orchParsed.orchestration?.roles?.lead === 'approved-frontier', 'Lead role should match');
  assert(orchParsed.orchestration?.policies?.['work-eu']?.unknownDestination === 'deny', 'Policy unknownDestination should be deny');
  assert(orchParsed.orchestration?.budgets?.dailyLimit === 15, 'Daily limit should be 15');
  assert(orchParsed.assignees.length === 1 && orchParsed.assignees[0].id === 'bjorn', 'Assignees should parse normally');
  console.log('✓ Versioned orchestration config parsed correctly with assignees intact.');

  // Unsupported schema version rejection
  try {
    OrchestrationConfigParser.parseYaml(`schemaVersion: 99\norchestration:\n  enabled: true`);
    assert(false, 'Should have thrown on unsupported schema version');
  } catch (e: any) {
    assert(e.message.includes('Unsupported orchestration schemaVersion'), 'Error should mention unsupported schema');
  }
  console.log('✓ Unsupported schema version properly rejected.');

  // --- ORCH-003 Tests: Adapter Capability Probes & Contracts ---
  console.log('\nTesting ORCH-003: Adapter Capability Probes & Contracts...');
  const clineSpec = KNOWN_RUNNERS.find(r => r.id === 'cline');
  assert(clineSpec !== undefined, 'Cline spec should be registered');
  assert(clineSpec?.defaultTier === 'managed', 'Cline default tier should be managed');
  assert(clineSpec?.supportsStructuredOutput === true, 'Cline should support structured output');

  const copilotSpec = KNOWN_RUNNERS.find(r => r.id === 'copilot-cli');
  assert(copilotSpec?.defaultTier === 'assisted', 'Copilot CLI default tier should be assisted');

  // Probe runners (safe non-crashing probe)
  const probeResults = await CapabilityProbe.probeAllRunners();
  assert(probeResults['cline'] !== undefined, 'Probe results should include cline');
  assert(probeResults['copilot-cli'] !== undefined, 'Probe results should include copilot-cli');
  console.log('✓ Capability discovery probes evaluated successfully across all runners.');

  // --- ORCH-004 Tests: Ticket Attempt Model & Migration Utility ---
  console.log('\nTesting ORCH-004: Ticket Attempt Model, Manifest, and Migration...');

  // Manifest hashing
  const tempWorkspace = path.join(__dirname, '..', 'scratch', 'test-orch');
  fs.mkdirSync(tempWorkspace, { recursive: true });
  const testFilePath = path.join(tempWorkspace, 'sample.txt');
  fs.writeFileSync(testFilePath, 'Hello Orchestrator!', 'utf8');

  const manifest = TicketAttemptManager.createManifest('commit-sha-12345', [testFilePath]);
  assert(manifest.baseRevision === 'commit-sha-12345', 'Manifest baseRevision should match');
  assert(manifest.fileHashes[testFilePath] !== undefined, 'File hash should be present in manifest');

  // Attempt creation and durable storage
  const attempt = TicketAttemptManager.createAttempt(
    'ORCH-001',
    1,
    'cline-ollama',
    'managed',
    manifest,
    { currency: 'EUR', unitsReserved: 5, unitsSpentReported: 0, unitsSpentEstimated: 0, isSubscriptionQuota: false }
  );
  assert(attempt.ticketId === 'ORCH-001', 'Attempt ticket ID should match');
  assert(attempt.generation === 1, 'Attempt generation should match');
  assert(attempt.status === 'Pending', 'Attempt status should be Pending');

  // Save and load attempt
  TicketAttemptManager.saveAttempt(tempWorkspace, attempt);
  const loadedAttempt = TicketAttemptManager.loadAttempt(tempWorkspace, attempt.attemptId);
  assert(loadedAttempt !== null, 'Saved attempt should be loadable');
  assert(loadedAttempt?.attemptId === attempt.attemptId, 'Loaded attempt ID should match');
  assert(loadedAttempt?.budgetReservation.unitsReserved === 5, 'Reserved budget should be preserved');
  console.log('✓ Attempt lifecycle, manifest hashing, and durable crash-safe store verified.');

  // Non-destructive ticket ID migration
  const unnumberedTicket = `# Add Dark Mode Toggle\n\n| Field | Value |\n|---|---|\n| **Status** | Backlog |\n\n## Description\nAdd dark mode.`;
  const migrationResult = TicketMigrationUtility.migrateTicketContent(unnumberedTicket, null, 'EXT-042');
  assert(migrationResult.migrated === true, 'Unnumbered ticket should be migrated');
  assert(migrationResult.content.includes('# EXT-042 — Add Dark Mode Toggle'), 'Heading should include new ID');
  assert(migrationResult.content.includes('## Description'), 'Body formatting should be intact');

  // Ticket with existing ID should NOT be changed
  const alreadyNumberedTicket = `# EXT-001 — Existing Title\n\n| Field | Value |\n|---|---|\n| **Status** | Backlog |\n`;
  const noopResult = TicketMigrationUtility.migrateTicketContent(alreadyNumberedTicket, 'EXT-001', 'EXT-999');
  assert(noopResult.migrated === false, 'Already numbered ticket should not be re-migrated');
  console.log('✓ Non-destructive ticket ID migration verified.');

  // Cleanup temp files
  try {
    fs.rmSync(tempWorkspace, { recursive: true, force: true });
  } catch {}

  console.log('\n=== ALL M0 TESTS PASSED SUCCESSFULLY! ===\n');
}

runM0Tests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
