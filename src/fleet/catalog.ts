import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { AgentProvider } from './providers';
import { findExecutable, findForKind, parseOllamaList } from './detect';

// ---------------------------------------------------------------- types

export interface Pricing {
  /** USD per 1M tokens. */
  inPerM?: number;
  cachedPerM?: number;
  outPerM?: number;
  free?: boolean;
  /** listed = the provider told us; reference = same model's price from another provider; override = your pricing.overrides.json; estimated = tier-based guess. */
  source: 'listed' | 'reference' | 'override' | 'estimated';
}

export interface RawModel {
  id: string;
  label?: string;
  /** Provider-side family slug (e.g. devin "claude-opus-5.5"), when given. */
  family?: string;
  aliases?: string[];
  contextTokens?: number;
  pricing?: Pricing;
  sizeB?: number;
  local?: boolean;
  /** false = the provider lists it but your account/policy has it switched off (e.g. Copilot model policy). */
  enabled?: boolean;
  /** The id was derived from a display name and may need checking against the CLI. */
  idGuessed?: boolean;
}

export interface RawFile {
  providerId: string;
  providerName: string;
  kind: string;
  fetchedAt: number;
  /** How the list was obtained. `configured` means the provider has no list command and its own model list was used. */
  source: 'command' | 'api' | 'learned' | 'configured' | 'import';
  command: string;
  ok: boolean;
  error?: string;
  models: RawModel[];
}

export type ModelCategory = 'frontier' | 'balanced' | 'fast' | 'local' | 'free' | 'specialist';

export interface CatalogModel {
  /** `<providerId>::<id>` of the representative variant. */
  key: string;
  providerId: string;
  /** The id to pass to the CLI (the medium-effort variant when there are several). */
  id: string;
  label: string;
  family: string;
  version: number | null;
  sizeB?: number;
  tier: number;
  category: ModelCategory;
  pricing?: Pricing;
  contextTokens?: number;
  local: boolean;
  /** effort level -> model id, e.g. { low: 'x-low', medium: 'x-medium' }. */
  effortVariants: Record<string, string>;
  /** ids of fast/priority/lightning variants (more expensive, quicker). */
  speedVariants: string[];
  hidden: boolean;
  hiddenReason?: string;
}

export interface Catalog {
  version: 1;
  generatedAt: number;
  keepVersionsPerFamily: number;
  models: CatalogModel[];
}

export type PricingOverrides = Record<string, Partial<Pricing>>;

// ---------------------------------------------------------------- parsing provider list output

function toMillions(n: number, unit?: string): number {
  return /m/i.test(unit || '') ? n * 1_000_000 : /k/i.test(unit || '') ? n * 1_000 : n;
}

/** Parses the bracket part of a `devin models list` line: "[1M context, $4 / 1M Input · $0.2 / 1M Cached input · $20 / 1M Output]". */
function parseDevinBracket(b: string): { contextTokens?: number; pricing?: Pricing } {
  const out: { contextTokens?: number; pricing?: Pricing } = {};
  const ctx = b.match(/([\d.]+)\s*([KM])?\s*context/i);
  if (ctx) out.contextTokens = Math.round(toMillions(Number(ctx[1]), ctx[2]));
  if (/\bfree\b/i.test(b)) {
    out.pricing = { free: true, inPerM: 0, outPerM: 0, source: 'listed' };
  } else {
    const inp = b.match(/\$([\d.]+)\s*\/\s*1M\s*Input/i);
    const cached = b.match(/\$([\d.]+)\s*\/\s*1M\s*Cached/i);
    const outp = b.match(/\$([\d.]+)\s*\/\s*1M\s*Output/i);
    if (inp || outp) {
      out.pricing = {
        inPerM: inp ? Number(inp[1]) : undefined,
        cachedPerM: cached ? Number(cached[1]) : undefined,
        outPerM: outp ? Number(outp[1]) : undefined,
        source: 'listed'
      };
    }
  }
  return out;
}

