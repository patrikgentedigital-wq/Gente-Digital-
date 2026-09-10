import type { LucideIcon } from 'lucide-react';

import type {
  AnalyticsStatus,
} from '@/lib/analytics/response';

interface AnalyticsMetricCardProps {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  tone?: 'amber' | 'blue' | 'emerald' | 'slate' | 'rose';
  canShowValues: boolean;
}

const toneClasses: Record<NonNullable<AnalyticsMetricCardProps['tone']>, string> = {
  amber: 'bg-amber-400/15 text-amber-300 ring-amber-400/20',
  blue: 'bg-blue-400/15 text-blue-300 ring-blue-400/20',
  emerald: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/20',
  slate: 'bg-slate-400/15 text-slate-300 ring-slate-400/20',
  rose: 'bg-rose-400/15 text-rose-300 ring-rose-400/20',
};

export function AnalyticsMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'slate',
  canShowValues,
}: AnalyticsMetricCardProps) {
  return (
    <article className="group rounded-2xl border border-zinc-800/80 bg-zinc-950/80 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
          <p className="mt-3 font-display text-3xl font-extrabold tracking-tight text-white">
            {canShowValues ? value.toLocaleString('pt-BR') : '—'}
          </p>
        </div>
        <div className={`rounded-xl p-2.5 ring-1 ${toneClasses[tone]}`} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">{canShowValues ? detail : 'Aguardando cobertura completa da fonte.'}</p>
    </article>
  );
}

interface AnalyticsDimensionListProps {
  title: string;
  items: ReadonlyArray<{ key: string; count: number }>;
  canShowValues: boolean;
  emptyLabel?: string;
}

export function AnalyticsDimensionList({
  title,
  items,
  canShowValues,
  emptyLabel = 'Nenhum registro na janela confirmada.',
}: AnalyticsDimensionListProps) {
  const max = Math.max(...items.map((item) => item.count), 1);

  return (
    <section className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">distribuição</span>
      </div>
      {canShowValues && items.length > 0 ? (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-zinc-400">{item.key}</span>
                <span className="shrink-0 font-semibold tabular-nums text-zinc-200">{item.count.toLocaleString('pt-BR')}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-7 text-center text-xs leading-5 text-zinc-500">
          {canShowValues ? emptyLabel : 'Dimensão indisponível enquanto a cobertura estiver parcial.'}
        </p>
      )}
    </section>
  );
}

export function AnalyticsSourceNotice({ status }: { status: AnalyticsStatus }) {
  if (status === 'success') return null;

  return (
    <div
      className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100"
      role="status"
    >
      <span className="font-semibold">Leitura parcial:</span>{' '}
      os indicadores desta aba só serão exibidos quando a cobertura das fontes estiver completa.
    </div>
  );
}

export function AnalyticsPageIntro({
  eyebrow,
  title,
  description,
  source,
}: {
  eyebrow: string;
  title: string;
  description: string;
  source: string;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-400">{eyebrow}</p>
        <h3 className="mt-2 font-display text-2xl font-bold tracking-tight text-white">{title}</h3>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">{description}</p>
      </div>
      <span className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
        Fonte: {source}
      </span>
    </div>
  );
}

export function AnalyticsUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-950/70 px-6 py-14 text-center shadow-[0_20px_70px_rgba(0,0,0,0.18)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20">
        <span className="font-display text-xl font-bold">—</span>
      </div>
      <h3 className="mt-5 font-display text-xl font-bold text-white">Dados ainda não disponíveis</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-500">
        O painel está conectado ao contrato analítico, mas ainda não recebeu uma sincronização válida do Opa! Suite e do IXC. Nenhum valor foi estimado.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
      >
        Tentar novamente
      </button>
    </div>
  );
}
