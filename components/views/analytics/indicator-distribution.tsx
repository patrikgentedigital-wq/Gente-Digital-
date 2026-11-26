import { useId, type ReactNode } from 'react';

const numbers = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const colors = ['#e6b416', 'var(--distribution-navy)', '#6a8196', '#acbac8', '#50657a', '#d5dee7'];
const rowClass = 'grid min-h-11 w-full grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 px-2 py-2 text-left text-sm';

interface IndicatorDistributionProps {
  title: string;
  description?: string;
  totalLabel: string;
  rows: readonly { key: string; label: string; count: number }[];
  selected?: string;
  onSelect?: (key: string) => void;
  controls?: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
  emptyMessage: string;
}

export function IndicatorDistribution({
  title, description, totalLabel, rows, selected, onSelect, controls, footer, compact = false, emptyMessage,
}: IndicatorDistributionProps) {
  const titleId = useId();
  const ranked = [...rows].sort((left, right) => right.count - left.count || left.key.localeCompare(right.key, 'pt-BR'));
  const total = ranked.reduce((sum, row) => sum + row.count, 0);
  const hasTail = ranked.length > colors.length;
  const colorByKey = new Map(ranked.map((row, index) => [row.key, colors[Math.min(index, colors.length - 1)]]));
  const segments = ranked.slice(0, colors.length).map((row, index) => ({
    color: colors[index],
    count: hasTail && index === colors.length - 1
      ? ranked.slice(index).reduce((sum, item) => sum + item.count, 0)
      : row.count,
  }));
  let offset = 0;
  const stops = total > 0 ? segments.map(({ color, count }, index) => {
    const start = offset / total * 100;
    offset += count;
    const end = index === segments.length - 1 ? 100 : offset / total * 100;
    return color + ' ' + start + '% ' + end + '%';
  }).join(', ') : '';

  return (
    <section
      className="h-full min-w-0 rounded-[25px] border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-[var(--app-shadow)] [--distribution-navy:#20374f] dark:[--distribution-navy:#8da6ca] sm:p-5"
      aria-labelledby={titleId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={titleId} className="text-base font-extrabold">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-[var(--app-muted)]">{description}</p>}
        </div>
        {controls}
      </div>
      {total > 0 ? (
        <div className={'mt-4 gap-x-6 gap-y-4 ' + (compact ? 'grid' : 'flex flex-wrap items-center')}>
          <div className={'min-w-0 flex-[1_0_10rem] ' + (hasTail ? 'self-start sm:pt-5' : '')}>
            <div
              className={'mx-auto grid aspect-square w-full place-items-center rounded-full ' + (compact ? 'max-w-36' : 'max-w-52')}
              style={{ background: segments.length === 1 ? segments[0].color : 'conic-gradient(' + stops + ')' }}
            >
              <div className="grid aspect-square w-[68%] content-center justify-items-center rounded-full bg-[var(--app-panel)] px-2 text-center">
                <strong className="font-display text-4xl leading-none font-bold tracking-tight tabular-nums">{numbers.format(total)}</strong>
                <span className="mt-1 text-xs leading-tight text-[var(--app-muted)]">{totalLabel}</span>
              </div>
            </div>
          </div>
          <div className="min-w-0 flex-[2_1_15rem]">
            <ul className="divide-y divide-[var(--app-border)]">
              {rows.map(row => {
                const content = (
                  <>
                    <span className="size-2 rounded-sm" style={{ backgroundColor: colorByKey.get(row.key) }} aria-hidden="true" />
                    <span className="min-w-0 break-words">{row.label}</span>
                    <strong className="text-right font-bold tabular-nums">{numbers.format(row.count)}</strong>
                    <span className="w-[4.5ch] text-right text-[var(--app-muted)] tabular-nums">{percent.format(row.count / total)}</span>
                  </>
                );
                return (
                  <li key={row.key}>
                    {onSelect ? (
                      <button
                        type="button" onClick={() => onSelect(row.key)} aria-pressed={selected === row.key}
                        className={rowClass + ' rounded-lg hover:bg-[var(--app-panel-muted)] aria-pressed:bg-[var(--app-panel-muted)] aria-pressed:font-bold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--app-ink)]'}
                      >
                        {content}
                      </button>
                    ) : <div className={rowClass}>{content}</div>}
                  </li>
                );
              })}
            </ul>
            {hasTail && (
              <p className="mt-2 px-2 text-xs text-[var(--app-muted)]">
                A fatia cinza-clara reúne os grupos menores. A lista mostra todos separadamente.
              </p>
            )}
          </div>
        </div>
      ) : <p className="mt-4 text-sm text-[var(--app-muted)]">{emptyMessage}</p>}
      {footer}
    </section>
  );
}
