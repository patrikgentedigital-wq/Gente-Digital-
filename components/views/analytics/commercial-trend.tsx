'use client';

import type { commercialTrendBuckets } from '@/lib/analytics/commercial-panorama';
import { formatDay } from './ixc-period-panel';

export type TrendBucket = ReturnType<typeof commercialTrendBuckets>[number];

interface CommercialTrendProps {
  buckets: TrendBucket[];
  active: TrendBucket | null;
  onSelect: (bucket: TrendBucket) => void;
}

export function CommercialTrend({ buckets, active, onSelect }: CommercialTrendProps) {
  if (!buckets.length) return null;
  const peak = Math.max(1, ...buckets.map(bucket => Math.max(bucket.current, bucket.previous ?? 0)));
  const top = Math.ceil(peak / 2) * 2;
  const hasPrevious = buckets.some(bucket => bucket.previous !== null);
  return (
    <>
      <div className="ix-trend">
        <div className="ix-trend-axis" aria-hidden="true">{[top, top / 2, 0].map(tick => <span key={tick}>{tick}</span>)}</div>
        <div className="ix-trend-buckets" style={{ gridTemplateColumns: 'repeat(' + buckets.length + ', minmax(0,1fr))' }}>
          {buckets.map(bucket => {
            const selected = active?.from === bucket.from && active.to === bucket.to;
            const label = formatDay(bucket.from) + ' a ' + formatDay(bucket.to) + ', ' + bucket.current + ' no período atual'
              + (bucket.previous === null ? '' : ', ' + bucket.previous + ' no intervalo anterior');
            return <button className="ix-trend-bucket" key={bucket.from} type="button" aria-label={label + '. Ver registros do intervalo atual.'}
              aria-controls="commercial-detail" title={label} aria-pressed={selected} onClick={() => onSelect(bucket)}>
              <span aria-hidden="true" className="ix-bars">
                {bucket.previous !== null && <span className="ix-bar ix-prior" style={{ height: bucket.previous / top * 100 + '%' }} />}
                <span className="ix-bar ix-now" style={{ height: bucket.current / top * 100 + '%' }}>
                  <span className={bucket.current / top < .14 ? 'ix-bar-label above' : 'ix-bar-label'}>{bucket.current}</span>
                </span>
              </span>
              <span className="ix-tick" aria-hidden="true">{bucket.label}{bucket.partial && '*'}</span>
            </button>;
          })}
        </div>
      </div>
      <ul className="ix-legend" aria-label="Séries do gráfico">
        <li><i aria-hidden="true" className="ix-now" />Atual</li>
        {hasPrevious && <li><i aria-hidden="true" className="ix-prior" />Anterior</li>}
      </ul>
      {buckets.some(bucket => bucket.partial) && <p className="ix-caption">* Os intervalos indicados podem ter durações diferentes.</p>}
    </>
  );
}
