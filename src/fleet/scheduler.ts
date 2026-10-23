import { Ticket } from '../types';
import { AgentProvider } from './providers';
import { SessionManager } from './sessions';
import { Option, OptimizerContext, rankOptions } from './optimizer';

export interface PlanCandidate {
  ticket: Ticket;
  boardId: string;
  boardRoot: string;
}

export interface PlanDecision {
  ticketPath: string;
  ticketId: string;
  title: string;
  boardId: string;
  providerId: string;
  providerName: string;
  model: string;
  /** True when a slot is free right now; false means the session would queue. */
  startsNow: boolean;
  reason: string;
  /** Optimizer estimates (when a model catalog / cost data is available). */
  estMinutes?: number;
  estCost?: number;
  points?: number;
  /** Reasoning level the optimizer chose for this task ('' = not controllable). */
  reasoning?: string;
  /** The runners-up and what they would have cost, for transparency. */
  alternatives?: string[];
}

export interface PlanOptions {
  now?: number;
  /** Upper bound on decisions returned (keeps one tick from flooding the providers). */
  maxNew?: number;
  /** When given, providers/models are chosen by predicted time + cost + quota scarcity instead of plain headroom. */
  optimizer?: OptimizerContext;
}

const PRIORITY_RANK: Record<string, number> = {
  p0: 0, critical: 0, p1: 1, high: 1, p2: 2, medium: 2, normal: 2, p3: 3, low: 3
};

export function priorityRank(priority: string | undefined): number {
  const m = (priority || '').toLowerCase().match(/^(p[0-3]|critical|high|medium|normal|low)/);
  return m ? PRIORITY_RANK[m[1]] : 2;
}

/** Providers the scheduler may drive on its own: CLI agents that are enabled and allowed to work (Ollama only answers, it cannot edit files). */
export function automatableWorkers(providers: AgentProvider[]): AgentProvider[] {
  return providers.filter(p => p.enabled && p.type === 'cli' && p.agentic && p.roles.includes('worker'));
}

