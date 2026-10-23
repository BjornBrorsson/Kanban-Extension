import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Ticket } from '../src/types';
import { CatalogIndex, CatalogStore, RawFile, curate, listProviderModels, parseCopilotPolicy, parseImportedList, fusionCombos, parseAgyModels, parseDevinModels, parseGenericModels, parseModelId, providerPatches } from '../src/fleet/catalog';
import { createProvider, AgentProvider } from '../src/fleet/providers';
import { SessionLauncher, SessionManager, Session, FleetData } from '../src/fleet/sessions';
import { SpeedBook } from '../src/fleet/speed';
import { estimateCost, periodEnd, periodStart, ticketPoints } from '../src/fleet/cost';
import { rankOptions, quotaPressure, estimateRun } from '../src/fleet/optimizer';
import { supportedLevels, pickReasoning, resolveReasoning } from '../src/fleet/reasoning';
import { AgentRunner } from '../src/agentRunner';
const order5 = (l: string) => ['low', 'medium', 'high', 'xhigh', 'max'].indexOf(l);
import { planWork } from '../src/fleet/scheduler';

let failures = 0;
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error('  ✘ ' + msg); } else { console.log('  ✔ ' + msg); }
}

const FIX = path.join(__dirname, '..', 'test', 'fixtures', 'models');
const read = (f: string) => fs.readFileSync(path.join(FIX, f), 'utf8');

class NullLauncher implements SessionLauncher {
  async launch(_s: Session) { return true; }
  show() {}
  kill() {}
}

function mkTicket(over: Partial<Ticket> = {}): Ticket {
  return {
    id: 'T-1', filename: 't-1.md', path: path.join(os.tmpdir(), 'catalog-t1.md'), relativePath: 't-1.md', column: 'Backlog', subfolder: 'Ready',
    title: 'Do it', summary: '', description: '', status: 'Backlog', priority: 'Normal', epic: null, type: null, estimate: 'M', milestone: null,
    assignee: null, dependsOn: [], blocks: [], labels: [], acceptanceCriteria: [], progress: { done: 0, total: 0 }, mtime: 1, hasWorkLog: false, ...over
  };
}

function storeWith(data: Partial<FleetData>) {
  return { load: (): FleetData => ({ starts: {}, sessions: [], blocks: {}, spend: [], ...data }), save: (_d: FleetData) => {} };
}

