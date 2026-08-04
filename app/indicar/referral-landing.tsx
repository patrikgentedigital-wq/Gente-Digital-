import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Gift,
  Link2,
  MousePointerClick,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wallet,
} from 'lucide-react';
import { PROGRAM_RULES, RULES_COPY } from '@/lib/rules';
import { ReferralActions } from './referral-actions';
import { ReferralLeadForm } from './referral-form';
import { ReferralWebVitals } from './referral-web-vitals';

type ReferralLandingProps = {
  refCode: string;
  initialStatusCode: string;
};

const focusClasses = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

export function ReferralLanding({ refCode, initialStatusCode }: ReferralLandingProps) {
  const tiers = [
    {
      icon: Wallet,
      title: 'Colaborador: 1 a 9 vendas',
      value: `R$ ${PROGRAM_RULES.colaborador.taxaPorVenda},00`,
      detail: 'por venda confirmada, via PIX',
      color: 'bg-amber-300 text-slate-950',
    },
    {
      icon: Sparkles,
      title: `Colaborador: ${PROGRAM_RULES.colaborador.volumeThreshold}+ vendas`,
      value: `R$ ${PROGRAM_RULES.colaborador.taxaVolume},00`,
      detail: 'por venda confirmada, via PIX',
      color: 'bg-emerald-600 text-white',
    },
    {
      icon: Gift,
      title: `Top indicador: ${PROGRAM_RULES.bonusTop.minimoIndicacoes}+ vendas`,
      value: `+ R$ ${PROGRAM_RULES.bonusTop.valor},00`,
      detail: 'bônus no fechamento do mês',
      color: 'bg-purple-700 text-white',
    },
    {
      icon: Users,
      title: 'Cliente que indicar',
      value: `R$ ${PROGRAM_RULES.clienteIndicador.descontoMensalidade},00`,
      detail: 'de desconto na mensalidade',
      color: 'bg-blue-700 text-white',
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-brand-surface text-brand-charcoal dark:bg-gray-950 dark:text-gray-100">
      <ReferralWebVitals />
      <a
        href="#conteudo"
        className={`sr-only z-50 rounded-lg bg-white px-4 py-3 font-bold text-slate-950 shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 ${focusClasses}`}
      >
        Ir para o conteúdo
      </a>

      <header className="glass-header sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-brand-border px-4 dark:border-gray-800 sm:px-8">
        <a href="/indicar" className={`flex items-center gap-2.5 rounded-xl ${focusClasses}`} aria-label="Gente Digital - Indique e Ganhe">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-yellow-300 to-amber-400">
            <Link2 className="h-5 w-5 text-slate-950" aria-hidden="true" />
          </span>
          <span className="leading-tight">
            <span className="block font-display font-bold text-brand-charcoal dark:text-white">
              Gente<span className="text-amber-700 dark:text-amber-300">Digital</span>
            </span>
            <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-gray-300">Indique e Ganhe</span>
          </span>
        </a>

        <nav className="flex items-center gap-2" aria-label="Navegação principal">
          <a href="#acompanhar" className={`hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-800 sm:inline-flex ${focusClasses}`}>
            Acompanhar
          </a>
          <a href="#quero-contratar" className={`inline-flex items-center gap-2 rounded-xl bg-brand-yellow px-4 py-2.5 text-sm font-extrabold text-slate-950 shadow-sm transition hover:bg-yellow-300 ${focusClasses}`}>
            Quero contratar
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main id="conteudo" className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 py-10 sm:px-6 sm:py-14">
        <section className="space-y-6 text-center" aria-labelledby="titulo-programa">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Programa oficial de indicação
          </p>
          <h1 id="titulo-programa" className="font-display text-4xl font-extrabold tracking-tight sm:text-6xl">
            Indique e ganhe <span className="text-amber-700 dark:text-amber-300">recompensas reais</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-700 dark:text-gray-300 sm:text-lg">
            Cadastre a pessoa interessada, preserve quem indicou e acompanhe cada etapa até a confirmação da instalação.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#quero-contratar" className={`inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 py-3.5 text-base font-extrabold text-white shadow-lg transition hover:bg-slate-800 dark:bg-brand-yellow dark:text-slate-950 dark:hover:bg-yellow-300 ${focusClasses}`}>
              Cadastrar interesse
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
            <a href="#como-funciona" className={`inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-bold text-slate-800 transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800 ${focusClasses}`}>
              Ver regras e prazos
            </a>
          </div>
        </section>

        <section className="rounded-3xl border-2 border-amber-400/50 bg-white p-6 shadow-lg dark:bg-[#18181b] sm:p-8" aria-labelledby="origem-indicacao">
          <div className="mb-5 flex items-start gap-3">
            <span className="rounded-xl bg-amber-100 p-2.5 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <ShieldCheck className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 id="origem-indicacao" className="font-display text-xl font-bold text-slate-950 dark:text-white">
                {refCode ? (
                  <>Indicação vinculada a <span className="text-amber-700 dark:text-amber-300">{refCode}</span></>
                ) : (
                  'Compartilhe o programa'
                )}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-gray-300">
                {refCode
                  ? `A origem fica salva neste dispositivo por ${PROGRAM_RULES.cookieDuracaoDias} dias e também acompanha o cadastro enviado abaixo.`
                  : 'Abra um link individual de colaborador ou cliente para que a origem seja creditada automaticamente.'}
              </p>
            </div>
          </div>
          <ReferralActions refCode={refCode} />
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-labelledby="recompensas">
          <h2 id="recompensas" className="sr-only">Recompensas do programa</h2>
          {tiers.map((tier) => (
            <article key={tier.title} className="saas-card flex items-start gap-4 p-6">
              <span className={`shrink-0 rounded-xl p-2.5 ${tier.color}`}>
                <tier.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-base font-bold leading-snug text-slate-950 dark:text-white">{tier.title}</h3>
                <p className="mt-1 font-display text-2xl font-extrabold">{tier.value}</p>
                <p className="text-sm text-slate-600 dark:text-gray-300">{tier.detail}</p>
              </div>
            </article>
          ))}
        </section>

        <section id="como-funciona" className="scroll-mt-24 space-y-5" aria-labelledby="titulo-como-funciona">
          <div>
            <h2 id="titulo-como-funciona" className="font-display text-3xl font-bold text-slate-950 dark:text-white">Como funciona</h2>
            <p className="mt-2 text-base text-slate-600 dark:text-gray-300">Três etapas, com origem e andamento visíveis.</p>
          </div>
          <ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <li className="saas-card p-6">
              <span className="mb-4 flex w-fit items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 font-extrabold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                <MousePointerClick className="h-5 w-5" aria-hidden="true" /> 1
              </span>
              <h3 className="text-base font-bold">Cadastre o interesse</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-gray-300">Nome, telefone e origem da indicação seguem juntos para o painel comercial.</p>
            </li>
            <li className="saas-card p-6">
              <span className="mb-4 flex w-fit items-center gap-2 rounded-xl bg-blue-100 px-3 py-2 font-extrabold text-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
                <BadgeCheck className="h-5 w-5" aria-hidden="true" /> 2
              </span>
              <h3 className="text-base font-bold">Acompanhe o atendimento</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-gray-300">O código privado mostra se a indicação foi recebida, está em atendimento ou foi convertida.</p>
            </li>
            <li className="saas-card p-6">
              <span className="mb-4 flex w-fit items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 font-extrabold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                <Timer className="h-5 w-5" aria-hidden="true" /> 3
              </span>
              <h3 className="text-base font-bold">Receba a recompensa</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-gray-300">{RULES_COPY.prazoPagamento}</p>
            </li>
          </ol>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30" aria-labelledby="regras-prazos">
          <div className="flex items-start gap-3">
            <Timer className="mt-0.5 h-5 w-5 shrink-0 text-blue-800 dark:text-blue-300" aria-hidden="true" />
            <div>
              <h2 id="regras-prazos" className="text-base font-bold text-blue-950 dark:text-blue-200">Regras e prazos transparentes</h2>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-blue-900 dark:text-blue-200">
                <li>• A conversão conta quando a instalação é confirmada no painel.</li>
                <li>• {RULES_COPY.prazoPagamento}</li>
                <li>• O desconto do cliente indicador entra na primeira fatura após a instalação.</li>
                <li>• O bônus de top indicador é fechado no fim do mês quando a meta mínima é atingida.</li>
              </ul>
            </div>
          </div>
        </section>

        <ReferralLeadForm refCode={refCode} initialStatusCode={initialStatusCode} />

        <section className="rounded-3xl bg-slate-950 p-7 text-white dark:border dark:border-gray-800 sm:p-10" aria-labelledby="garantias-programa">
          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 id="garantias-programa" className="font-display text-2xl font-bold">O que fica registrado</h2>
              <ul className="mt-4 grid gap-3 text-sm text-slate-200 sm:grid-cols-2">
                <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" /> Origem da indicação</li>
                <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" /> Data e andamento do lead</li>
                <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" /> Baixa da recompensa com referência</li>
                <li className="flex gap-2"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" /> Histórico administrativo auditável</li>
              </ul>
            </div>
            <a href="#quero-contratar" className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand-yellow px-6 py-3.5 font-extrabold text-slate-950 hover:bg-yellow-300 ${focusClasses}`}>
              Começar agora
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-brand-border px-4 py-7 text-center text-sm text-slate-600 dark:border-gray-800 dark:text-gray-400">
        Gente Digital © {new Date().getFullYear()} · Programa de Indicação e Recompensas
      </footer>
    </div>
  );
}
