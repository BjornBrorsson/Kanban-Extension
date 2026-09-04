import * as fs from 'fs';
import * as path from 'path';
import { TicketParser } from '../src/ticketParser';
import { ConfigParser } from '../src/configParser';

export { TicketParser, ConfigParser };

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('=== Running Parser Unit Tests ===');

  const root = path.join(__dirname, '..');
  const ticketsRoot = path.join(root, 'Example Structure', 'Tickets');

  // Test 1: Parse config.md
  const configPath = path.join(ticketsRoot, 'config.md');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = ConfigParser.parse(configContent, 'Example Project Board');

  console.log('Testing ConfigParser...');
  assert(config.name === 'Example Project Board', `Config name expected 'Example Project Board', got '${config.name}'`);
  assert(config.columnsOrder.length === 5, `Expected 5 columns in order, got ${config.columnsOrder.length}`);
  assert(config.autoUpdateStatus === true, 'Expected autoUpdateStatus to be true');
  assert(config.assignees.length >= 4, `Expected at least 4 assignees, got ${config.assignees.length}`);

  const bjorn = config.assignees.find(a => a.id === 'bjorn');
  assert(bjorn !== undefined && bjorn.type === 'human', 'Bjorn should be parsed as a human assignee');

  const claude = config.assignees.find(a => a.id === 'claude-code');
  assert(claude !== undefined && claude.type === 'agent', 'Claude Code should be parsed as an agent assignee');
  assert(claude?.agentConfig?.type === 'cli', 'Claude Code runner type should be cli');

  const ideChat = config.assignees.find(a => a.id === 'ide-chat');
  assert(ideChat !== undefined && ideChat.agentConfig?.type === 'vscode-command', 'ide-chat should be parsed as vscode-command');
  console.log('✓ ConfigParser tests passed!');

  // Test 2: Parse table ticket (Example_ticket-019_cleanup-audit-trail.md)
  console.log('\nTesting TicketParser on table ticket (ticket-019)...');
  const ticket019Path = path.join(ticketsRoot, 'Ongoing', 'Example_ticket-019_cleanup-audit-trail.md');
  const ticket019Content = fs.readFileSync(ticket019Path, 'utf8');
  const ticket019 = TicketParser.parse(ticket019Path, ticket019Content, ticketsRoot, 'Ongoing', null);

  assert(ticket019.id === 'ATF-019', `Expected ID ATF-019, got '${ticket019.id}'`);
  assert(ticket019.title.includes('Cleanup + audit-trail framework'), `Expected title to contain cleanup, got '${ticket019.title}'`);
  assert(ticket019.priority === 'P0 — Critical', `Expected P0, got '${ticket019.priority}'`);
  assert(ticket019.epic?.includes('Test Data') === true, `Expected Epic C, got '${ticket019.epic}'`);
  assert(ticket019.labels.includes('cleanup'), 'Expected label cleanup');
  assert(ticket019.labels.includes('audit'), 'Expected label audit');
  assert(ticket019.acceptanceCriteria.length === 5, `Expected 5 criteria, got ${ticket019.acceptanceCriteria.length}`);
  assert(ticket019.progress.done === 0, `Expected 0 done, got ${ticket019.progress.done}`);
  assert(ticket019.hasWorkLog === true, 'Expected hasWorkLog to be true');
  console.log('✓ Ticket-019 table parser tests passed!');

  // Test 3: Parse checked criteria ticket (Example_ticket-001_local-gpu-model-host.md)
  console.log('\nTesting TicketParser on checklist progress (ticket-001)...');
  const ticket001Path = path.join(ticketsRoot, 'Assistance Required', 'Example_ticket-001_local-gpu-model-host.md');
  const ticket001Content = fs.readFileSync(ticket001Path, 'utf8');
  const ticket001 = TicketParser.parse(ticket001Path, ticket001Content, ticketsRoot, 'Assistance Required', null);

  assert(ticket001.id === 'ACM-001', `Expected ID ACM-001, got '${ticket001.id}'`);
  assert(ticket001.progress.total === 5, `Expected 5 total criteria, got ${ticket001.progress.total}`);
  assert(ticket001.progress.done === 2, `Expected 2 done criteria, got ${ticket001.progress.done}`);
  assert(ticket001.labels.includes('llm') && ticket001.labels.includes('gpu'), 'Expected llm and gpu labels');
  console.log('✓ Ticket-001 checklist tests passed!');

  // Test 4: Parse freeform ticket (Example_ticket-092-Pathfix.md)
  console.log('\nTesting TicketParser on freeform ticket (ticket-092)...');
  const ticket092Path = path.join(ticketsRoot, 'Backlog', 'Needs further specification', 'Example_ticket-092-Pathfix.md');
  const ticket092Content = fs.readFileSync(ticket092Path, 'utf8');
  const ticket092 = TicketParser.parse(ticket092Path, ticket092Content, ticketsRoot, 'Backlog', 'Needs further specification');

  assert(ticket092.id.includes('092'), `Expected ID to contain 092, got '${ticket092.id}'`);
  assert(ticket092.subfolder === 'Needs further specification', 'Subfolder should be Needs further specification');
  assert(ticket092.column === 'Backlog', 'Column should be Backlog');
  assert(ticket092.summary.length > 20, 'Expected non-empty summary from freeform text');
  console.log('✓ Ticket-092 freeform parser tests passed!');

  // Test 5: updateTicketStatus
  console.log('\nTesting updateTicketStatus...');
  const updated019 = TicketParser.updateTicketStatus(ticket019Content, 'Completed');
  assert(updated019.includes('| **Status** | Completed |'), 'Expected Status row to be updated to Completed');
  console.log('✓ updateTicketStatus tests passed!');

  // Test 6: updateTicketAssignee
  console.log('\nTesting updateTicketAssignee...');
  const assignedAgent = TicketParser.updateTicketAssignee(ticket019Content, 'Cline (Ollama / Gemma 4)');
  assert(assignedAgent.includes('| **Assignee** | Cline (Ollama / Gemma 4) |'), 'Expected Assignee row to be updated to agent');

  const unassigned = TicketParser.updateTicketAssignee(assignedAgent, '');
  assert(unassigned.includes('| **Assignee** | — |'), 'Expected Assignee row to be set to em-dash when unassigned');

  const parsedUnassigned = TicketParser.parse(ticket019Path, unassigned, ticketsRoot, 'Completed', null);
  assert(parsedUnassigned.assignee === null, `Expected parsed assignee to be null, got: ${parsedUnassigned.assignee}`);

  // Test 7: updateTicketAssignee on freeform markdown (ticket-092)
  console.log('\nTesting updateTicketAssignee on freeform ticket (ticket-092)...');
  const assigned092 = TicketParser.updateTicketAssignee(ticket092Content, 'Björn');
  assert(assigned092.includes('| **Assignee** | Björn |'), 'Expected Assignee table to be inserted into freeform ticket');
  const parsed092Assigned = TicketParser.parse(ticket092Path, assigned092, ticketsRoot, 'Backlog', 'Needs further specification');
  assert(parsed092Assigned.assignee === 'Björn', `Expected parsed assignee to be 'Björn', got: ${parsed092Assigned.assignee}`);
  console.log('✓ Freeform ticket assignment tests passed!');

  // Test 8: CRLF preservation in updateTicketAssignee
  console.log('\nTesting CRLF preservation...');
  const crlfContent = '# Test Ticket\r\n\r\n| Field | Value |\r\n|---|---|\r\n| **Status** | Ongoing |\r\n';
  const crlfAssigned = TicketParser.updateTicketAssignee(crlfContent, 'Devin');
  assert(crlfAssigned.includes('\r\n| **Assignee** | Devin |'), 'Expected CRLF line ending before inserted Assignee row');
  assert(!crlfAssigned.includes('\n| **Assignee** | Devin |') || crlfAssigned.includes('\r\n'), 'Expected consistent CRLF');
  console.log('✓ CRLF preservation tests passed!');

  // Test 9: YAML frontmatter assignee update
  console.log('\nTesting YAML frontmatter assignee update...');
  const yamlContent = '---\ntitle: Feature X\nstatus: Ongoing\n---\n\n## Content';
  const yamlAssigned = TicketParser.updateTicketAssignee(yamlContent, 'Copilot');
  assert(yamlAssigned.includes('assignee: Copilot'), 'Expected assignee to be inserted in YAML frontmatter');
  console.log('✓ YAML frontmatter assignment tests passed!');

  // Test 10: Assignee insertion on EXT-001 (Project's own ticket format)
  console.log('\nTesting Assignee insertion on EXT-001 format...');
  const ext001Path = path.join(root, 'Tickets', 'Ongoing', 'EXT-001_copy-agent-task-prompt.md');
  if (fs.existsSync(ext001Path)) {
    const ext001Content = fs.readFileSync(ext001Path, 'utf8');
    const ext001Assigned = TicketParser.updateTicketAssignee(ext001Content, 'Cline CLI (Ollama - Gemma 4 E4B)');
    assert(ext001Assigned.includes('| **Assignee** | Cline CLI (Ollama - Gemma 4 E4B) |'), 'Expected Assignee row inserted into EXT-001');
    const parsedExt001 = TicketParser.parse(ext001Path, ext001Assigned, path.join(root, 'Tickets'), 'Ongoing', null);
    assert(parsedExt001.assignee === 'Cline CLI (Ollama - Gemma 4 E4B)', `Expected parsed assignee to be Cline CLI, got: ${parsedExt001.assignee}`);

    // Re-assigning updates in-place
    const ext001Reassigned = TicketParser.updateTicketAssignee(ext001Assigned, 'Björn');
    assert(ext001Reassigned.includes('| **Assignee** | Björn |'), 'Expected Assignee row updated to Björn');
    assert(!ext001Reassigned.includes('Cline CLI'), 'Expected Cline CLI to be replaced');
    console.log('✓ EXT-001 assignment and re-assignment tests passed!');
  }

  console.log('\n=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
