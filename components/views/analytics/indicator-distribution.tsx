import { useLayoutEffect, useRef, type ReactNode } from 'react';

const numbers = new Intl.NumberFormat('pt-BR');
const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const colors = ['var(--gd-turquoise)', 'var(--gd-yellow)', '#697e7d', '#116e6b', '#5b7470', '#9aaead'];

interface IndicatorDistributionProps {
  title: string;
  description?: string;
  totalLabel: string;
  rows: readonly { key: string; label: string; count: number }[];
  selected?: string;
  onSelect?: (key: string) => void;
  selectedRowDetail?: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
  emptyMessage: string;
}

export function IndicatorDistribution({
  title, description, totalLabel, rows, selected, onSelect, selectedRowDetail, controls, footer, compact = false, emptyMessage,
}: IndicatorDistributionProps) {
  const titleId = compact ? 'commercial-distribution' : 'cancellation-reasons';
  const detailRef = useRef<HTMLDivElement>(null);
  const expandable = selectedRowDetail !== undefined;
  useLayoutEffect(() => {
    const detail = detailRef.current;
    if (detail?.getClientRects().length) detail.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const ranked = [...rows].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'pt-BR', { numeric: true }));
  const total = ranked.reduce((sum, row) => sum + row.count, 0);
  const max = ranked[0]?.count ?? 0;
  const colorByKey = new Map(ranked.map((row, index) => [row.key, colors[Math.min(index, colors.length - 1)]]));
  const segments = ranked.slice(0, colors.length).map((row, index) => ({
    color: colors[index],
    count: index === colors.length - 1 ? ranked.slice(index).reduce((sum, item) => sum + item.count, 0) : row.count,
  }));

  return (
    <section className="ix-pane ix-distribution" aria-labelledby={titleId}>
      <header className="ix-pane-head">
        <div><h3 id={titleId}>{title}</h3>{description && <p>{description}</p>}</div>
        {controls}
      </header>
      {total > 0 ? <>
        {compact && <>
          <p className="ix-total"><strong>{numbers.format(total)}</strong> {totalLabel}</p>
          <div className="ix-mix" aria-hidden="true">
            {segments.filter(item => item.count).map(item => <span key={item.color} style={{ flexGrow: item.count, background: item.color }} />)}
          </div>
        </>}
        <ul className={compact ? 'ix-ranking compact' : 'ix-ranking reasons'}>
          {rows.map(row => {
            const active = selected === row.key;
            const color = colorByKey.get(row.key);
            const content = <>
              {compact && <i className="ix-dot" style={{ background: color }} aria-hidden="true" />}
              <span className="ix-category">{row.label}</span>
              <span className="ix-count">{numbers.format(row.count)}</span>
              <span className="ix-share">{percent.format(row.count / total)}</span>
              {!compact && <span className="ix-reason-track" aria-hidden="true"><i style={{ width: row.count / max * 100 + '%', background: color }} /></span>}
            </>;
            return <li key={row.key}>
              {onSelect ? <button type="button" onClick={() => onSelect(row.key)}
                aria-pressed={expandable ? undefined : active} aria-expanded={expandable ? active : undefined}
                className="ix-rank-row">{content}</button> : <div className="ix-rank-row">{content}</div>}
              {active && selectedRowDetail && <div ref={detailRef} className="ix-reason-detail lg:hidden">
                {selectedRowDetail}
              </div>}
            </li>;
          })}
        </ul>
        {compact && ranked.length > colors.length && <p className="ix-caption">O último segmento reúne as demais categorias, detalhadas na lista.</p>}
      </> : <p className="ix-empty">{emptyMessage}</p>}
      {footer}
    </section>
  );
}
