import * as fs from 'fs';
import * as path from 'path';
import { Assignee } from '../types';
import type { Detection } from './detect';

export type ProviderKind =
  | 'claude-code'
  | 'devin'
  | 'antigravity'
  | 'gemini'
  | 'codex'
  | 'aider'
  | 'copilot-cli'
  | 'cline'
  | 'ollama'
  | 'ollama-aider'
  | 'ide-chat'
  | 'custom';

export type ProviderRole = 'worker' | 'reviewer' | 'orchestrator';

export interface AgentProvider {
  id: string;
  kind: ProviderKind;
  /** Display name — freely renamable ("Devin (work)"). The id never changes. */
  name: string;
  /** Free-text account label, e.g. "work" / "personal". */
  account?: string;
  enabled: boolean;
  type: 'cli' | 'vscode-command';
  /** Command template. Placeholders: {task} {ticket_path} {ticket_title} {model} {model_args} ... ({task} = implement/review/plan instruction) */
  command: string;
  /**
   * Optional command used to continue an interrupted conversation (placeholders as above plus {session_id}).
   * Without it, a resume re-runs `command` with a recovery prompt that tells the agent to check the ticket and git state.
   */
  resumeCommand?: string;
  /** Models you always want available (e.g. a specific fusion combo), kept even when the catalog hides or omits them. */
  pinnedModels: string[];
  /** Command that prints this provider's models (one per line, id first). Built-in for devin, agy and ollama. */
  listCommand?: string;
  /** Can this provider edit files / run tools (a real coding agent)? Plain `ollama run` cannot. */
  agentic: boolean;
  /** Spend caps in USD per calendar day / week / month (0 = no cap). The orchestrator stays under them. */
  budgetDaily: number;
  budgetWeekly: number;
  budgetMonthly: number;
  /** Optional capability overrides for failover, e.g. "opus=5, sonnet=4, haiku=2" (1 = small, 5 = frontier). */
  modelTiers?: string;
  /** Flag used to build {model_args}; if the template uses neither {model} nor {model_args}, it is appended. */
  modelFlag?: string;
  workingDir?: string;
  path?: string;
  prompt?: string;
  models: string[];
  defaultModel: string;
  /** Max simultaneous sessions for this provider/account. */
  maxParallel: number;
  /** Rolling-window cap on session starts (0 = unlimited). Used to stay clear of rate limits. */
  maxSessionsPerWindow: number;
  windowMinutes: number;
  /** Minimum seconds between two session starts on this provider. */
  minSpacingSeconds: number;
  /** Stop dispatching once this % of the window cap is used (0-50). */
  safetyMarginPct: number;
  roles: ProviderRole[];
}

