import { Ticket } from '../types';
import { AgentProvider } from './providers';
import { SessionManager } from './sessions';
import { CatalogIndex, estimatePricing } from './catalog';
import { PERIODS, budgetOf, estimateCost, periodEnd, periodStart, ticketPoints } from './cost';
import { SpeedBook, priorMinutes, priorTps } from './speed';
import { modelTier, parseTierOverrides, requiredTier } from './limits';
import { REASONING_FACTOR, pickReasoning, resolveReasoning } from './reasoning';

export type Objective = 'balanced' | 'cost' | 'speed';

export interface Weights {
  /** What one minute of waiting is worth, in USD. */
  timeValuePerMin: number;
  /** What a provider's whole quota window is worth, in USD (prices scarce quota). */
  quotaValue: number;
}

export const OBJECTIVES: Record<Objective, Weights> = {
  balanced: { timeValuePerMin: 0.2, quotaValue: 50 },
  cost: { timeValuePerMin: 0.05, quotaValue: 50 },
  speed: { timeValuePerMin: 1.0, quotaValue: 20 }
};

export interface OptimizerContext {
  catalog: CatalogIndex;
  speed: SpeedBook;
  /** Measured local tokens/second per `providerId::model` (from the benchmark script). */
  bench?: Record<string, { tps: number }>;
  objective?: Objective;
  /** Never pick a model weaker than this for automatic assignments (1-5). */
  minTier?: number;
  weights?: Partial<Weights>;
  now?: number;
  /** Slots already promised to other tickets in this planning pass. */
  virtualSpent?: Map<string, number>;
}

export interface Option {
  provider: AgentProvider;
  model: string;
  tier: number;
  points: number;
  estMinutes: number;
  estCost: number;
  /** Reasoning level the orchestrator picked ('' = not controllable) and the CLI effort value when set by flag. */
  reasoning: string;
  effort?: string;
  /** Minutes until a slot/budget/quota is available (0 = start now). */
  waitMinutes: number;
  lambda: number;
  score: number;
  startsNow: boolean;
  summary: string;
}

const MAX_WAIT_MIN = 8 * 60;

const pow2 = (x: number) => x * x;

/**
 * How scarce is this provider's quota right now? lambda is about 0 when plenty is left or the window is about to reset
 * (use it or lose it) and large when most of it is gone with a long time to wait for the reset.
 */
export function quotaPressure(
  p: AgentProvider,
  sessions: SessionManager,
  now: number
): { lambdaCount: number; lambdaBudget: number; share: number } {
  let lambdaCount = 0;
  let share = 0;
  if (p.maxSessionsPerWindow > 0) {
    const starts = sessions.windowStarts(p, now);
    const windowMs = p.windowMinutes * 60_000;
    const remaining = Math.max(0, 1 - starts.length / p.maxSessionsPerWindow);
    const timeLeft = starts.length ? Math.min(1, Math.max(0, (starts[0] + windowMs - now) / windowMs)) : 1;
    lambdaCount = remaining <= 0.001 ? 10 : Math.min(10, pow2(timeLeft / remaining));
    share = 1 / p.maxSessionsPerWindow;
  }

  let lambdaBudget = 0;
  for (const period of PERIODS) {
    const cap = budgetOf(p, period);
    if (cap <= 0) continue;
    const start = periodStart(period, now);
    const end = periodEnd(period, now);
    const remaining = Math.max(0, 1 - sessions.spentSince(p.id, start) / cap);
    const timeLeft = (end - now) / (end - start);
    lambdaBudget = Math.max(lambdaBudget, remaining <= 0.001 ? 10 : Math.min(10, pow2(timeLeft / remaining)));
  }
  return { lambdaCount, lambdaBudget, share };
}

export interface RunEstimate { points: number; tier: number; estCost: number; estMinutes: number; local: boolean }

/** Predicted size, cost and duration of running this ticket on this provider + model. */
export function estimateRun(ticket: Ticket, p: AgentProvider, model: string, ctx: Pick<OptimizerContext, 'catalog' | 'speed' | 'bench'>, level = ''): RunEstimate {
  const points = ticketPoints(ticket);
  const entry = ctx.catalog.get(p.id, model);
  const local = entry ? entry.local : p.kind === 'ollama' || p.kind === 'ollama-aider';
  const hasOverride = parseTierOverrides(p.modelTiers)[model.toLowerCase()] !== undefined;
  const tier = entry && !hasOverride ? entry.tier : modelTier(p, model);
  const pricing = ctx.catalog.pricingFor(p.id, model) || entry?.pricing || estimatePricing(tier, local);
  const factor = REASONING_FACTOR[level] ?? 1; // thinking harder costs more tokens and time
  const tps = priorTps(tier, local, entry?.sizeB, ctx.bench?.[`${p.id}::${model}`]?.tps);
  return {
    points, tier, local,
    estCost: estimateCost(pricing, points) * factor,
    estMinutes: ctx.speed.predict(p.id, model, points, priorMinutes(points, tps)) * factor
  };
}

