import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BoardManager } from '../src/boardManager';
import { messages } from './fixtures/vscodeStub';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✘ ' + msg); } else { console.log('  ✔ ' + msg); }
}

const TICKET = (title: string) => `# ${title}\n\n| Field | Value |\n|---|---|\n| **Status** | Backlog |\n\n## Acceptance Criteria\n- [ ] done\n`;

async function main() {
  console.log('\n=== BoardManager regression tests ===');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-'));
  const root = path.join(base, 'Tickets');
  for (const c of ['Backlog', 'Ongoing', 'Completed']) fs.mkdirSync(path.join(root, c), { recursive: true });
  fs.writeFileSync(path.join(root, 'Backlog', 'a.md'), TICKET('A'));
  fs.writeFileSync(path.join(root, 'Ongoing', 'a.md'), TICKET('A (already in Ongoing)'));
  fs.writeFileSync(path.join(root, 'Backlog', 'b.md'), TICKET('B'));

  const bm = BoardManager.getInstance();
  const board = (await bm.reloadSingleBoard(root))!;
  check(!!board, 'board loads');

  console.log('\n--- moveTicket ---');
  messages.length = 0;
  const clash = await bm.moveTicket(board.id, path.join(root, 'Backlog', 'a.md'), 'Ongoing', null);
  check(clash === false && fs.readFileSync(path.join(root, 'Ongoing', 'a.md'), 'utf8').includes('already in Ongoing'),
    'refuses to overwrite a same-named ticket in the target column');
  check(messages.some(m => /already exists/.test(m.text)), 'tells the user why');
  check(fs.existsSync(path.join(root, 'Backlog', 'a.md')), 'source ticket is untouched after a refused move');

  const escaped = await bm.moveTicket(board.id, path.join(root, 'Backlog', 'b.md'), '../outside', null);
  check(escaped === false && !fs.existsSync(path.join(base, 'outside')), 'column "../outside" cannot escape the board root');
  const escapedSub = await bm.moveTicket(board.id, path.join(root, 'Backlog', 'b.md'), 'Ongoing', '../../x');
  check(escapedSub === false && !fs.existsSync(path.join(base, 'x')), 'subfolder traversal is rejected');

  const ok = await bm.moveTicket(board.id, path.join(root, 'Backlog', 'b.md'), 'Completed', null);
  check(ok === true && fs.existsSync(path.join(root, 'Completed', 'b.md')), 'a normal move still works');
  check(fs.readFileSync(path.join(root, 'Completed', 'b.md'), 'utf8').includes('| **Status** | Completed |'), 'status field follows the column');

  console.log('\n--- createTicket ---');
  const p1 = await bm.createTicket(board.id, 'Backlog', null, 'Åtgärda buggen i Öppna-menyn');
  check(!!p1 && path.basename(p1!).includes('atgarda-buggen-i-oppna-menyn'), 'non-ASCII titles keep a readable filename');
  const p2 = await bm.createTicket(board.id, 'Backlog', null, '???');
  check(!!p2 && path.basename(p2!).includes('untitled'), 'symbol-only titles fall back to "untitled"');
  const tpl = '# {id} — {title}\n\n| Field | Value |\n|---|---|\n| **Status** | {column} |\n';
  const q1 = await bm.createTicket(board.id, 'Backlog', null, 'Same title', tpl);
  const q2 = await bm.createTicket(board.id, 'Backlog', null, 'Same title', tpl);
  const id1 = fs.readFileSync(q1!, 'utf8').match(/# (\S+)/)![1];
  const id2 = fs.readFileSync(q2!, 'utf8').match(/# (\S+)/)![1];
  check(id1 !== id2, `duplicate titles get unique ticket ids (${id1} vs ${id2})`);
  const bad = await bm.createTicket(board.id, '..', null, 'evil');
  check(bad === null, 'createTicket rejects a column that escapes the board');
  const outside = await bm.createTicket(board.id, 'Backlog', '../../..', 'evil');
  check(outside === null, 'createTicket rejects a traversing subfolder');

  console.log('\n--- board lookup ---');
  fs.mkdirSync(path.join(base, 'Tickets2', 'Backlog'), { recursive: true });
  check(bm.findBoardForTicketPath(path.join(base, 'Tickets2', 'Backlog', 'z.md')) === undefined,
    'a path in a sibling folder sharing the prefix is not claimed by the board');
  check(bm.findBoardForTicketPath(path.join(root, 'Backlog', 'x.md'))?.id === board.id, 'paths inside the board still resolve');

  const rules = await bm.generateAgentRules(board.id);
  check(rules !== null, 'generateAgentRules works');

  fs.rmSync(base, { recursive: true, force: true });
  if (failures) { console.error(`\n${failures} BoardManager check(s) FAILED`); process.exit(1); }
  console.log('\n=== All BoardManager tests passed ===');
}

main().catch(e => { console.error(e); process.exit(1); });