/** `devin models list` — families as headers, models (with context + pricing) indented below. */
export function parseDevinModels(text: string): RawModel[] {
  const models: RawModel[] = [];
  let family: string | undefined;
  let aliases: string[] = [];
  const familyStart: number[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    if (!/^\s/.test(raw)) {
      const h = raw.match(/^(.+?)\s+\(([^()\s]+)\)\s*$/);
      if (h && !/^available models/i.test(raw)) {
        family = h[2];
        aliases = [];
        familyStart.push(models.length);
      }
      continue;
    }
    const al = raw.match(/^\s+aliases:\s*(.+)$/i);
    if (al) {
      aliases = al[1].split(',').map(s => s.trim()).filter(Boolean);
      continue;
    }
    const m = raw.match(/^\s+(\S+)\s{2,}(.+?)\s{2,}\[(.+)\]\s*$/);
    if (m) {
      const extra = parseDevinBracket(m[3]);
      models.push({ id: m[1], label: m[2].trim(), family, aliases: aliases.length ? aliases : undefined, ...extra });
    }
  }
  return models;
}

/** `agy models` — "id<TAB>label" lines after a "Fetching..." banner. */
export function parseAgyModels(text: string): RawModel[] {
  const out: RawModel[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = raw.match(/^([A-Za-z0-9][\w.:\/-]*)\t(.+)$/);
    if (m) out.push({ id: m[1], label: m[2].trim() });
  }
  return out;
}

/** Generic "one model per line, id first" output for user-defined list commands. */
export function parseGenericModels(text: string): RawModel[] {
  const out: RawModel[] = [];
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const m = raw.trim().match(/^([A-Za-z0-9][\w.:\/-]*)(?:\s+(.*))?$/);
    if (!m || /^(name|id|model|models|available|fetching|usage|error)\b/i.test(m[1])) continue;
    out.push({ id: m[1], label: m[2]?.trim() || undefined });
  }
  return out;
}

function sizeFromParameterSize(s: string | undefined): number | undefined {
  const m = (s || '').match(/([\d.]+)\s*([MBT])/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return /t/i.test(m[2]) ? n * 1000 : /m/i.test(m[2]) ? n / 1000 : n;
}

function httpGetJson(url: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', d => (body += d));
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export async function listOllamaModels(host = '127.0.0.1:11434', exePath?: string): Promise<RawModel[]> {
  try {
    const data = await httpGetJson(`http://${host}/api/tags`, 2000);
    const list = (data?.models || []).map((m: any): RawModel => ({
      id: String(m.name || m.model),
      label: String(m.name || m.model),
      sizeB: sizeFromParameterSize(m.details?.parameter_size),
      local: true,
      pricing: { free: true, inPerM: 0, outPerM: 0, source: 'listed' }
    }));
    if (list.length) return list;
  } catch { /* fall through to the CLI */ }
  const exe = exePath || findExecutable(['ollama']);
  if (!exe) return [];
  const text = await runCapture(exe, ['list']);
  return parseOllamaList(text).map(id => ({ id, label: id, local: true, pricing: { free: true, inPerM: 0, outPerM: 0, source: 'listed' as const } }));
}

/** Display name -> CLI-style id: "Anthropic Claude Opus 4.8 (fast mode) Preview" -> "claude-opus-4.8-fast". */
export function slugFromDisplayName(name: string): string {
  return name
    .replace(/^(?:Anthropic|OpenAI|Google|xAI|Microsoft|Moonshot AI|Meta|Mistral(?: AI)?|DeepSeek|Alibaba|Amazon)\s+/i, '')
    .replace(/\(\s*fast mode\s*\)/i, 'fast')
    .replace(/\b(?:preview|beta)\b/gi, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Parses the model list pasted from GitHub Copilot's model-policy settings page:
 *   * Anthropic Claude Sonnet 5.5
 *   Enabled
 *   You can use the latest ...
 * Disabled models are kept (enabled: false) so the catalog can hide them.
 */
export function parseCopilotPolicy(text: string): RawModel[] {
  const out: RawModel[] = [];
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*[*\u2022-]\s+(.+?)\s*$/);
    if (!m) continue;
    const next = (lines[i + 1] || '').trim();
    if (!/^(enabled|disabled)$/i.test(next)) continue;
    const id = slugFromDisplayName(m[1]);
    if (id) out.push({ id, label: m[1].trim(), enabled: /^enabled$/i.test(next), idGuessed: true });
  }
  return out;
}

/** Copilot CLI has no list command: collect the model ids it has actually used on this machine. */
export function listCopilotLearned(home: string = os.homedir()): RawModel[] {
  const ids = new Set<string>();
  const dir = path.join(home, '.copilot');
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    for (const id of cfg.recentModelIds || []) ids.add(String(id));
  } catch { /* no config */ }
  try {
    const st = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));
    if (st.model) ids.add(String(st.model));
  } catch { /* no settings */ }
  try {
    const logs = fs.readdirSync(path.join(dir, 'logs')).filter(f => f.endsWith('.log')).sort().slice(-40);
    for (const f of logs) {
      const text = fs.readFileSync(path.join(dir, 'logs', f), 'utf8');
      for (const m of text.matchAll(/Using default model:\s*([\w.:\/-]+)/g)) ids.add(m[1]);
    }
  } catch { /* no logs */ }
  ids.delete('auto');
  return [...ids].map(id => ({ id, label: id }));
}

