'use client';

import { Printer, X, TrendingUp, Award } from 'lucide-react';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] as string));
}

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
  const currentDate = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const handlePrintPdf = () => {
    const reportElem = document.getElementById('executive-report-document');
    if (!reportElem) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Relatorio_Executivo_Gente_Digital_${new Date().toISOString().slice(0, 10)}</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@600;700;800&display=swap" rel="stylesheet">
        <style>
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #ffffff !important;
            color: #0f172a !important;
            padding: 24px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .font-display {
            font-family: 'Outfit', 'Inter', sans-serif;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 3px solid #f59e0b;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .brand-title {
            font-size: 26px;
            font-weight: 800;
            color: #09090b;
            letter-spacing: -0.5px;
          }
          .brand-title span {
            color: #f59e0b;
          }
          .brand-sub {
            font-size: 11px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-top: 4px;
          }
          .date-box {
            text-align: right;
          }
          .date-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
          }
          .date-val {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
          }
          .section-title {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
          }
          .metrics-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-bottom: 24px;
          }
          .metric-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 14px;
          }
          .metric-label {
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            display: block;
          }
          .metric-value {
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            margin-top: 4px;
          }
          .text-green { color: #16a34a !important; }
          .text-blue { color: #2563eb !important; }
          .text-amber { color: #d97706 !important; }
          .ranking-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
            font-size: 12px;
          }
          .ranking-table th {
            background: #f1f5f9;
            color: #334155;
            text-align: left;
            padding: 10px 12px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            border-bottom: 2px solid #cbd5e1;
          }
          .ranking-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e2e8f0;
            color: #1e293b;
          }
          .ranking-table tr:nth-child(even) {
            background: #f8fafc;
          }
          .concl-box {
            background: #fffbeb;
            border: 1px solid #fde68a;
            border-radius: 12px;
            padding: 14px 16px;
            margin-bottom: 24px;
          }
          .concl-title {
            font-size: 11px;
            font-weight: 700;
            color: #92400e;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .concl-text {
            font-size: 11.5px;
            color: #78350f;
            line-height: 1.5;
          }
          .footer {
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #94a3b8;
            font-weight: 500;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand-title font-display">Gente<span>Digital</span></div>
            <div class="brand-sub">Relatório de Desempenho Comercial & Marketing de Indicações</div>
          </div>
          <div class="date-box">
            <span class="date-label">Emissão</span>
            <div class="date-val">${currentDate}</div>
          </div>
        </div>

        <div>
          <div class="section-title">Métricas Consolidadas do Período</div>
          <div class="metrics-grid">
            <div class="metric-card">
              <span class="metric-label">Total de Leads</span>
              <div class="metric-value font-display">${metrics.totalLeads}</div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Contratos Fechados</span>
              <div class="metric-value font-display text-green">${metrics.conversões}</div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Taxa de Conversão</span>
              <div class="metric-value font-display text-blue">${metrics.conversionRate}</div>
            </div>
            <div class="metric-card">
              <span class="metric-label">Acessos aos Links</span>
              <div class="metric-value font-display text-amber">${metrics.clicks}</div>
            </div>
          </div>
        </div>

        <div>
          <div class="section-title">Ranking dos Melhores Colaboradores (Indicações)</div>
          <table class="ranking-table">
            <thead>
              <tr>
                <th style="width: 15%">Posição</th>
                <th style="width: 45%">Colaborador</th>
                <th style="width: 20%">Conversões</th>
                <th style="width: 20%; text-align: right;">Pontuação</th>
              </tr>
            </thead>
            <tbody>
              ${metrics.topColaboradores.map((colab, i) => `
                <tr>
                  <td><strong>#${i + 1}</strong></td>
                  <td><strong>${escapeHtml(colab.name)}</strong></td>
                  <td class="text-green"><strong>${escapeHtml(colab.conversions)} vendas</strong></td>
                  <td style="text-align: right;"><strong>${escapeHtml(colab.points)} pts</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="concl-box">
          <div class="concl-title">Conclusão Executiva</div>
          <p class="concl-text">
            O programa de marketing de indicações continua apresentando tração consistente, impulsionando novas adesões de banda larga com menor custo de aquisição de clientes (CAC) em comparação com canais tradicionais. Recomenda-se a continuidade dos incentivos de comissionamento aos técnicos e colaboradores mais ativos.
          </p>
        </div>

        <div class="footer">
          <span>Gente Digital CRM - Sistema de Gestão de Indicações</span>
          <span>Documento Reservado à Diretoria Executiva</span>
        </div>
      </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 400);
  };

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
              onClick={handlePrintPdf}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Imprimir / Salvar em PDF
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Report Area */}
        <div id="executive-report-document" className="p-8 sm:p-12 space-y-8 bg-white dark:bg-zinc-900 text-brand-charcoal dark:text-white print:p-0 print:bg-white print:text-black">
          
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
