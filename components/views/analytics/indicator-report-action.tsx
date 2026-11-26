'use client';

import { Download, FileText, Sheet, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CommercialPeriod } from '@/lib/analytics/commercial-ixc';
import { loadIndicatorReport, type IndicatorReport, type ReportScope } from '@/lib/analytics/indicator-report';

type Format = 'pdf' | 'xlsx';

const scopes = {
  consolidado: 'Vendas e cancelamentos',
  vendas: 'Somente vendas',
  cancelamentos: 'Somente cancelamentos',
} satisfies Record<ReportScope, string>;

function ReportDialog({ period, onClose }: { period: CommercialPeriod; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useRef<AbortController | null>(null);
  const snapshot = useRef<{ scope: ReportScope; report: IndicatorReport } | null>(null);
  const [scope, setScope] = useState<ReportScope>('consolidado');
  const [busy, setBusy] = useState<Format | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
    return () => pending.current?.abort();
  }, []);

  async function download(format: Format) {
    if (pending.current) return;
    const task = new AbortController();
    pending.current = task;
    setBusy(format);
    setError('');
    try {
      if (snapshot.current?.scope !== scope) {
        setStatus('Consultando os dados do período no IXC…');
        const report = await loadIndicatorReport(period, scope, task.signal);
        if (task.signal.aborted) return;
        snapshot.current = { scope, report };
      }
      const report = snapshot.current.report;
      setStatus(format === 'pdf' ? 'Preparando o PDF…' : 'Preparando a planilha…');
      const blob = format === 'pdf'
        ? await (await import('@/lib/reports/indicator-pdf')).createIndicatorPdf(report)
        : await (await import('@/lib/reports/indicator-xlsx')).createIndicatorXlsx(report);
      if (task.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'gente-digital-' + scope + '-' + period.from + '-a-' + period.to + '.' + format;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus('Download do ' + (format === 'pdf' ? 'PDF' : 'Excel') + ' iniciado.');
    } catch (cause) {
      if (task.signal.aborted) return;
      setStatus('');
      setError(cause instanceof Error ? cause.message : 'Falha ao gerar o arquivo. Tente novamente.');
    } finally {
      if (!task.signal.aborted) {
        pending.current = null;
        setBusy(null);
      }
    }
  }

  return (
    <dialog ref={dialog} className="ix-report-dialog" aria-labelledby="ix-report-title" onClose={onClose}>
      <header>
        <h2 id="ix-report-title">Gerar relatório</h2>
        <button type="button" className="ix-report-close" onClick={() => dialog.current?.close()} aria-label="Fechar relatório">
          <X size={19} aria-hidden="true" />
        </button>
      </header>
      <p className="ix-report-period">{period.from.split('-').reverse().join('/')} a {period.to.split('-').reverse().join('/')}</p>
      <label className="ix-report-scope">
        <span>Incluir no relatório</span>
        <select value={scope} disabled={!!busy} onChange={event => {
          setScope(event.target.value as ReportScope);
          setStatus('');
          setError('');
        }}>
          {Object.entries(scopes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <p className="ix-report-hint">Inclui o resumo, a comparação e todos os registros do período, mesmo com filtros ativos na tabela.</p>
      <div className="ix-report-formats">
        <button type="button" disabled={!!busy} onClick={() => void download('pdf')}>
          <FileText size={17} aria-hidden="true" />Baixar PDF
        </button>
        <button type="button" disabled={!!busy} onClick={() => void download('xlsx')}>
          <Sheet size={17} aria-hidden="true" />Baixar Excel
        </button>
      </div>
      <p role="status" className="ix-report-status">{status}</p>
      {error && <p role="alert" className="ix-report-error">{error}</p>}
    </dialog>
  );
}

export function IndicatorReportAction({ period, disabled }: { period: CommercialPeriod; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="ix-report-action" aria-haspopup="dialog" disabled={disabled} onClick={() => setOpen(true)}>
      <Download size={16} aria-hidden="true" />Gerar relatório
    </button>
    {open && <ReportDialog period={period} onClose={() => setOpen(false)} />}
  </>;
}