function isShim(exe: string): boolean { return process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe); }

function runCapture(exe: string, args: string[], timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 8 * 1024 * 1024, shell: isShim(exe) }, (err, stdout, stderr) => {
      if (err && !String(stdout).trim()) reject(new Error(String(stderr || err.message).trim().slice(0, 300)));
      else resolve(String(stdout));
    });
  });
}

/** Lists the models of one provider with whatever mechanism it offers, never throwing. */
export async function listProviderModels(p: AgentProvider, env: NodeJS.ProcessEnv = process.env, importsDir?: string): Promise<RawFile> {
  const base = { providerId: p.id, providerName: p.name, kind: p.kind, fetchedAt: Date.now() };
  // A pasted/exported model list (imports/<providerId>.txt) beats any guessing: it is what your account actually offers.
  if (importsDir) {
    try {
      const text = fs.readFileSync(path.join(importsDir, `${p.id}.txt`), 'utf8');
      const policy = parseCopilotPolicy(text);
      const models = policy.length ? policy : parseGenericModels(text);
      if (models.length) return { ...base, source: 'import', command: `imports/${p.id}.txt`, ok: true, models };
    } catch { /* no import file */ }
  }
  const exe = p.path || findForKind(p.kind, env);
  const fail = (command: string, error: string): RawFile => ({ ...base, source: 'command', command, ok: false, error, models: [] });
  try {
    if (p.listCommand) {
      const parts = p.listCommand.trim().split(/\s+/);
      const bin = parts[0] === p.kind || !path.isAbsolute(parts[0]) ? (findExecutable([parts[0]], env) || parts[0]) : parts[0];
      const text = await runCapture(bin, parts.slice(1));
      return { ...base, source: 'command', command: p.listCommand, ok: true, models: parseGenericModels(text) };
    }
    switch (p.kind) {
      case 'devin': {
        if (!exe) return fail('devin models list', 'devin executable not found');
        const text = await runCapture(exe, ['models', 'list']);
        return { ...base, source: 'command', command: 'devin models list', ok: true, models: parseDevinModels(text) };
      }
      case 'antigravity': {
        if (!exe) return fail('agy models', 'agy executable not found');
        const text = await runCapture(exe, ['models']);
        return { ...base, source: 'command', command: 'agy models', ok: true, models: parseAgyModels(text) };
      }
      case 'ollama':
      case 'ollama-aider': {
        const models = await listOllamaModels(undefined, exe);
        return { ...base, source: 'api', command: 'GET http://127.0.0.1:11434/api/tags (fallback: ollama list)', ok: models.length > 0, error: models.length ? undefined : 'Ollama not reachable or no models installed', models };
      }
      case 'copilot-cli': {
        const models = listCopilotLearned();
        return {
          ...base, source: 'learned', command: '~/.copilot (config, settings, logs)', ok: models.length > 0,
          error: models.length ? undefined : 'Copilot CLI has no model list command and no model usage was found locally',
          models: models.length ? models : p.models.map(id => ({ id }))
        };
      }
      default:
        return { ...base, source: 'configured', command: '(no list command; using the provider\'s configured models)', ok: p.models.length > 0, models: p.models.map(id => ({ id })) };
    }
  } catch (e: any) {
    return fail(p.listCommand || p.kind, e?.message || String(e));
  }
}

