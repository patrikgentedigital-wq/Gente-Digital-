'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import type { commercialTrendBuckets } from '@/lib/analytics/commercial-panorama';
import { formatDay } from './ixc-period-panel';

export type TrendBucket = ReturnType<typeof commercialTrendBuckets>[number];

interface CommercialTrendProps {
  buckets: readonly TrendBucket[];
  active: TrendBucket | null;
  onSelect: (bucket: TrendBucket) => void;
}

export function CommercialTrend({ buckets, active, onSelect }: CommercialTrendProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const currentColor = dark ? '#d6e2ef' : '#233d58';
  const previousColor = dark ? '#8796ab' : '#647990';
  const max = Math.max(1, ...buckets.map(({ current, previous }) => Math.max(current, previous ?? 0)));
  const step = Math.max(1, Math.ceil(max * 1.15 / 4));
  const top = step * 4;
  const ticks = [top, step * 3, step * 2, step, 0];
  const hasPrevious = buckets.some(bucket => bucket.previous !== null);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    function draw() {
      const surface = canvas.current;
      if (!surface) return;
      const { clientWidth: width, clientHeight: height } = surface;
      const scale = window.devicePixelRatio || 1;
      surface.width = Math.round(width * scale);
      surface.height = Math.round(height * scale);
      const context = surface.getContext('2d');
      if (!context) return;
      context.scale(scale, scale);
      context.lineCap = 'round';
      context.lineJoin = 'round';

      const points = (key: 'current' | 'previous') => buckets.map((bucket, index) => {
        const value = bucket[key];
        return value === null ? null : { x: (index + .5) * width / buckets.length, y: height * (1 - value / top) };
      });
      type Point = { x: number; y: number };
      const trace = (series: readonly (Point | null)[]) => {
        let last: Point | null = null;
        for (const point of series) {
          if (point && last) {
            const middle = (last.x + point.x) / 2;
            context.bezierCurveTo(middle, last.y, middle, point.y, point.x, point.y);
          } else if (point) context.moveTo(point.x, point.y);
          last = point;
        }
      };

      const current = points('current');
      const first = current[0];
      const last = current.at(-1);
      if (first && last && current.length > 1) {
        context.beginPath();
        trace(current);
        context.lineTo(last.x, height);
        context.lineTo(first.x, height);
        context.closePath();
        const fill = context.createLinearGradient(0, 0, 0, height);
        fill.addColorStop(0, currentColor);
        fill.addColorStop(1, 'transparent');
        context.fillStyle = fill;
        context.globalAlpha = .15;
        context.fill();
        context.globalAlpha = 1;
      }

      const previous = points('previous');
      context.beginPath();
      trace(previous);
      context.strokeStyle = previousColor;
      context.lineWidth = 1.8;
      context.setLineDash([5, 5]);
      context.stroke();
      const priorPoints = previous.filter(point => point !== null);
      if (priorPoints.length === 1) {
        context.beginPath();
        context.setLineDash([]);
        context.arc(priorPoints[0].x, priorPoints[0].y, 5, 0, 2 * Math.PI);
        context.stroke();
      }

      context.beginPath();
      trace(current);
      context.strokeStyle = currentColor;
      context.lineWidth = 2.5;
      context.setLineDash([]);
      context.stroke();
    }

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => observer.disconnect();
  }, [buckets, top, currentColor, previousColor]);

  if (!buckets.length) return null;

  return (
    <>
      <ul aria-label="Séries do gráfico" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--app-muted)]">
        {hasPrevious && <li className="flex items-center gap-1.5"><i aria-hidden="true" className="w-4 border-t-2 border-dashed" style={{ borderColor: previousColor }} />Anterior</li>}
        <li className="flex items-center gap-1.5"><i aria-hidden="true" className="w-4 border-t-2" style={{ borderColor: currentColor }} />Atual</li>
      </ul>
      <div className="mt-6 grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-2">
        <div className="relative h-40 text-right text-[10px] text-[var(--app-muted)] sm:h-48" aria-hidden="true">
          {ticks.map((tick, index) => <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: index * 25 + '%' }}>{tick}</span>)}
        </div>
        <div className="relative min-w-0">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 flex h-40 flex-col justify-between sm:h-48">
            {ticks.map(tick => <i key={tick} className="border-t border-[var(--app-border)]" />)}
          </div>
          <canvas aria-hidden="true" ref={canvas} className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full sm:h-48" />
          <div className="relative grid min-w-0" style={{ gridTemplateColumns: 'repeat(' + buckets.length + ',minmax(0,1fr))' }}>
            {buckets.map((bucket) => {
              const selected = active?.from === bucket.from && active.to === bucket.to;
              const label = formatDay(bucket.from) + ' a ' + formatDay(bucket.to) + ', ' + bucket.current + ' no período atual'
                + (bucket.previous === null ? '' : ', ' + bucket.previous + ' no intervalo anterior');
              return (
                <button key={bucket.from} type="button" title={label} aria-label={label + '. Ver registros do intervalo atual.'}
                  aria-controls="commercial-detail" aria-pressed={selected} onClick={() => onSelect(bucket)}
                  className="min-w-0 rounded-2xl text-[var(--app-muted)] outline-offset-1 hover:bg-[var(--app-ink)]/5 focus-visible:outline-2 aria-pressed:bg-[var(--app-ink)]/8">
                  <span className="relative block h-40 w-full sm:h-48" aria-hidden="true">
                    <span className="absolute left-1/2 size-2 -translate-x-1/2 translate-y-1/2 rounded-full border-2 bg-[var(--app-panel)]"
                      style={{ borderColor: currentColor, bottom: bucket.current / top * 100 + '%' }}>
                      <strong className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1 text-[11px] text-[var(--app-ink)]">{bucket.current}</strong>
                    </span>
                  </span>
                  <span aria-hidden="true" className="flex min-h-8 items-center justify-center break-all px-0.5 text-[10px] leading-tight">{bucket.label}{bucket.partial && '*'}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      {buckets.some(bucket => bucket.partial) && <p className="mt-1 text-xs text-[var(--app-muted)]">* Os intervalos indicados podem ter durações diferentes.</p>}
    </>
  );
}
