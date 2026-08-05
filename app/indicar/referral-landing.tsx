'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardList, Copy, Gift, Link2, Loader2, MousePointerClick, ShieldCheck, Sparkles, Timer, Users, Wallet } from 'lucide-react';
import { PROGRAM_RULES, RULES_COPY } from '@/lib/rules';

function normalizeRef(ref: string | null): string {
  if (!ref) return '';
  return ref.trim().slice(0, 50);
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function ReferralLanding() {
  const searchParams = useSearchParams();
  const ref = useMemo(() => normalizeRef(searchParams.get('ref')), [searchParams]);
  const trackedRef = useRef<string | null>(null);

  // Evita hydration mismatch preenchendo fullLink apenas no cliente após o mount
  const [fullLink, setFullLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setFullLink(window.location.href);
    }
  }, []);

  useEffect(() => {
    if (!ref || trackedRef.current === ref) return;
    trackedRef.current = ref;

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + PROGRAM_RULES.cookieDuracaoDias);
      document.cookie = [
        `gente_digital_ref=${encodeURIComponent(ref)}`,
        `expires=${expiresAt.toUTCString()}`,
        'path=/',
        'SameSite=Lax',
        'Secure',
      ].join('; ');
    } catch (e) {
      console.error('Erro ao gravar cookie de indicação:', e);
    }

    void fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    }).catch(err => console.error('Falha ao rastrear clique:', err));
  }, [ref]);

  // Garante que o link de compartilhamento sempre carregue o ref para manter rastreabilidade
  const getShareLink = () => {
    if (ref) {
      return `${PROGRAM_RULES.linkBasePadrao}?ref=${encodeURIComponent(ref)}`;
    }
    return fullLink || PROGRAM_RULES.linkBasePadrao;
  };

  const handleShareWhatsApp = () => {
    setShareError(null);
    const link = getShareLink();
    const text = `Indique e Ganhe Gente Digital! Confira o programa e ganhe recompensas a cada indicação: ${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    setShareError(null);
    const link = getShareLink();

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Gente Digital - Indique e Ganhe',
          text: 'Confira o programa Indique e Ganhe da Gente Digital e ganhe recompensas:',
          url: link,
        });
        return;
      } catch (e: any) {
        if (e.name !== 'AbortError') {
          console.error('Erro no compartilhamento nativo:', e);
        } else {
          return;
        }
      }
    }
    handleShareWhatsApp();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getShareLink());
      setCopied(true);
      setShareError(null);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Falha ao copiar link:', e);
      setShareError('Não foi possível copiar automaticamente. Selecione e copie o link manualmente.');
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setForm(prev => ({ ...prev, phone: formatted }));
  };

  const handleLeadSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);

    const rawDigits = form.phone.replace(/\D/g, '');
    if (rawDigits.length < 10) {
      setSubmitError('Informe um telefone válido com DDD (mínimo 10 dígitos).');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ref: ref || 'Orgânico' }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Não foi possível registrar seus dados.');
      }
      setSubmitted(true);
      setForm({ name: '', phone: '' });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Não foi possível registrar seus dados. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tiers = [
    { icon: Wallet, title: 'Colaborador (1 a 9 vendas)', value: `R$ ${PROGRAM_RULES.colaborador.taxaPorVenda},00`, detail: 'no PIX por venda', color: 'bg-amber-400 text-slate-950' },
    { icon: Sparkles, title: 'Colaborador (10+ vendas)', value: `R$ ${PROGRAM_RULES.colaborador.taxaVolume},00`, detail: 'no PIX por venda', color: 'bg-emerald-500 text-white' },
    { icon: Gift, title: `Top indicador (${PROGRAM_RULES.bonusTop.minimoIndicacoes}+ vendas)`, value: `+ R$ ${PROGRAM_RULES.bonusTop.valor},00`, detail: 'bônus PIX no fim do mês', color: 'bg-purple-600 text-white' },
    { icon: Users, title: 'Cliente que indicar', value: `R$ ${PROGRAM_RULES.clienteIndicador.descontoMensalidade},00`, detail: 'desconto na mensalidade', color: 'bg-blue-500 text-white' },
  ];

  return (
    <div className="min-h-screen bg-brand-surface dark:bg-gray-900 text-brand-charcoal dark:text-gray-100 flex flex-col">
      <header className="sticky top-0 z-40 glass-header border-b border-brand-border dark:border-gray-800 h-[64px] flex items-center justify-between px-4 sm:px-8" aria-label="Cabeçalho da página">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 flex items-center justify-center" aria-hidden="true">
            <Link2 className="w-5 h-5 text-slate-950" />
          </div>
          <div className="leading-tight">
            <p className="font-display font-bold text-brand-charcoal dark:text-white">Gente<span className="text-amber-500">Digital</span></p>
            <p className="text-[11px] font-semibold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Indique & Ganhe</p>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
        <section className="text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-yellow/15 text-brand-charcoal dark:text-brand-yellow border border-brand-yellow/30 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-4 h-4" aria-hidden="true" /> Programa de Indicação Oficial
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">
            Indique e Ganhe <span className="text-amber-500">recompensas reais</span>
          </h1>
          <p className="text-brand-muted dark:text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Colaboradores ganham PIX por venda e clientes ganham desconto na mensalidade.
            Quanto mais indicações, maiores as recompensas.
          </p>
          <a href="#cadastro" className="inline-flex items-center justify-center rounded-xl bg-brand-yellow px-6 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2">
            Quero ser contatado
          </a>
        </section>

        {ref && (
          <section className="rounded-3xl border-2 border-brand-yellow/40 bg-white dark:bg-[#18181b] shadow-lg p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow" aria-hidden="true">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-brand-charcoal dark:text-white">
                  Você foi indicado por <span className="text-amber-600 dark:text-amber-400">{ref}</span>
                </h2>
                <p className="text-xs text-brand-muted dark:text-gray-400">
                  Sua indicação fica registrada por {PROGRAM_RULES.cookieDuracaoDias} dias neste dispositivo.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={handleNativeShare} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2">
                <span className="text-base" aria-hidden="true">💬</span> Compartilhar indicação
              </button>
              <button type="button" onClick={handleCopy} aria-live="polite" className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 border ${copied ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-brand-charcoal dark:bg-zinc-700 border-brand-charcoal dark:border-zinc-700 text-white hover:bg-gray-800 dark:hover:bg-zinc-600'}`}>
                {copied ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
                {copied ? 'Link copiado!' : 'Copiar link com indicação'}
              </button>
            </div>
            {shareError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{shareError}</p>}
            <p className="text-[11px] text-center text-brand-muted dark:text-gray-400">
              Compartilhe a página e o código de indicação continua associado às novas conversões.
            </p>
          </section>
        )}

        <section id="cadastro" className="rounded-3xl border-2 border-brand-yellow/40 bg-white dark:bg-[#18181b] shadow-lg p-6 sm:p-8">
          <div className="max-w-xl mx-auto text-center space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Próximo passo</p>
            <h2 className="font-display text-2xl font-bold text-brand-charcoal dark:text-white">Quero conhecer os planos</h2>
            <p className="text-sm text-brand-muted dark:text-gray-400">Deixe seus dados e a equipe Gente Digital entrará em contato para apresentar as opções disponíveis.</p>
          </div>

          {submitted ? (
            <div className="mt-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 p-5 text-center" role="status">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="mt-2 font-bold text-emerald-800 dark:text-emerald-300">Indicação registrada com sucesso!</p>
              <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">Nossa equipe entrará em contato via WhatsApp/Telefone em breve.</p>
            </div>
          ) : (
            <form onSubmit={handleLeadSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 max-w-xl mx-auto" aria-label="Cadastro para conhecer os planos">
              <div className="sm:col-span-1">
                <label htmlFor="referral-name" className="block text-sm font-semibold text-brand-charcoal dark:text-white">Nome completo</label>
                <input id="referral-name" name="name" value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} required minLength={3} maxLength={100} autoComplete="name" placeholder="Seu nome" className="mt-1 w-full rounded-xl border border-brand-border bg-gray-50 px-4 py-3 text-sm text-brand-charcoal focus:border-brand-yellow focus:outline-none focus:ring-2 focus:ring-brand-yellow/30 dark:border-gray-700 dark:bg-zinc-800 dark:text-white" />
              </div>
              <div className="sm:col-span-1">
                <label htmlFor="referral-phone" className="block text-sm font-semibold text-brand-charcoal dark:text-white">Telefone / WhatsApp</label>
                <input id="referral-phone" name="phone" type="tel" inputMode="tel" value={form.phone} onChange={handlePhoneChange} required minLength={14} maxLength={15} autoComplete="tel" placeholder="(91) 98000-0000" className="mt-1 w-full rounded-xl border border-brand-border bg-gray-50 px-4 py-3 text-sm text-brand-charcoal focus:border-brand-yellow focus:outline-none focus:ring-2 focus:ring-brand-yellow/30 dark:border-gray-700 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-400" />
              </div>
              {submitError && <p role="alert" className="sm:col-span-2 text-sm text-red-600 dark:text-red-400 text-center">{submitError}</p>}
              <button type="submit" disabled={isSubmitting} className="sm:col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-5 py-3.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-brand-yellow dark:text-slate-950 dark:hover:bg-yellow-400">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isSubmitting ? 'Registrando...' : 'Quero receber contato'}
              </button>
            </form>
          )}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tiers.map(tier => (
            <div key={tier.title} className="saas-card p-6 flex items-start gap-4">
              <div className={`p-2.5 rounded-xl shrink-0 ${tier.color}`} aria-hidden="true"><tier.icon className="w-5 h-5" /></div>
              <div>
                <h3 className="text-sm font-bold text-brand-charcoal dark:text-white leading-snug">{tier.title}</h3>
                <p className="font-display text-2xl font-extrabold mt-1">{tier.value}</p>
                <p className="text-xs text-brand-muted dark:text-gray-400">{tier.detail}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="font-display font-bold text-2xl text-brand-charcoal dark:text-white">Como funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="saas-card p-6"><div className="p-2 w-fit rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow mb-3" aria-hidden="true"><MousePointerClick className="w-5 h-5" /></div><h3 className="font-bold text-sm mb-1">1. Acesse o link</h3><p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">Ao acessar, sua indicação é registrada automaticamente por {PROGRAM_RULES.cookieDuracaoDias} dias.</p></div>
            <div className="saas-card p-6"><div className="p-2 w-fit rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow mb-3" aria-hidden="true"><ClipboardList className="w-5 h-5" /></div><h3 className="font-bold text-sm mb-1">2. Conheça os planos</h3><p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">Preencha seus dados para a equipe entrar em contato e apresentar as opções.</p></div>
            <div className="saas-card p-6"><div className="p-2 w-fit rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow mb-3" aria-hidden="true"><Timer className="w-5 h-5" /></div><h3 className="font-bold text-sm mb-1">3. Receba a recompensa</h3><p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">{RULES_COPY.prazoPagamento}</p></div>
          </div>
        </section>

        <section className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-5 flex items-start gap-3">
          <Timer className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div><h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Prazos transparentes</h3><p className="text-xs text-amber-700 dark:text-amber-400/80 mt-1 leading-relaxed">{RULES_COPY.prazoPagamento} O desconto do cliente indicador é aplicado na primeira fatura após a instalação. O bônus de top indicador é pago no fechamento do mês, sempre que a meta mínima for atingida.</p></div>
        </section>

        <section className="text-center space-y-4 pb-6">
          <h2 className="font-display font-bold text-xl text-brand-charcoal dark:text-white">Quer indicar alguém?</h2>
          <p className="text-sm text-brand-muted dark:text-gray-400">Compartilhe este link com amigos e clientes.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 max-w-xl mx-auto">
            <button type="button" onClick={handleNativeShare} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"><span className="text-base" aria-hidden="true">💬</span> Compartilhar indicação</button>
            <button type="button" onClick={handleCopy} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 border ${copied ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-brand-yellow hover:bg-yellow-400 border-brand-yellow text-brand-charcoal'}`}>{copied ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}{copied ? 'Link copiado!' : 'Copiar link'}</button>
          </div>
          {shareError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{shareError}</p>}
        </section>
      </main>

      <footer className="border-t border-brand-border dark:border-gray-800 py-6 text-center text-xs text-brand-muted dark:text-gray-500">Gente Digital © {new Date().getFullYear()} • Programa de Indicação e Recompensas</footer>
    </div>
  );
}
