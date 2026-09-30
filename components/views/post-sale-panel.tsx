'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, CalendarDays, CheckCircle2, Loader2, RefreshCw, UserRoundCog, X } from 'lucide-react';
import { sanitizeCsvField } from '@/lib/utils';
import type { PostSaleCollaborator, PostSaleContact, PostSaleDashboardResponse, PostSaleMetricConversion } from '@/lib/post-sale/contracts';
import { PostSaleReviewDialog } from '@/components/views/post-sale-review-dialog';

type DashboardData = PostSaleDashboardResponse & {
  success: boolean;
};

interface Props {
  onRequestCollection(): void;
}

const inputClass = 'min-w-0 rounded-xl border border-brand-border bg-white px-3 py-2 text-sm text-brand-charcoal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-zinc-900 dark:text-white';

function currentBusinessMonth(): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${day}` };
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(date);
}

function downloadCsv(name: string, rows: Array<Array<string | number | null | undefined>>) {
  const content = `\uFEFF${rows.map((row) => row.map((field) => sanitizeCsvField(field)).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, hint, accent = 'blue' }: { label: string; value: string | number; hint?: string; accent?: 'blue' | 'green' | 'amber' | 'gray' }) {
  const colors = {
    blue: 'text-blue-700 dark:text-blue-300',
    green: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    gray: 'text-brand-charcoal dark:text-white',
  };
  return (
    <article className="rounded-2xl border border-brand-border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-zinc-900 sm:p-5">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-brand-muted dark:text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-black tracking-tight ${colors[accent]}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-brand-muted dark:text-gray-500">{hint}</p>}
    </article>
  );
}

function AttributionDialog({
  collectionId,
  currentCollectorId,
  collaborators,
  onClose,
  onSaved,
}: {
  collectionId: string;
  currentCollectorId: string;
  collaborators: PostSaleCollaborator[];
  onClose(): void;
  onSaved(): void | Promise<void>;
}) {
  const [collectorId, setCollectorId] = useState(currentCollectorId);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!collectorId || reason.trim().length < 10) {
      setError('Selecione o novo coletor e informe o motivo da correção (mínimo de 10 caracteres).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/post-sale/collections/${encodeURIComponent(collectionId)}/collector`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectorColaboradorId: collectorId, reason: reason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível salvar a correção.');
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao salvar a correção.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="collector-correction-title" className="w-full max-w-lg overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl dark:border-gray-800 dark:bg-[#18181b]">
        <header className="flex items-start justify-between gap-4 border-b border-brand-border px-5 py-4 dark:border-gray-800">
          <div><p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">Auditoria administrativa</p><h2 id="collector-correction-title" className="mt-1 font-extrabold text-brand-charcoal dark:text-white">Corrigir coletor</h2><p className="mt-1 text-xs text-brand-muted dark:text-gray-400">A atribuição anterior, o novo coletor, o administrador e o motivo serão registrados.</p></div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 px-5 py-5">
          <label className="block space-y-1.5 text-xs font-bold text-brand-muted dark:text-gray-400"><span>Novo coletor</span><select value={collectorId} onChange={(event) => setCollectorId(event.target.value)} className={inputClass + ' w-full'}>{collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name} · {collaborator.id}</option>)}</select></label>
          <label className="block space-y-1.5 text-xs font-bold text-brand-muted dark:text-gray-400"><span>Motivo da correção</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={4} placeholder="Explique por que a atribuição precisa ser corrigida." className={inputClass + ' w-full'} /></label>
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/25 dark:text-red-300">{error}</div>}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-brand-border px-5 py-4 dark:border-gray-800 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-brand-border px-4 py-2.5 text-sm font-bold text-brand-muted dark:border-gray-700 dark:text-gray-300">Cancelar</button><button type="button" onClick={submit} disabled={saving || reason.trim().length < 10 || !collectorId || collectorId === currentCollectorId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-brand-yellow dark:text-brand-charcoal">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? 'Salvando' : 'Registrar correção'}</button></footer>
      </section>
    </div>
  );
}

