import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { claim, createThread, findMessageBoard, parseActiveAgents, readClaims, readMessageBoard, release, replyToThread } from '../src/fleet/messageBoard';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✘ ' + msg); } else { console.log('  ✔ ' + msg); }
}

const AGENTS = `# Active Agents

| Agent Name | Client / Environment | Current Focus | Claimed Areas | Active Ticket | Last Check-in |
|---|---|---|---|---|---|
| **Björn** | Project Lead (Human) | Direction | All | All | Active |
| **Devin** | Devin Desktop | Feature waves | \`UI\` | SKTY-127 | 2026-10-21 |

---
## Claim protocol
`;

const THREAD = `# THREAD-001: Welcome

| Metadata | Details |
|---|---|
| **Author** | Björn |
| **Status** | Active / Open |
| **Related Ticket** | N/A |
| **Created** | 2026-10-17 01:37 |

## Conversation Log

### 2026-10-17 01:43 — Devin (IDE)
Hello.

### 2026-10-17 02:30 — Claude Code (CLI)
Hi.
`;

async function main() {
  console.log('\n=== Message Board integration ===');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-'));
  const project = path.join(root, 'proj');
  const mb = path.join(project, 'MessageBoard');
  fs.mkdirSync(path.join(mb, 'THREADS'), { recursive: true });
  fs.mkdirSync(path.join(mb, 'DIRECT_MESSAGES', 'DEVIN'), { recursive: true });
  fs.mkdirSync(path.join(mb, 'ARCHIVE'), { recursive: true });
  fs.writeFileSync(path.join(mb, 'ACTIVE_AGENTS.md'), AGENTS);
  fs.writeFileSync(path.join(mb, 'THREADS', 'THREAD_001_welcome.md'), THREAD);
  fs.writeFileSync(path.join(mb, 'DIRECT_MESSAGES', 'DEVIN', '2026-10-17_note.md'), '# From Claude Code — hi\n');
  fs.writeFileSync(path.join(mb, 'ARCHIVE', 'THREAD_000_old.md'), '# old\n');

  console.log('\n--- discovery & reading ---');
  check(findMessageBoard([path.join(project, 'Tickets')]) === mb, 'finds MessageBoard/ in a parent of the board folder');
  check(findMessageBoard([path.join(root, 'nothing')]) === undefined, 'returns nothing when the add-on is not installed');
  const agents = parseActiveAgents(AGENTS);
  check(agents.length === 2 && agents[1].name === 'Devin' && agents[1].claimed === 'UI' && agents[1].ticket === 'SKTY-127', 'parses the ACTIVE_AGENTS.md roster');
  const state = readMessageBoard(mb);
  check(state.threads.length === 1 && state.threads[0].title === 'THREAD-001: Welcome' && state.threads[0].status === 'Active / Open' && state.threads[0].messages === 2, 'reads thread title, status and message count');
  check(state.threads[0].lastMessage.includes('Claude Code'), 'shows who spoke last');
  check(state.dms.length === 1 && state.dms[0].to === 'DEVIN' && state.archived === 1, 'lists direct messages and archived threads');

  console.log('\n--- claims (same lease rules as claim.py) ---');
  const now = Date.UTC(2026, 9, 23, 12, 0, 0);
  const r1 = claim(mb, 'SKTY-1', 'Claude Code', 'work', 'SKTY-1', 60, now);
  check(r1.ok === true, 'first claim wins');
  const r2 = claim(mb, 'SKTY-1', 'Devin', 'work', 'SKTY-1', 60, now + 1000);
  check(r2.ok === false && (r2 as any).heldBy === 'Claude Code', 'a second agent is told who holds it');
  const r3 = claim(mb, 'SKTY-1', 'Claude Code', 'still working', 'SKTY-1', 60, now + 10 * 60_000);
  check(r3.ok === true && (r3 as any).renewed === true, 'the holder renews its own claim');
  const claims = readClaims(mb, now + 20 * 60_000);
  check(claims.length === 1 && !claims[0].expired && claims[0].minutesLeft === 50, 'readClaims reports time left on the lease');
  const r4 = claim(mb, 'SKTY-1', 'Devin', 'takeover', 'SKTY-1', 60, now + 3 * 3600_000);
  check(r4.ok === true && readClaims(mb, now + 3 * 3600_000)[0].agent === 'Devin', 'an expired claim is taken over');
  check(release(mb, 'SKTY-1', 'Claude Code') === false && release(mb, 'SKTY-1', 'Claude Code', true) === true, 'only the holder (or a forced release) can release');
  check(readClaims(mb).length === 0, 'released claims disappear');
  const log = fs.readFileSync(path.join(mb, 'LOCKS', 'CLAIMS_LOG.md'), 'utf8');
  check(/CLAIM SKTY-1/.test(log) && /TAKEOVER/.test(log) && /RELEASE/.test(log), 'every claim action is logged to CLAIMS_LOG.md');

  console.log('\n--- threads ---');
  const file = createThread(mb, 'Who owns the auth refactor?', 'Björn', 'Agentic Kanban UI', 'Please claim before editing.');
  check(path.basename(file).startsWith('THREAD_002_who-owns-the-auth-refactor') && /THREAD-002/.test(fs.readFileSync(file, 'utf8')), 'new threads get the next number and a slug');
  replyToThread(file, 'Björn', 'Agentic Kanban UI', 'Thanks all.', new Date(2026, 9, 23, 14, 5));
  const t2 = readMessageBoard(mb).threads.find(t => t.file.startsWith('THREAD_002'))!;
  check(t2.messages === 1 && t2.lastMessage.includes('2026-10-23 14:05') && t2.status === 'Open', 'replies are appended and signed with a timestamp');

  console.log('\n--- interoperates with claim.py ---');
  const py = [process.env.BOARD_PYTHON, path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'python.exe'), 'python3', 'python'].filter(Boolean) as string[];
  const script = path.join(__dirname, '..', '..', 'BearsAgenticCodeFramework', 'Add-ons', 'MessageBoard', 'MessageBoard', 'tools', 'claim.py');
  let ran = false;
  if (fs.existsSync(script)) {
    const toolsDir = path.join(mb, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(script, path.join(toolsDir, 'claim.py'));
    claim(mb, 'INTEROP-1', 'Devin', 'from the UI', 'INTEROP-1', 60);
    for (const exe of py) {
      const r = spawnSync(exe, [path.join(toolsDir, 'claim.py'), 'status'], { encoding: 'utf8' });
      if (r.status === 0 && r.stdout) {
        ran = true;
        check(/INTEROP-1/.test(r.stdout) && /held by Devin/.test(r.stdout), 'claim.py sees a claim made by the extension');
        const rel = spawnSync(exe, [path.join(toolsDir, 'claim.py'), 'release', 'INTEROP-1', '--agent', 'Devin'], { encoding: 'utf8' });
        check(rel.status === 0 && readClaims(mb).length === 0, 'claim.py can release it, and the extension sees that');
        break;
      }
    }
  }
  if (!ran) console.log('  (skipped: BACF claim.py or Python not available here)');

  fs.rmSync(root, { recursive: true, force: true });
  if (failures) { console.error(`\n${failures} message board check(s) FAILED`); process.exit(1); }
  console.log('\n=== All message board tests passed ===');
}

main().catch(e => { console.error(e); process.exit(1); });
