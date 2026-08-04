'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clipboard, Loader2, Search, ShieldCheck } from 'lucide-react';
import { REFERRAL_STATUS_LABELS, normalizePhone, normalizeTrackingCode } from '@/lib/referrals';

type ReferralLeadFormProps = {
  refCode: string;
  initialStatusCode: string;
};

type StatusResult = {
  code: string;
  status: string;
  createdAt: string;
  ref: string;
};

type Feedback = { tone: 'success' | 'error'; message: string } | null;

const inputClasses = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500';

function getErrorMessage(data: { error?: string } | null, fallback: string): string {
  return data?.error || fallback;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
}

export function ReferralLeadForm({ refCode, initialStatusCode }: ReferralLeadFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [trackingCode, setTrackingCode] = useState('');
  const [statusCode, setStatusCode] = useState(initialStatusCode);
  const [statusInput, setStatusInput] = useState(initialStatusCode);
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);
  const [statusError, setStatusError] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(Boolean(initialStatusCode));
  const [copied, setCopied] = useState(false);
  const submissionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialStatusCode) return;

    let cancelled = false;
    void fetch(`/api/referrals?code=${encodeURIComponent(initialStatusCode)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => null) as StatusResult & { error?: string } | null;
        if (!response.ok) throw new Error(getErrorMessage(data, 'Não foi possível consultar a indicação.'));
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setStatusResult(data);
        setStatusError('');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatusResult(null);
        setStatusError(error instanceof Error ? error.message : 'Não foi possível consultar a indicação.');
      })
      .finally(() => {
        if (!cancelled) setIsLookingUp(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialStatusCode]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    if (!consent) {
      setFeedback({ tone: 'error', message: 'Marque a autorização para contato antes de enviar.' });
      return;
    }

    setIsSubmitting(true);
    try {
      submissionKeyRef.current ||= crypto.randomUUID();
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizePhone(phone),
          ref: refCode,
          consent: true,
          submissionKey: submissionKeyRef.current,
        }),
      });
      const data = await response.json().catch(() => null) as { trackingCode?: string; error?: string } | null;
      if (!response.ok || !data?.trackingCode) {
        throw new Error(getErrorMessage(data, 'Não foi possível registrar sua indicação.'));
      }

      const nextCode = normalizeTrackingCode(data.trackingCode);
      setTrackingCode(nextCode);
      setStatusCode(nextCode);
      setStatusInput(nextCode);
      setFeedback({ tone: 'success', message: 'Indicação registrada. Guarde o código para acompanhar o atendimento.' });
      submissionKeyRef.current = null;
      window.history.replaceState(null, '', `${window.location.pathname}?${new URLSearchParams({ ...(refCode ? { ref: refCode } : {}), status: nextCode }).toString()}#acompanhar`);
    } catch (error: unknown) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Não foi possível registrar sua indicação.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const lookupStatus = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const normalizedCode = normalizeTrackingCode(statusInput);
    if (!normalizedCode) {
      setStatusError('Digite um código no formato XXXX-XXXX-XXXX-XXXX.');
      setStatusResult(null);
      return;
    }

    setIsLookingUp(true);
    setStatusError('');
    try {
      const response = await fetch(`/api/referrals?code=${encodeURIComponent(normalizedCode)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null) as StatusResult & { error?: string } | null;
      if (!response.ok) throw new Error(getErrorMessage(data, 'Não foi possível consultar a indicação.'));
      setStatusResult(data);
      setStatusCode(normalizedCode);
    } catch (error: unknown) {
      setStatusResult(null);
      setStatusError(error instanceof Error ? error.message : 'Não foi possível consultar a indicação.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const copyCode = async () => {
    if (!trackingCode) return;
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setFeedback({ tone: 'error', message: 'Não foi possível copiar automaticamente. Anote o código exibido.' });
    }
  };

  const statusCopy = statusResult ? REFERRAL_STATUS_LABELS[statusResult.status] || {
    title: statusResult.status,
    description: 'O andamento está registrado no painel da equipe.',
  } : null;

  return (
    <section id="quero-contratar" className="scroll-mt-24 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]" aria-labelledby="titulo-cadastro">
      <div className="saas-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 id="titulo-cadastro" className="font-display text-2xl font-bold text-slate-950 dark:text-white">Quero contratar</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-gray-300">Informe os dados da pessoa interessada. O atendimento comercial continuará pelo telefone.</p>
          </div>
        </div>

        {trackingCode ? (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-950/30" role="status" aria-live="polite">
            <CheckCircle2 className="mb-3 h-7 w-7 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
            <h3 className="text-lg font-bold text-emerald-950 dark:text-emerald-200">Cadastro recebido</h3>
            <p className="mt-2 text-sm leading-relaxed text-emerald-900 dark:text-emerald-200">Seu código de acompanhamento é:</p>
            <div className="mt-3 flex items-center gap-2">
              <output className="flex-1 rounded-xl border border-emerald-300 bg-white px-4 py-3 font-mono text-base font-extrabold tracking-wider text-slate-950 dark:border-emerald-800 dark:bg-gray-900 dark:text-white">{trackingCode}</output>
              <button type="button" onClick={copyCode} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">
                <Clipboard className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{copied ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <a href="#acompanhar" className="mt-4 inline-flex text-sm font-bold text-emerald-900 underline underline-offset-4 dark:text-emerald-200">Acompanhar esta indicação</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="referral-name" className="mb-2 block text-sm font-bold text-slate-800 dark:text-gray-200">Nome da pessoa interessada</label>
              <input id="referral-name" name="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={120} autoComplete="name" className={inputClasses} placeholder="Ex.: Maria da Silva" />
            </div>
            <div>
              <label htmlFor="referral-phone" className="mb-2 block text-sm font-bold text-slate-800 dark:text-gray-200">Telefone com DDD</label>
              <input id="referral-phone" name="phone" value={phone} onChange={(event) => setPhone(normalizePhone(event.target.value))} required inputMode="tel" autoComplete="tel" minLength={10} maxLength={13} className={inputClasses} placeholder="(91) 99999-9999" />
            </div>
            <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-700 dark:text-gray-300">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-blue-700" />
              <span>Autorizo a Gente Digital a entrar em contato para tratar desta indicação.</span>
            </label>
            <button type="submit" disabled={isSubmitting} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3.5 text-base font-extrabold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 dark:bg-brand-yellow dark:text-slate-950 dark:hover:bg-yellow-300">
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
              {isSubmitting ? 'Enviando cadastro...' : 'Enviar indicação'}
            </button>
            <p className={`min-h-5 text-sm ${feedback?.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`} role="status" aria-live="polite">{feedback?.message || ''}</p>
          </form>
        )}
      </div>

      <div id="acompanhar" className="scroll-mt-24 saas-card p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="rounded-xl bg-blue-100 p-2.5 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
            <Search className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-950 dark:text-white">Acompanhar indicação</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-gray-300">Use o código recebido após o cadastro. Nenhum dado pessoal é exibido nesta consulta.</p>
          </div>
        </div>

        <form onSubmit={lookupStatus} className="space-y-3">
          <label htmlFor="referral-status-code" className="block text-sm font-bold text-slate-800 dark:text-gray-200">Código de acompanhamento</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input id="referral-status-code" value={statusInput} onChange={(event) => setStatusInput(event.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX-XXXX" autoComplete="off" className={`${inputClasses} font-mono tracking-wider`} />
            <button type="submit" disabled={isLookingUp} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
              {isLookingUp ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
              Consultar
            </button>
          </div>
        </form>

        {statusError && <p className="mt-4 text-sm font-semibold text-red-700 dark:text-red-300" role="alert">{statusError}</p>}
        {statusResult && statusCopy && (
          <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30" role="status" aria-live="polite">
            <p className="font-mono text-xs font-bold tracking-wider text-blue-800 dark:text-blue-300">{statusCode}</p>
            <h3 className="mt-2 text-lg font-bold text-blue-950 dark:text-blue-200">{statusCopy.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-blue-900 dark:text-blue-200">{statusCopy.description}</p>
            <p className="mt-3 text-xs font-semibold text-blue-800 dark:text-blue-300">Recebida em {formatDate(statusResult.createdAt)} · Origem: {statusResult.ref || 'Orgânico'}</p>
          </div>
        )}
      </div>
    </section>
  );
}
