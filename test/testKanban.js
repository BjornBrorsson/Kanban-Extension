const fs = require('fs');
const path = require('path');

// We can test using the built dist or require ts-node, or test the logic directly
// Let's create a standalone verification script that imports our compiled bundle or tests parsing directly.
const distPath = path.join(__dirname, '..', 'dist', 'extension.js');

async function runVerification() {
  console.log('--- Starting Agentic Kanban Verification ---');

  // Verify file existence
  const root = path.join(__dirname, '..');
  const exampleTicketsRoot = path.join(root, 'Example Structure', 'Tickets');

  if (!fs.existsSync(exampleTicketsRoot)) {
    throw new Error(`Example tickets root not found at ${exampleTicketsRoot}`);
  }
  console.log('✓ Found Example Structure/Tickets');

  // Check config.md
  const configPath = path.join(exampleTicketsRoot, 'config.md');
  if (!fs.existsSync(configPath)) {
    throw new Error('config.md not found');
  }
  const configContent = fs.readFileSync(configPath, 'utf8');
  console.log('✓ Read config.md (' + configContent.length + ' bytes)');

  // Check 00_Plan.md
  const planPath = path.join(exampleTicketsRoot, '00_Plan.md');
  if (!fs.existsSync(planPath)) {
    throw new Error('00_Plan.md not found');
  }
  const planContent = fs.readFileSync(planPath, 'utf8');
  console.log('✓ Read 00_Plan.md (' + planContent.length + ' bytes)');

  // Verify columns in Example Structure/Tickets
  const cols = fs.readdirSync(exampleTicketsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.'));
  const colNames = cols.map(c => c.name);
  console.log('✓ Discovered columns:', colNames.join(', '));

  const expectedCols = ['Assistance Required', 'Backlog', 'Blocked', 'Completed', 'Ongoing'];
  for (const expected of expectedCols) {
    if (!colNames.includes(expected)) {
      throw new Error(`Missing expected column ${expected}`);
    }
  }

  // Check Backlog subfolders
  const backlogSubdirs = fs.readdirSync(path.join(exampleTicketsRoot, 'Backlog'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
  console.log('✓ Discovered Backlog subfolders:', backlogSubdirs.join(', '));
  if (!backlogSubdirs.includes('Needs further specification') || !backlogSubdirs.includes('Ready')) {
    throw new Error('Backlog subfolders missing expected filter folders');
  }

  // Check Whatwhy.md in folders
  const backlogWhatwhy = path.join(exampleTicketsRoot, 'Backlog', 'Whatwhy.md');
  if (!fs.existsSync(backlogWhatwhy)) {
    throw new Error('Backlog/Whatwhy.md missing');
  }
  console.log('✓ Verified Whatwhy.md exists in Backlog');

  console.log('--- All automated structure and file assertions passed! ---');
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
