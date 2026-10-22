'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { CheckCircle2, Copy, Loader2, MessageCircle, ShieldCheck, Sparkles, Timer } from 'lucide-react';
import { PROGRAM_RULES, RULES_COPY } from '@/lib/rules';
import { BrandMark } from '@/components/brand-mark';
import { CableArt } from '@/components/cable-art';

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

  // Lê a URL atual de forma segura para SSR (evita hydration mismatch)
  const fullLink = useSyncExternalStore(
    () => () => {},
    () => (typeof window !== 'undefined' ? window.location.href : ''),
    () => '',
  );
  const [baseLink, setBaseLink] = useState<string>(PROGRAM_RULES.linkBasePadrao);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', phone: '' });

  // Carrega o link base configurado no painel admin (fallback: constante padrão)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/settings/base-link')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.base_link) {
          setBaseLink(data.base_link);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
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
        // Sem a flag Secure: cookies sem Secure também funcionam em HTTPS, mas
        // com Secure o cookie é rejeitado em dev/HTTP e o rastreio quebra.
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

  // Garante que o link de compartilhamento sempre direcione para a landing page mantendo o ref
  const getShareLink = () => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      if (ref) {
        return `${origin}/indicar?ref=${encodeURIComponent(ref)}`;
      }
      return `${origin}/indicar`;
    }
    if (ref) {
      return `${baseLink}${baseLink.includes('?') ? '&' : '?'}ref=${encodeURIComponent(ref)}`;
    }
    return fullLink || baseLink;
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

  // Tabela de recompensas: cada linha é um perfil e o valor que ele recebe.
  const tiers = [
    { title: 'Colaborador (1 a 9 vendas)', value: `R$ ${PROGRAM_RULES.colaborador.taxaPorVenda},00`, detail: 'no PIX por venda' },
    { title: 'Colaborador (10+ vendas)', value: `R$ ${PROGRAM_RULES.colaborador.taxaVolume},00`, detail: 'no PIX por venda' },
    { title: `Top indicador (${PROGRAM_RULES.bonusTop.minimoIndicacoes}+ vendas)`, value: `+ R$ ${PROGRAM_RULES.bonusTop.valor},00`, detail: 'bônus PIX no fim do mês' },
    { title: 'Cliente que indicar', value: `R$ ${PROGRAM_RULES.clienteIndicador.descontoMensalidade},00`, detail: 'desconto na mensalidade' },
  ];

  const steps = [
    { title: 'Acesse o link', text: `Ao acessar, sua indicação é registrada automaticamente por ${PROGRAM_RULES.cookieDuracaoDias} dias.` },
    { title: 'Conheça os planos', text: 'Preencha seus dados para a equipe entrar em contato e apresentar as opções.' },
    { title: 'Receba a recompensa', text: RULES_COPY.prazoPagamento },
  ];

  const fieldClass =
    'mt-1.5 w-full rounded-2xl border border-[#35496a] bg-[#17263b] px-4 py-3.5 text-sm font-semibold text-white placeholder:text-[#8796ab] transition-colors focus:border-[#ffe300] focus:outline-none focus:ring-4 focus:ring-[#ffe300]/30';

  const shareButtons = (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={handleNativeShare}
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#0e1b2c] px-5 py-3.5 text-sm font-extrabold text-[#ffe300] transition-colors hover:bg-[#17263b]"
      >
        <MessageCircle className="h-4 w-4" aria-hidden="true" /> Compartilhar indicação
      </button>
      <button
        type="button"
        onClick={handleCopy}
        aria-live="polite"
        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#0e1b2c] px-5 py-3 text-sm font-extrabold text-[#0e1b2c] transition-colors hover:bg-[#0e1b2c]/10"
      >
        {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Link copiado' : 'Copiar link com indicação'}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[var(--app-canvas)] text-[var(--app-ink)]">
      <div className="rounded-b-[40px] bg-[#ffe300] text-[#0e1b2c] sm:rounded-b-[72px]">
        <header className="mx-auto flex h-[76px] w-full max-w-6xl items-center justify-between px-4 sm:px-8" aria-label="Cabeçalho da página">
          <BrandMark tone="onYellow" />
          <div className="fiber-leds" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} />)}
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-16 pt-4 sm:px-8 sm:pb-24 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-14">
          <div className="space-y-6">
            <span className="gd-sticker text-sm">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              PIX a partir de R$ {PROGRAM_RULES.colaborador.taxaPorVenda},00 por venda
            </span>
            <h1 className="font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              Indique e ganhe recompensas reais.
            </h1>
            <p className="max-w-lg text-lg font-semibold leading-relaxed text-[#0e1b2c]/85">
              Colaboradores ganham PIX por venda e clientes ganham desconto na mensalidade.
              Quanto mais indicações, maiores as recompensas.
            </p>

            {ref && (
              <div className="space-y-4 rounded-[28px] bg-white/60 p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0e1b2c] text-[#ffe300]">
                    <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="font-display text-2xl font-bold leading-tight">
                      Você foi indicado por {ref}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-[#0e1b2c]/75">
                      Sua indicação fica registrada por {PROGRAM_RULES.cookieDuracaoDias} dias neste dispositivo.
                    </p>
                  </div>
                </div>
                {shareButtons}
                {shareError && <p role="alert" className="text-sm font-bold text-[#a3231a]">{shareError}</p>}
                <p className="text-sm font-medium text-[#0e1b2c]/75">
                  Compartilhe a página e o código de indicação continua associado às novas conversões.
                </p>
              </div>
            )}

            <CableArt className="pointer-events-none -ml-6 hidden h-auto w-full max-w-md lg:block" />
          </div>

          <section
            id="cadastro"
            className="rounded-[32px] bg-[#0e1b2c] p-6 text-white shadow-2xl sm:p-8 lg:sticky lg:top-6"
          >
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">Quero conhecer os planos</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-[#b4c1d1]">
              Deixe seus dados e a equipe Gente Digital entrará em contato para apresentar as opções disponíveis.
            </p>

            {submitted ? (
              <div className="mt-6 rounded-3xl border-2 border-[#ffe300] p-5" role="status">
                <CheckCircle2 className="h-9 w-9 text-[#ffe300]" aria-hidden="true" />
                <p className="mt-2 font-display text-xl font-bold">Indicação registrada com sucesso!</p>
                <p className="mt-1 text-sm font-medium text-[#b4c1d1]">Nossa equipe entrará em contato via WhatsApp ou telefone em breve.</p>
              </div>
            ) : (
              <form onSubmit={handleLeadSubmit} className="mt-6 grid gap-4" aria-label="Cadastro para conhecer os planos">
                <div>
                  <label htmlFor="referral-name" className="block text-sm font-bold">Nome completo</label>
                  <input id="referral-name" name="name" value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} required minLength={3} maxLength={100} autoComplete="name" placeholder="Seu nome" className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="referral-phone" className="block text-sm font-bold">Telefone / WhatsApp</label>
                  <input id="referral-phone" name="phone" type="tel" inputMode="tel" value={form.phone} onChange={handlePhoneChange} required minLength={14} maxLength={15} autoComplete="tel" placeholder="(91) 98000-0000" className={fieldClass} />
                </div>
                {submitError && <p role="alert" className="text-sm font-bold text-[#ff9b94]">{submitError}</p>}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 inline-flex items-center justify-center gap-2 rounded-full bg-[#ffe300] px-6 py-4 text-base font-extrabold text-[#0e1b2c] shadow-[0_4px_0_#b59f00] transition-all hover:bg-[#ffee55] active:translate-y-[2px] active:shadow-[0_2px_0_#b59f00] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {isSubmitting ? 'Registrando...' : 'Quero receber contato'}
                </button>
              </form>
            )}
          </section>
        </section>
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-20 px-4 py-16 sm:px-8 sm:py-24">
        <section aria-labelledby="recompensas">
          <h2 id="recompensas" className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Quanto cada indicação rende</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {tiers.map(tier => (
              <li key={tier.title} className="flex items-center justify-between gap-4 rounded-[28px] bg-[var(--app-panel)] p-5 shadow-md sm:p-6">
                <div>
                  <h3 className="text-base font-extrabold leading-snug">{tier.title}</h3>
                  <p className="mt-0.5 text-sm font-semibold text-[var(--app-muted)]">{tier.detail}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#ffe300] px-4 py-2 font-display text-2xl font-extrabold tabular-nums text-[#0e1b2c] sm:text-3xl">
                  {tier.value}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Como funciona</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className={`rounded-[32px] p-6 ${index === 1 ? 'bg-[#0e1b2c] text-white' : 'bg-[var(--app-panel)] shadow-md'}`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe300] font-display text-2xl font-extrabold text-[#0e1b2c]">{index + 1}</span>
                <h3 className="mt-4 font-display text-xl font-bold">{step.title}</h3>
                <p className={`mt-1.5 text-sm font-medium leading-relaxed ${index === 1 ? 'text-[#b4c1d1]' : 'text-[var(--app-muted)]'}`}>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex items-start gap-4 rounded-[28px] bg-[#ffe300]/40 p-5 sm:p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ffe300] text-[#0e1b2c]">
            <Timer className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold">Prazos transparentes</h3>
            <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--app-ink)]/80">
              {RULES_COPY.prazoPagamento} O desconto do cliente indicador é aplicado na primeira fatura após a instalação. O bônus de top indicador é pago no fechamento do mês, sempre que a meta mínima for atingida.
            </p>
          </div>
        </section>

        <section className="space-y-4 text-center">
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">Conhece alguém que precisa de internet boa?</h2>
          <p className="text-base font-semibold text-[var(--app-muted)]">Compartilhe este link com amigos e clientes.</p>
          <div className="mx-auto max-w-xl">
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--app-ink)] px-5 py-3.5 text-sm font-extrabold text-[var(--app-canvas)] transition-opacity hover:opacity-90"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> Compartilhar indicação
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#0e1b2c] bg-[#ffe300] px-5 py-3 text-sm font-extrabold text-[#0e1b2c] shadow-[0_3px_0_#0e1b2c] transition-all hover:bg-[#ffee55] active:translate-y-[2px] active:shadow-[0_1px_0_#0e1b2c]"
              >
                {copied ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copied ? 'Link copiado' : 'Copiar link'}
              </button>
            </div>
            {shareError && <p role="alert" className="mt-3 text-sm font-bold text-red-700 dark:text-red-400">{shareError}</p>}
          </div>
        </section>
      </main>

      <footer className="py-8 text-center text-xs font-semibold text-[var(--app-muted)]">
        Gente Digital © {new Date().getFullYear()} • Programa de Indicação e Recompensas
      </footer>
    </div>
  );
}