export function PostSalePanel({ onRequestCollection }: Props) {
  const defaults = useMemo(() => currentBusinessMonth(), []);
  const [collectionStart, setCollectionStart] = useState(defaults.start);
  const [collectionEnd, setCollectionEnd] = useState(defaults.end);
  const [conversionStart, setConversionStart] = useState(defaults.start);
  const [conversionEnd, setConversionEnd] = useState(defaults.end);
  const [collectorId, setCollectorId] = useState('');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileNotice, setReconcileNotice] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<PostSaleMetricConversion | null>(null);
  const [correcting, setCorrecting] = useState<{ id: string; collectorId: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ collectionStart, collectionEnd, conversionStart, conversionEnd });
      if (collectorId) query.set('collectorId', collectorId);
      const response = await fetch(`/api/post-sale/collections?${query}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.metrics) throw new Error(payload.error || 'Não foi possível carregar o relatório.');
      setData(payload as DashboardData);
      if (selectedCollection && !payload.collections.some((row: { id: string }) => row.id === selectedCollection)) setSelectedCollection(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha de conexão ao carregar o relatório.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [collectionStart, collectionEnd, conversionStart, conversionEnd, collectorId, selectedCollection]);

  useEffect(() => {
    queueMicrotask(() => { void loadData(); });
  }, [loadData]);

  const collaboratorNames = useMemo(() => new Map((data?.collaborators || []).map((collaborator) => [collaborator.id, collaborator.name])), [data?.collaborators]);
  const contactCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of data?.contacts || []) counts.set(contact.collectionId, (counts.get(contact.collectionId) || 0) + 1);
    return counts;
  }, [data?.contacts]);
  const visibleContacts = useMemo(() => selectedCollection
    ? (data?.contacts || []).filter((contact) => contact.collectionId === selectedCollection)
    : data?.contacts || [], [data?.contacts, selectedCollection]);
  const visibleConversions = useMemo(() => selectedCollection
    ? (data?.conversions || []).filter((conversion) => conversion.collectionId === selectedCollection)
    : [], [data?.conversions, selectedCollection]);
  const pendingConversions = useMemo(() => (data?.conversions || []).filter((conversion) => conversion.state === 'pending_review'), [data?.conversions]);

  async function reconcile() {
    setReconciling(true);
    setReconcileNotice(null);
    try {
      const response = await fetch('/api/post-sale/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionStart, collectionEnd }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível atualizar os fechamentos.');
      setReconcileNotice(`${payload.scannedContacts} contatos revisados · ${payload.inserted} contratos registrados · ${payload.pendingReview} pendentes de revisão.`);
      await loadData();
    } catch (caught) {
      setReconcileNotice(caught instanceof Error ? caught.message : 'Falha ao consultar o IXC.');
    } finally {
      setReconciling(false);
    }
  }

  function exportCollections() {
    if (!data) return;
    const rows: Array<Array<string | number | null | undefined>> = [
      ['Contrato de origem', 'Cliente de origem', 'Data da venda', 'Coletor', 'Resultado', 'Contatos'],
      ...data.collections.map((collection) => [
        collection.originContractId,
        collection.originCustomerRef || 'Não informado',
        displayDate(collection.soldAt),
        collaboratorNames.get(collection.collectorColaboradorId) || collection.collectorColaboradorId || 'Não informado',
        collection.outcome === 'no_referral' ? 'Não recebeu contatos' : 'Recebeu contatos',
        contactCounts.get(collection.id) || 0,
      ]),
    ];
    downloadCsv('indicacoes-pos-venda.csv', rows);
  }

  const metrics = data?.metrics;
  const isAdmin = data?.viewerRole === 'admin';
  const conversionRate = metrics?.conversionRate === null || metrics?.conversionRate === undefined
    ? '—'
    : `${(metrics.conversionRate * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  return (
    <section className="min-w-0 space-y-5 pb-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-950 dark:bg-blue-950/20 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"><CalendarDays className="h-5 w-5" /></div><div><p className="text-sm font-bold text-blue-950 dark:text-blue-100">Base: {data?.basisLabel || 'vendas de origem registradas no painel'}</p><p className="mt-1 text-xs leading-relaxed text-blue-800 dark:text-blue-300">Este relatório acompanha coletas registradas. Ainda não representa todas as vendas elegíveis.</p></div></div>
        {isAdmin && <button type="button" onClick={reconcile} disabled={reconciling || loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50 dark:bg-brand-yellow dark:text-brand-charcoal dark:hover:bg-yellow-400">{reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{reconciling ? 'Consultando IXC' : 'Atualizar fechamentos no IXC'}</button>}
      </div>

      {reconcileNotice && <div role="status" className="rounded-xl border border-brand-border bg-white px-4 py-3 text-sm text-brand-charcoal dark:border-gray-800 dark:bg-zinc-900 dark:text-gray-200">{reconcileNotice}</div>}

      <div className="grid gap-3 rounded-2xl border border-brand-border bg-white p-4 dark:border-gray-800 dark:bg-zinc-900 sm:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2 sm:col-span-2 xl:col-span-2"><p className="text-xs font-extrabold uppercase tracking-wide text-brand-muted dark:text-gray-400">Período da coleta</p><div className="grid grid-cols-2 gap-2"><input aria-label="Coleta de" type="date" value={collectionStart} onChange={(event) => setCollectionStart(event.target.value)} className={inputClass} /><input aria-label="Coleta até" type="date" value={collectionEnd} onChange={(event) => setCollectionEnd(event.target.value)} className={inputClass} /></div></div>
        <div className="space-y-2 sm:col-span-2 xl:col-span-2"><p className="text-xs font-extrabold uppercase tracking-wide text-brand-muted dark:text-gray-400">Período da conversão</p><div className="grid grid-cols-2 gap-2"><input aria-label="Conversão de" type="date" value={conversionStart} onChange={(event) => setConversionStart(event.target.value)} className={inputClass} /><input aria-label="Conversão até" type="date" value={conversionEnd} onChange={(event) => setConversionEnd(event.target.value)} className={inputClass} /></div></div>
        {isAdmin && <label className="space-y-2 text-xs font-extrabold uppercase tracking-wide text-brand-muted dark:text-gray-400"><span>Coletor</span><select aria-label="Filtrar por coletor" value={collectorId} onChange={(event) => setCollectorId(event.target.value)} className={inputClass + ' w-full font-normal normal-case tracking-normal'}><option value="">Todos</option>{(data?.collaborators || []).map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}</select></label>}
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/25 dark:text-red-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {loading && !data ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" /><div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" /><div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" /><div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-zinc-800" /></div> : metrics && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Vendas de origem registradas" value={metrics.registeredOriginSales} hint="no período de coleta" />
          <MetricCard label="Contatos válidos" value={metrics.validContacts} hint={`${metrics.contactsReceived} recebidos`} accent="blue" />
          <MetricCard label="Contatos convertidos" value={metrics.convertedContacts} hint={`${conversionRate} dos contatos válidos`} accent="green" />
          <MetricCard label="Contratos novos confirmados" value={metrics.confirmedContracts} hint="confirmados no IXC" accent="green" />
          <MetricCard label="Leads em atendimento" value={metrics.leadsInProgress} accent="blue" />
          <MetricCard label="Duplicados / inválidos" value={`${metrics.duplicateContacts} / ${metrics.invalidContacts}`} hint="atribuições existentes preservadas" accent="amber" />
          <MetricCard label="Pendentes de revisão" value={metrics.pendingReviews} hint="contrato sem vínculo inequívoco" accent="amber" />
          <MetricCard label="Tempo até 1º atendimento" value={metrics.averageMinutesToFirstAttendance === null ? 'Não informado' : `${Math.round(metrics.averageMinutesToFirstAttendance)} min`} hint="quando há evento confiável no histórico" accent="gray" />
        </div>
      )}

      {isAdmin && pendingConversions.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white dark:border-amber-950 dark:bg-zinc-900">
          <header className="flex items-center justify-between gap-3 border-b border-amber-100 px-4 py-3 dark:border-amber-950 sm:px-5"><div><h2 className="text-sm font-extrabold text-brand-charcoal dark:text-white">Revisões pendentes</h2><p className="text-xs text-brand-muted dark:text-gray-400">Confirme somente após verificar o vínculo e registre a justificativa.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">{pendingConversions.length}</span></header>
          <div className="divide-y divide-brand-border dark:divide-gray-800">{pendingConversions.map((conversion) => <div key={conversion.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><p className="text-sm font-bold text-brand-charcoal dark:text-gray-200">Contrato IXC {conversion.ixcContractId}</p><p className="mt-0.5 text-xs text-brand-muted dark:text-gray-400">Ativado em {displayDate(conversion.activatedAt)}</p></div><button type="button" onClick={() => setReviewing(conversion)} className="rounded-lg border border-amber-300 px-3.5 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/30">Revisar vínculo</button></div>)}</div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm dark:border-gray-800 dark:bg-zinc-900">
        <header className="flex flex-col gap-3 border-b border-brand-border px-4 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 className="text-base font-extrabold text-brand-charcoal dark:text-white">Coletas de pós-venda</h2><p className="mt-1 text-xs text-brand-muted dark:text-gray-400">Selecione uma linha para conferir os contatos recebidos.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={exportCollections} disabled={!data?.collections.length} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border px-3 py-2 text-xs font-bold text-brand-charcoal hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-zinc-800"><ArrowDownToLine className="h-3.5 w-3.5" />Exportar CSV</button></div></header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-brand-muted dark:bg-zinc-800/70 dark:text-gray-400"><tr><th className="px-4 py-3 font-extrabold sm:px-5">Contrato / cliente de origem</th><th className="px-4 py-3 font-extrabold">Data</th><th className="px-4 py-3 font-extrabold">Coletor</th><th className="px-4 py-3 font-extrabold">Resultado</th><th className="px-4 py-3 font-extrabold">Contatos</th><th className="px-4 py-3 font-extrabold">Ação</th></tr></thead>
            <tbody className="divide-y divide-brand-border dark:divide-gray-800">
              {(data?.collections || []).map((collection) => <tr key={collection.id} className={`cursor-pointer transition hover:bg-blue-50/50 dark:hover:bg-blue-950/10 ${selectedCollection === collection.id ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`} onClick={() => setSelectedCollection((current) => current === collection.id ? null : collection.id)}>
                <td className="px-4 py-3 sm:px-5"><p className="font-bold text-brand-charcoal dark:text-gray-200">{collection.originContractId}</p><p className="mt-0.5 text-xs text-brand-muted dark:text-gray-400">{collection.originCustomerRef || 'Origem não informada'}</p></td>
                <td className="px-4 py-3 text-xs text-brand-muted dark:text-gray-400">{displayDate(collection.soldAt)}</td>
                <td className="px-4 py-3 text-xs text-brand-charcoal dark:text-gray-300">{collaboratorNames.get(collection.collectorColaboradorId) || collection.collectorColaboradorId || 'Não informado'}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${collection.outcome === 'no_referral' ? 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'}`}>{collection.outcome === 'no_referral' ? 'Sem contatos' : 'Com contatos'}</span></td>
                <td className="px-4 py-3 text-center font-bold tabular-nums text-brand-charcoal dark:text-gray-200">{contactCounts.get(collection.id) || 0}</td>
                <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>{isAdmin ? <button type="button" onClick={() => setCorrecting({ id: collection.id, collectorId: collection.collectorColaboradorId })} title="Corrigir coletor com justificativa e auditoria" className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold text-brand-muted hover:bg-amber-50 hover:text-amber-800 dark:text-gray-400 dark:hover:bg-amber-950/30 dark:hover:text-amber-300"><UserRoundCog className="h-4 w-4" /><span className="hidden xl:inline">Corrigir</span></button> : <span className="text-xs text-brand-muted dark:text-gray-500">—</span>}</td>
              </tr>)}
              {!loading && (data?.collections.length || 0) === 0 && <tr><td colSpan={6} className="px-5 py-12 text-center"><div className="mx-auto flex max-w-sm flex-col items-center"><div className="rounded-2xl bg-gray-100 p-3 text-gray-500 dark:bg-zinc-800 dark:text-gray-400"><CalendarDays className="h-5 w-5" /></div><p className="mt-3 text-sm font-bold text-brand-charcoal dark:text-gray-200">Nenhuma coleta nesse período</p><p className="mt-1 text-xs text-brand-muted dark:text-gray-400">Ajuste as datas ou registre uma coleta de pós-venda.</p><button type="button" onClick={onRequestCollection} className="mt-4 text-xs font-bold text-blue-700 dark:text-blue-300">Registrar coleta</button></div></td></tr>}
            </tbody>
          </table>
        </div>
        {selectedCollection && <div className="border-t border-brand-border bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-zinc-950/40 sm:p-5"><div className="mb-3 flex items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold text-brand-charcoal dark:text-white">Contatos da coleta</h3><p className="text-xs text-brand-muted dark:text-gray-400">A atribuição original é preservada em duplicidades.</p></div><button type="button" onClick={() => setSelectedCollection(null)} className="rounded-lg p-2 text-brand-muted hover:bg-gray-100 dark:hover:bg-zinc-800" aria-label="Fechar detalhes"><X className="h-4 w-4" /></button></div>
          {visibleContacts.length ? <div className="grid gap-2 md:grid-cols-2">{visibleContacts.map((contact) => <ContactCard key={contact.id} contact={contact} />)}</div> : <p className="rounded-xl border border-dashed border-brand-border p-5 text-center text-sm text-brand-muted dark:border-gray-700 dark:text-gray-400">Esta coleta não possui contatos registrados.</p>}
          <p className="mt-3 text-[11px] text-brand-muted dark:text-gray-500">Responsável pelo atendimento/fechamento: não informado nesta fonte.</p>
          {visibleConversions.length > 0 && <div className="mt-5 overflow-x-auto rounded-xl border border-brand-border dark:border-gray-800"><div className="border-b border-brand-border px-3.5 py-2.5 text-xs font-extrabold uppercase tracking-wide text-brand-muted dark:border-gray-800 dark:text-gray-400">Contratos novos vinculados</div><table className="w-full min-w-[440px] text-left text-xs"><thead className="bg-gray-50 text-brand-muted dark:bg-zinc-800/70 dark:text-gray-400"><tr><th className="px-3.5 py-2 font-bold">Contrato IXC</th><th className="px-3.5 py-2 font-bold">Ativado</th><th className="px-3.5 py-2 font-bold">Estado</th></tr></thead><tbody className="divide-y divide-brand-border dark:divide-gray-800">{visibleConversions.map((conversion) => <tr key={conversion.id}><td className="px-3.5 py-2.5 font-mono text-brand-charcoal dark:text-gray-200">{conversion.ixcContractId}</td><td className="px-3.5 py-2.5 text-brand-muted dark:text-gray-400">{displayDate(conversion.activatedAt)}</td><td className="px-3.5 py-2.5"><span className={`rounded-full px-2 py-1 font-bold ${conversion.state === 'confirmed' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-300'}`}>{conversion.state === 'confirmed' ? 'Confirmado' : 'Pendente'}</span></td></tr>)}</tbody></table></div>}
        </div>}
      </section>

      <div className="flex items-center gap-2 text-[11px] text-brand-muted dark:text-gray-500"><CheckCircle2 className="h-3.5 w-3.5" />Períodos inclusivos no fuso America/Sao_Paulo. Contratos contam apenas quando verificados no IXC.</div>

      {reviewing && data && <PostSaleReviewDialog conversion={reviewing} contacts={data.contacts} onClose={() => setReviewing(null)} onSaved={loadData} />}
      {correcting && data && <AttributionDialog collectionId={correcting.id} currentCollectorId={correcting.collectorId} collaborators={data.collaborators} onClose={() => setCorrecting(null)} onSaved={loadData} />}
    </section>
  );
}

function ContactCard({ contact }: { contact: PostSaleContact }) {
  const labels = {
    created_lead: 'Lead no Kanban',
    duplicate_existing: 'Duplicidade preservada',
    invalid: 'Inválido para conferência',
  };
  const style = contact.state === 'created_lead'
    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300'
    : contact.state === 'duplicate_existing'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/35 dark:text-amber-300'
      : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-300';
  return <article className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-brand-border bg-white px-3.5 py-3 dark:border-gray-800 dark:bg-zinc-900"><div className="min-w-0"><p className="truncate text-sm font-bold text-brand-charcoal dark:text-gray-200">{contact.name || 'Nome não informado'}</p><p className="mt-0.5 text-xs text-brand-muted dark:text-gray-400">{contact.phoneRaw || 'Telefone não informado'}{contact.leadStatus ? ` · ${contact.leadStatus}` : ''}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${style}`}>{labels[contact.state]}</span></article>;
}