// ---------------------------------------------------------------- curation

const EFFORT_ORDER = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const SPEED_WORDS = ['fast', 'priority', 'lightning'];

export interface ParsedId {
  family: string;
  version: number | null;
  sizeB?: number;
  effort?: string;
  speed?: string;
  embedding: boolean;
}

/** Splits a model id into family / version / size / effort / speed ("claude-sonnet-5-5-high" -> claude-sonnet, 5.5, high). */
export function parseModelId(id: string): ParsedId {
  const lower = id.toLowerCase().replace(/^.*\//, '');
  let tokens = lower.split(/[-_:\s]+/).filter(Boolean);
  let effort: string | undefined;
  let speed: string | undefined;
  tokens = tokens.filter(t => t !== 'latest' && t !== 'thinking' && t !== 'preview');
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (SPEED_WORDS.includes(last)) { speed = last; tokens.pop(); }
    else if (EFFORT_ORDER.includes(last)) { effort = last; tokens.pop(); }
    else break;
  }

  let sizeB: number | undefined;
  const rest: string[] = [];
  const nums: string[] = [];
  let numDone = false;
  for (const t of tokens) {
    const size = t.match(/^e?(\d+(?:\.\d+)?)b$/);
    if (size) { sizeB = Number(size[1]); continue; }
    if (/^\d+(\.\d+)?$/.test(t)) {
      if (!numDone) nums.push(t);
      continue;
    }
    const prefixed = t.match(/^([a-z]{1,2})(\d+(?:\.\d+)?)$/); // k2.6, v4, r1
    const glued = t.match(/^([a-z]{3,})(\d+(?:\.\d+)?)$/); // gemma4, qwen3
    if (prefixed) { rest.push(prefixed[1]); if (!numDone) nums.push(prefixed[2]); continue; }
    if (glued) { rest.push(glued[1]); if (!numDone) nums.push(glued[2]); continue; }
    if (nums.length) numDone = true;
    rest.push(t);
  }
  let version: number | null = null;
  if (nums.length) {
    // ["5","5"] -> 5.5 ; ["3.8"] -> 3.8 ; ["5"] -> 5
    version = nums.length >= 2 && !nums[0].includes('.') && !nums[1].includes('.') ? Number(`${nums[0]}.${nums[1]}`) : Number(nums[0]);
  }
  return { family: rest.join('-') || lower, version, sizeB, effort, speed, embedding: /embed/.test(lower) };
}

/** Name/size based capability guess, 1 (small/fast) to 5 (frontier). */
export function tierFromName(name: string, sizeB?: number): number {
  const n = name.toLowerCase();
  const b = sizeB ?? (n.match(/(\d+(?:\.\d+)?)b\b/) ? Number(n.match(/(\d+(?:\.\d+)?)b\b/)![1]) : undefined);
  if (b !== undefined) return b <= 4 ? 1 : b <= 9 ? 2 : b <= 40 ? 3 : b < 100 ? 4 : 5;
  if (/haiku|flash|(?:^|[-_ :])mini|nano|lite|small|instant/.test(n)) return 2;
  if (/fable|opus|gpt-?[5-9]|o3|o1|ultra|argon|gemini.*pro|deepseek-r1|astra|max/.test(n)) return 5;
  if (/sonnet|gpt-?4|codex|codestral|devstral|coder|sol\b|pro\b/.test(n)) return 4;
  return 3;
}

function priceTier(p?: Pricing): number | undefined {
  if (!p || p.free || p.outPerM === undefined) return undefined;
  return p.outPerM <= 2 ? 2 : p.outPerM <= 8 ? 3 : p.outPerM <= 25 ? 4 : 5;
}

