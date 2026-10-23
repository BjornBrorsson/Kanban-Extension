import { Ticket } from '../types';
import type { CatalogModel } from './catalog';
import type { AgentProvider } from './providers';
import { priorityRank } from './scheduler';
import { requiredTier } from './limits';

export const REASONING_LEVELS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ReasoningLevel = typeof REASONING_LEVELS[number];

/** Rough multiplier on tokens (cost) and time when the model thinks harder or less. */
export const REASONING_FACTOR: Record<string, number> = { none: 0.55, minimal: 0.65, low: 0.75, medium: 1, high: 1.4, xhigh: 1.9, max: 2.5 };

export function isLevel(v: string | undefined): v is ReasoningLevel {
  return !!v && (REASONING_LEVELS as readonly string[]).includes(v);
}

const order = (l: string) => REASONING_LEVELS.indexOf(l as ReasoningLevel);

/** Levels this model can actually run at: its effort variants (devin/agy ids), else the provider's effort flag. */
export function supportedLevels(provider: AgentProvider, entry?: CatalogModel): string[] {
  const variants = Object.keys(entry?.effortVariants || {}).filter(isLevel);
  if (variants.length >= 2) return variants.sort((a, b) => order(a) - order(b));
  if (provider.effortFlag) return ['low', 'medium', 'high', 'xhigh', 'max'];
  return [];
}

/**
 * The orchestrator's reasoning choice for a task. Starts at the provider's default level and moves up for hard or
 * high-priority work, down for easy work and when optimising for cost or speed. A `reasoning:<level>` label pins it.
 * Returns '' when the model has no reasoning control.
 */
export function pickReasoning(
  ticket: Ticket,
  provider: AgentProvider,
  entry?: CatalogModel,
  objective: 'balanced' | 'cost' | 'speed' = 'balanced'
): string {
  const levels = supportedLevels(provider, entry);
  if (!levels.length) return '';

  const label = (ticket.labels || []).map(l => l.replace(/[`\s]/g, '')).find(l => /^reasoning:/i.test(l));
  if (label) {
    const wanted = label.split(':')[1].toLowerCase();
    if (levels.includes(wanted)) return wanted;
  }

  const baseline = isLevel(provider.defaultReasoning) && levels.includes(provider.defaultReasoning)
    ? provider.defaultReasoning
    : levels.includes('medium') ? 'medium' : levels[Math.floor(levels.length / 2)];

  let shift = 0;
  const need = requiredTier(ticket);
  if (need >= 5) shift += 2;
  else if (need === 4) shift += 1;
  // an ordinary ticket stays at the default; only clearly small / low-priority work is dialled down
  if (priorityRank(ticket.priority) === 3 || /^(xs|s\b|small)/i.test(ticket.estimate || '')) shift -= 1;
  if (priorityRank(ticket.priority) === 0) shift += 1;
  if (/^(l|xl|large)\b/i.test(ticket.estimate || '')) shift += 1;
  if (objective === 'cost' || objective === 'speed') shift -= 1;
  shift = Math.max(-2, Math.min(2, shift));

  const idx = Math.max(0, Math.min(levels.length - 1, levels.indexOf(baseline) + shift));
  return levels[idx];
}

export interface ResolvedReasoning {
  /** The model id to run (an effort variant such as claude-opus-5-5-high when the provider has them). */
  model: string;
  /** Value for the CLI effort flag when the level is applied via a flag instead of a model variant. */
  effort?: string;
  level: string;
}

/** Turns "model + wanted level" into the exact model id and/or effort flag value to launch with. */
export function resolveReasoning(provider: AgentProvider, entry: CatalogModel | undefined, model: string, level: string): ResolvedReasoning {
  if (!level || !isLevel(level)) return { model, level: '' };
  const variants = entry?.effortVariants || {};
  if (variants[level]) return { model: variants[level], level };
  if (provider.effortFlag) return { model, effort: level, level };
  return { model, level: '' };
}
