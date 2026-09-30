'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { PostSaleContact, PostSaleMetricConversion } from '@/lib/post-sale/contracts';

interface Props {
  conversion: PostSaleMetricConversion;
  contacts: PostSaleContact[];
  onClose(): void;
  onSaved(): void | Promise<void>;
}

const inputClass = 'w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-charcoal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-zinc-900 dark:text-white';

export function PostSaleReviewDialog({ conversion, contacts, onClose, onSaved }: Props) {
  const candidates = contacts.filter((contact) => contact.state === 'created_lead' && contact.leadId !== null);
  const [contactId, setContactId] = useState(candidates[0]?.id || '');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!contactId || reason.trim().length < 10) {
      setError('Escolha um contato elegível e informe uma justificativa de pelo menos 10 caracteres.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const response = await fetch(`/api/post-sale/conversions/${encodeURIComponent(conversion.id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, reason: reason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível salvar a revisão.');
      await onSaved();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao salvar revisão.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="post-sale-review-title" className="w-full max-w-lg overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl dark:border-gray-800 dark:bg-[#18181b]">
        <header className="flex items-start justify-between gap-4 border-b border-brand-border px-5 py-4 dark:border-gray-800 sm:px-6">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">Revisão administrativa</p>
            <h2 id="post-sale-review-title" className="mt-1 text-lg font-extrabold text-brand-charcoal dark:text-white">Vincular contrato confirmado</h2>
            <p className="mt-1 text-xs text-brand-muted dark:text-gray-400">Contrato IXC {conversion.ixcContractId} · ativado em {new Date(conversion.activatedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </header>
        <div className="space-y-4 px-5 py-5 sm:px-6">
          {candidates.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-300">Não há contato novo elegível nessa visão para vincular. Ajuste o período da coleta e tente novamente.</div>
          ) : (
            <>
              <label className="block space-y-1.5 text-xs font-bold text-brand-muted dark:text-gray-400">
                <span>Contato / lead confirmado</span>
                <select value={contactId} onChange={(event) => setContactId(event.target.value)} className={inputClass}>
                  {candidates.map((contact) => <option key={contact.id} value={contact.id}>{contact.name || 'Sem nome'} · {contact.phoneRaw || 'Sem telefone'}</option>)}
                </select>
              </label>
              <label className="block space-y-1.5 text-xs font-bold text-brand-muted dark:text-gray-400">
                <span>Justificativa da revisão</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} rows={4} placeholder="Registre o que foi conferido para confirmar este vínculo." className={inputClass} />
                <span className="block text-right font-normal">{reason.trim().length}/500</span>
              </label>
            </>
          )}
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/25 dark:text-red-300">{error}</div>}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-brand-border px-5 py-4 dark:border-gray-800 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-brand-border px-4 py-2.5 text-sm font-bold text-brand-muted dark:border-gray-700 dark:text-gray-300">Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || candidates.length === 0 || reason.trim().length < 10} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-brand-yellow dark:text-brand-charcoal">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Salvando revisão' : 'Confirmar vínculo'}
          </button>
        </footer>
      </section>
    </div>
  );
}
