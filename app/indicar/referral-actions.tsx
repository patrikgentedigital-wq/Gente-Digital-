'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Copy, MessageCircle, Share2 } from 'lucide-react';
import { PROGRAM_RULES } from '@/lib/rules';
import { REFERRAL_COOKIE_NAME, REFERRAL_VISITOR_KEY } from '@/lib/referrals';

type ReferralActionsProps = {
  refCode: string;
};

type Feedback = { tone: 'success' | 'error'; message: string } | null;

function getShareUrl(refCode: string): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('status');
  if (refCode) url.searchParams.set('ref', refCode);
  return url.toString();
}

function getVisitorId(): string {
  try {
    const stored = window.localStorage.getItem(REFERRAL_VISITOR_KEY);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return stored;

    const created = crypto.randomUUID();
    window.localStorage.setItem(REFERRAL_VISITOR_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export function ReferralActions({ refCode }: ReferralActionsProps) {
  const trackedRef = useRef('');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!refCode || trackedRef.current === refCode) return;
    trackedRef.current = refCode;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + PROGRAM_RULES.cookieDuracaoDias);
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = [
      `${REFERRAL_COOKIE_NAME}=${encodeURIComponent(refCode)}`,
      `expires=${expiresAt.toUTCString()}`,
      'path=/',
      'SameSite=Lax',
    ].join('; ') + secure;

    void fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: refCode, visitorId: getVisitorId() }),
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error(`Falha de rastreamento: ${response.status}`);
    }).catch((error) => {
      console.error('Falha ao registrar acesso da indicação:', error);
      setFeedback({ tone: 'error', message: 'A página abriu normalmente, mas o registro do acesso será tentado novamente no cadastro.' });
    });
  }, [refCode]);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const showTemporaryFeedback = (nextFeedback: Feedback) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(nextFeedback);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareUrl(refCode));
      showTemporaryFeedback({ tone: 'success', message: 'Link copiado. A origem da indicação foi preservada.' });
    } catch {
      showTemporaryFeedback({ tone: 'error', message: 'Não foi possível copiar automaticamente. Selecione o endereço do navegador e copie o link.' });
    }
  };

  const handleNativeShare = async () => {
    const url = getShareUrl(refCode);
    const text = 'Conheça o programa Indique e Ganhe da Gente Digital.';

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Indique e Ganhe | Gente Digital', text, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsApp = () => {
    const url = getShareUrl(refCode);
    const text = `Conheça o programa Indique e Ganhe da Gente Digital: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={handleWhatsApp} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-green-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2">
          <MessageCircle className="h-5 w-5" aria-hidden="true" /> WhatsApp
        </button>
        <button type="button" onClick={handleNativeShare} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2">
          <Share2 className="h-5 w-5" aria-hidden="true" /> Compartilhar
        </button>
        <button type="button" onClick={handleCopy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700">
          {feedback?.tone === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" /> : <Copy className="h-5 w-5" aria-hidden="true" />}
          Copiar link
        </button>
      </div>
      <p className={`min-h-5 text-sm ${feedback?.tone === 'error' ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'}`} role="status" aria-live="polite">
        {feedback?.message || ''}
      </p>
    </div>
  );
}