/** `model:opus` label on a ticket overrides the provider default (if the provider lists that model). */
export function modelFor(provider: AgentProvider, ticket: Ticket): string {
  const label = (ticket.labels || []).map(l => l.replace(/[`\s]/g, '')).find(l => /^model:/i.test(l));
  if (label) {
    const wanted = label.slice(label.indexOf(':') + 1).toLowerCase();
    const hit = provider.models.find(m => m.toLowerCase() === wanted);
    if (hit) return hit;
  }
  return provider.defaultModel;
}

/** If the wanted model is at its usage limit, use another model of the same provider that is not. */
export function availableModel(provider: AgentProvider, wanted: string, sessions: SessionManager, now: number): string {
  if (!wanted || !sessions.modelBlock(provider.id, wanted, now)) return wanted;
  return provider.models.find(m => !sessions.modelBlock(provider.id, m, now)) ?? wanted;
}

export function matchProvider(providers: AgentProvider[], assignee: string | null | undefined): AgentProvider | undefined {
  if (!assignee) return undefined;
  const key = assignee.trim().toLowerCase();
  return providers.find(p => p.id.toLowerCase() === key) || providers.find(p => p.name.toLowerCase() === key);
}

/**
 * Decides which Ready tickets to hand to which provider, spending each provider's headroom (parallel slots,
 * rolling-window cap, spacing, cooldown) without ever planning past it — that is what keeps the user clear of rate limits.
 */
export function planWork(
  candidates: PlanCandidate[],
  providers: AgentProvider[],
  sessions: SessionManager,
  opts: PlanOptions = {}
): PlanDecision[] {
  const now = opts.now ?? Date.now();
  const maxNew = opts.maxNew ?? 8;
  const workers = automatableWorkers(providers);
  const spent = new Map<string, number>();
  const room = (p: AgentProvider) => sessions.headroom(p, now) - (spent.get(p.id) || 0);

  const ordered = candidates
    .filter(c => !sessions.activeForTicket(c.ticket.path))
    .filter(c => !(c.ticket.unresolvedDependencies && c.ticket.unresolvedDependencies.length))
    .sort((a, b) => priorityRank(a.ticket.priority) - priorityRank(b.ticket.priority) || a.ticket.mtime - b.ticket.mtime);

  const out: PlanDecision[] = [];
  for (const c of ordered) {
    if (out.length >= maxNew) break;
    const t = c.ticket;

    const requested = matchProvider(providers, t.assignee);
    let chosen: AgentProvider | undefined;
    let reason: string;

    if (opts.optimizer) {
      // Cost / speed / quota aware path: rank every capable (provider, model) and take the cheapest overall.
      if (requested && !workers.includes(requested)) continue;
      if (!requested && t.assignee && !/^(unassigned|\u2014|-)$/i.test(t.assignee.trim())) continue;
      const ranked: Option[] = rankOptions(t, workers, sessions, { ...opts.optimizer, now, virtualSpent: spent }, requested);
      const best = ranked[0];
      if (!best) continue;
      if (best.startsNow) spent.set(best.provider.id, (spent.get(best.provider.id) || 0) + 1);
      out.push({
        ticketPath: t.path,
        ticketId: t.id,
        title: t.title,
        boardId: c.boardId,
        providerId: best.provider.id,
        providerName: best.provider.name,
        model: best.model,
        startsNow: best.startsNow,
        reason: (requested ? `Assigned to ${requested.name}. ` : 'Best time/cost/quota trade-off. ') + best.summary,
        estMinutes: best.estMinutes,
        estCost: best.estCost,
        points: best.points,
        reasoning: best.reasoning,
        alternatives: ranked.slice(1, 4).map(o => o.summary)
      });
      continue;
    }
    if (requested) {
      if (!workers.includes(requested)) continue; // assigned to a human / IDE chat: not ours to start
      chosen = requested;
      reason = `Assigned to ${requested.name}`;
    } else if (t.assignee && !/^(unassigned|—|-)$/i.test(t.assignee.trim())) {
      continue; // assigned to a human
    } else {
      const ranked = workers
        .map(p => ({ p, free: room(p), u: sessions.usage(p, now) }))
        .filter(x => x.free > 0)
        .sort((a, b) => (a.u.pct ?? 0) - (b.u.pct ?? 0) || b.free - a.free);
      chosen = ranked[0]?.p;
      reason = chosen ? 'Most headroom available' : 'No provider has free capacity';
    }

    if (!chosen) continue;
    const startsNow = room(chosen) > 0;
    if (startsNow) spent.set(chosen.id, (spent.get(chosen.id) || 0) + 1);
    out.push({
      ticketPath: t.path,
      ticketId: t.id,
      title: t.title,
      boardId: c.boardId,
      providerId: chosen.id,
      providerName: chosen.name,
      model: availableModel(chosen, modelFor(chosen, t), sessions, now),
      startsNow,
      reason: startsNow ? reason : `${reason} — will queue (${sessions.canStart(chosen, now).reason || 'at capacity'})`
    });
  }
  return out;
}

/** Best reviewer: a reviewer-capable provider with headroom, preferring a different one than the author. */
export function pickReviewer(
  providers: AgentProvider[],
  sessions: SessionManager,
  authorProviderId?: string,
  now: number = Date.now()
): AgentProvider | undefined {
  const reviewers = providers.filter(p => p.enabled && p.type === 'cli' && p.roles.includes('reviewer'));
  const scored = reviewers
    .map(p => ({ p, free: sessions.headroom(p, now), other: p.id !== authorProviderId ? 1 : 0, pct: sessions.usage(p, now).pct ?? 0 }))
    .sort((a, b) => (b.free > 0 ? 1 : 0) - (a.free > 0 ? 1 : 0) || b.other - a.other || a.pct - b.pct);
  return scored[0]?.p;
}
