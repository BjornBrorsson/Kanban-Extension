import { Ticket } from '../types';
import { Pricing } from './catalog';
import { AgentProvider } from './providers';

export type Period = 'day' | 'week' | 'month';

/** Rough work size of a ticket in "points" (S=1, M=3, L=8, XL=13). Unknown estimates count as M. */
export function ticketPoints(t: Ticket): number {
  const e = (t.estimate || '').trim().toLowerCase();
  if (/^(xs|s\b|small)/.test(e)) return 1;
  if (/^(xl|extra)/.test(e)) return 13;
  if (/^(l\b|large)/.test(e)) return 8;
  if (/^(m\b|medium)/.test(e)) return 3;
  return 3;
}

/** Tokens an agentic run typically burns per point (reads a lot, writes comparatively little). */
export const TOKENS_PER_POINT = { input: 60_000, output: 8_000 };
/** Share of input tokens assumed served from the provider's prompt cache. */
const CACHED_SHARE = 0.7;

/** Estimated USD for one run of `points` on a model with this pricing. Free/local models cost 0. */
export function estimateCost(pricing: Pricing | undefined, points: number): number {
  if (!pricing || pricing.free) return 0;
  const inTok = TOKENS_PER_POINT.input * points;
  const outTok = TOKENS_PER_POINT.output * points;
  const inPrice = pricing.inPerM ?? 0;
  const cachedPrice = pricing.cachedPerM ?? inPrice;
  const inCost = (inTok * (1 - CACHED_SHARE) * inPrice + inTok * CACHED_SHARE * cachedPrice) / 1e6;
  return inCost + (outTok * (pricing.outPerM ?? 0)) / 1e6;
}

export function periodStart(period: Period, now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
  } else if (period === 'month') {
    d.setDate(1);
  }
  return d.getTime();
}

export function periodEnd(period: Period, now: number): number {
  const d = new Date(periodStart(period, now));
  if (period === 'day') d.setDate(d.getDate() + 1);
  else if (period === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

export const PERIODS: Period[] = ['day', 'week', 'month'];

export function budgetOf(p: AgentProvider, period: Period): number {
  return period === 'day' ? p.budgetDaily : period === 'week' ? p.budgetWeekly : p.budgetMonthly;
}