function candidateModels(p: AgentProvider, catalog: CatalogIndex): string[] {
  const fromCatalog = catalog.visible(p.id).map(m => m.id);
  const ids = fromCatalog.length ? fromCatalog : p.models.length ? p.models : [p.defaultModel];
  return [...new Set([...ids, ...(p.pinnedModels || [])])];
}

/**
 * Ranks every (provider, model) that is capable enough for the ticket by one comparable cost:
 *   time  = (run minutes + minutes until it can start) x value of a minute
 *   money = estimated USD, inflated when a spend cap is running out
 *   quota = share of a scarce session quota this run uses x how scarce it is x value of the quota
 * Lowest total wins, so a slow free local model beats a metered one when quota is scarce, and loses when quota is about to reset.
 */
export function rankOptions(
  ticket: Ticket,
  providers: AgentProvider[],
  sessions: SessionManager,
  ctx: OptimizerContext,
  restrictTo?: AgentProvider
): Option[] {
  const now = ctx.now ?? Date.now();
  const w: Weights = { ...OBJECTIVES[ctx.objective || 'balanced'], ...(ctx.weights || {}) };
  const points = ticketPoints(ticket);
  const needed = Math.max(requiredTier(ticket), ctx.minTier || 0);
  // A `model:<name>` label on the ticket restricts the choice to matching models (id contains the name).
  const modelLabel = (ticket.labels || []).map(l => l.replace(/[`\s]/g, '')).find(l => /^model:/i.test(l));
  const modelWanted = modelLabel ? modelLabel.slice(modelLabel.indexOf(':') + 1).toLowerCase() : '';
  const options: Option[] = [];

  for (const p of restrictTo ? [restrictTo] : providers) {
    const pressure = quotaPressure(p, sessions, now);
    const allModels = candidateModels(p, ctx.catalog);
    const labelled = modelWanted ? allModels.filter(m => m.toLowerCase().includes(modelWanted)) : [];
    for (const model of labelled.length ? labelled : modelWanted && restrictTo === undefined && providers.some(q => candidateModels(q, ctx.catalog).some(m => m.toLowerCase().includes(modelWanted))) ? [] : allModels) {
      if (sessions.modelBlock(p.id, model, now)) continue;
      const entry = ctx.catalog.get(p.id, model);
      const wanted = pickReasoning(ticket, p, entry, ctx.objective || 'balanced');
      const resolved = resolveReasoning(p, entry, model, wanted);
      if (resolved.model !== model && sessions.modelBlock(p.id, resolved.model, now)) continue;
      const run = estimateRun(ticket, p, resolved.model, ctx, resolved.level);
      const { tier, estCost, estMinutes } = run;
      if (tier < needed) continue;

      const check = sessions.canStart(p, now, estCost);
      const virtual = ctx.virtualSpent?.get(p.id) || 0;
      let waitMinutes = 0;
      if (!check.ok) {
        waitMinutes = check.retryAt ? Math.max(0, (check.retryAt - now) / 60_000) : estMinutes / 2;
      } else if (sessions.headroom(p, now) - virtual <= 0) {
        waitMinutes = estMinutes / 2; // slots taken by other tickets in this pass: roughly half a run until one frees
      }
      if (waitMinutes > MAX_WAIT_MIN) continue;

      const lambda = Math.max(pressure.lambdaCount, pressure.lambdaBudget);
      const timeCost = (estMinutes + waitMinutes) * w.timeValuePerMin;
      const moneyCost = estCost * (1 + pressure.lambdaBudget);
      const quotaCost = pressure.lambdaCount * pressure.share * w.quotaValue;
      const score = timeCost + moneyCost + quotaCost;
      const startsNow = waitMinutes === 0;
      options.push({
        provider: p, model: resolved.model, tier, points, estMinutes, estCost, reasoning: resolved.level, effort: resolved.effort,
        waitMinutes, lambda, score, startsNow,
        summary: `${p.name}${resolved.model ? ' · ' + resolved.model : ''}${resolved.level && !resolved.model.endsWith(resolved.level) ? ' (' + resolved.level + ')' : ''}: ~${Math.round(estMinutes)} min` +
          `${estCost > 0 ? `, ~$${estCost.toFixed(2)}` : ', free'}` +
          `${waitMinutes > 0 ? `, starts in ~${Math.round(waitMinutes)} min` : ''}` +
          `${lambda > 0.5 ? `, quota ${lambda >= 2 ? 'scarce' : 'tight'}` : ''}`
      });
    }
  }
  return options.sort((a, b) => a.score - b.score);
}
