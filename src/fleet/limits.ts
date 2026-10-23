import { Ticket } from '../types';
import { AgentProvider } from './providers';
import { SessionManager } from './sessions';
import { priorityRank } from './scheduler';

// ---------------------------------------------------------------- terminal output heuristics

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[()][A-Za-z0-9]|\u001b[=>]/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '').replace(/\r(?!\n)/g, '\n');
}

export interface LimitInfo {
  /** Epoch ms when usage should be available again, if the message said so. */
  resetAt?: number;
  /** The model the limit applies to, when the message names one. */
  model?: string;
  excerpt: string;
}

const LIMIT_RE = new RegExp(
  [
    'usage limit', 'rate[- ]limit', 'quota (?:exceeded|exhausted|reached)', 'limit (?:reached|exceeded)',
    'hit your (?:usage |weekly |daily |5-hour |session )?limit', 'out of (?:credits|usage|quota)',
    'too many requests', '(?:http|status|error|code)\\D{0,12}429', 'resource[_ ]exhausted', 'insufficient[_ ]quota'
  ].join('|'),
  'i'
);

/** Next wall-clock occurrence of H[:MM][am|pm] (today if still ahead, otherwise tomorrow). */
function nextClockTime(hour: number, minute: number, meridiem: string | undefined, now: number): number {
  let h = hour;
  if (meridiem) {
    const pm = /p/i.test(meridiem);
    h = (h % 12) + (pm ? 12 : 0);
  }
  const d = new Date(now);
  d.setHours(h, minute, 0, 0);
  if (d.getTime() <= now) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function parseReset(window: string, now: number): number | undefined {
  // Claude Code style: "usage limit reached|1760000000"
  const epoch = window.match(/limit reached\|(\d{10})/i);
  if (epoch) return Number(epoch[1]) * 1000;

  // "in 2 hours 30 minutes", "after 45m", "retry after 90s": find a number-led phrase after a time keyword
  const phrase = /\b(?:in|after|retry[- ]after:?)\s+(\d[^.\n]{0,40})/gi;
  let pm: RegExpExecArray | null;
  while ((pm = phrase.exec(window)) !== null) {
    const p = pm[1];
    const h = p.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/i);
    const mi = p.match(/(\d+)\s*(?:m|mins?|minutes?)\b/i);
    const se = p.match(/(\d+)\s*(?:s|secs?|seconds?)\b/i);
    const ms = ((h ? Number(h[1]) * 3600 : 0) + (mi ? Number(mi[1]) * 60 : 0) + (se ? Number(se[1]) : 0)) * 1000;
    if (ms > 0) return now + ms;
  }

  const clock = window.match(/resets?(?:\s+at)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (clock && (clock[3] || clock[2] || Number(clock[1]) > 12)) {
    return nextClockTime(Number(clock[1]), Number(clock[2] || 0), clock[3], now);
  }
  return undefined;
}

/** Looks for a usage/rate-limit message in agent output. Heuristic: returns null when nothing convincing is found. */
export function detectLimit(text: string, models: string[] = [], now: number = Date.now()): LimitInfo | null {
  const clean = stripAnsi(text);
  const m = LIMIT_RE.exec(clean);
  if (!m) return null;
  const start = Math.max(0, m.index - 120);
  const around = clean.slice(start, m.index + 260);
  const lower = around.toLowerCase();
  const model = [...models].sort((a, b) => b.length - a.length).find(x => x && lower.includes(x.toLowerCase()));
  return {
    resetAt: parseReset(clean.slice(m.index, m.index + 260), now),
    model,
    excerpt: clean.slice(Math.max(0, m.index - 20), m.index + 140).replace(/\s+/g, ' ').trim()
  };
}

export type FatalKind = 'workspace-trust' | 'auth' | 'missing-cli';

export interface FatalInfo { kind: FatalKind; message: string; excerpt: string }

/**
 * Setup problems no retry can fix (they need you): an untrusted workspace, a signed-out CLI, a missing executable.
 * Detected early so the session stops cleanly instead of failing and retrying in a loop.
 */
export function detectFatal(text: string): FatalInfo | null {
  const clean = stripAnsi(text);
  const rules: { re: RegExp; kind: FatalKind; message: string }[] = [
    {
      re: /(?:refusing to run in an )?untrusted workspace|workspace (?:is )?not trusted|trust this (?:folder|workspace|directory)/i,
      kind: 'workspace-trust',
      message: 'The agent refuses to run in a folder it does not trust. Open the agent interactively in that folder once to trust it (or turn off workspace trust in the agent\'s config).'
    },
    {
      re: /not (?:logged|signed) in|please (?:log ?in|sign ?in)|authentication (?:required|failed)|invalid (?:api key|token)|\b401 unauthorized/i,
      kind: 'auth',
      message: 'The agent is not signed in (or its token expired). Sign in from its terminal, then resume.'
    },
    {
      re: /is not recognized as an internal or external command|command not found|no such file or directory.*(?:devin|claude|gemini|agy|copilot|codex|aider)|cannot find the path specified/i,
      kind: 'missing-cli',
      message: 'The agent command was not found. Check the executable path in Agent Providers (use Detect).'
    }
  ];
  for (const r of rules) {
    const m = r.re.exec(clean);
    if (m) return { kind: r.kind, message: r.message, excerpt: clean.slice(Math.max(0, m.index - 10), m.index + 140).replace(/\s+/g, ' ').trim() };
  }
  return null;
}

const ATTENTION_RE = [
  /\(y\/n\)|\[y\/n\]|\[yes\/no\]/i,
  /do you want to (?:proceed|continue|allow|make this edit|run)/i,
  /press (?:enter|any key)/i,
  /waiting for (?:your )?(?:input|approval|confirmation|response)/i,
  /(?:permission|approval) (?:required|needed)/i,
  /(?:please )?(?:log ?in|sign ?in|authenticate)\b.*(?:required|first|to continue)/i,
  /enter (?:a |your )?(?:password|passphrase|token|api key|code)/i,
  /(?:choose|select) an option/i
];

/** Returns the line that suggests the agent is blocked on the user, if any. */
export function detectAttention(text: string): string | undefined {
  const lines = stripAnsi(text).split('\n').map(l => l.trim()).filter(Boolean).slice(-12);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (ATTENTION_RE.some(re => re.test(lines[i]))) return lines[i].slice(0, 140);
  }
  return undefined;
}

