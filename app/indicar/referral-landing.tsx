'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { CheckCircle2, Copy, Loader2, MessageCircle, ArrowUpRight } from 'lucide-react';
import { PROGRAM_RULES, RULES_COPY } from '@/lib/rules';
import { PublicBackLink, PublicShell } from '@/app/_public-identity/public-shell';

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
      } catch (e) {
        if (!(e instanceof Error && e.name === 'AbortError')) {
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
    { title: 'Colaborador', rule: `De 1 a ${PROGRAM_RULES.colaborador.volumeThreshold - 1} vendas no período`, value: PROGRAM_RULES.colaborador.taxaPorVenda, detail: 'via Pix por venda' },
    { title: 'Colaborador', rule: `A partir de ${PROGRAM_RULES.colaborador.volumeThreshold} vendas no período`, value: PROGRAM_RULES.colaborador.taxaVolume, detail: 'via Pix por venda' },
    { title: 'Top indicador', rule: `1º colocado com pelo menos ${PROGRAM_RULES.bonusTop.minimoIndicacoes} vendas no mês`, value: PROGRAM_RULES.bonusTop.valor, detail: 'bônus no fechamento do mês' },
    { title: 'Cliente que indica', rule: 'Após a instalação do indicado', value: PROGRAM_RULES.clienteIndicador.descontoMensalidade, detail: 'de desconto na primeira fatura após a instalação' },
  ];
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const shareActions = (
    <div className="pub-actions">
      <button type="button" onClick={handleNativeShare} className="pub-secondary">
        <MessageCircle size={16} /> Compartilhar indicação
      </button>
      <button type="button" onClick={handleCopy} className="pub-secondary" aria-live="polite">
        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
    </div>
  );

  return (
    <PublicShell referral headerAction={<PublicBackLink href="/">Voltar ao painel</PublicBackLink>}
      referrer={ref && (
        <div className="pub-referrer">
          <strong>Você foi indicado por {ref}</strong>
          <small>Sua indicação fica registrada por {PROGRAM_RULES.cookieDuracaoDias} dias neste dispositivo.</small>
          {shareActions}
        </div>
      )}
      details={(
        <section className="pub-rules" aria-labelledby="recompensas">
          <div className="pub-section-head">
            <h2 id="recompensas">Quanto rende cada indicação</h2>
            <p>{RULES_COPY.prazoPagamento}</p>
          </div>
          <ul className="pub-tiles">
            {tiers.map(tier => (
              <li className="pub-tile" key={tier.rule}>
                <div><h3>{tier.title}</h3><p>{tier.rule}</p></div>
                <div><strong>{money.format(tier.value)}</strong><small>{tier.detail}</small></div>
              </li>
            ))}
          </ul>
          <div className="pub-share">
            <div>
              <h2>Compartilhar indicação</h2>
              <p>O link identificado mantém a indicação associada por {PROGRAM_RULES.cookieDuracaoDias} dias neste dispositivo.</p>
            </div>
            {shareActions}
            {shareError && (
              <div className="pub-manual-link pub-alert" role="alert">
                <p>{shareError}</p><a className="pub-link" href={getShareLink()}>{getShareLink()}</a>
              </div>
            )}
          </div>
          <details className="pub-steps">
            <summary>Como funciona o programa</summary>
            <ol>
              <li><strong>Acesse o link.</strong> A indicação identificada fica registrada por {PROGRAM_RULES.cookieDuracaoDias} dias.</li>
              <li><strong>Conheça os planos.</strong> Preencha seus dados para a equipe apresentar as opções.</li>
              <li><strong>Receba a recompensa.</strong> {RULES_COPY.prazoPagamento} O bônus do top indicador é pago no fechamento do mês quando a meta mínima é atingida.</li>
            </ol>
          </details>
        </section>
      )}>
      <div className="pub-form-head">
        <h2 id="cadastro">Quero conhecer os planos</h2>
        <p>Deixe seus dados e a equipe Gente Digital entrará em contato para apresentar as opções disponíveis.</p>
      </div>
      {submitted ? (
        <div className="pub-notice" role="status">
          <strong>Indicação registrada com sucesso!</strong>
          <p>Nossa equipe entrará em contato via WhatsApp ou telefone.</p>
        </div>
      ) : (
        <form className="pub-fields" onSubmit={handleLeadSubmit} aria-label="Cadastro para conhecer os planos">
          <div className="pub-field">
            <label htmlFor="referral-name">Nome completo</label>
            <input id="referral-name" name="name" value={form.name}
              onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))}
              required minLength={3} maxLength={100} autoComplete="name" placeholder="Seu nome" />
          </div>
          <div className="pub-field">
            <label htmlFor="referral-phone">Telefone / WhatsApp</label>
            <input id="referral-phone" name="phone" type="tel" inputMode="tel" value={form.phone} onChange={handlePhoneChange}
              required minLength={14} maxLength={15} autoComplete="tel" placeholder="(91) 98000-0000" />
          </div>
          {submitError && <p className="pub-alert" role="alert">{submitError}</p>}
          <button type="submit" disabled={isSubmitting} className="pub-primary">
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
            {isSubmitting ? 'Registrando...' : 'Quero receber contato'}
            {!isSubmitting && <ArrowUpRight size={17} />}
          </button>
        </form>
      )}
    </PublicShell>
  );
}
