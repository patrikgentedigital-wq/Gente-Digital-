'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';

interface ContactDraft {
  name: string;
  phone: string;
}

interface VerifiedContract {
  contractId: string;
  customerName: string;
  soldAt: string;
  collectorColaboradorId: string;
  collectorName: string;
}

interface SavedContact {
  contactId: string;
  state: 'created_lead' | 'duplicate_existing' | 'invalid';
  reason: string | null;
  leadId: number | null;
}

interface SavedCollection {
  collectionId: string;
  outcome: 'contacts_collected' | 'no_referral';
  contacts: SavedContact[];
}

interface PostSaleCollectionDialogProps {
  onClose(): void;
  onSaved(): void | Promise<void>;
}

const DRAFT_KEY = 'gente-digital:post-sale-collection-draft:v1';
const DRAFT_EVENT = 'gente-digital:post-sale-draft-change';
const inputClass = 'w-full rounded-xl border border-brand-border bg-white px-3.5 py-2.5 text-sm text-brand-charcoal outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 dark:border-gray-700 dark:bg-zinc-900 dark:text-white';
const stateLabel: Record<SavedContact['state'], string> = {
  created_lead: 'Lead criado',
  duplicate_existing: 'Telefone já cadastrado; atribuição preservada',
  invalid: 'Contato salvo para conferência',
};

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(date);
}