export interface ProviderPreset {
  kind: ProviderKind;
  label: string;
  type: 'cli' | 'vscode-command';
  command: string;
  resumeCommand?: string;
  modelFlag?: string;
  models: string[];
  defaultModel: string;
  maxParallel: number;
  maxSessionsPerWindow: number;
  windowMinutes: number;
  minSpacingSeconds: number;
  prompt?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    kind: 'claude-code', label: 'Claude Code', type: 'cli',
    command: `claude {model_args} --session-id {session_id} -p "{task}"`, modelFlag: '--model',
    resumeCommand: `claude {model_args} --resume {session_id} -p "{task}"`,
    models: ['opus', 'sonnet', 'haiku'], defaultModel: 'sonnet',
    maxParallel: 3, maxSessionsPerWindow: 40, windowMinutes: 300, minSpacingSeconds: 10
  },
  {
    kind: 'devin', label: 'Devin', type: 'cli',
    command: `devin {model_args} -p "{task}"`, modelFlag: '--model',
    models: [], defaultModel: '',
    maxParallel: 2, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 30
  },
  {
    kind: 'antigravity', label: 'Antigravity CLI', type: 'cli',
    command: `& "{agy_path}" {model_args} -p "{task}" --dangerously-skip-permissions`, modelFlag: '--model',
    models: [], defaultModel: '',
    maxParallel: 2, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 15
  },
  {
    kind: 'gemini', label: 'Gemini CLI', type: 'cli',
    command: `gemini {model_args} --prompt "{task}"`, modelFlag: '--model',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'], defaultModel: 'gemini-2.5-pro',
    maxParallel: 2, maxSessionsPerWindow: 60, windowMinutes: 60, minSpacingSeconds: 10
  },
  {
    kind: 'codex', label: 'Codex CLI', type: 'cli',
    command: `codex exec {model_args} "{task}"`, modelFlag: '--model',
    models: [], defaultModel: '',
    maxParallel: 2, maxSessionsPerWindow: 0, windowMinutes: 300, minSpacingSeconds: 10
  },
  {
    kind: 'aider', label: 'Aider', type: 'cli',
    command: 'aider {model_args} --message "Implement ticket requirements in {ticket_path}" "{ticket_path}"', modelFlag: '--model',
    resumeCommand: 'aider {model_args} --restore-chat-history --message "{task}" "{ticket_path}"',
    models: [], defaultModel: '',
    maxParallel: 2, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 5
  },
  {
    kind: 'copilot-cli', label: 'GitHub Copilot CLI', type: 'cli',
    command: `copilot {model_args} -p "{task}"`, modelFlag: '--model',
    models: [], defaultModel: '',
    maxParallel: 1, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 10
  },
  {
    kind: 'cline', label: 'Cline CLI', type: 'cli',
    command: `cline {model_args} "{task}"`, modelFlag: '-m',
    models: [], defaultModel: '',
    maxParallel: 2, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 5
  },
  {
    // Local models. `ollama run` answers/chats but cannot edit files; use Aider/Cline pointed at Ollama for coding.
    kind: 'ollama', label: 'Ollama (local)', type: 'cli',
    command: 'ollama run {model} "{task}"',
    models: [], defaultModel: '',
    maxParallel: 1, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 0
  },
  {
    // Local models driven by Aider, which can edit files (unlike plain `ollama run`).
    kind: 'ollama-aider', label: 'Aider + Ollama (local, edits files)', type: 'cli',
    command: 'aider {model_args} --message "{task}" "{ticket_path}"', modelFlag: '--model',
    resumeCommand: 'aider {model_args} --restore-chat-history --message "{task}" "{ticket_path}"',
    models: [], defaultModel: '',
    maxParallel: 1, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 0
  },
  {
    kind: 'ide-chat', label: 'IDE Chat (Copilot / Cursor / Antigravity)', type: 'vscode-command',
    command: 'workbench.action.chat.open', models: [], defaultModel: '',
    maxParallel: 1, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 0,
    prompt: 'Please work on ticket {ticket_title} located at: {ticket_path}'
  },
  {
    kind: 'custom', label: 'Custom CLI', type: 'cli',
    command: `my-agent {model_args} "{task}"`, modelFlag: '--model',
    models: [], defaultModel: '',
    maxParallel: 1, maxSessionsPerWindow: 0, windowMinutes: 60, minSpacingSeconds: 5
  }
];

export function getPreset(kind: ProviderKind): ProviderPreset {
  return PROVIDER_PRESETS.find(p => p.kind === kind) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}

const LEGACY_ID_TO_KIND: Record<string, ProviderKind> = {
  'antigravity-cli': 'antigravity', agy: 'antigravity',
  'claude-code': 'claude-code', claude: 'claude-code',
  'gemini-cli': 'gemini', gemini: 'gemini',
  'devin-cli': 'devin', devin: 'devin',
  aider: 'aider',
  'ide-chat': 'ide-chat',
  codex: 'codex', 'codex-cli': 'codex',
  ollama: 'ollama',
  'ollama-aider': 'ollama-aider',
  'copilot-cli': 'copilot-cli',
  'cline-ollama': 'cline', cline: 'cline'
};