/** Fallback $/1M output price by tier when nothing was listed (rough public list-price levels). */
const ESTIMATED_OUT_PER_M: Record<number, number> = { 1: 0, 2: 1.5, 3: 6, 4: 15, 5: 30 };

export function estimatePricing(tier: number, local: boolean): Pricing {
  if (local) return { free: true, inPerM: 0, outPerM: 0, source: 'estimated' };
  const out = ESTIMATED_OUT_PER_M[tier] ?? 6;
  return { inPerM: out / 5, cachedPerM: out / 50, outPerM: out, source: 'estimated' };
}

export interface CurateOptions {
  /** How many versions of each model family to keep visible per provider (newest first). Default 2. */
  keepVersionsPerFamily?: number;
  overrides?: PricingOverrides;
  now?: number;
}

function pickRepresentative(variants: { id: string; effort?: string }[]): string {
  const byEffort = (e: string) => variants.find(v => v.effort === e)?.id;
  return byEffort('medium') || variants.find(v => !v.effort)?.id || byEffort('high') || byEffort('low') || variants[0].id;
}

function categoryOf(tier: number, local: boolean, pricing: Pricing | undefined, embedding: boolean): ModelCategory {
  if (embedding) return 'specialist';
  if (local) return 'local';
  if (pricing?.free) return 'free';
  return tier >= 5 ? 'frontier' : tier >= 3 ? 'balanced' : 'fast';
}

/**
 * Turns raw provider lists into one catalog: effort/speed variants collapse into one entry, every model gets a
 * tier, category and price, and older versions of a family (beyond `keepVersionsPerFamily`) are hidden.
 */