async function main() {
  console.log('\n--- parsing real provider output ---');
  const devin = parseDevinModels(read('devin.txt'));
  check(devin.length > 500, `parses every model line of "devin models list" (${devin.length})`);
  const swe = devin.find(m => m.id === 'swe-2-high')!;
  check(swe.pricing?.free === true && (swe.contextTokens || 0) >= 262000, 'reads context size and "Free"');
  const opus = devin.find(m => m.id === 'claude-opus-5-5-medium')!;
  check(opus.family === 'claude-opus-5.5' && opus.pricing?.inPerM === 4 && opus.pricing?.cachedPerM === 0.2 && opus.pricing?.outPerM === 20, 'reads family and $/1M input, cached, output');
  check(opus.aliases?.includes('opus') === true, 'reads family aliases');
  const agy = parseAgyModels(read('agy.txt'));
  check(agy.length === 13 && agy[0].id === 'gemini-4-argon-medium' && agy[0].label === 'Gemini 4 Argon (Medium)', 'parses "agy models" (tab separated)');
  check(parseGenericModels('NAME  SIZE\nllama3\nmistral:7b  4GB\n').map(m => m.id).join() === 'llama3,mistral:7b', 'generic parser takes the first token of each line');

  console.log('\n--- id parsing ---');
  const a = parseModelId('claude-sonnet-5-5-high');
  check(a.family === 'claude-sonnet' && a.version === 5.5 && a.effort === 'high', 'claude-sonnet-5-5-high -> claude-sonnet, 5.5, high');
  const b = parseModelId('gemini-3.8-flash-medium');
  check(b.family === 'gemini-flash' && b.version === 3.8, 'gemini-3.8-flash -> gemini-flash 3.8');
  const c = parseModelId('gpt-6-sol-high-priority');
  check(c.family === 'gpt-sol' && c.version === 6 && c.speed === 'priority' && c.effort === 'high', 'gpt-6-sol-high-priority -> speed + effort split off');
  check(parseModelId('gemma4:e4b').sizeB === 4 && parseModelId('gemma4:e4b').family === 'gemma', 'gemma4:e4b -> gemma, 4B');
  check(parseModelId('nomic-embed-text:latest').embedding === true, 'embedding models are recognised');

  console.log('\n--- curation: categories, prices, hiding superseded models ---');
  const rawDevin: RawFile = { providerId: 'devin', providerName: 'Devin', kind: 'devin', fetchedAt: 1, source: 'command', command: 'devin models list', ok: true, models: devin };
  const rawAgy: RawFile = { providerId: 'agy', providerName: 'Antigravity', kind: 'antigravity', fetchedAt: 1, source: 'command', command: 'agy models', ok: true, models: agy };
  const rawOllama: RawFile = {
    providerId: 'ol', providerName: 'Ollama', kind: 'ollama', fetchedAt: 1, source: 'api', command: 'api', ok: true,
    models: [{ id: 'gemma4:12b', local: true, sizeB: 12 }, { id: 'gemma4:e4b', local: true, sizeB: 4 }, { id: 'gemma2:2b', local: true, sizeB: 2 }, { id: 'nomic-embed-text:latest', local: true }]
  };
  const cat = curate([rawDevin, rawAgy, rawOllama], { keepVersionsPerFamily: 2, now: 5 });
  const dev = cat.models.filter(m => m.providerId === 'devin');
  const visOpus = dev.filter(m => m.family === 'claude-opus' && !m.hidden).map(m => m.version).sort();
  check(visOpus.join() === '5,5.5', 'claude-opus: only the newest two versions (5.5 and 5) stay visible');
  const hidOpus = dev.filter(m => m.family === 'claude-opus' && m.hidden);
  check(hidOpus.length >= 3 && hidOpus.every(m => /superseded/.test(m.hiddenReason || '')), 'older claude-opus versions are hidden with a reason');
  check(dev.filter(m => m.family === 'claude-sonnet' && !m.hidden).length === 2 && dev.some(m => m.family === 'claude-sonnet' && m.hidden), 'claude-sonnet: 5.5 and 5 visible, 4.6 hidden');
  check(dev.filter(m => m.family === 'gemini-flash' && !m.hidden).map(m => m.version).sort().join() === '3.7,3.8', 'gemini-flash: 3.8 and 3.7 visible');
  const o55 = dev.find(m => m.family === 'claude-opus' && m.version === 5.5)!;
  check(o55.id === 'claude-opus-5-5-medium' && Object.keys(o55.effortVariants).length >= 5 && o55.speedVariants.length >= 3, 'effort and fast variants collapse into one entry represented by the medium variant');
  check(o55.tier === 5 && o55.category === 'frontier' && o55.pricing?.outPerM === 20 && o55.pricing?.source === 'listed', 'opus is frontier with its listed price');
  const sweFree = dev.find(m => m.family === 'swe' && m.version === 2)!;
  check(sweFree.category === 'free' && sweFree.pricing?.free === true, 'free hosted models are categorised "free"');
  check(dev.filter(m => m.family === 'fusion').length === 1, 'hundreds of fusion combo ids collapse into one entry');
  check(dev.filter(m => !m.hidden).length < 45, `the visible list is short (${dev.filter(m => !m.hidden).length} of ${dev.length} entries)`);
  const ol = cat.models.filter(m => m.providerId === 'ol');
  check(ol.find(m => m.id === 'gemma4:12b')!.category === 'local' && ol.find(m => m.id === 'nomic-embed-text:latest')!.hidden, 'local models are "local"; embeddings are hidden');
  check(!ol.find(m => m.id === 'gemma2:2b')!.hidden, 'with keep=2 both gemma generations (4 and 2) stay visible');
  const agySonnet = cat.models.find(m => m.providerId === 'agy' && m.id === 'claude-sonnet-5-5-medium')!;
  check(agySonnet.pricing?.source === 'reference' && agySonnet.pricing?.outPerM === 10, 'a provider without prices borrows the listed price of the same model elsewhere');
  const agyFlash = cat.models.find(m => m.providerId === 'agy' && m.family === 'gemini-flash')!;
  check(agyFlash.tier === 2 && agyFlash.category === 'fast', 'flash models are the fast category');
  const keep1 = curate([rawDevin], { keepVersionsPerFamily: 1 });
  check(keep1.models.filter(m => m.family === 'claude-opus' && !m.hidden).length === 1, 'keep=1 leaves only the newest version');

  console.log('\n--- script files on disk ---');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-'));
  const store = new CatalogStore(tmp);
  store.saveRaw(rawDevin);
  store.saveRaw(rawOllama);
  fs.mkdirSync(path.dirname(store.overridesPath), { recursive: true });
  fs.writeFileSync(store.overridesPath, JSON.stringify({ 'ol::*': { outPerM: 0.5, inPerM: 0.1 } }));
  const saved = store.curateSaved(2);
  check(fs.existsSync(store.catalogPath) && saved.models.length > 20, 'curate reads the saved raw files and writes catalog.json');
  const ovr = saved.models.find(m => m.providerId === 'ol' && m.id === 'gemma4:12b')!;
  check(ovr.pricing?.source === 'override' && ovr.pricing?.outPerM === 0.5, 'pricing.overrides.json overrides listed/estimated prices');
  const patches = providerPatches([{ ...createProvider('devin', []), id: 'devin' } as AgentProvider], saved);
  check(patches.length === 1 && patches[0].models.length > 5 && patches[0].models.length <= 60 && patches[0].modelTiers.includes('claude-opus-5-5-medium=5'), 'catalog -> provider model list and tier hints');
  check(patches[0].defaultModel !== '' && patches[0].models.includes(patches[0].defaultModel), 'a valid default model is chosen');

  console.log('\n--- cost & budgets ---');
  check(ticketPoints(mkTicket({ estimate: 'S' })) === 1 && ticketPoints(mkTicket({ estimate: 'L (4-5 days)' })) === 8 && ticketPoints(mkTicket({ estimate: 'M (2-3 days)' })) === 3, 'ticket estimates map to points');
  check(estimateCost({ free: true, source: 'listed' }, 3) === 0, 'free models cost nothing');
  const sonnetCost = estimateCost({ inPerM: 3, cachedPerM: 0.3, outPerM: 15, source: 'listed' }, 3);
  check(sonnetCost > 0.3 && sonnetCost < 1, `a medium ticket on a $3/$15 model costs roughly $0.5 (${sonnetCost.toFixed(2)})`);
  const NOW = new Date(2026, 9, 23, 14, 0, 0).getTime(); // Friday
  check(new Date(periodStart('week', NOW)).getDay() === 1 && new Date(periodEnd('week', NOW)).getDate() === 26, 'weeks run Monday to Monday');
  check(new Date(periodStart('month', NOW)).getDate() === 1 && new Date(periodEnd('month', NOW)).getMonth() === 10, 'months run 1st to 1st');

  const budgetP: AgentProvider = { ...createProvider('claude-code', []), id: 'bp', name: 'BP', maxParallel: 5, maxSessionsPerWindow: 0, minSpacingSeconds: 0, budgetDaily: 1, budgetWeekly: 5, budgetMonthly: 12, safetyMarginPct: 0 } as AgentProvider;
  const todayAt = new Date(2026, 9, 23, 9, 0, 0).getTime();
  const mBud = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [{ providerId: 'bp', model: 'x', cost: 0.9, at: todayAt }] }), () => NOW);
  check(mBud.canStart(budgetP, NOW, 0.05).ok, 'a run that fits under the daily cap is allowed');
  const over = mBud.canStart(budgetP, NOW, 0.2);
  check(!over.ok && /Daily budget/.test(over.reason || '') && over.retryAt === periodEnd('day', NOW), 'a run that would cross the daily cap waits until tomorrow');
  const mWeek = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [
    { providerId: 'bp', model: 'x', cost: 2.5, at: new Date(2026, 9, 20, 10).getTime() }, { providerId: 'bp', model: 'x', cost: 2.4, at: new Date(2026, 9, 21, 10).getTime() }] }), () => NOW);
  const wk = mWeek.canStart(budgetP, NOW, 0.3);
  check(!wk.ok && /Weekly budget/.test(wk.reason || '') && wk.retryAt === periodEnd('week', NOW), 'weekly cap blocks even when today is empty');
  const mMonth = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [{ providerId: 'bp', model: 'x', cost: 11.9, at: new Date(2026, 9, 2, 10).getTime() }] }), () => NOW);
  check(!mMonth.canStart(budgetP, NOW, 0.3).ok && /Monthly/.test(mMonth.canStart(budgetP, NOW, 0.3).reason || ''), 'monthly cap blocks too');
  const mOk = new SessionManager(() => budgetP, new NullLauncher(), storeWith({ spend: [{ providerId: 'bp', model: 'x', cost: 50, at: new Date(2026, 8, 1).getTime() }] }), () => NOW);
  check(mOk.canStart(budgetP, NOW, 0.3).ok, 'spend from earlier periods does not count');
  const started = await mBud.request({ provider: budgetP, model: 'm', role: 'worker', ticketPath: path.join(tmp, 'x.md'), ticketId: 'X', ticketTitle: 'X', boardId: 'b', payload: {}, estCost: 0.05, points: 3 });
  check(started.status === 'running' && Math.abs(mBud.spentSince('bp', periodStart('day', NOW)) - 0.95) < 1e-9, 'starting a session records its estimated cost in the ledger');
  check(mBud.usage(budgetP).spend.day > 0.9 && mBud.usage(budgetP).budget.week === 5, 'usage reports spend and caps per day / week / month');

  console.log('\n--- speed learning ---');
  const book = new SpeedBook();
  check(book.predict('p', 'm', 3, 30) === 30, 'with no history the prior is used');
  book.record('p', 'm', 3, 6);
  const afterOne = book.predict('p', 'm', 3, 30);
  check(afterOne < 30 && afterOne > 6, 'one measurement shifts the estimate toward reality');
  book.record('p', 'm', 3, 6); book.record('p', 'm', 3, 6);
  check(Math.abs(book.predict('p', 'm', 3, 30) - 6) < 0.5, 'three measurements make the measurement dominant');

  console.log('\n--- optimizer: the time / cost / quota trade-off ---');
  const clockNow = NOW;
  const gem: AgentProvider = { ...createProvider('antigravity', []), id: 'gm', name: 'Antigravity CLI', agentic: true, maxParallel: 3, minSpacingSeconds: 0, safetyMarginPct: 0,
    models: ['gemini-3.8-flash-medium'], defaultModel: 'gemini-3.8-flash-medium', maxSessionsPerWindow: 40, windowMinutes: 300 } as AgentProvider;
  const loc: AgentProvider = { ...createProvider('ollama-aider', []), id: 'ol', name: 'Aider + Ollama', agentic: true, maxParallel: 1, minSpacingSeconds: 0,
    models: ['qwen2.5-coder:14b'], defaultModel: 'qwen2.5-coder:14b', maxSessionsPerWindow: 0 } as AgentProvider;
  const raws: RawFile[] = [
    { providerId: 'gm', providerName: 'g', kind: 'antigravity', fetchedAt: 1, source: 'command', command: '', ok: true, models: [{ id: 'gemini-3.8-flash-medium', pricing: { inPerM: 0.75, cachedPerM: 0.075, outPerM: 3.75, source: 'listed' } }] },
    { providerId: 'ol', providerName: 'o', kind: 'ollama-aider', fetchedAt: 1, source: 'api', command: '', ok: true, models: [{ id: 'qwen2.5-coder:14b', local: true, sizeB: 14, pricing: { free: true, source: 'listed' } }] }
  ];
  const index = new CatalogIndex(curate(raws));
  const ticket = mkTicket({ estimate: 'M' });

  // Scenario A: Ollama needs ~45 min, Gemini Flash ~7; Gemini has plenty of quota and it resets in 15 minutes.
  const startsA = Array.from({ length: 20 }, (_, i) => clockNow - 285 * 60_000 + i * 60_000);
  const smA = new SessionManager(id => (id === 'gm' ? gem : loc), new NullLauncher(), storeWith({ starts: { gm: startsA } }), () => clockNow);
  const ctxA = { catalog: index, speed: new SpeedBook(), bench: { 'ol::qwen2.5-coder:14b': { tps: 9.6 } }, now: clockNow };
  const rankA = rankOptions(ticket, [gem, loc], smA, ctxA);
  const oll = rankA.find(o => o.provider.id === 'ol')!;
  check(Math.abs(oll.estMinutes - 45) <= 3, `Ollama is predicted at ~45 min (${Math.round(oll.estMinutes)})`);
  check(rankA[0].provider.id === 'gm', `quota resets in 15 min: the fast hosted model wins (${rankA[0].summary})`);

  // Scenario B: Ollama ~15 min, Gemini ~7; Gemini is 80% used on a weekly window with 2 days until reset.
  const gemWeek: AgentProvider = { ...gem, windowMinutes: 7 * 24 * 60, maxSessionsPerWindow: 40 };
  const startsB = Array.from({ length: 32 }, (_, i) => clockNow - 5 * 24 * 3600_000 + i * 3600_000);
  const smB = new SessionManager(id => (id === 'gm' ? gemWeek : loc), new NullLauncher(), storeWith({ starts: { gm: startsB } }), () => clockNow);
  const ctxB = { catalog: index, speed: new SpeedBook(), bench: { 'ol::qwen2.5-coder:14b': { tps: 40 } }, now: clockNow };
  const rankB = rankOptions(ticket, [gemWeek, loc], smB, ctxB);
  const pressure = quotaPressure(gemWeek, smB, clockNow);
  check(pressure.lambdaCount > 1.5, `scarce quota is priced in (lambda ${pressure.lambdaCount.toFixed(2)})`);
  check(rankB[0].provider.id === 'ol', `80% used, reset in 2 days: the slower local model wins (${rankB[0].summary})`);

  // Objective changes the answer: "speed" pays for the fast model even when quota is scarce.
  const fast = rankOptions(ticket, [gemWeek, loc], smB, { ...ctxB, objective: 'speed' });
  check(fast[0].provider.id === 'gm', 'the "speed" objective prefers the fast model');
  const cheap = rankOptions(ticket, [gem, loc], smA, { ...ctxA, objective: 'cost' });
  check(cheap.length === 2, 'both options are ranked under the "cost" objective');

  // A provider that is at capacity: waiting time is added.
  const smBusy = new SessionManager(id => (id === 'gm' ? gem : loc), new NullLauncher(), storeWith({ starts: { gm: startsA } }), () => clockNow);
  await smBusy.request({ provider: loc, model: 'qwen2.5-coder:14b', role: 'worker', ticketPath: path.join(tmp, 'busy.md'), ticketId: 'B', ticketTitle: 'B', boardId: 'b', payload: {} });
  const rankBusy = rankOptions(ticket, [gem, loc], smBusy, ctxA);
  check(rankBusy.find(o => o.provider.id === 'ol')!.waitMinutes > 0 && !rankBusy.find(o => o.provider.id === 'ol')!.startsNow, 'a busy provider is charged for the wait');

  // Capability gate: a hard ticket cannot go to a tier-2 flash model.
  const hard = mkTicket({ priority: 'P0', type: 'Architecture' });
  const rankHard = rankOptions(hard, [gem, loc], smA, ctxA);
  check(!rankHard.some(o => o.provider.id === 'gm'), 'tickets that need a strong model never go to a weak one, however cheap');

  // Budget caps steer the choice: gemini daily cap spent -> local takes it.
  const gemCapped: AgentProvider = { ...gem, budgetDaily: 0.05 };
  const smCap = new SessionManager(id => (id === 'gm' ? gemCapped : loc), new NullLauncher(), storeWith({ starts: { gm: startsA }, spend: [{ providerId: 'gm', model: 'x', cost: 0.05, at: todayAt }] }), () => clockNow);
  const rankCap = rankOptions(ticket, [gemCapped, loc], smCap, ctxA);
  check(rankCap[0].provider.id === 'ol' || rankCap.find(o => o.provider.id === 'gm')!.waitMinutes > 60, 'a provider that hit its daily budget cap is deprioritised (it would wait until tomorrow)');

  // planWork uses the optimizer and reports estimates + alternatives.
  const plan = planWork([{ ticket, boardId: 'b', boardRoot: tmp }], [gem, loc], smA, { now: clockNow, optimizer: ctxA });
  check(plan.length === 1 && plan[0].providerId === 'gm' && !!plan[0].estMinutes && plan[0].alternatives!.length === 1, 'the planner picks by optimizer and lists the runner-up with its estimates');

  console.log('\n--- Copilot model-policy import ---');
  const cop = parseCopilotPolicy(read('copilot.txt'));
  check(cop.length === 26, `parses every model in the pasted policy list (${cop.length})`);
  check(cop.filter(m => m.enabled).length === 11, `knows which are enabled (${cop.filter(m => m.enabled).length})`);
  const ids = cop.map(m => m.id);
  check(ids.includes('claude-sonnet-5.5') && ids.includes('gpt-5.6-luna') && ids.includes('gemini-3.8-flash') && ids.includes('kimi-k3') && ids.includes('mai-code-1.1-flash'), 'display names become CLI-style ids');
  check(ids.includes('claude-opus-4.8-fast') && ids.includes('gpt-5-mini') && ids.includes('grok-code-fast-1'), 'fast-mode, mini and multi-word names are slugged sensibly');
  const copRaw: RawFile = { providerId: 'cp', providerName: 'Copilot', kind: 'copilot-cli', fetchedAt: 1, source: 'import', command: 'imports/cp.txt', ok: true, models: cop };
  const copCat = curate([copRaw], { keepVersionsPerFamily: 2 });
  const usable = copCat.models.filter(m => !m.hidden);
  check(copCat.models.filter(m => m.hidden && /disabled/.test(m.hiddenReason || '')).length >= 12, 'disabled models are hidden with the reason "disabled in your account / policy settings"');
  check(usable.every(m => cop.find(r => r.id === m.id)?.enabled === true), 'only models enabled on your account stay visible');
  check(usable.some(m => m.id === 'claude-opus-4.8') && !usable.some(m => m.id === 'claude-opus-5.5'), 'a disabled newer model (Opus 5.5) does not hide the enabled older one (Opus 4.8)');
  check(usable.some(m => m.id === 'claude-sonnet-5.5') && usable.some(m => m.id === 'claude-sonnet-5'), 'enabled Sonnet 5.5 and 5 are kept');
  const impTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
  const impStore = new CatalogStore(impTmp);
  impStore.saveImport('cp', read('copilot.txt'));
  const viaFile = await listProviderModels({ ...createProvider('copilot-cli', []), id: 'cp' } as AgentProvider, process.env, impStore.importsDir);
  check(viaFile.source === 'import' && viaFile.models.length === 26 && viaFile.ok, 'listing a provider prefers its imported model list');
  fs.rmSync(impTmp, { recursive: true, force: true });

  console.log('\n--- semicolon-separated list with prices ---');
  const dl = parseImportedList(read('copilot-priced.txt'));
  check(dl.length === 26, `parses all 26 lines (${dl.length})`);
  check(dl.filter(m => m.enabled).length === 11, 'reads Enabled / Disabled');
  const s55 = dl.find(m => m.id === 'claude-sonnet-5.5')!;
  check(s55.enabled === true && s55.pricing?.inPerM === 2 && s55.pricing?.outPerM === 10 && s55.pricing?.source === 'listed', 'reads "$2.00 in / $10.00 out" as listed prices');
  check(dl.find(m => m.id === 'gpt-5-mini')!.pricing === undefined && dl.find(m => m.id === 'grok-code-fast-1')!.pricing === undefined, '"N/A" leaves the price unknown');
  check(dl.find(m => m.id === 'kimi-k3')!.label === 'Kimi K3' && dl.find(m => m.id === 'mai-code-1.1-flash')!.enabled === true, 'vendor is dropped; multi-word vendors work (Moonshot AI)');
  check(dl.find(m => m.id === 'claude-opus-4.8-fast')!.enabled === false, '"(fast mode) Preview" becomes -fast');
  const dRaw: RawFile = { providerId: 'cp', providerName: 'Copilot', kind: 'copilot-cli', fetchedAt: 1, source: 'import', command: 'imports/cp.txt', ok: true, models: dl };
  const dCat = curate([dRaw], { keepVersionsPerFamily: 2 });
  const dUse = dCat.models.filter(m => !m.hidden);
  check(dUse.every(m => dl.find(r => r.id === m.id)?.enabled === true) && dUse.length >= 8, `only the enabled models are shown (${dUse.length})`);
  check(dUse.find(m => m.id === 'claude-sonnet-5.5')!.pricing?.outPerM === 10 && dUse.find(m => m.id === 'claude-sonnet-5.5')!.pricing?.source === 'listed', 'your prices are used instead of estimates');
  check(parseImportedList('claude-sonnet-5.5\ngpt-5.6-luna\n').length === 2, 'a plain list of ids still works');
  check(parseImportedList(read('copilot.txt')).length === 26, 'the Copilot settings-page format still works');

  console.log('\n--- reasoning level ---');
  const opusEntry = dev.find(m => m.family === 'claude-opus' && m.version === 5.5)!;
  const dvp: AgentProvider = { ...createProvider('devin', []), id: 'devin', name: 'Devin', agentic: true, defaultReasoning: 'medium', maxParallel: 5, minSpacingSeconds: 0, maxSessionsPerWindow: 0 } as AgentProvider;
  check(supportedLevels(dvp, opusEntry).join() === 'low,medium,high,xhigh,max', 'levels come from the model\'s effort variants, in order');
  check(supportedLevels(dvp, undefined).length === 0, 'a model without effort variants or a flag has no reasoning control');
  check(supportedLevels({ ...dvp, effortFlag: '--effort' } as AgentProvider, undefined).join() === 'low,medium,high,xhigh,max', 'a provider effort flag enables the standard levels');
  const easyT = mkTicket({ priority: 'Low', estimate: 'S' });
  const normT = mkTicket({ priority: 'Normal', estimate: 'M' });
  const hardT = mkTicket({ priority: 'P0', type: 'Architecture', estimate: 'L' });
  check(pickReasoning(easyT, dvp, opusEntry) === 'low', 'easy ticket: one step below the default (low)');
  check(pickReasoning(normT, dvp, opusEntry) === 'medium', 'normal ticket: the default level');
  check(['high', 'xhigh', 'max'].includes(pickReasoning(hardT, dvp, opusEntry)) && order5(pickReasoning(hardT, dvp, opusEntry)) >= order5('high'), 'critical architecture ticket: raised at least to high');
  check(pickReasoning(normT, { ...dvp, defaultReasoning: 'high' } as AgentProvider, opusEntry) === 'high', 'the provider default level is the starting point');
  check(pickReasoning(normT, dvp, opusEntry, 'cost') === 'low' && pickReasoning(normT, dvp, opusEntry, 'speed') === 'low', 'cost and speed objectives lower it');
  check(pickReasoning(mkTicket({ labels: ['reasoning:max'] }), dvp, opusEntry) === 'max' && pickReasoning(mkTicket({ labels: ['reasoning:bogus'] }), dvp, opusEntry) === 'medium', 'a reasoning:<level> label pins the level (unsupported ones are ignored)');
  const r1 = resolveReasoning(dvp, opusEntry, 'claude-opus-5-5-medium', 'high');
  check(r1.model === 'claude-opus-5-5-high' && r1.level === 'high' && r1.effort === undefined, 'effort variants are selected by model id (claude-opus-5-5-high)');
  const r2 = resolveReasoning({ ...dvp, effortFlag: '--reasoning-effort' } as AgentProvider, undefined, 'gpt-x', 'high');
  check(r2.model === 'gpt-x' && r2.effort === 'high', 'without variants the level goes to the CLI flag');
  check(resolveReasoning(dvp, undefined, 'plain', 'high').level === '', 'unsupported models ignore the level');

  const effCmd = AgentRunner.formatCliCommand(mkTicket(), { id: 'cp', name: 'Copilot', type: 'agent', agentConfig: { type: 'cli', command: 'copilot {model_args} -p "{task}"' } }, os.tmpdir(), undefined, 'b', { shell: 'posix', model: 'claude-sonnet-5.5', modelFlag: '--model', effort: 'high', effortFlag: '--reasoning-effort' });
  check(effCmd.includes('--model claude-sonnet-5.5') && effCmd.endsWith('--reasoning-effort high'), 'the effort flag is appended to the command');
  check(!AgentRunner.formatCliCommand(mkTicket(), { id: 'cp', name: 'C', type: 'agent', agentConfig: { type: 'cli', command: 'copilot -p "x"' } }, os.tmpdir(), undefined, 'b', { shell: 'posix', effort: 'high; rm -rf ~', effortFlag: '--reasoning-effort' }).includes('rm -rf'), 'effort values are validated before reaching a shell');

  // the optimizer picks the level per task and prices it
  const dvIdx = new CatalogIndex(curate([rawDevin]));
  const dvSm = new SessionManager(() => dvp, new NullLauncher(), storeWith({}), () => clockNow);
  const hiOpts = rankOptions(hardT, [dvp], dvSm, { catalog: dvIdx, speed: new SpeedBook(), now: clockNow });
  const loOpts = rankOptions(easyT, [dvp], dvSm, { catalog: dvIdx, speed: new SpeedBook(), now: clockNow });
  const hiOpus = hiOpts.find(o => o.model.startsWith('claude-opus-5-5'))!;
  const loOpus = loOpts.find(o => o.model.startsWith('claude-opus-5-5'));
  check(!!hiOpus && ['high', 'xhigh', 'max'].includes(hiOpus.reasoning) && hiOpus.model.endsWith(hiOpus.reasoning), 'hard ticket on Opus runs the high-reasoning variant id');
  check(!loOpus || loOpus.reasoning === 'low', 'easy ticket never gets more than low');
  const mediumCost = estimateRun(normT, dvp, 'claude-opus-5-5-medium', { catalog: dvIdx, speed: new SpeedBook() }, 'medium');
  const maxCost = estimateRun(normT, dvp, 'claude-opus-5-5-max', { catalog: dvIdx, speed: new SpeedBook() }, 'max');
  check(maxCost.estCost > mediumCost.estCost * 2 && maxCost.estMinutes > mediumCost.estMinutes * 2, 'max reasoning costs ~2.5x the tokens and time of medium');

  console.log('\n--- Devin Fusion picker data ---');
  const combos = fusionCombos(rawDevin);
  check(combos.length === 575, `finds every fusion combination (${combos.length})`);
  const mains = [...new Set(combos.map(c => c.main))];
  check(mains.length > 5 && mains.length < 200 && combos.every(c => c.main && c.side), `step 1 offers distinct main models (${mains.length}); every combo has a main and a side-kick`);
  const sw = combos.filter(c => c.side === 'SWE-2 Medium');
  check(sw.length === 80 || sw.length > 40, `step 2 can offer SWE-2 Medium as side-kick (${sw.length} mains)`);
  const pick = combos.find(c => c.id === 'fusion-claude-opus-5-5-medium-sidekick-swe-2-medium')!;
  check(!!pick && pick.main === 'Claude Opus 5.5 Medium' && pick.side === 'SWE-2 Medium' && pick.outPerM === 20, 'main + side-kick resolve to the exact Devin model id with its own price');
  const fCat = new CatalogIndex(curate([rawDevin]));
  check(fCat.get('devin', pick.id) !== undefined, 'a pinned fusion id is recognised by the catalog');
  const otherFusion = combos.find(c => c.outPerM !== undefined && c.outPerM !== 20 && c.outPerM !== undefined)!;
  check(fCat.pricingFor('devin', otherFusion.id)?.outPerM === otherFusion.outPerM, 'each fusion id is priced by its own listing, not the family average');

  console.log('\n--- capability floor and model labels (the ATF run) ---');
  const mk2 = (id: string, pr?: { in: number; out: number }) => ({ id, pricing: pr ? { inPerM: pr.in, outPerM: pr.out, source: 'listed' as const } : undefined });
  const tierRaw: RawFile = { providerId: 'dv', providerName: 'Devin', kind: 'devin', fetchedAt: 1, source: 'command', command: '', ok: true, models: [
    { ...mk2('gpt-6-luna-medium', { in: 0.1, out: 0.5 }), family: 'gpt-6-luna' }, { ...mk2('claude-haiku-5-5-medium', { in: 0.1, out: 0.5 }), family: 'claude-haiku-5.5' },
    { ...mk2('claude-sonnet-5-5-medium', { in: 2, out: 10 }), family: 'claude-sonnet-5.5' }, { ...mk2('claude-opus-5-5-medium', { in: 4, out: 20 }), family: 'claude-opus-5.5' },
    { id: 'swe-2-medium', family: 'swe-2', pricing: { free: true, source: 'listed' } }] };
  const tierCat = curate([tierRaw]);
  const tierOf = (id: string) => tierCat.models.find(m => m.id === id)!.tier;
  check(tierOf('gpt-6-luna-medium') === 2 && tierOf('claude-haiku-5-5-medium') === 2, 'cheap "new generation" models (GPT-6 Luna, Haiku) are fast-tier, not strong');
  check(tierOf('claude-sonnet-5-5-medium') === 4 && tierOf('claude-opus-5-5-medium') === 5 && tierOf('swe-2-medium') === 3, 'sonnet 4, opus 5, free SWE-2 3');
  const tProv: AgentProvider = { ...createProvider('devin', []), id: 'dv', name: 'Devin', agentic: true, maxParallel: 5, minSpacingSeconds: 0, maxSessionsPerWindow: 0, defaultReasoning: '' } as AgentProvider;
  const tIdx = new CatalogIndex(tierCat);
  const tSm = new SessionManager(() => tProv, new NullLauncher(), storeWith({}), () => clockNow);
  const plain = mkTicket({ priority: 'Normal', estimate: 'M' });
  const openFloor = rankOptions(plain, [tProv], tSm, { catalog: tIdx, speed: new SpeedBook(), now: clockNow, minTier: 1 });
  check(openFloor.some(o => o.tier === 2), 'with no floor a tier-2 model can be picked for an ordinary ticket');
  const floored = rankOptions(plain, [tProv], tSm, { catalog: tIdx, speed: new SpeedBook(), now: clockNow, minTier: 3 });
  check(floored.length > 0 && floored.every(o => o.tier >= 3), 'a minimum tier of 3 keeps Haiku / Luna out of ordinary tickets');
  check(floored.some(o => o.model.startsWith('swe-2')), 'free SWE-2 stays eligible at tier 3');
  const labelled = rankOptions(mkTicket({ labels: ['model:opus'] }), [tProv], tSm, { catalog: tIdx, speed: new SpeedBook(), now: clockNow, minTier: 3 });
  check(labelled.length > 0 && labelled.every(o => /opus/.test(o.model)), 'a model:opus label restricts the choice to Opus');
  const unknownLabel = rankOptions(mkTicket({ labels: ['model:nonexistent'] }), [tProv], tSm, { catalog: tIdx, speed: new SpeedBook(), now: clockNow, minTier: 3 });
  check(unknownLabel.length > 1, 'a label matching no model is ignored instead of blocking the ticket');

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) { console.error(`\n${failures} catalog check(s) FAILED`); process.exit(1); }
  console.log('\n=== All catalog tests passed ===');
}

main().catch(e => { console.error(e); process.exit(1); });
