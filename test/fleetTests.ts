import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isInside, safeJoin, slugify } from '../src/pathUtils';
import { escapeForDoubleQuotes, detectShellKind } from '../src/shellEscape';
import { AgentRunner } from '../src/agentRunner';
import { TicketParser } from '../src/ticketParser';
import { Assignee, Ticket } from '../src/types';
import { ProviderRegistry, createProvider, providerToAssignee, sanitizeProvider, AgentProvider } from '../src/fleet/providers';
import { SessionLauncher, SessionManager, Session } from '../src/fleet/sessions';
import { modelFor, pickReviewer, planWork, priorityRank } from '../src/fleet/scheduler';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✘ ' + msg); } else { console.log('  ✔ ' + msg); }
}

function mkTicket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 'T-1', filename: 't-1.md', path: path.join(os.tmpdir(), 'Tickets', 'Backlog', 'Ready', 't-1.md'),
    relativePath: 'Backlog/Ready/t-1.md', column: 'Backlog', subfolder: 'Ready', title: 'Do it', summary: 'sum',
    description: '', status: 'Backlog', priority: 'Normal', epic: null, type: null, estimate: null, milestone: null,
    assignee: null, dependsOn: [], blocks: [], labels: [], acceptanceCriteria: [], progress: { done: 0, total: 0 },
    mtime: 1, hasWorkLog: false, ...over
  };
}

class FakeLauncher implements SessionLauncher {
  launched: string[] = [];
  killed: string[] = [];
  async launch(s: Session) { this.launched.push(s.id); return true; }
  show() {}
  kill(s: Session) { this.killed.push(s.id); }
}

