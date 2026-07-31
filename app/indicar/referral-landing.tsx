'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Copy, Gift, Link2, MousePointerClick, QrCode, ShieldCheck, Sparkles, Timer, Users, Wallet, X } from 'lucide-react';
import { PROGRAM_RULES, RULES_COPY } from '@/lib/rules';

function normalizeRef(ref: string | null): string {
  if (!ref) return '';
  return ref.trim().slice(0, 50);
}

export function ReferralLanding() {
  const searchParams = useSearchParams();
  const ref = useMemo(() => normalizeRef(searchParams.get('ref')), [searchParams]);
  const [copied, setCopied] = useState(false);
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (!ref || tracked) return;
    setTracked(true);

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + PROGRAM_RULES.cookieDuracaoDias);
      document.cookie = [
        `gente_digital_ref=${encodeURIComponent(ref)}`,
        `expires=${expiresAt.toUTCString()}`,
        'path=/',
        'SameSite=Lax',
      ].join('; ');
    } catch (e) {
      console.error('Erro ao gravar cookie de indicação:', e);
    }

    fetch('/api/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    }).catch(err => console.error('Falha ao rastrear clique:', err));
  }, [ref, tracked]);

  const fullLink = typeof window !== 'undefined' ? window.location.href : '';

  const handleShareWhatsApp = () => {
    const text = `Indique e Ganhe Gente Digital! Confira o programa e ganhe recompensas a cada indicação: ${fullLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Falha ao copiar link:', e);
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
      <header className="sticky top-0 z-40 glass-header border-b border-brand-border dark:border-gray-800 h-[64px] flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 flex items-center justify-center">
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
            <Sparkles className="w-4 h-4" /> Programa de Indicação Oficial
          </div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">
            Indique e Ganhe <span className="text-amber-500">recompensas reais</span>
          </h1>
          <p className="text-brand-muted dark:text-gray-400 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Colaboradores ganham PIX por venda e clientes ganham desconto na mensalidade.
            Quanto mais indicações, maiores as recompensas.
          </p>
        </section>

        {ref && (
          <section className="rounded-3xl border-2 border-brand-yellow/40 bg-white dark:bg-[#18181b] shadow-lg p-6 sm:p-8 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-brand-charcoal dark:text-white">
                  Você foi indicado por <span className="text-amber-600 dark:text-amber-400">{ref}</span>
                </h2>
                <p className="text-xs text-brand-muted dark:text-gray-400">
                  Sua indicação fica registrada por {PROGRAM_RULES.cookieDuracaoDias} dias no seu dispositivo.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleShareWhatsApp}
                className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <span className="text-base">💬</span> Compartilhar no WhatsApp
              </button>
              <button
                onClick={handleCopy}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 border ${
                  copied
                    ? 'bg-emerald-600 border-emerald-600 text-white'
                    : 'bg-brand-charcoal dark:bg-zinc-700 border-brand-charcoal dark:border-zinc-700 text-white hover:bg-gray-800 dark:hover:bg-zinc-600'
                }`}
              >
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Link copiado!' : 'Copiar link do programa'}
              </button>
            </div>
            <p className="text-[11px] text-center text-brand-muted dark:text-gray-400">
              Compartilhando, quem te indicou também continua sendo creditado em novas conversões.
            </p>
          </section>
        )}

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tiers.map(tier => (
            <div key={tier.title} className="saas-card p-6 flex items-start gap-4">
              <div className={`p-2.5 rounded-xl shrink-0 ${tier.color}`}>
                <tier.icon className="w-5 h-5" />
              </div>
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
            <div className="saas-card p-6">
              <div className="p-2 w-fit rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow mb-3">
                <MousePointerClick className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm mb-1">1. Acesse o link</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">
                Ao acessar, sua indicação é registrada automaticamente por {PROGRAM_RULES.cookieDuracaoDias} dias.
              </p>
            </div>
            <div className="saas-card p-6">
              <div className="p-2 w-fit rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow mb-3">
                <QrCode className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm mb-1">2. Contrate o plano</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">
                Ao contratar, quem indicou é creditado na hora na regra vigente.
              </p>
            </div>
            <div className="saas-card p-6">
              <div className="p-2 w-fit rounded-xl bg-brand-yellow/20 text-brand-charcoal dark:text-brand-yellow mb-3">
                <Timer className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-sm mb-1">3. Receba a recompensa</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">
                {RULES_COPY.prazoPagamento}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 p-5 flex items-start gap-3">
          <Timer className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300">Prazos transparentes</h3>
            <p className="text-xs text-amber-700 dark:text-amber-400/80 mt-1 leading-relaxed">
              {RULES_COPY.prazoPagamento} O desconto do cliente indicador é aplicado na primeira fatura após a instalação.
              O bônus de top indicador é pago no fechamento do mês, sempre que a meta mínima for atingida.
            </p>
          </div>
        </section>

        <section className="text-center space-y-4 pb-6">
          <h2 className="font-display font-bold text-xl text-brand-charcoal dark:text-white">Pronto para indicar?</h2>
          <p className="text-sm text-brand-muted dark:text-gray-400">
            Compartilhe este link com amigos e clientes e acompanhe suas recompensas.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 max-w-xl mx-auto">
            <button
              onClick={handleShareWhatsApp}
              className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-base">💬</span> Compartilhar no WhatsApp
            </button>
            <button
              onClick={handleCopy}
              className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2 border ${
                copied
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-brand-yellow hover:bg-yellow-400 border-brand-yellow text-brand-charcoal'
              }`}
            >
              {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Link copiado!' : 'Copiar link'}
            </button>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-border dark:border-gray-800 py-6 text-center text-xs text-brand-muted dark:text-gray-500">
        Gente Digital © {new Date().getFullYear()} • Programa de Indicação e Recompensas
      </footer>
    </div>
  );
}
