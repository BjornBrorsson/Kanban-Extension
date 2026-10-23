#!/usr/bin/env node
/**
 * Model catalog scripts.
 *
 *   node dist/models-cli.js list    [--dir <workspace>] [--only <providerId|kind>]   ask every provider for its models -> raw/*.json
 *   node dist/models-cli.js curate  [--dir <workspace>] [--keep <n>]                 categorise, price, hide superseded -> catalog.json
 *   node dist/models-cli.js bench   [--dir <workspace>] [--only <providerId|kind>]   measure local (Ollama) tokens/second -> bench.json
 *   node dist/models-cli.js apply   [--dir <workspace>]                              write curated models/tiers into providers.json
*   node dist/models-cli.js import  --only <providerId> --file <list.txt> [--dir <workspace>]   save a pasted model list (e.g. Copilot model policy) for a provider
 *   node dist/models-cli.js show    [--dir <workspace>] [--hidden]                   print the catalog
 *   node dist/models-cli.js all     [--dir <workspace>] [--keep <n>] [--apply]       list + curate (+ apply)
 *
 * Files live in <workspace>/.agentic-kanban/models/ (raw/, catalog.json, bench.json, pricing.overrides.json).
 */
import { AgentProvider, ProviderRegistry, createProvider } from './providers';
import { Catalog, CatalogStore, providerPatches } from './catalog';
import { detectAll } from './detect';
import { benchOllama } from './bench';

interface Args { cmd: string; dir: string; only?: string; keep: number; hidden: boolean; apply: boolean; file?: string }

export function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: argv[0] || 'all', dir: process.cwd(), keep: 2, hidden: false, apply: false };
  for (let i = 1; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--dir') a.dir = argv[++i];
    else if (v === '--only') a.only = argv[++i];
    else if (v === '--file') a.file = argv[++i];
    else if (v === '--keep') a.keep = Math.max(1, Number(argv[++i]) || 2);
    else if (v === '--hidden') a.hidden = true;
    else if (v === '--apply') a.apply = true;
  }
  return a;
}

/** Providers from providers.json; with none configured, falls back to whatever is installed on this machine. */
export async function providersFor(dir: string, only?: string): Promise<AgentProvider[]> {
  const registry = new ProviderRegistry(dir);
  let providers = registry.list();
  if (!providers.length) {
    const found = await detectAll();
    const made: AgentProvider[] = [];
    for (const d of found) {
      const p = createProvider(d.kind, made);
      made.push({ ...p, path: d.path, models: d.models?.length ? d.models : p.models });
    }
    providers = made;
  }
  return only ? providers.filter(p => p.id === only || p.kind === only) : providers;
}

export function summarize(c: Catalog): string {
  const lines: string[] = [];
  const byProvider = new Map<string, typeof c.models>();
  for (const m of c.models) byProvider.set(m.providerId, [...(byProvider.get(m.providerId) || []), m]);
  for (const [id, list] of byProvider) {
    const vis = list.filter(m => !m.hidden);
    lines.push(`\n${id}: ${vis.length} shown, ${list.length - vis.length} hidden`);
    for (const m of vis) {
      const price = m.pricing?.free ? 'free' : m.pricing?.outPerM !== undefined ? `$${m.pricing.inPerM ?? '?'}/$${m.pricing.outPerM} per 1M` : '?';
      lines.push(`  [${m.category.padEnd(8)}] T${m.tier}  ${m.id.padEnd(34)} ${price}${m.pricing?.source === 'estimated' ? ' (est.)' : m.pricing?.source === 'reference' ? ' (ref.)' : ''}`);
    }
  }
  return lines.join('\n');
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const store = new CatalogStore(args.dir);

  if (args.cmd === 'import') {
    if (!args.only || !args.file) { console.error('Usage: import --only <providerId> --file <list.txt>'); return 2; }
    const saved = store.saveImport(args.only, require('fs').readFileSync(args.file, 'utf8'));
    console.log(`Saved ${saved}. Run "list" and "curate" (or "all") to use it.`);
    return 0;
  }

  if (args.cmd === 'list' || args.cmd === 'all') {
    const providers = await providersFor(args.dir, args.only);
    if (!providers.length) { console.error('No providers configured or detected. Add some in the Agents screen first.'); return 1; }
    console.log(`Listing models for ${providers.length} provider(s)...`);
    const raws = await store.refreshRaw(providers);
    for (const r of raws) {
      console.log(`  ${r.ok ? 'ok ' : 'FAIL'} ${r.providerName.padEnd(28)} ${String(r.models.length).padStart(4)} models  via ${r.source}${r.error ? '  - ' + r.error : ''}`);
    }
    console.log(`Raw lists saved in ${store.rawDir}`);
  }

  if (args.cmd === 'curate' || args.cmd === 'all') {
    const c = store.curateSaved(args.keep);
    const hidden = c.models.filter(m => m.hidden).length;
    console.log(`\nCatalog: ${c.models.length - hidden} models shown, ${hidden} hidden (kept the newest ${c.keepVersionsPerFamily} version(s) of each family). Saved to ${store.catalogPath}`);
  }

  if (args.cmd === 'bench') {
    const providers = (await providersFor(args.dir, args.only)).filter(p => p.kind === 'ollama' || p.kind === 'ollama-aider');
    const bench = store.loadBench();
    for (const p of providers) {
      const models = p.models.filter(m => !/embed/i.test(m));
      for (const m of models) {
        process.stdout.write(`Benchmarking ${p.id} / ${m} ... `);
        try {
          const tps = await benchOllama(m);
          bench[`${p.id}::${m}`] = { tps, at: Date.now() };
          console.log(`${tps.toFixed(1)} tokens/s`);
        } catch (e: any) {
          console.log(`failed (${e?.message || e})`);
        }
      }
    }
    store.saveBench(bench);
    console.log(`Saved to ${store.benchPath}`);
  }

  if (args.cmd === 'apply' || (args.cmd === 'all' && args.apply)) {
    const c = store.loadCatalog();
    if (!c) { console.error('No catalog yet. Run "curate" first.'); return 1; }
    const registry = new ProviderRegistry(args.dir);
    const patches = providerPatches(registry.list(), c);
    for (const patch of patches) {
      const p = registry.get(patch.id)!;
      registry.upsert({ ...p, models: patch.models, defaultModel: patch.defaultModel, modelTiers: patch.modelTiers });
    }
    console.log(`Applied the curated catalog to ${patches.length} provider(s) in ${registry.filePath}`);
  }

  if (args.cmd === 'show') {
    const c = store.loadCatalog();
    if (!c) { console.error('No catalog yet. Run "all" first.'); return 1; }
    console.log(summarize(c));
    if (args.hidden) {
      console.log('\nHidden:');
      for (const m of c.models.filter(x => x.hidden)) console.log(`  ${m.providerId}::${m.id}  - ${m.hiddenReason}`);
    }
  }

  if (!['list', 'curate', 'bench', 'apply', 'show', 'all', 'import'].includes(args.cmd)) {
    console.error('Usage: models-cli <list|curate|bench|apply|show|all> [--dir <workspace>] [--only <provider>] [--keep <n>] [--apply] [--hidden]');
    return 2;
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => process.exit(code)).catch(e => { console.error(e); process.exit(1); });
}