function clampInt(v: any, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Validates/normalises untrusted provider data (from the settings webview or disk). */
export function sanitizeProvider(raw: any, existingIds: string[] = []): AgentProvider {
  const kind: ProviderKind = PROVIDER_PRESETS.some(p => p.kind === raw?.kind) ? raw.kind : 'custom';
  const preset = getPreset(kind);
  const name = String(raw?.name || preset.label).trim().slice(0, 60) || preset.label;
  let id = String(raw?.id || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!id) id = uniqueProviderId(kind, existingIds);
  const models = Array.isArray(raw?.models)
    ? raw.models.map((m: any) => String(m).trim()).filter(Boolean)
    : preset.models.slice();
  const defaultModel = String(raw?.defaultModel ?? preset.defaultModel).trim();
  const roles: ProviderRole[] = (Array.isArray(raw?.roles) ? raw.roles : ['worker'])
    .filter((r: any) => r === 'worker' || r === 'reviewer' || r === 'orchestrator');
  return {
    id,
    kind,
    name,
    account: raw?.account ? String(raw.account).trim().slice(0, 60) : undefined,
    enabled: raw?.enabled !== false,
    type: raw?.type === 'vscode-command' ? 'vscode-command' : (raw?.type === 'cli' ? 'cli' : preset.type),
    command: String(raw?.command ?? preset.command),
    pinnedModels: Array.isArray(raw?.pinnedModels) ? raw.pinnedModels.map((m: any) => String(m).trim()).filter(Boolean) : [],
    listCommand: raw?.listCommand ? String(raw.listCommand).slice(0, 300) : undefined,
    agentic: raw?.agentic !== undefined ? !!raw.agentic : kind !== 'ollama' && kind !== 'ide-chat',
    budgetDaily: Math.max(0, Number(raw?.budgetDaily) || 0),
    budgetWeekly: Math.max(0, Number(raw?.budgetWeekly) || 0),
    budgetMonthly: Math.max(0, Number(raw?.budgetMonthly) || 0),
    modelTiers: raw?.modelTiers ? String(raw.modelTiers).slice(0, 400) : undefined,
    resumeCommand: raw?.resumeCommand !== undefined ? (String(raw.resumeCommand).trim() || undefined) : preset.resumeCommand,
    modelFlag: raw?.modelFlag !== undefined ? String(raw.modelFlag).trim() || undefined : preset.modelFlag,
    workingDir: raw?.workingDir ? String(raw.workingDir) : undefined,
    path: raw?.path ? String(raw.path) : undefined,
    prompt: raw?.prompt ? String(raw.prompt) : preset.prompt,
    models,
    defaultModel: defaultModel && models.length && !models.includes(defaultModel) ? models[0] : defaultModel,
    maxParallel: clampInt(raw?.maxParallel, 1, 32, preset.maxParallel),
    maxSessionsPerWindow: clampInt(raw?.maxSessionsPerWindow, 0, 100000, preset.maxSessionsPerWindow),
    windowMinutes: clampInt(raw?.windowMinutes, 1, 10080, preset.windowMinutes),
    minSpacingSeconds: clampInt(raw?.minSpacingSeconds, 0, 3600, preset.minSpacingSeconds),
    safetyMarginPct: clampInt(raw?.safetyMarginPct, 0, 50, 10),
    roles: roles.length ? roles : ['worker']
  };
}

export function uniqueProviderId(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function createProvider(kind: ProviderKind, existing: AgentProvider[], name?: string): AgentProvider {
  const preset = getPreset(kind);
  const ids = existing.map(p => p.id);
  const sameKind = existing.filter(p => p.kind === kind).length;
  return sanitizeProvider({
    ...preset,
    id: uniqueProviderId(kind, ids),
    kind,
    name: name || (sameKind ? `${preset.label} ${sameKind + 1}` : preset.label),
    models: preset.models.slice(),
    roles: kind === 'ide-chat' || kind === 'ollama' ? ['worker'] : ['worker', 'reviewer']
  }, ids);
}

/** Turns legacy config.md agent assignees into providers (keeps their command templates). */
export function providersFromAssignees(assignees: Assignee[], existing: AgentProvider[] = []): AgentProvider[] {
  const out: AgentProvider[] = [];
  const ids = existing.map(p => p.id);
  for (const a of assignees) {
    if (a.type !== 'agent' || !a.agentConfig) continue;
    if (existing.some(p => p.id === a.id || p.name.toLowerCase() === a.name.toLowerCase())) continue;
    const kind = LEGACY_ID_TO_KIND[a.id] || 'custom';
    const preset = getPreset(kind);
    const p = sanitizeProvider({
      ...preset,
      id: uniqueProviderId(a.id, ids.concat(out.map(o => o.id))),
      kind,
      name: a.name,
      type: a.agentConfig.type,
      command: a.agentConfig.command || preset.command,
      workingDir: a.agentConfig.workingDir,
      path: a.agentConfig.path || a.agentConfig.executable,
      prompt: a.agentConfig.prompt || preset.prompt,
      models: preset.models.slice(),
      // legacy commands have no model placeholder and must keep working unchanged
      modelFlag: undefined,
      // legacy commands hard-code an "implement" prompt, so they cannot act as reviewers/planners
      roles: ['worker']
    });
    out.push(p);
  }
  return out;
}

export function providerToAssignee(p: AgentProvider): Assignee {
  return {
    id: p.id,
    name: p.name,
    type: 'agent',
    role: p.account ? `Account: ${p.account}` : undefined,
    agentConfig: {
      type: p.type,
      command: p.command,
      workingDir: p.workingDir,
      prompt: p.prompt,
      path: p.path,
      executable: p.path
    }
  };
}

const OLD_CLAUDE_COMMAND = 'claude {model_args} -p "{task}"';

/** Upgrades providers saved by earlier versions (e.g. adds resumable Claude Code sessions). */
export function migrateProvider(raw: any): any {
  if (raw?.kind === 'claude-code' && raw.command === OLD_CLAUDE_COMMAND) {
    const preset = getPreset('claude-code');
    return { ...raw, command: preset.command, resumeCommand: raw.resumeCommand || preset.resumeCommand };
  }
  return raw;
}

/** Persists providers in `<root>/.agentic-kanban/providers.json`. */
export class ProviderRegistry {
  private providers: AgentProvider[] = [];
  private listeners: (() => void)[] = [];
  public readonly filePath: string;

  constructor(public readonly workspaceRoot: string) {
    this.filePath = path.join(workspaceRoot, '.agentic-kanban', 'providers.json');
    this.load();
  }

  public onChange(fn: () => void): void { this.listeners.push(fn); }

  public load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const list: any[] = Array.isArray(raw) ? raw : raw?.providers || [];
      const ids: string[] = [];
      this.providers = list.map(r => {
        const p = sanitizeProvider(migrateProvider(r), ids);
        ids.push(p.id);
        return p;
      });
    } catch {
      this.providers = [];
    }
  }

  public isEmpty(): boolean { return this.providers.length === 0; }

  public list(): AgentProvider[] { return this.providers.map(p => ({ ...p, models: p.models.slice(), roles: p.roles.slice() })); }

  public get(idOrName: string): AgentProvider | undefined {
    if (!idOrName) return undefined;
    const key = idOrName.toLowerCase();
    return this.providers.find(p => p.id.toLowerCase() === key) ||
      this.providers.find(p => p.name.toLowerCase() === key);
  }

  public upsert(raw: any): AgentProvider {
    const others = this.providers.filter(p => p.id !== raw?.id).map(p => p.id);
    const p = sanitizeProvider(raw, others);
    const idx = this.providers.findIndex(x => x.id === p.id);
    if (idx >= 0) this.providers[idx] = p; else this.providers.push(p);
    this.save();
    return p;
  }

  public add(kind: ProviderKind, name?: string): AgentProvider {
    const p = createProvider(kind, this.providers, name);
    this.providers.push(p);
    this.save();
    return p;
  }

  public duplicate(id: string): AgentProvider | undefined {
    const src = this.providers.find(p => p.id === id);
    if (!src) return undefined;
    const copy: AgentProvider = {
      ...src,
      models: src.models.slice(),
      roles: src.roles.slice(),
      id: uniqueProviderId(src.kind, this.providers.map(p => p.id)),
      name: `${src.name} (copy)`
    };
    this.providers.push(copy);
    this.save();
    return copy;
  }

  public remove(id: string): boolean {
    const before = this.providers.length;
    this.providers = this.providers.filter(p => p.id !== id);
    if (this.providers.length !== before) { this.save(); return true; }
    return false;
  }

  /** Applies a detection result to one provider: fills a missing path, and refreshes models for Ollama. */
  public applyDetection(id: string, d: Detection): AgentProvider | undefined {
    const p = this.providers.find(x => x.id === id);
    if (!p) return undefined;
    const next: any = { ...p };
    if (d.path && !p.path) next.path = d.path;
    if (d.models && d.models.length) {
      next.models = d.models;
      if (!d.models.includes(p.defaultModel)) next.defaultModel = d.models[0];
    }
    return this.upsert(next);
  }

  /** Adds a provider for every detected tool that has none yet. Returns the new providers. */
  public addDetected(found: Detection[]): AgentProvider[] {
    const added: AgentProvider[] = [];
    for (const d of found) {
      if (this.providers.some(p => p.kind === d.kind)) continue;
      const p = createProvider(d.kind, this.providers);
      this.providers.push(p);
      added.push(this.applyDetection(p.id, d) || p);
    }
    if (added.length) this.save();
    return added;
  }

  public seedFromAssignees(assignees: Assignee[]): number {
    const added = providersFromAssignees(assignees, this.providers);
    if (added.length) {
      this.providers.push(...added);
      this.save();
    }
    return added.length;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ version: 1, providers: this.providers }, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
    this.listeners.forEach(fn => fn());
  }
}