export function curate(raws: RawFile[], opts: CurateOptions = {}): Catalog {
  const keep = Math.max(1, opts.keepVersionsPerFamily ?? 2);
  const overrides = opts.overrides || {};
  const models: CatalogModel[] = [];

  for (const raw of raws) {
    if (!raw.ok && !raw.models.length) continue;
    // 1. group variants of the same (family, version, size)
    const groups = new Map<string, { parsed: ParsedId; items: { raw: RawModel; effort?: string; speed?: string }[] }>();
    for (const m of raw.models) {
      const parsed = parseModelId(m.id);
      // A provider-declared family slug (devin: "claude-opus-5.5") groups every variant (effort, fast, 1m context,
      // combos) into one entry and carries the version; otherwise the id itself is parsed.
      const fam = m.family ? parseModelId(m.family) : undefined;
      const key = m.family ? `fam|${m.family}` : `${parsed.family}|${parsed.version ?? ''}|${parsed.sizeB ?? ''}`;
      const g = groups.get(key) || { parsed: fam ? { ...fam, sizeB: fam.sizeB ?? parsed.sizeB } : parsed, items: [] };
      g.items.push({ raw: m, effort: parsed.effort, speed: parsed.speed });
      groups.set(key, g);
    }

    const entries: CatalogModel[] = [];
    for (const g of groups.values()) {
      const normal = g.items.filter(i => !i.speed);
      const base = normal.length ? normal : g.items;
      const rep = pickRepresentative(base.map(i => ({ id: i.raw.id, effort: i.effort })));
      const repItem = g.items.find(i => i.raw.id === rep)!;
      const effortVariants: Record<string, string> = {};
      for (const i of base) if (i.effort) effortVariants[i.effort] = i.raw.id;
      const local = !!repItem.raw.local;
      const sizeB = g.parsed.sizeB ?? repItem.raw.sizeB;
      const nameTier = tierFromName(repItem.raw.id, sizeB);
      const ovKey = [`${raw.providerId}::${rep}`, `${raw.providerId}::*`, `*::${rep}`].find(k => overrides[k]);
      let pricing: Pricing | undefined = repItem.raw.pricing;
      if (ovKey) pricing = { ...(pricing || {}), ...overrides[ovKey], source: 'override' };
      const pTier = priceTier(pricing);
      const tier = local ? nameTier : pTier ? Math.max(1, Math.min(5, Math.round((nameTier * 2 + pTier) / 3))) : nameTier;
      if (!pricing) pricing = estimatePricing(tier, local);
      entries.push({
        key: `${raw.providerId}::${rep}`,
        providerId: raw.providerId,
        id: rep,
        label: (repItem.raw.label || rep).replace(/\s*\((?:low|medium|high|xhigh|max|none|minimal)\)\s*$/i, '').replace(/\s+(?:low|medium|high|xhigh|max)(?:\s+thinking)?$/i, '').trim(),
        family: g.parsed.family,
        version: g.parsed.version,
        sizeB,
        tier,
        category: categoryOf(tier, local, pricing, g.parsed.embedding),
        pricing,
        contextTokens: repItem.raw.contextTokens,
        local,
        effortVariants,
        speedVariants: g.items.filter(i => i.speed).map(i => i.raw.id),
        hidden: false
      });
      if (repItem.raw.enabled === false) {
        const e = entries[entries.length - 1];
        e.hidden = true;
        e.hiddenReason = 'disabled in your account / policy settings';
      }
      if (g.parsed.embedding) {
        const e = entries[entries.length - 1];
        e.hidden = true;
        e.hiddenReason = 'embedding model (not usable as a coding agent)';
      }
    }

    // 2. hide superseded versions: keep the newest N versions per family
    const byFamily = new Map<string, CatalogModel[]>();
    for (const e of entries) {
      const list = byFamily.get(e.family) || [];
      list.push(e);
      byFamily.set(e.family, list);
    }
    for (const [family, list] of byFamily) {
      // only models you can actually use decide which versions count as "newest"
      const versions = [...new Set(list.filter(e => e.version !== null && e.hiddenReason !== 'disabled in your account / policy settings').map(e => e.version as number))].sort((a, b) => b - a);
      const keepSet = new Set(versions.slice(0, keep));
      for (const e of list) {
        if (e.hidden || e.version === null || keepSet.has(e.version)) continue;
        e.hidden = true;
        e.hiddenReason = `superseded: ${family} v${versions[0]} is newest (keeping the latest ${keep} version${keep === 1 ? '' : 's'})`;
      }
    }
    models.push(...entries);
  }

  // Providers that do not list prices (agy, copilot) borrow the listed price of the same model elsewhere (e.g. devin).
  const listed = new Map<string, Pricing>();
  for (const m of models) {
    if (m.pricing?.source === 'listed' && !m.pricing.free && m.version !== null) listed.set(`${m.family}|${m.version}`, m.pricing);
  }
  for (const m of models) {
    if (m.pricing?.source !== 'estimated' || m.local || m.version === null) continue;
    const ref = listed.get(`${m.family}|${m.version}`);
    if (ref) m.pricing = { ...ref, source: 'reference' };
  }

  models.sort((a, b) =>
    a.providerId.localeCompare(b.providerId) || Number(a.hidden) - Number(b.hidden) || b.tier - a.tier ||
    a.family.localeCompare(b.family) || (b.version ?? 0) - (a.version ?? 0));
  return { version: 1, generatedAt: opts.now ?? Date.now(), keepVersionsPerFamily: keep, models };
}

// ---------------------------------------------------------------- store

export class CatalogStore {
  public readonly dir: string;
  constructor(workspaceRoot: string) {
    this.dir = path.join(workspaceRoot, '.agentic-kanban', 'models');
  }
  public get rawDir(): string { return path.join(this.dir, 'raw'); }
  public get catalogPath(): string { return path.join(this.dir, 'catalog.json'); }
  public get overridesPath(): string { return path.join(this.dir, 'pricing.overrides.json'); }
  public get importsDir(): string { return path.join(this.dir, 'imports'); }

  /** Saves a pasted model list for a provider (used by the next refresh). */
  public saveImport(providerId: string, text: string): string {
    const file = path.join(this.importsDir, `${providerId}.txt`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text, 'utf8');
    return file;
  }

  public get benchPath(): string { return path.join(this.dir, 'bench.json'); }

  private writeJson(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }

  public saveRaw(raw: RawFile): string {
    const file = path.join(this.rawDir, `${raw.providerId}.json`);
    this.writeJson(file, raw);
    return file;
  }