// ---------------------------------------------------------------- capability & fallback

export function parseTierOverrides(text: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (text || '').split(/[,\n]/)) {
    const m = part.trim().match(/^(.+?)\s*[=:]\s*([1-5])$/);
    if (m) out[m[1].trim().toLowerCase()] = Number(m[2]);
  }
  return out;
}

/** 1 (small/fast) to 5 (frontier). Explicit provider overrides win; otherwise name/size heuristics. */
export function modelTier(provider: AgentProvider, model: string): number {
  const name = (model || provider.defaultModel || '').toLowerCase();
  const over = parseTierOverrides(provider.modelTiers);
  if (over[name] !== undefined) return over[name];

  const size = name.match(/(\d+(?:\.\d+)?)b\b/);
  if (size) {
    const b = Number(size[1]);
    return b <= 4 ? 1 : b <= 9 ? 2 : b <= 40 ? 3 : b < 100 ? 4 : 5;
  }
  if (/haiku|flash|(?:^|[-_ :])mini|nano|lite|small|instant/.test(name)) return 2;
  if (/fable|opus|gpt-?5|o3|o1|ultra|gemini.*pro|deepseek-r1/.test(name)) return 5;
  if (/sonnet|gpt-?4|codex|codestral|devstral|coder/.test(name)) return 4;
  return 3;
}

/** How capable a model must be to be trusted with this ticket (1-5). */
export function requiredTier(ticket: Ticket): number {
  let req = 2;
  const rank = priorityRank(ticket.priority);
  if (rank === 0) req = 4;
  else if (rank === 1) req = 3;
  if (/architect|security|migration|refactor/i.test(ticket.type || '')) req = Math.max(req, 4);
  if (/^(l|xl|large)\b/i.test(ticket.estimate || '')) req += 1;
  if ((ticket.labels || []).some(l => /complex|hard/i.test(l))) req = Math.max(req, 4);
  return Math.min(5, req);
}

export interface Fallback {
  provider: AgentProvider;
  model: string;
  tier: number;
  sameProvider: boolean;
}

/**
 * After a model hits its usage limit: find another model that is not limited, has capacity, and is capable enough.
 * "Capable enough" = at least as capable as this ticket needs, but never more than the model it replaces.
 * Prefers the weakest qualifying model so strong models are not burned on easy work.
 */
export function pickFallback(
  providers: AgentProvider[],
  sessions: SessionManager,
  from: { providerId: string; model: string; role: 'worker' | 'reviewer' | 'orchestrator' },
  ticket: Ticket,
  now: number = Date.now()
): Fallback | null {
  const origin = providers.find(p => p.id === from.providerId);
  const originTier = origin ? modelTier(origin, from.model) : 5;
  const needed = Math.min(requiredTier(ticket), originTier);
  const role = from.role === 'orchestrator' ? 'worker' : from.role;

  const options: (Fallback & { pct: number })[] = [];
  for (const p of providers) {
    // Answer-only providers (plain Ollama) cannot edit files, so they never take over coding work.
    if (!p.enabled || p.type !== 'cli' || !p.agentic || !p.roles.includes(role)) continue;
    if (sessions.headroom(p, now) <= 0 && p.id !== from.providerId) continue;
    const models = p.models.length ? p.models : [p.defaultModel];
    for (const model of models) {
      if (p.id === from.providerId && model === from.model) continue;
      if (sessions.modelBlock(p.id, model, now)) continue;
      const tier = modelTier(p, model);
      if (tier < needed) continue;
      options.push({ provider: p, model, tier, sameProvider: p.id === from.providerId, pct: sessions.usage(p, now).pct ?? 0 });
    }
  }
  options.sort((a, b) => a.tier - b.tier || Number(b.sameProvider) - Number(a.sameProvider) || a.pct - b.pct);
  const best = options[0];
  return best ? { provider: best.provider, model: best.model, tier: best.tier, sameProvider: best.sameProvider } : null;
}
