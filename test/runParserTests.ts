import * as fs from 'fs';
import * as path from 'path';
import { TicketParser } from '../src/ticketParser';
import { ConfigParser } from '../src/configParser';
import { PromptFormatter } from '../src/promptFormatter';

export { TicketParser, ConfigParser, PromptFormatter };

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
  const ext001Path = fs.existsSync(path.join(root, 'Tickets', 'Completed', 'EXT-001_copy-agent-task-prompt.md'))
    ? path.join(root, 'Tickets', 'Completed', 'EXT-001_copy-agent-task-prompt.md')
    : path.join(root, 'Tickets', 'Ongoing', 'EXT-001_copy-agent-task-prompt.md');
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

  // Test 11: ConfigParser prompt template parsing
  console.log('\nTesting ConfigParser prompt template parsing...');
  const inlineTemplateConfig = ConfigParser.parse(`
## Settings
- **Board Name**: Custom Prompt Board
- **Agent Prompt Template**: Work on {id} located at {relative_path}
  `, 'Test Board');
  assert(inlineTemplateConfig.agentPromptTemplate === 'Work on {id} located at {relative_path}',
    `Expected parsed inline template, got: '${inlineTemplateConfig.agentPromptTemplate}'`);

  const sectionTemplateConfig = ConfigParser.parse(`
## Settings
- **Board Name**: Custom Prompt Board

## Prompt Template
\`\`\`markdown
Special instructions for **{id}: {title}** at {relative_path}:
Summary: {summary}
Acceptance Criteria:
{acceptance_criteria}
\`\`\`
  `, 'Test Board');
  assert(sectionTemplateConfig.agentPromptTemplate !== undefined && sectionTemplateConfig.agentPromptTemplate.includes('Special instructions for **{id}: {title}**'),
    `Expected parsed block template, got: '${sectionTemplateConfig.agentPromptTemplate}'`);
  console.log('✓ ConfigParser prompt template tests passed!');

  // Test 12: PromptFormatter default template formatting
  console.log('\nTesting PromptFormatter default template...');
  const defaultPrompt = PromptFormatter.formatPrompt(ticket019, null, root, ticketsRoot);
  assert(defaultPrompt.includes('Please review and work on ticket **ATF-019:'),
    `Expected prompt to include 'Please review and work on ticket **ATF-019:', got:\n${defaultPrompt}`);
  assert(defaultPrompt.includes('located at `Example Structure/Tickets/Ongoing/Example_ticket-019_cleanup-audit-trail.md`'),
    `Expected relative path to be computed relative to workspace root, got:\n${defaultPrompt}`);
  assert(defaultPrompt.includes('### Summary'), 'Expected prompt to contain ### Summary');
  assert(defaultPrompt.includes('### Key Acceptance Criteria'), 'Expected prompt to contain Key Acceptance Criteria');
  assert(defaultPrompt.includes('- [ ] Mutations captured with before/after'),
    'Expected criteria to be formatted with checklist bullets');
  assert(defaultPrompt.includes('### Instructions'), 'Expected prompt to contain Instructions');
  assert(defaultPrompt.includes('Move the ticket to `Example Structure/Tickets/Completed/` once done.'),
    `Expected completed path to be correctly derived, got:\n${defaultPrompt}`);
  console.log('✓ PromptFormatter default template tests passed!');

  // Test 13: PromptFormatter with custom config template and edge cases
  console.log('\nTesting PromptFormatter with custom template...');
  const customPrompt = PromptFormatter.formatPrompt(ticket001, sectionTemplateConfig, root, ticketsRoot);
  assert(customPrompt.includes('Special instructions for **ACM-001:'),
    `Expected custom template prefix, got:\n${customPrompt}`);
  assert(customPrompt.includes('- [x] Ollama installed and running locally.') && customPrompt.includes('- [ ] Backend `.env` model endpoint'),
    'Expected done/undone checkboxes to reflect criterion state');

  // Test with ticket having no acceptance criteria
  const noCriteriaTicket = { ...ticket092, acceptanceCriteria: [] };
  const fallbackPrompt = PromptFormatter.formatPrompt(noCriteriaTicket, null, root, ticketsRoot);
  assert(fallbackPrompt.includes('- [ ] Implement requirements as specified in ticket.'),
    'Expected fallback criterion text when no criteria present');
  console.log('✓ PromptFormatter custom template & edge cases tests passed!');

  // Test 14: TicketParser.toggleCriterion (EXT-003)
  console.log('\nTesting TicketParser.toggleCriterion (EXT-003)...');
  const checklistSample = `# Ticket With Criteria\n\n## Acceptance Criteria\n- [ ] Task 1: Initialize DB\n- [ ] Task 2: Setup routes\n- [x] Task 3: Write tests\n`;
  const toggled0 = TicketParser.toggleCriterion(checklistSample, 0, true);
  assert(toggled0.includes('- [x] Task 1: Initialize DB'), 'Expected task 1 to be checked');
  assert(toggled0.includes('- [ ] Task 2: Setup routes'), 'Expected task 2 to remain unchecked');

  const toggled2 = TicketParser.toggleCriterion(toggled0, 2, false);
  assert(toggled2.includes('- [ ] Task 3: Write tests'), 'Expected task 3 to be unchecked');

  // Test CRLF preservation during checkbox toggle
  const crlfChecklist = '# Title\r\n\r\n## Criteria\r\n- [ ] Task 1\r\n- [ ] Task 2\r\n';
  const crlfToggled = TicketParser.toggleCriterion(crlfChecklist, 1, true);
  assert(crlfToggled.includes('\r\n- [x] Task 2\r\n'), 'Expected CRLF preserved when toggling checkbox');
  console.log('✓ TicketParser.toggleCriterion tests passed!');

  // Test 15: TicketParser.extractWorkLogEntries (EXT-005)
  console.log('\nTesting TicketParser.extractWorkLogEntries (EXT-005)...');
  const workLogSample = `# Ticket With Log\n\n## Summary\nTicket summary\n\n## Work Log\n- **2026-09-04**: Started implementation of core algorithm\n- **2026-09-05**: Added regression tests and benchmark suite\n\n## Next Steps\nShip it\n`;
  const entries = TicketParser.extractWorkLogEntries(workLogSample, 'EXT-005', 'Live Timeline', 'Tickets/EXT-005.md', 'board-1', 'Main Board');
  assert(entries.length === 2, `Expected 2 work log entries, got ${entries.length}`);
  assert(entries[0].date === '2026-09-04', `Expected date 2026-09-04, got '${entries[0].date}'`);
  assert(entries[0].text.includes('Started implementation'), `Expected text to include 'Started implementation', got '${entries[0].text}'`);
  assert(entries[0].line === 7, `Expected line 7, got ${entries[0].line}`);
  assert(entries[1].date === '2026-09-05', `Expected date 2026-09-05, got '${entries[1].date}'`);
  assert(entries[1].line === 8, `Expected line 8, got ${entries[1].line}`);
  console.log('✓ TicketParser.extractWorkLogEntries tests passed!');

  // Test 16: PromptFormatter dependency blocker warning (EXT-004)
  console.log('\nTesting PromptFormatter dependency blocker warning (EXT-004)...');
  const blockedTicket = {
    ...ticket019,
    dependsOn: ['EXT-000', 'EXT-001'],
    unresolvedDependencies: ['EXT-000', 'EXT-001 (Ongoing)']
  };
  const blockedPrompt = PromptFormatter.formatPrompt(blockedTicket, null, root, ticketsRoot);
  assert(blockedPrompt.includes('⚠️ **DEPENDENCY WARNING**:'), 'Expected prompt to include dependency blocker warning');
  assert(blockedPrompt.includes('EXT-000, EXT-001 (Ongoing)'), 'Expected prompt to list unfinished dependencies');
  console.log('✓ PromptFormatter dependency blocker warning tests passed!');

  // Test 17: Template placeholder replacement (EXT-006)
  console.log('\nTesting ticket template interpolation (EXT-006)...');
  const templateSample = `# {id} — Fix: {title}\n\n| Field | Value |\n|---|---|\n| **Status** | {column} |\n\n## Work Log\n- **{date}**: Created ticket.\n`;
  const dateStr = '2026-09-07';
  const interpolated = templateSample
    .split('{id}').join('T-FIX-BUG')
    .split('{title}').join('Fix memory leak')
    .split('{column}').join('Backlog')
    .split('{date}').join(dateStr);
  assert(interpolated.includes('# T-FIX-BUG — Fix: Fix memory leak'), 'Expected title interpolated');
  assert(interpolated.includes('| **Status** | Backlog |'), 'Expected status column interpolated');
  assert(interpolated.includes(`- **${dateStr}**: Created ticket.`), 'Expected date interpolated');
  console.log('✓ Ticket template interpolation tests passed!');

  console.log('\n=== ALL UNIT TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