  public loadRaws(): RawFile[] {
    try {
      return fs.readdirSync(this.rawDir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(this.rawDir, f), 'utf8')) as RawFile);
    } catch { return []; }
  }

  public loadOverrides(): PricingOverrides {
    try { return JSON.parse(fs.readFileSync(this.overridesPath, 'utf8')); } catch { return {}; }
  }

  public saveCatalog(c: Catalog): string {
    this.writeJson(this.catalogPath, c);
    return this.catalogPath;
  }

  public loadCatalog(): Catalog | undefined {
    try { return JSON.parse(fs.readFileSync(this.catalogPath, 'utf8')); } catch { return undefined; }
  }

  public loadBench(): Record<string, { tps: number; at: number }> {
    try { return JSON.parse(fs.readFileSync(this.benchPath, 'utf8')); } catch { return {}; }
  }

  public saveBench(b: Record<string, { tps: number; at: number }>): void { this.writeJson(this.benchPath, b); }

  /** Step 1: ask every provider for its models and save the raw results. */
  public async refreshRaw(providers: AgentProvider[], env: NodeJS.ProcessEnv = process.env): Promise<RawFile[]> {
    const out: RawFile[] = [];
    for (const p of providers) {
      if (!p.enabled) continue;
      const raw = await listProviderModels(p, env, this.importsDir);
      this.saveRaw(raw);
      out.push(raw);
    }
    return out;
  }

  /** Step 2: curate the saved raw files into catalog.json. */
  public curateSaved(keepVersionsPerFamily = 2): Catalog {
    const c = curate(this.loadRaws(), { keepVersionsPerFamily, overrides: this.loadOverrides() });
    this.saveCatalog(c);
    return c;
  }
}

/** Fast lookups over a catalog for the orchestrator. */
export class CatalogIndex {
  private byKey = new Map<string, CatalogModel>();
  constructor(public readonly catalog: Catalog | undefined) {
    for (const m of catalog?.models || []) {
      this.byKey.set(m.key, m);
      for (const id of [...Object.values(m.effortVariants), ...m.speedVariants]) {
        if (!this.byKey.has(`${m.providerId}::${id}`)) this.byKey.set(`${m.providerId}::${id}`, m);
      }
    }
  }
  public get(providerId: string, modelId: string): CatalogModel | undefined { return this.byKey.get(`${providerId}::${modelId}`); }
  public visible(providerId: string): CatalogModel[] { return (this.catalog?.models || []).filter(m => m.providerId === providerId && !m.hidden); }
  public hasData(): boolean { return !!this.catalog?.models.length; }
}

// ---------------------------------------------------------------- applying the catalog to providers

export interface ProviderPatch {
  id: string;
  models: string[];
  defaultModel: string;
  modelTiers: string;
}

/**
 * Turns the curated catalog into provider settings: visible models (strongest first), a sensible default
 * (cheapest model of tier 4+, else the strongest) and `id=tier` capability hints. User-written tier overrides win.
 */
export function providerPatches(providers: AgentProvider[], catalog: Catalog, maxModels = 12): ProviderPatch[] {
  const patches: ProviderPatch[] = [];
  for (const p of providers) {
    const visible = catalog.models.filter(m => m.providerId === p.id && !m.hidden && m.category !== 'specialist');
    if (!visible.length) continue;
    const sorted = [...visible].sort((a, b) => b.tier - a.tier || (a.pricing?.outPerM ?? 0) - (b.pricing?.outPerM ?? 0)).slice(0, maxModels);
    const models = sorted.map(m => m.id);
    const strong = sorted.filter(m => m.tier >= 4).sort((a, b) => (a.pricing?.outPerM ?? 0) - (b.pricing?.outPerM ?? 0));
    const defaultModel = models.includes(p.defaultModel) ? p.defaultModel : (strong[0] || sorted[0]).id;
    const existing = (p.modelTiers || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
    const known = new Set(existing.map(e => e.split(/[=:]/)[0].trim().toLowerCase()));
    const added = sorted.filter(m => !known.has(m.id.toLowerCase())).map(m => `${m.id}=${m.tier}`);
    patches.push({ id: p.id, models, defaultModel, modelTiers: [...existing, ...added].join(', ') });
  }
  return patches;
}
