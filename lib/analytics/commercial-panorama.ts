import type { CommercialMetrics, CommercialPeriod, CommercialRecord } from './commercial-ixc';

export interface CommercialDayCount {
  date: string;
  count: number;
}

export type CommercialDailyTotals = Record<keyof CommercialMetrics, CommercialDayCount[] | null>;

const dayMs = 86_400_000;
const iso = (date: number) => new Date(date).toISOString().slice(0, 10);
const shortDay = (date: string) => date.slice(8) + '/' + date.slice(5, 7);

export function countCommercialDays(rows: readonly Pick<CommercialRecord, 'date'>[]): CommercialDayCount[] {
  const counts = new Map<string, number>();
  for (const { date } of rows) counts.set(date, (counts.get(date) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right))
    .map(([date, count]) => ({ date, count }));
}

function sumBetween(counts: readonly CommercialDayCount[], from: string, to: string) {
  return counts.reduce((total, item) => item.date >= from && item.date <= to ? total + item.count : total, 0);
}

export function commercialTrendBuckets(
  period: CommercialPeriod,
  current: readonly CommercialDayCount[],
  prior: CommercialPeriod | null,
  previous: readonly CommercialDayCount[] | null | undefined,
) {
  const start = Date.parse(period.from);
  const stop = Date.parse(period.to);
  const span = (stop - start) / dayMs + 1;
  if (!Number.isInteger(span) || span < 1 || span > 92) return [];

  const bucketDays = span <= 7 ? 1 : span <= 49 ? 7 : 14;
  const bucketMs = bucketDays * dayMs;
  const priorStart = Date.parse(prior?.from ?? '');
  const priorStop = Date.parse(prior?.to ?? '');
  const comparable = previous != null && Number.isFinite(priorStart) && Number.isFinite(priorStop);

  return Array.from({ length: Math.ceil(span / bucketDays) }, (_, index) => {
    const fromMs = start + index * bucketMs;
    const toMs = Math.min(fromMs + bucketMs - dayMs, stop);
    const from = iso(fromMs);
    const to = iso(toMs);
    const previousFrom = priorStart + index * bucketMs;
    const previousTo = toMs === stop ? priorStop : Math.min(previousFrom + bucketMs - dayMs, priorStop);
    const hasPrevious = comparable && previousFrom <= previousTo;
    const partial = toMs - fromMs + dayMs < bucketMs
      || (hasPrevious && previousTo - previousFrom !== toMs - fromMs);
    const label = from === to ? shortDay(from)
      : from.slice(0, 7) === to.slice(0, 7) ? from.slice(8) + '–' + shortDay(to) : shortDay(from) + '–' + shortDay(to);

    return {
      from, to, label, current: sumBetween(current, from, to),
      previous: hasPrevious ? sumBetween(previous, iso(previousFrom), iso(previousTo)) : null,
      partial,
    };
  });
}