async function main() {
  console.log('\n--- pathUtils ---');
  const root = path.join(os.tmpdir(), 'board');
  check(isInside(root, path.join(root, 'Backlog', 'a.md')), 'child path is inside');
  check(!isInside(root, root + '2'), 'sibling with shared prefix is NOT inside');
  check(safeJoin(root, 'Backlog', 'Ready') === path.join(root, 'Backlog', 'Ready'), 'safeJoin accepts normal names');
  check(safeJoin(root, '..', 'x') === null, 'safeJoin rejects ..');
  check(safeJoin(root, 'Backlog', '../../etc') === null, 'safeJoin rejects nested traversal');
  check(safeJoin(root, 'C:\\Windows') === null && safeJoin(root, '/etc') === null, 'safeJoin rejects absolute segments');
  check(slugify('Åtgärda buggen i Öppna-menyn') === 'atgarda-buggen-i-oppna-menyn', 'slugify folds accents');
  check(slugify('???') === 'untitled', 'slugify never returns an empty slug');

  console.log('\n--- shell escaping / command building ---');
  check(detectShellKind('C:\\Program Files\\PowerShell\\7\\pwsh.exe') === 'powershell', 'detects pwsh');
  check(detectShellKind('/bin/bash') === 'posix' && detectShellKind('cmd.exe') === 'cmd', 'detects bash / cmd');
  const evil = 'x"; Remove-Item -Recurse C:\\; $(calc) `whoami`\nnext';
  const ps = escapeForDoubleQuotes(evil, 'powershell');
  check(!/(^|[^`])\$\(/.test(ps) && !/(^|[^`])"/.test(ps) && !ps.includes('\n'), 'powershell: $( and " are backtick-escaped, newline flattened');
  const sh = escapeForDoubleQuotes(evil, 'posix');
  check(!/(^|[^\\])\$\(/.test(sh) && !/(^|[^\\])"/.test(sh), 'posix: $( and " are backslash-escaped');

  const agent: Assignee = {
    id: 'claude-code', name: 'Claude Code', type: 'agent',
    agentConfig: { type: 'cli', command: 'claude {model_args} -p "{task}" # {ticket_title}' }
  };
  const evilTicket = mkTicket({ title: 'Fix $(calc) "now" {model}', id: 'E-1' });
  const cmd = AgentRunner.formatCliCommand(evilTicket, agent, os.tmpdir(), undefined, 'body', {
    shell: 'powershell', model: 'opus', modelFlag: '--model'
  });
  check(cmd.startsWith('claude --model opus -p "'), 'model_args expands to --model opus');
  check(cmd.includes('`$(calc)') && cmd.includes('`"now`"'), 'ticket title is escaped inside the command');
  check(cmd.includes('{model}'), 'placeholder-looking text in a ticket stays literal (single pass)');
  const badModel = AgentRunner.formatCliCommand(mkTicket(), agent, os.tmpdir(), undefined, 'b', {
    shell: 'posix', model: 'opus; rm -rf ~', modelFlag: '--model'
  });
  check(!badModel.includes('rm -rf'), 'unsafe model ids are dropped');
  const appended = AgentRunner.formatCliCommand(mkTicket(), {
    id: 'x', name: 'X', type: 'agent', agentConfig: { type: 'cli', command: 'mytool "{ticket_title}"' }
  }, os.tmpdir(), undefined, 'b', { shell: 'posix', model: 'big', modelFlag: '-m' });
  check(appended.endsWith('-m big'), 'model flag is appended when the template has no placeholder');

  console.log('\n--- ticket parser: replacement specials ---');
  const md = '# T\n\n| Field | Value |\n|---|---|\n| **Status** | Backlog | extra |\n| **Assignee** | Bob |\n';
  const st = TicketParser.updateTicketStatus(md, "Done $& $' end");
  check(st.includes("| **Status** | Done $& $' end | extra |"), 'status keeps $-patterns literal and preserves trailing cells');
  const as = TicketParser.updateTicketAssignee(md, "Dev$`in");
  check(as.includes('| **Assignee** | Dev$`in |'), 'assignee keeps $-patterns literal');

  console.log('\n--- providers ---');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-'));
  const reg = new ProviderRegistry(tmp);
  const d1 = reg.add('devin', 'Devin (work)');
  const d2 = reg.add('devin', 'Devin (personal)');
  check(d1.id !== d2.id && reg.list().length === 2, 'two providers of the same kind get distinct ids');
  const renamed = reg.upsert({ ...d1, name: 'Devin – Acme', account: 'work' });
  check(renamed.id === d1.id && reg.get(d1.id)!.name === 'Devin – Acme', 'rename keeps the id');
  check(new ProviderRegistry(tmp).list().length === 2, 'registry persists to disk');
  const weird = sanitizeProvider({ kind: 'claude-code', name: '  ', maxParallel: 999, safetyMarginPct: 99, models: ['a', 'b'], defaultModel: 'zzz' });
  check(weird.maxParallel === 32 && weird.safetyMarginPct === 50 && weird.defaultModel === 'a', 'sanitize clamps limits and fixes default model');
  const seeded = new ProviderRegistry(fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-')));
  check(seeded.seedFromAssignees([agent, { id: 'bj', name: 'Bj', type: 'human' }]) === 1 && seeded.list()[0].kind === 'claude-code', 'legacy agents are imported, humans ignored');
  check(providerToAssignee(d1).id === d1.id && providerToAssignee(d1).type === 'agent', 'provider converts to an assignee');

  console.log('\n--- sessions: parallel, window, spacing, cooldown ---');
  let now = 1_000_000;
  const clock = () => now;
  const provs: Record<string, AgentProvider> = {};
  const mk = (over: Partial<AgentProvider>) => {
    const p = { ...createProvider('claude-code', Object.values(provs)), ...over } as AgentProvider;
    provs[p.id] = p;
    return p;
  };
  const a = mk({ id: 'a', name: 'A', maxParallel: 2, maxSessionsPerWindow: 0, minSpacingSeconds: 0 });
  const launcher = new FakeLauncher();
  const sm = new SessionManager(id => provs[id], launcher, undefined, clock);
  const req = (p: AgentProvider, n: number) => ({
    provider: p, model: 'm', role: 'worker' as const, ticketPath: path.join(tmp, `t${n}.md`),
    ticketId: `T${n}`, ticketTitle: `T${n}`, boardId: 'b', payload: {}
  });
  const s1 = await sm.request(req(a, 1));
  const s2 = await sm.request(req(a, 2));
  const s3 = await sm.request(req(a, 3));
  check(s1.status === 'running' && s2.status === 'running' && s3.status === 'queued', 'third session queues at maxParallel=2');
  check((await sm.request(req(a, 1))).id === s1.id, 'same ticket + provider is not started twice');
  now += 60_000;
  sm.ended(s1.id, 0);
  await new Promise(r => setTimeout(r, 5));
  check(sm.get(s3.id)!.status === 'running', 'queued session starts when a slot frees');

  const w = mk({ id: 'w', name: 'W', maxParallel: 10, maxSessionsPerWindow: 10, windowMinutes: 60, safetyMarginPct: 20, minSpacingSeconds: 0 });
  for (let i = 0; i < 8; i++) await sm.request(req(w, 100 + i));
  check(sm.canStart(w).ok === false && sm.canStart(w).state === 'throttled', '8 of 10 (20% margin) throttles the provider');
  const over = await sm.request({ ...req(w, 200), queueIfBusy: false });
  check(over.status === 'cancelled', 'queueIfBusy=false rejects instead of queueing');
  check(sm.usage(w).pct === 80, 'usage reports 80%');
  now += 61 * 60_000;
  check(sm.canStart(w).ok && sm.usage(w).startsInWindow === 0, 'window slides forward and capacity returns');

  const sp = mk({ id: 'sp', name: 'SP', maxParallel: 5, maxSessionsPerWindow: 0, minSpacingSeconds: 30 });
  await sm.request(req(sp, 300));
  check(sm.canStart(sp).state === 'throttled' && !!sm.canStart(sp).retryAt, 'minimum spacing between starts is enforced');
  now += 31_000;
  check(sm.canStart(sp).ok, 'spacing clears after the delay');

  const cd = mk({ id: 'cd', name: 'CD', maxParallel: 5, maxSessionsPerWindow: 0, minSpacingSeconds: 0 });
  const q = await sm.request(req(cd, 400));
  now += 3_000;
  sm.ended(q.id, 1);
  check(sm.canStart(cd).state === 'cooldown', 'quick non-zero exit puts the provider in cooldown');
  now += 6 * 60_000;
  check(sm.canStart(cd).ok, 'cooldown expires');

  const old = await sm.request(req(cd, 500));
  now += 181 * 60_000;
  await sm.tick();
  check(sm.get(old.id)!.status === 'finished', 'sessions that outlive the timeout are retired so slots never leak');
  const run = await sm.request(req(cd, 501));
  sm.cancel(run.id);
  check(launcher.killed.includes(run.id) && sm.get(run.id)!.status === 'cancelled', 'cancel kills the terminal');

  console.log('\n--- scheduler ---');
  check(priorityRank('P0 — Critical') < priorityRank('Normal') && priorityRank('P3') > priorityRank('Normal'), 'priority ranking');
  const now2 = 5_000_000_000;
  const sm2 = new SessionManager(id => provs2[id], new FakeLauncher(), undefined, () => now2);
  const provs2: Record<string, AgentProvider> = {};
  const p1 = { ...createProvider('claude-code', []), id: 'p1', name: 'Claude A', maxParallel: 1, minSpacingSeconds: 0, models: ['opus', 'sonnet'], defaultModel: 'sonnet', maxSessionsPerWindow: 0 } as AgentProvider;
  const p2 = { ...createProvider('gemini', []), id: 'p2', name: 'Gemini', maxParallel: 1, minSpacingSeconds: 0, maxSessionsPerWindow: 0 } as AgentProvider;
  provs2.p1 = p1; provs2.p2 = p2;
  const cands = [
    { ticket: mkTicket({ id: 'L', path: path.join(tmp, 'l.md'), priority: 'Low', mtime: 1 }), boardId: 'b', boardRoot: tmp },
    { ticket: mkTicket({ id: 'H', path: path.join(tmp, 'h.md'), priority: 'P0', mtime: 2, labels: ['model:opus'] }), boardId: 'b', boardRoot: tmp },
    { ticket: mkTicket({ id: 'D', path: path.join(tmp, 'd.md'), priority: 'P0', unresolvedDependencies: ['X'] }), boardId: 'b', boardRoot: tmp },
    { ticket: mkTicket({ id: 'N', path: path.join(tmp, 'n.md'), priority: 'P1', assignee: 'Björn' }), boardId: 'b', boardRoot: tmp },
    { ticket: mkTicket({ id: 'A', path: path.join(tmp, 'a.md'), priority: 'P2', assignee: 'Gemini' }), boardId: 'b', boardRoot: tmp }
  ];
  const plan = planWork(cands, [p1, p2], sm2, { now: now2 });
  const byId = Object.fromEntries(plan.map(d => [d.ticketId, d]));
  check(plan[0].ticketId === 'H', 'highest priority is planned first');
  check(!byId.D && !byId.N, 'tickets with open dependencies or a human assignee are skipped');
  check(byId.A.providerId === 'p2', 'explicit assignee is honoured');
  check(byId.H.model === 'opus' && modelFor(p1, cands[0].ticket) === 'sonnet', 'model:<name> label picks the model, default otherwise');
  const startsNow = plan.filter(d => d.startsNow);
  check(startsNow.filter(d => d.providerId === 'p1').length <= 1 && startsNow.filter(d => d.providerId === 'p2').length <= 1, 'plan never exceeds a provider\'s free parallel slots');
  check(plan.some(d => d.ticketId === 'L') === false || byId.L.startsNow === false, 'overflow work is marked as queued, not started');
  const rev = pickReviewer([{ ...p1, roles: ['worker', 'reviewer'] }, { ...p2, roles: ['worker', 'reviewer'] }], sm2, 'p1', now2);
  check(rev?.id === 'p2', 'reviewer prefers a different provider than the author');

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} fleet check(s) FAILED`);
    process.exit(1);
  }
  console.log('\n=== All fleet tests passed ===');
}

main().catch(e => { console.error(e); process.exit(1); });
