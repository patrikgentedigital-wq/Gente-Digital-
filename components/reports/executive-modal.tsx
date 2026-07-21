import { Printer, X, TrendingUp, Users, DollarSign, Award, CheckCircle2 } from 'lucide-react';

interface ExecutiveReportModalProps {
  onClose: () => void;
  metrics: {
    totalLeads: number;
    conversões: number;
    conversionRate: string;
    clicks: number;
    topColaboradores: any[];
    topClientes: any[];
  };
}

export function ExecutiveReportModal({ onClose, metrics }: ExecutiveReportModalProps) {
  const handlePrint = () => {
    window.print();
  };

  const currentDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white dark:bg-zinc-900 text-brand-charcoal dark:text-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden border border-brand-border dark:border-gray-800 my-8">
        
        {/* Top Control Bar (Hidden on print) */}
        <div className="flex items-center justify-between p-6 border-b border-brand-border dark:border-gray-800 bg-gray-50 dark:bg-zinc-800 print:hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-yellow text-brand-charcoal rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-brand-charcoal dark:text-white">Relatório Executivo Mensal</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400">Documento corporativo pronto para apresentação à diretoria e exportação em PDF.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar em PDF
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Area */}
        <div className="p-8 sm:p-12 space-y-8 bg-white dark:bg-zinc-900 text-brand-charcoal dark:text-white print:p-0 print:bg-white print:text-black">
          
          {/* Report Header */}
          <div className="flex justify-between items-start border-b-2 border-brand-yellow pb-6">
            <div>
              <h1 className="font-display text-3xl font-extrabold text-brand-charcoal dark:text-white print:text-black tracking-tight">
                Gente Digital
              </h1>
              <p className="text-xs text-brand-muted dark:text-gray-400 print:text-gray-600 uppercase tracking-widest font-bold mt-1">
                Relatório de Desempenho Comercial & Marketing de Indicações
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-brand-muted dark:text-gray-400 print:text-gray-600 font-bold block">Emissão:</span>
              <span className="text-sm font-extrabold text-brand-charcoal dark:text-white print:text-black">{currentDate}</span>
            </div>
          </div>

          {/* Key Executive Metrics Grid */}
          <div>
            <h2 className="text-xs font-bold text-brand-muted dark:text-gray-400 print:text-gray-600 uppercase tracking-wider mb-4">
              Métricas Consolidadas do Período
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-zinc-800/60 p-4 rounded-xl border border-brand-border dark:border-gray-700 print:bg-gray-50 print:border-gray-300">
                <span className="text-[10px] font-bold text-brand-muted dark:text-gray-400 print:text-gray-600 uppercase">Total de Leads</span>
                <p className="font-display text-2xl font-extrabold text-brand-charcoal dark:text-white print:text-black mt-1">
                  {metrics.totalLeads}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-zinc-800/60 p-4 rounded-xl border border-brand-border dark:border-gray-700 print:bg-gray-50 print:border-gray-300">
                <span className="text-[10px] font-bold text-brand-muted dark:text-gray-400 print:text-gray-600 uppercase">Contratos Fechados</span>
                <p className="font-display text-2xl font-extrabold text-green-600 print:text-green-700 mt-1">
                  {metrics.conversões}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-zinc-800/60 p-4 rounded-xl border border-brand-border dark:border-gray-700 print:bg-gray-50 print:border-gray-300">
                <span className="text-[10px] font-bold text-brand-muted dark:text-gray-400 print:text-gray-600 uppercase">Taxa de Conversão</span>
                <p className="font-display text-2xl font-extrabold text-blue-600 print:text-blue-700 mt-1">
                  {metrics.conversionRate}
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-zinc-800/60 p-4 rounded-xl border border-brand-border dark:border-gray-700 print:bg-gray-50 print:border-gray-300">
                <span className="text-[10px] font-bold text-brand-muted dark:text-gray-400 print:text-gray-600 uppercase">Acessos aos Links</span>
                <p className="font-display text-2xl font-extrabold text-brand-yellow print:text-amber-600 mt-1">
                  {metrics.clicks}
                </p>
              </div>
            </div>
          </div>

          {/* Top Colaboradores Table */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Award className="w-4 h-4 text-brand-yellow" />
              <h2 className="text-sm font-bold text-brand-charcoal dark:text-white print:text-black uppercase tracking-wider">
                Ranking dos Melhores Colaboradores (Indicações)
              </h2>
            </div>
            <table className="w-full text-left border-collapse border border-brand-border dark:border-gray-700 print:border-gray-300 text-xs">
              <thead className="bg-gray-100 dark:bg-zinc-800 print:bg-gray-100 text-brand-charcoal dark:text-gray-200 print:text-black font-bold uppercase">
                <tr>
                  <th className="p-3 border-b">Posição</th>
                  <th className="p-3 border-b">Colaborador</th>
                  <th className="p-3 border-b">Conversões</th>
                  <th className="p-3 border-b text-right">Pontuação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border dark:divide-gray-800 print:divide-gray-200">
                {metrics.topColaboradores.map((colab, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-zinc-800/40">
                    <td className="p-3 font-bold text-brand-charcoal dark:text-white print:text-black">#{i + 1}</td>
                    <td className="p-3 font-semibold text-brand-charcoal dark:text-white print:text-black">{colab.name}</td>
                    <td className="p-3 text-green-600 font-bold">{colab.conversions} vendas</td>
                    <td className="p-3 text-right font-extrabold text-brand-charcoal dark:text-white print:text-black">{colab.points} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Conclusion Note */}
          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl print:bg-gray-50 print:border-gray-300">
            <h3 className="text-xs font-bold text-amber-800 dark:text-amber-300 print:text-black uppercase tracking-wider mb-1">
              Conclusão Executiva
            </h3>
            <p className="text-xs text-amber-900 dark:text-amber-200 print:text-gray-700 leading-relaxed">
              O programa de marketing de indicações continua apresentando tração consistente, impulsionando novas adesões de banda larga com menor custo de aquisição de clientes (CAC) em comparação com canais tradicionais. Recomenda-se a continuidade dos incentivos de comissionamento aos técnicos e colaboradores mais ativos.
            </p>
          </div>

          {/* Signature Line for Board Presentation */}
          <div className="pt-8 border-t border-gray-200 dark:border-gray-800 print:border-gray-300 flex justify-between items-center text-xs text-brand-muted dark:text-gray-400 print:text-gray-500">
            <span>Gente Digital CRM - Sistema de Gestão de Indicações</span>
            <span>Documento Reservado à Diretoria Executiva</span>
          </div>

        </div>

      </div>
    </div>
  );
}
