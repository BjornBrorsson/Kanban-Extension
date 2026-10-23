import * as fs from 'fs';
import * as os from 'os';
import * as http from 'http';
import * as path from 'path';
import { findExecutable, parseOllamaList, detectOllamaModels } from '../src/fleet/detect';
import { isInside, safeJoin, slugify } from '../src/pathUtils';
import { escapeForDoubleQuotes, detectShellKind } from '../src/shellEscape';
import { AgentRunner } from '../src/agentRunner';
import { TicketParser } from '../src/ticketParser';
import { Assignee, Ticket } from '../src/types';
import { ProviderRegistry, createProvider, providerToAssignee, sanitizeProvider, AgentProvider } from '../src/fleet/providers';
import { SessionLauncher, SessionManager, Session, JsonFleetStore } from '../src/fleet/sessions';
import { appendWorkLog, changedSince, formatWorkLogEntry, summarizeOutput } from '../src/fleet/outcome';
import { countPermissionDenials } from '../src/fleet/limits';
import { addCopilotTrustedFolder, removeCopilotTrustedFolder, copilotTrusts, isTrusted } from '../src/fleet/trust';
import { detectFatal, detectLimit, detectAttention, modelTier, requiredTier, pickFallback } from '../src/fleet/limits';
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

  console.log('\n--- auto-detect & ollama ---');
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'));
  const exeName = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  fs.writeFileSync(path.join(bin, exeName), process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');
  const fakeEnv = { PATH: '', PATHEXT: '.CMD;.EXE' } as NodeJS.ProcessEnv;
  check(findExecutable(['claude'], fakeEnv, [bin]) === path.join(bin, exeName), 'findExecutable finds a CLI in an extra install folder');
  check(findExecutable(['claude'], { ...fakeEnv, PATH: bin }, []) === path.join(bin, exeName), 'findExecutable finds a CLI on PATH');
  check(findExecutable(['definitely-not-installed-xyz'], fakeEnv, [bin]) === undefined, 'missing tools return undefined');
  check(JSON.stringify(parseOllamaList('NAME  ID  SIZE  MODIFIED\nllama3.2:3b  abc  2 GB  1 day ago\nqwen2.5-coder:7b  def  4 GB  2 days ago\n')) === '["llama3.2:3b","qwen2.5-coder:7b"]', 'parses `ollama list` output');

  const srv = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ models: [{ name: 'llama3.2:3b' }, { name: 'codestral:22b' }] }));
  });
  await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as any).port;
  const models = await detectOllamaModels(`127.0.0.1:${port}`);
  srv.close();
  check(models.length === 2 && models[0] === 'llama3.2:3b', 'detects models from the Ollama HTTP API');
  check((await detectOllamaModels('127.0.0.1:1', path.join(bin, 'nonexistent'))).length === 0, 'unreachable Ollama yields an empty list, not an error');

  const oreg = new ProviderRegistry(fs.mkdtempSync(path.join(os.tmpdir(), 'fleet-')));
  const addedP = oreg.addDetected([{ kind: 'ollama', path: path.join(bin, 'ollama.exe'), models: ['llama3.2:3b', 'codestral:22b'] }, { kind: 'claude-code', path: path.join(bin, exeName) }]);
  const oll = addedP.find(p => p.kind === 'ollama')!;
  check(addedP.length === 2 && oll.models.length === 2 && oll.defaultModel === 'llama3.2:3b' && oll.path!.includes('ollama'), 'addDetected creates providers with path and detected models');
  check(oreg.addDetected([{ kind: 'ollama', path: 'x' }]).length === 0, 'addDetected does not duplicate an existing kind');
  const keepPath = oreg.applyDetection(oll.id, { kind: 'ollama', path: 'other', models: ['phi4:14b'] })!;
  check(keepPath.path === oll.path && keepPath.defaultModel === 'phi4:14b', 'applyDetection keeps an existing path and fixes the default model');

  const ollCmd = AgentRunner.formatCliCommand(mkTicket({ title: 'Say hi' }), providerToAssignee({ ...oll, path: undefined }), os.tmpdir(), undefined, 'b', { shell: 'posix', model: 'llama3.2:3b', modelFlag: oll.modelFlag });
  check(ollCmd.startsWith('ollama run llama3.2:3b "'), 'ollama preset builds `ollama run <model> "<task>"`');
  const viaPath = AgentRunner.formatCliCommand(mkTicket(), providerToAssignee({ ...oll, path: 'C:/Tools/ollama.exe' }), os.tmpdir(), undefined, 'b', { shell: 'powershell', model: 'm' });
  check(viaPath.startsWith('& "C:/Tools/ollama.exe" run m'), 'a detected path replaces the bare tool name (PATH-independent)');
  const noSwap = AgentRunner.formatCliCommand(mkTicket(), { id: 'x', name: 'X', type: 'agent', agentConfig: { type: 'cli', command: 'othertool "{ticket_title}"', path: 'C:/Tools/ollama.exe' } }, os.tmpdir(), undefined, 'b', { shell: 'posix' });
  check(noSwap.startsWith('othertool '), 'path is only substituted when it matches the command\'s tool name');
  const sm3 = new SessionManager(() => undefined, new FakeLauncher(), undefined, () => 1);
  check(planWork([{ ticket: mkTicket({ path: path.join(tmp, 'o.md') }), boardId: 'b', boardRoot: tmp }], [oll], sm3, { now: 1 }).length === 0, 'autopilot never hands tickets to answer-only Ollama');

  console.log('\n--- recovery: persisted sessions survive a restart ---');
  const storeFile = path.join(tmp, 'fleet-usage.json');
  let t0 = 10_000_000;
  const rp: AgentProvider = { ...createProvider('claude-code', []), id: 'rp', name: 'RP', maxParallel: 3, maxSessionsPerWindow: 0, minSpacingSeconds: 0, models: ['opus', 'sonnet', 'haiku'], defaultModel: 'opus' } as AgentProvider;
  const rmap: Record<string, AgentProvider> = { rp };
  const smA = new SessionManager(id => rmap[id], new FakeLauncher(), new JsonFleetStore(storeFile), () => t0);
  const run1 = await smA.request({ provider: rp, model: 'opus', role: 'worker', ticketPath: path.join(tmp, 'r1.md'), ticketId: 'R1', ticketTitle: 'R1', boardId: 'b', payload: {}, agentSessionId: 'aaaaaaaa-1111-2222-3333-444444444444', hidden: true });
  const queuedOnly = await smA.request({ provider: { ...rp, maxParallel: 1 }, model: 'opus', role: 'worker', ticketPath: path.join(tmp, 'r2.md'), ticketId: 'R2', ticketTitle: 'R2', boardId: 'b', payload: {} });
  check(run1.status === 'running' && queuedOnly.status === 'queued', 'one session running, one queued before the "crash"');
  // simulate PC/editor dying: a brand-new manager reads the same store without any shutdown call
  t0 += 5 * 60_000;
  const smB = new SessionManager(id => rmap[id], new FakeLauncher(), new JsonFleetStore(storeFile), () => t0);
  const back = smB.get(run1.id)!;
  check(back.status === 'interrupted' && back.interruptKind === 'host-closed', 'a session that was running comes back as interrupted (host-closed)');
  check(back.agentSessionId === 'aaaaaaaa-1111-2222-3333-444444444444' && back.hidden === true, 'its agent conversation id and background flag survive');
  check(smB.get(queuedOnly.id)!.interruptKind === 'queued-lost', 'a queued session is kept as interrupted too');
  check(smB.resumable().length === 2 && smB.active().length === 0, 'both are resumable and nothing is falsely "running"');
  smB.markResumed(run1.id, 'new');
  check(smB.resumable().length === 1, 'once resumed, a session stops offering Resume');
  smB.dismiss(queuedOnly.id);
  check(smB.get(queuedOnly.id)!.status === 'finished' && smB.resumable().length === 0, 'Dismiss removes it from the recovery list');
  const fresh = await smB.request({ provider: rp, model: 'sonnet', role: 'worker', ticketPath: path.join(tmp, 'r3.md'), ticketId: 'R3', ticketTitle: 'R3', boardId: 'b', payload: {} });
  smB.ended(fresh.id, undefined, undefined, true);
  check(smB.get(fresh.id)!.status === 'interrupted' && smB.get(fresh.id)!.interruptKind === 'user-closed', 'a terminal closed without an exit code is "interrupted", never "finished"');
  const fresh2 = await smB.request({ provider: rp, model: 'sonnet', role: 'worker', ticketPath: path.join(tmp, 'r4.md'), ticketId: 'R4', ticketTitle: 'R4', boardId: 'b', payload: {} });
  smB.shutdown();
  check(smB.get(fresh2.id)!.interruptKind === 'host-closed', 'shutdown() marks live sessions host-closed');
  check(new SessionManager(id => rmap[id], new FakeLauncher(), new JsonFleetStore(storeFile), () => t0).get(fresh2.id)!.status === 'interrupted', 'shutdown state is persisted');

  console.log('\n--- usage limits: detection ---');
  const NOW = new Date(2026, 9, 23, 14, 0, 0).getTime();
  const esc27 = String.fromCharCode(27);
  const l1 = detectLimit('Claude AI usage limit reached|1760000000', ['opus'], NOW);
  check(!!l1 && l1.resetAt === 1760000000000, 'parses the epoch reset time Claude Code prints');
  const l2 = detectLimit("You've hit your limit for Opus - resets 7pm (Europe/Stockholm)", ['opus', 'sonnet'], NOW);
  check(!!l2 && l2.model === 'opus' && new Date(l2.resetAt!).getHours() === 19 && l2.resetAt! > NOW, 'parses "resets 7pm" to the next 19:00 and finds the model');
  const l3 = detectLimit('Error: rate limit exceeded, try again in 2 hours 30 minutes', [], NOW);
  check(!!l3 && l3.resetAt === NOW + 150 * 60_000, 'parses relative "in 2 hours 30 minutes"');
  const l4 = detectLimit('HTTP error 429 Too Many Requests', [], NOW);
  check(!!l4 && l4.resetAt === undefined, 'detects a limit with no reset time');
  const l5 = detectLimit(esc27 + '[31mQuota exceeded' + esc27 + '[0m for gemini-2.5-pro. Retry after 90s', ['gemini-2.5-pro'], NOW);
  check(!!l5 && l5.model === 'gemini-2.5-pro' && l5.resetAt === NOW + 90_000, 'strips ANSI colour codes and reads "retry after 90s"');
  check(detectLimit('Compiled 429 files, no rate problems at all, all good', [], NOW) === null, 'ordinary output (even containing 429) is not a limit');
  check(!!detectAttention('Do you want to proceed? (y/n)') && !!detectAttention('Press Enter to continue') && detectAttention('Reading src/index.ts') === undefined, 'detects prompts that need a human');

  console.log('\n--- fatal setup errors (need a human, never retry) ---');
  const trustErr = 'Error: Refusing to run in an untrusted workspace: C:\\Aptic\nStart `devin.exe` interactively in this directory to trust it, or set `respect_workspace_trust: false` in your config to restore the previous behavior.';
  const fa = detectFatal(trustErr);
  check(!!fa && fa.kind === 'workspace-trust' && /trust/i.test(fa.message), 'recognises Devin\'s "untrusted workspace" refusal');
  check(detectFatal('Please log in first: run devin auth login')?.kind === 'auth' && detectFatal('Error 401 Unauthorized')?.kind === 'auth', 'recognises a signed-out CLI');
  check(detectFatal("'agy' is not recognized as an internal or external command")?.kind === 'missing-cli', 'recognises a missing executable');
  check(detectFatal('Reading src/index.ts\nRunning tests... 12 passed') === null && detectFatal('I trusted the tests and signed the release notes') === null, 'ordinary output is not flagged');

  console.log('\n--- workspace trust ---');
  const trustHome = fs.mkdtempSync(path.join(os.tmpdir(), 'home-'));
  fs.mkdirSync(path.join(trustHome, '.copilot'));
  const cfgFile = path.join(trustHome, '.copilot', 'config.json');
  fs.writeFileSync(cfgFile, '// User settings belong in settings.json.\n// This file is managed automatically.\n{\n  "firstLaunchAt": "2026-08-21T12:55:20.970Z",\n  "trustedFolders": ["C:\\\\Aptic"],\n  "recentModelIds": ["kimi-k3"]\n}\n');
  const r1 = addCopilotTrustedFolder('C:\\Work\\Proj', trustHome);
  const txt = fs.readFileSync(cfgFile, 'utf8');
  check(r1.changed && txt.startsWith('// User settings belong in settings.json.\n// This file is managed automatically.\n'), 'Copilot config: the folder is added and the comment header is kept');
  const parsed = JSON.parse(txt.split('\n').filter(l => !l.startsWith('//')).join('\n'));
  check(parsed.trustedFolders.length === 2 && parsed.recentModelIds[0] === 'kimi-k3' && parsed.firstLaunchAt === '2026-08-21T12:55:20.970Z', 'other settings are untouched');
  check(addCopilotTrustedFolder('c:\\work\\proj', trustHome).changed === false && copilotTrusts('C:\\WORK\\PROJ', trustHome), 'adding again (any letter case) changes nothing');
  check(removeCopilotTrustedFolder('C:\\Work\\Proj', trustHome).changed && !copilotTrusts('C:\\Work\\Proj', trustHome) && copilotTrusts('C:\\Aptic', trustHome), 'removing only removes that folder');
  fs.writeFileSync(cfgFile, '{ not json');
  let threw = false;
  try { addCopilotTrustedFolder('C:\\x', trustHome); } catch { threw = true; }
  check(threw && fs.readFileSync(cfgFile, 'utf8') === '{ not json', 'an unreadable config is never overwritten');
  fs.rmSync(trustHome, { recursive: true, force: true });

  check(isTrusted(['C:\\Aptic'], 'C:\\Aptic\\sub\\dir') && isTrusted(['c:\\aptic'], 'C:\\APTIC') && !isTrusted(['C:\\Aptic'], 'C:\\Aptic2'), 'trust covers the folder and its subfolders, not look-alike siblings');
  const devinAssignee: Assignee = { id: 'devin', name: 'Devin', type: 'agent', agentConfig: { type: 'cli', command: 'devin {model_args} -p "{task}"', workingDir: 'C:\\Aptic' } };
  const trustedCmd = (await AgentRunner.prepareLaunch(mkTicket(), devinAssignee, 'C:\\Aptic\\Tickets', undefined, { trustedRoots: ['C:\\Aptic'], trustFlag: '--respect-workspace-trust false', model: 'swe-2-high', modelFlag: '--model' }))!;
  check(trustedCmd.command.endsWith('--respect-workspace-trust false') && trustedCmd.command.includes('--model swe-2-high'), 'Devin sessions in a trusted workspace get --respect-workspace-trust false');
  const untrustedCmd = (await AgentRunner.prepareLaunch(mkTicket(), devinAssignee, 'C:\\Aptic\\Tickets', undefined, { trustedRoots: ['D:\\Other'], trustFlag: '--respect-workspace-trust false' }))!;
  check(!untrustedCmd.command.includes('respect-workspace-trust'), 'no flag in a workspace that was not marked trusted');
  const evilFlag = (await AgentRunner.prepareLaunch(mkTicket(), devinAssignee, 'C:\\Aptic\\Tickets', undefined, { trustedRoots: ['C:\\Aptic'], trustFlag: '--x; rm -rf ~' }))!;
  check(!evilFlag.command.includes('rm -rf'), 'a malformed trust flag is never put on the command line');

  console.log('\n--- unattended permissions, outcomes and Work Log ---');
  check(countPermissionDenials('x\nPermission denied because no interactive user response was available.\n...\nPermission denied because no interactive user response was available.') === 2 && countPermissionDenials('all good') === 0, 'counts "no one to approve" denials');
  const permCmd = AgentRunner.formatCliCommand(mkTicket(), { id: 'd', name: 'D', type: 'agent', agentConfig: { type: 'cli', command: 'devin -p "{task}"' } }, os.tmpdir(), undefined, 'b', { shell: 'posix', permissionMode: 'smart', permissionFlag: '--permission-mode' });
  check(permCmd.endsWith('--permission-mode smart'), 'the provider permission mode becomes --permission-mode smart');
  check(!AgentRunner.formatCliCommand(mkTicket(), { id: 'd', name: 'D', type: 'agent', agentConfig: { type: 'cli', command: 'devin -p "x"' } }, os.tmpdir(), undefined, 'b', { shell: 'posix', permissionMode: 'smart; rm -rf ~', permissionFlag: '--permission-mode' }).includes('rm -rf'), 'permission mode values are validated before reaching a shell');
  check(sanitizeProvider({ kind: 'devin', permissionMode: 'smart' }).permissionMode === 'smart' && sanitizeProvider({ kind: 'devin', permissionMode: 'x;y' }).permissionMode === '', 'provider permission mode is sanitised');
  check(sanitizeProvider({ kind: 'devin' }).permissionFlag === '--permission-mode', 'the Devin preset knows its permission flag');

  const out = ['─────', 'Reading ticket ATF-180', 'Running generator...', '', 'Done. Added 3 regression tests, all passing. See Dev/tests/export_v8.py', '─────'].join('\n');
  const sum = summarizeOutput(out);
  check(sum.endsWith('See Dev/tests/export_v8.py') && !sum.includes('─'), 'the summary is the agent\'s closing lines without decoration');
  check(summarizeOutput('x'.repeat(5000)).length <= 700 && summarizeOutput('') === '', 'summaries are capped; empty output gives an empty summary');
  check(JSON.stringify(changedSince(new Set(['M a.cs']), new Set(['M a.cs', 'M b.cs', '?? c.cs']))) === '["b.cs","c.cs"]', 'files touched = new/changed git status lines');

  const wlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-'));
  const entry = formatWorkLogEntry({ at: new Date(2026, 9, 23, 14, 5), provider: 'Devin', model: 'nemotron-3-ultra-high', role: 'worker', status: 'finished', minutes: 1.7, summary: 'Added 3 tests.', files: ['a.py', 'b.py'], logFile: '.agentic-kanban/runtime/sessions/s1.log' });
  check(entry[0].startsWith('- **2026-10-23 14:05**: [Orchestrator] Devin') && entry.some(l => /Result: Added 3 tests/.test(l)) && entry.some(l => /Files touched.*a\.py, b\.py/.test(l)), 'Work Log entry has time, who, result and files');
  const t1 = path.join(wlDir, 't1.md');
  fs.writeFileSync(t1, '# T\n\n| Field | Value |\n|---|---|\n| **Status** | Ongoing |\n\n## Work Log\n- **2026-10-22**: Created.\n\n## Notes\nkeep me\n');
  check(appendWorkLog(t1, entry) === true, 'appends to an existing Work Log');
  const t1txt = fs.readFileSync(t1, 'utf8');
  check(t1txt.includes('- **2026-10-22**: Created.\n- **2026-10-23 14:05**') && t1txt.indexOf('## Notes') > t1txt.indexOf('Added 3 tests') && t1txt.includes('keep me'), 'the entry lands at the end of the Work Log section; earlier lines and later sections are untouched');
  const t2 = path.join(wlDir, 't2.md');
  fs.writeFileSync(t2, '# T\r\n\r\nBody\r\n');
  appendWorkLog(t2, entry);
  const t2txt = fs.readFileSync(t2, 'utf8');
  check(t2txt.includes('## Work Log') && /\r\n- \*\*2026-10-23/.test(t2txt) && !/[^\r]\n/.test(t2txt), 'a missing Work Log section is created, and CRLF endings are kept');
  check(appendWorkLog(path.join(wlDir, 'nope.md'), entry) === false, 'a missing ticket file is reported, not created');
  fs.rmSync(wlDir, { recursive: true, force: true });

  console.log('\n--- usage limits: block, fallback, wait ---');
  const fclock = () => t0;
  const claude: AgentProvider = { ...createProvider('claude-code', []), id: 'cc', name: 'Claude', maxParallel: 2, maxSessionsPerWindow: 0, minSpacingSeconds: 0, models: ['opus', 'sonnet', 'haiku'], defaultModel: 'opus' } as AgentProvider;
  const gem: AgentProvider = { ...createProvider('gemini', [{ id: 'cc' } as any]), id: 'gm', name: 'Gemini', maxParallel: 2, maxSessionsPerWindow: 0, minSpacingSeconds: 0, models: ['gemini-2.5-pro', 'gemini-2.5-flash'], defaultModel: 'gemini-2.5-pro' } as AgentProvider;
  const olla: AgentProvider = { ...createProvider('ollama', []), id: 'ol', name: 'Ollama', models: ['llama3.2:3b'], defaultModel: 'llama3.2:3b' } as AgentProvider;
  const pm: Record<string, AgentProvider> = { cc: claude, gm: gem, ol: olla };
  const sm5 = new SessionManager(id => pm[id], new FakeLauncher(), undefined, fclock);
  const lim = await sm5.request({ provider: claude, model: 'opus', role: 'worker', ticketPath: path.join(tmp, 'l1.md'), ticketId: 'L1', ticketTitle: 'L1', boardId: 'b', payload: {} });
  const resetAt = t0 + 90 * 60_000;
  sm5.limitHit(lim.id, { model: 'opus', resetAt });
  check(sm5.get(lim.id)!.status === 'interrupted' && sm5.get(lim.id)!.interruptKind === 'usage-limit' && sm5.get(lim.id)!.resumeAfter === resetAt, 'limitHit interrupts the session and records the reset time');
  check(!!sm5.modelBlock('cc', 'opus') && !sm5.modelBlock('cc', 'sonnet'), 'only the limited model is blocked');
  check(sm5.usage(claude).blockedModels.length === 1, 'usage lists the blocked model');
  check(sm5.canStart(claude).ok, 'the provider itself stays usable through its other models');

  check(modelTier(claude, 'opus') === 5 && modelTier(claude, 'sonnet') === 4 && modelTier(claude, 'haiku') === 2, 'tier heuristics: opus 5, sonnet 4, haiku 2');
  check(modelTier(olla, 'llama3.2:3b') === 1 && modelTier(olla, 'qwen2.5-coder:32b') === 3, 'tier heuristics use parameter count for local models');
  check(modelTier({ ...claude, modelTiers: 'haiku=3' } as AgentProvider, 'haiku') === 3, 'per-provider tier overrides win');
  const hard = mkTicket({ priority: 'P0', type: 'Architecture' });
  const easy = mkTicket({ priority: 'Low' });
  check(requiredTier(hard) === 4 && requiredTier(easy) === 2, 'critical/architecture tickets need tier 4, easy ones tier 2');

  const fbEasy = pickFallback([claude, gem, olla], sm5, { providerId: 'cc', model: 'opus', role: 'worker' }, easy, t0)!;
  check(fbEasy.provider.id === 'cc' && fbEasy.model === 'haiku', 'easy ticket: the weakest capable model (haiku) takes over, saving stronger ones');
  const fbHard = pickFallback([claude, gem, olla], sm5, { providerId: 'cc', model: 'opus', role: 'worker' }, hard, t0)!;
  check(fbHard.tier >= 4 && fbHard.model === 'sonnet', 'hard ticket: sonnet (tier 4) is capable enough and takes over');
  sm5.blockModel('cc', 'sonnet', resetAt);
  const fbHard2 = pickFallback([claude, gem, olla], sm5, { providerId: 'cc', model: 'opus', role: 'worker' }, hard, t0)!;
  check(fbHard2.provider.id === 'gm' && fbHard2.model === 'gemini-2.5-pro', 'with sonnet also limited, another provider takes over');
  sm5.blockModel('gm', 'gemini-2.5-pro', resetAt);
  check(pickFallback([claude, gem, olla], sm5, { providerId: 'cc', model: 'opus', role: 'worker' }, hard, t0) === null, 'no capable model left: no fallback (small local models never qualify)');
  check(pickFallback([claude, gem], new SessionManager(id => pm[id], new FakeLauncher(), undefined, fclock), { providerId: 'cc', model: 'haiku', role: 'worker' }, hard, t0)!.tier >= 2, 'a weak origin model only needs an equal-tier replacement');

  sm5.blockModel('cc', 'haiku', resetAt);
  check(sm5.canStart(claude).state === 'throttled' && sm5.canStart(claude).retryAt === resetAt, 'when every model is limited the provider reports throttled with the reset time');
  t0 = resetAt + 1000;
  check(sm5.canStart(claude).ok && sm5.blockedModels('cc').length === 0, 'blocks expire at the reset time');
  const unk = sm5.blockModel('gm', 'gemini-2.5-flash');
  check(unk.unknown === true && unk.until === t0 + 30 * 60_000, 'an unknown reset is assumed ~30 min and re-probed');
  const planModel = planWork([{ ticket: mkTicket({ path: path.join(tmp, 'pm.md') }), boardId: 'b', boardRoot: tmp }], [claude], (() => { const m = new SessionManager(id => pm[id], new FakeLauncher(), undefined, fclock); m.blockModel('cc', 'opus', t0 + 60_000); return m; })(), { now: t0 });
  check(planModel.length === 1 && planModel[0].model !== 'opus', 'the planner avoids a model that is at its limit');

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} fleet check(s) FAILED`);
    process.exit(1);
  }
  console.log('\n=== All fleet tests passed ===');
}

main().catch(e => { console.error(e); process.exit(1); });
