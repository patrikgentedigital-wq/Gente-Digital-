import type { CommercialPeriod } from './commercial-ixc';

const dayMs = 86_400_000;
const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' });

export type PeriodPreset = 'this-month' | 'previous-month' | 'last-seven';

export function businessToday() {
  return localDate.format(new Date());
}

function iso(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function previousMonth(first: string): CommercialPeriod {
  const end = iso(Date.parse(first) - dayMs);
  return { from: end.slice(0, 8) + '01', to: end };
}

export function presetPeriod(preset: PeriodPreset, today: string): CommercialPeriod {
  const first = today.slice(0, 8) + '01';
  if (preset === 'previous-month') return previousMonth(first);
  if (preset === 'last-seven') return { from: iso(Date.parse(today) - 6 * dayMs), to: today };
  return { from: first, to: today };
}

export function comparisonPeriod(period: CommercialPeriod, today: string): CommercialPeriod | null {
  const start = Date.parse(period.from);
  const end = Date.parse(period.to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start >= 92 * dayMs
    || iso(start) !== period.from || iso(end) !== period.to) return null;
  if (period.from.endsWith('-01') && period.from.slice(0, 7) === period.to.slice(0, 7)) {
    const last = iso(end + dayMs).endsWith('-01');
    const previous = previousMonth(period.from);
    if (last && period.to < today) return previous;
    if (period.to === today) {
      const matchingDay = previous.from.slice(0, 8) + period.to.slice(8);
      return { ...previous, to: matchingDay < previous.to ? matchingDay : previous.to };
    }
  }
  return { from: iso(start - (end - start) - dayMs), to: iso(start - dayMs) };
}

export interface IxcSnapshot<Metrics> {
  metrics: Partial<Metrics>;
  timestamps: Partial<Record<keyof Metrics, string>>;
}

export function saveIxcSnapshot<Metrics extends object>(
  previous: IxcSnapshot<Metrics> | undefined,
  incoming: Metrics,
  readAt: string,
): IxcSnapshot<Metrics> {
  const metrics: IxcSnapshot<Metrics>['metrics'] = { ...previous?.metrics };
  const timestamps: IxcSnapshot<Metrics>['timestamps'] = { ...previous?.timestamps };
  for (const key in incoming) {
    if (incoming[key] == null) continue;
    metrics[key] = incoming[key];
    timestamps[key] = readAt;
  }
  return { metrics, timestamps };
}