function subscribeDraft(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(DRAFT_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(DRAFT_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function readDraftSnapshot(): string | null {
  return typeof window === 'undefined' ? null : window.sessionStorage.getItem(DRAFT_KEY);
}

function writeDraftSnapshot(draft: { contractId: string; collectorColaboradorId: string; contacts: ContactDraft[]; outcome: 'contacts_collected' | 'no_referral' } | null) {
  if (typeof window === 'undefined') return;
  if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  else window.sessionStorage.removeItem(DRAFT_KEY);
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

function parseDraftSnapshot(snapshot: string | null): { contractId: string; collectorColaboradorId: string; contacts: ContactDraft[]; outcome: 'contacts_collected' | 'no_referral' } {
  if (!snapshot) return { contractId: '', collectorColaboradorId: '', contacts: [{ name: '', phone: '' }], outcome: 'contacts_collected' };
  try {
    const raw = JSON.parse(snapshot) as Partial<{ contractId: string; collectorColaboradorId: string; contacts: ContactDraft[]; outcome: 'contacts_collected' | 'no_referral' }>;
    return {
      contractId: typeof raw.contractId === 'string' ? raw.contractId : '',
      collectorColaboradorId: typeof raw.collectorColaboradorId === 'string' ? raw.collectorColaboradorId : '',
      contacts: Array.isArray(raw.contacts) && raw.contacts.length <= 100
        ? raw.contacts.map((contact) => ({ name: String(contact.name ?? ''), phone: String(contact.phone ?? '') }))
        : [{ name: '', phone: '' }],
      outcome: raw.outcome === 'no_referral' ? 'no_referral' : 'contacts_collected',
    };
  } catch {
    return { contractId: '', collectorColaboradorId: '', contacts: [{ name: '', phone: '' }], outcome: 'contacts_collected' };
  }
}

export function PostSaleCollectionDialog({ onClose, onSaved }: PostSaleCollectionDialogProps) {
  const draftSnapshot = useSyncExternalStore(subscribeDraft, readDraftSnapshot, () => null);
  const draft = useMemo(() => parseDraftSnapshot(draftSnapshot), [draftSnapshot]);
  const { contractId, collectorColaboradorId, contacts, outcome } = draft;
  const [viewerRole, setViewerRole] = useState<'admin' | 'vendedor' | null>(null);
  const [collaborators, setCollaborators] = useState<Array<{ id: string; name: string }>>([]);
  const [verifiedContract, setVerifiedContract] = useState<VerifiedContract | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedCollection | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/post-sale/collectors', { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Não foi possível carregar os colaboradores.');
        setViewerRole(payload.viewerRole);
        setCollaborators(payload.collaborators);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar os colaboradores.');
      });
    return () => controller.abort();
  }, []);

  function updateDraft(update: (current: typeof draft) => typeof draft) {
    writeDraftSnapshot(update(draft));
  }

  function setContractId(value: string) {
    updateDraft((current) => ({ ...current, contractId: value }));
  }

  function setCollectorId(value: string) {
    updateDraft((current) => ({ ...current, collectorColaboradorId: value }));
    setVerifiedContract(null);
    setError(null);
  }

  function setContacts(update: ContactDraft[] | ((current: ContactDraft[]) => ContactDraft[])) {
    updateDraft((current) => ({
      ...current,
      contacts: typeof update === 'function' ? update(current.contacts) : update,
    }));
  }

  function setOutcome(value: 'contacts_collected' | 'no_referral') {
    updateDraft((current) => ({ ...current, outcome: value }));
  }

  const duplicatePhones = useMemo(() => {
    const seen = new Set<string>();
    const duplicate = new Set<string>();
    for (const contact of contacts) {
      const phone = normalizePhone(contact.phone);
      if (!phone) continue;
      if (seen.has(phone)) duplicate.add(phone);
      seen.add(phone);
    }
    return duplicate;
  }, [contacts]);

  async function validateContract() {
    setError(null);
    setVerifiedContract(null);
    if (!contractId.trim()) {
      setError('Informe o ID exato do contrato de origem.');
      return;
    }
    if (viewerRole === 'admin' && !collectorColaboradorId) {
      setError('Selecione quem realizou a coleta.');
      return;
    }
    setIsValidating(true);
    try {
      const response = await fetch('/api/post-sale/contracts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contractId.trim(), ...(viewerRole === 'admin' ? { collectorColaboradorId } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.contract) {
        throw new Error(payload.error || 'Não foi possível validar o contrato no IXC.');
      }
      setVerifiedContract(payload.contract as VerifiedContract);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha de conexão ao validar o contrato.');
    } finally {
      setIsValidating(false);
    }
  }

  function updateContact(index: number, field: keyof ContactDraft, value: string) {
    setContacts((current) => current.map((contact, position) => position === index ? { ...contact, [field]: value } : contact));
  }

  async function saveCollection() {
    if (!verifiedContract) {
      setError('Valide o contrato no IXC antes de registrar a coleta.');
      return;
    }
    if (outcome === 'contacts_collected' && contacts.length === 0) {
      setError('Inclua ao menos um contato ou marque “Não recebeu contatos”.');
      return;
    }
    if (duplicatePhones.size > 0) {
      setError('Remova telefones repetidos antes de registrar a coleta.');
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch('/api/post-sale/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originContractId: verifiedContract.contractId,
          ...(viewerRole === 'admin' ? { collectorColaboradorId } : {}),
          outcome,
          contacts: outcome === 'no_referral' ? [] : contacts,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success || !payload.collectionId) {
        throw new Error(payload.error || 'A coleta não foi confirmada pelo servidor.');
      }

      const result: SavedCollection = {
        collectionId: payload.collectionId,
        outcome: payload.outcome,
        contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
      };
      writeDraftSnapshot(null);
      setSaved(result);
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha de conexão. O rascunho foi mantido para retomar depois.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="post-sale-collection-title"
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl dark:border-gray-800 dark:bg-[#18181b]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-brand-border px-5 py-4 dark:border-gray-800 sm:px-7 sm:py-5">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Indique e Ganhe</p>
            <h2 id="post-sale-collection-title" className="mt-1 text-xl font-extrabold text-brand-charcoal dark:text-white">Registrar coleta de pós-venda</h2>
            <p className="mt-1 text-xs text-brand-muted dark:text-gray-400">A coleta só será confirmada depois da gravação no banco.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-800"><X className="h-5 w-5" /></button>
        </header>

        <div className="space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
          {saved ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <p className="font-bold text-emerald-800 dark:text-emerald-300">Coleta registrada</p>
                <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">Contrato {verifiedContract?.contractId} · referência {saved.collectionId.slice(0, 8)}</p>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">Coletor: {verifiedContract?.collectorName || 'vínculo da sessão autenticada'}</p>
              </div>
              {saved.contacts.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-brand-charcoal dark:text-white">Resultado de cada contato</h3>
                  {saved.contacts.map((contact, index) => (
                    <div key={contact.contactId || index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-border px-3.5 py-3 text-sm dark:border-gray-800">
                      <span className="text-brand-charcoal dark:text-gray-200">Contato {index + 1}</span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${contact.state === 'created_lead' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' : contact.state === 'duplicate_existing' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-gray-100 text-gray-700 dark:bg-zinc-800 dark:text-gray-300'}`}>
                        {stateLabel[contact.state] || 'Registrado'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-brand-muted dark:text-gray-400">A coleta foi registrada sem contatos.</p>}
            </div>
          ) : (
            <>
              {viewerRole === 'admin' && (
                <div className="space-y-2">
                  <label htmlFor="post-sale-collector" className="block text-sm font-bold text-brand-charcoal dark:text-gray-200">Quem realizou a coleta</label>
                  <select id="post-sale-collector" value={collectorColaboradorId} onChange={(event) => setCollectorId(event.target.value)} disabled={isValidating || isSaving} className={inputClass}>
                    <option value="">Selecione um colaborador</option>
                    {collaborators.map((collaborator) => <option key={collaborator.id} value={collaborator.id}>{collaborator.name}</option>)}
                  </select>
                  <p className="text-xs text-brand-muted dark:text-gray-400">A coleta será atribuída a essa pessoa; sua conta ficará registrada como responsável pelo lançamento.</p>
                </div>
              )}
              <div className="space-y-2">
                <label htmlFor="post-sale-contract-id" className="block text-sm font-bold text-brand-charcoal dark:text-gray-200">Contrato de origem no IXC</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="post-sale-contract-id"
                    value={contractId}
                    onChange={(event) => { setContractId(event.target.value); setVerifiedContract(null); setError(null); }}
                    disabled={isValidating || isSaving}
                    placeholder="Digite o ID exato, preservando zeros à esquerda"
                    className={`${inputClass} min-w-0 flex-1 font-mono`}
                  />
                  <button type="button" onClick={validateContract} disabled={isValidating || !viewerRole || !contractId.trim() || (viewerRole === 'admin' && !collectorColaboradorId)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-brand-border px-4 py-2.5 text-sm font-bold text-brand-charcoal transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-zinc-800">
                    {isValidating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isValidating ? 'Consultando IXC' : 'Validar contrato'}
                  </button>
                </div>
                {verifiedContract && (
                  <div className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/25 sm:grid-cols-2">
                    <p><span className="block text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Cliente de origem</span><span className="font-semibold text-brand-charcoal dark:text-white">{verifiedContract.customerName}</span></p>
                    <p><span className="block text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Data da venda</span><span className="font-semibold text-brand-charcoal dark:text-white">{formatDate(verifiedContract.soldAt)}</span></p>
                    <p className="sm:col-span-2"><span className="block text-[11px] font-bold uppercase tracking-wide text-blue-700 dark:text-blue-300">Coletor</span><span className="font-semibold text-brand-charcoal dark:text-white">{verifiedContract.collectorName}</span></p>
                  </div>
                )}
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-bold text-brand-charcoal dark:text-gray-200">Resultado da coleta</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setOutcome('contacts_collected')} aria-pressed={outcome === 'contacts_collected'} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${outcome === 'contacts_collected' ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300' : 'border-brand-border text-brand-muted hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-zinc-800'}`}>Recebeu contatos</button>
                  <button type="button" onClick={() => setOutcome('no_referral')} aria-pressed={outcome === 'no_referral'} className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${outcome === 'no_referral' ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300' : 'border-brand-border text-brand-muted hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-zinc-800'}`}>Não recebeu contatos</button>
                </div>
              </fieldset>

              {outcome === 'contacts_collected' && (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-brand-charcoal dark:text-gray-200">Contatos recebidos</h3>
                      <p className="mt-0.5 text-xs text-brand-muted dark:text-gray-400">Telefone repetido bloqueia o registro. Dados inválidos ficam identificados para conferência.</p>
                    </div>
                    <button type="button" onClick={() => setContacts((current) => [...current, { name: '', phone: '' }])} disabled={contacts.length >= 100} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-950/30"><Plus className="h-4 w-4" />Adicionar contato</button>
                  </div>
                  <div className="space-y-2.5">
                    {contacts.map((contact, index) => {
                      const digits = normalizePhone(contact.phone);
                      const isDuplicate = !!digits && duplicatePhones.has(digits);
                      return (
                        <div key={index} className={`grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1fr_1fr_auto] ${isDuplicate ? 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : 'border-brand-border dark:border-gray-800'}`}>
                          <label className="space-y-1 text-xs font-semibold text-brand-muted dark:text-gray-400">
                            <span>Nome</span>
                            <input value={contact.name} onChange={(event) => updateContact(index, 'name', event.target.value)} maxLength={160} placeholder="Nome da pessoa" className={inputClass} />
                          </label>
                          <label className="space-y-1 text-xs font-semibold text-brand-muted dark:text-gray-400">
                            <span>Telefone</span>
                            <input value={contact.phone} onChange={(event) => updateContact(index, 'phone', event.target.value)} maxLength={64} inputMode="tel" placeholder="(91) 99999-9999" className={inputClass} />
                            {isDuplicate && <span className="block text-[11px] font-bold text-red-600 dark:text-red-400">Este telefone aparece mais de uma vez.</span>}
                          </label>
                          <button type="button" onClick={() => setContacts((current) => current.filter((_, position) => position !== index))} aria-label={`Remover contato ${index + 1}`} className="self-center rounded-lg p-2 text-gray-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}

          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/25 dark:text-red-300">{error}</div>}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-brand-border px-5 py-4 dark:border-gray-800 sm:flex-row sm:justify-end sm:px-7">
          {saved ? (
            <button type="button" onClick={onClose} className="rounded-xl bg-brand-charcoal px-5 py-2.5 text-sm font-bold text-white transition hover:bg-black dark:bg-brand-yellow dark:text-brand-charcoal dark:hover:bg-yellow-400">Concluir</button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-brand-border px-5 py-2.5 text-sm font-bold text-brand-muted transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-zinc-800">Cancelar</button>
              <button type="button" onClick={saveCollection} disabled={isSaving || isValidating || !verifiedContract || (outcome === 'contacts_collected' && contacts.length === 0) || duplicatePhones.size > 0} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-5 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-yellow dark:text-brand-charcoal dark:hover:bg-yellow-400">
                {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSaving ? 'Salvando coleta' : 'Registrar coleta'}
              </button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
