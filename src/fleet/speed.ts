import * as fs from 'fs';
import * as path from 'path';
import { TOKENS_PER_POINT } from './cost';

/** Output tokens/second priors when nothing has been measured. Local speed depends on your hardware: benchmark it. */
export function priorTps(tier: number, local: boolean, sizeB?: number, benchTps?: number): number {
  if (benchTps && benchTps > 0) return benchTps;
  if (local) {
    const b = sizeB ?? 8;
    return b <= 4 ? 40 : b <= 9 ? 25 : b <= 16 ? 14 : b <= 40 ? 6 : 3;
  }
  return tier <= 1 ? 200 : tier === 2 ? 180 : tier === 3 ? 110 : tier === 4 ? 75 : 45;
}

/** Minutes for `points` of work at `tps`: generation time plus tool/test overhead. */
export function priorMinutes(points: number, tps: number): number {
  const generation = (TOKENS_PER_POINT.output * points) / tps / 60;
  return generation + 2 + points;
}

interface Sample { mpp: number; n: number; at: number }

export interface SpeedStore {
  load(): Record<string, Sample>;
  save(data: Record<string, Sample>): void;
}

export class JsonSpeedStore implements SpeedStore {
  constructor(private readonly file: string) {}
  load(): Record<string, Sample> {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { return {}; }
  }
  save(data: Record<string, Sample>): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(data), 'utf8');
    } catch { /* speed history is best-effort */ }
  }
}

/** Learns how long each provider/model really takes (minutes per point) from finished sessions. */
export class SpeedBook {
  private data: Record<string, Sample>;
  constructor(private readonly store?: SpeedStore) {
    this.data = store ? store.load() : {};
  }

  private key(providerId: string, model: string): string { return `${providerId}::${model}`; }

  public record(providerId: string, model: string, points: number, minutes: number): void {
    if (!(points > 0) || !(minutes > 0) || minutes > 24 * 60) return;
    const k = this.key(providerId, model);
    const mpp = minutes / points;
    const cur = this.data[k];
    // exponential moving average, so the estimate follows changes in load / hardware
    this.data[k] = cur ? { mpp: cur.mpp * 0.7 + mpp * 0.3, n: cur.n + 1, at: Date.now() } : { mpp, n: 1, at: Date.now() };
    this.store?.save(this.data);
  }

  public samples(providerId: string, model: string): { minutesPerPoint: number; n: number } | undefined {
    const s = this.data[this.key(providerId, model)];
    return s ? { minutesPerPoint: s.mpp, n: s.n } : undefined;
  }

  /** Blend measured speed into the prior: 3+ finished runs make the measurement dominant. */
  public predict(providerId: string, model: string, points: number, priorMin: number): number {
    const s = this.samples(providerId, model);
    if (!s) return priorMin;
    const w = Math.min(1, s.n / 3);
    return w * s.minutesPerPoint * points + (1 - w) * priorMin;
  }
}
