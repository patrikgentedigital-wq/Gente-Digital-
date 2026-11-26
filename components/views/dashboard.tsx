'use client';

import { Users as UsersIcon, Target, MousePointerClick, TrendingUp, Download, Sparkles, X, FileText } from 'lucide-react';
import { ProgramMetric } from './program-metric';
import { ReferralCharts } from './referral-charts';
import { useState, useEffect } from 'react';
import { ExecutiveReportModal } from '@/components/reports/executive-modal';
import { supabase, Lead, Colaborador, isSupabaseConfigured } from '@/lib/supabase';
import { initialLeads, initialColaboradores } from '@/lib/mock-data';
import { PROGRAM_RULES } from '@/lib/rules';
import { sanitizeCsvField } from '@/lib/utils';
import { DateFilterState, matchesDateFilter, parseFlexibleDate } from '@/lib/date-filters';

const normalizeStr = (str: string) =>
  str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

export function DashboardView({ navigation }: { navigation?: React.ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dateFilter, setDateFilter] = useState('all');
  const [specificMonth, setSpecificMonth] = useState(new Date().getMonth());
  const [specificYear, setSpecificYear] = useState(new Date().getFullYear());
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showExecutiveModal, setShowExecutiveModal] = useState(false);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});
  const [monthClickStats, setMonthClickStats] = useState<{ current: number; previous: number }>({ current: 0, previous: 0 });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Só ativa o spinner no primeiro carregamento (sem dados); refetches
        // realtime mantêm os dados atuais na tela, evitando flash de loading.
        if (leads.length === 0 && colaboradores.length === 0) {
          setIsLoading(true);
        }
        let leadsData: Lead[] = [];
        let colabsData: Colaborador[] = [];
        const clicksMap: Record<string, number> = {};

        const clicksPromise = fetch('/api/track-click')
          .then(res => res.json())
          .then(data => {
            if (data.success && Array.isArray(data.clicks)) {
              data.clicks.forEach((c: { ref: string; count: number }) => {
                clicksMap[normalizeStr(c.ref)] = (clicksMap[normalizeStr(c.ref)] || 0) + c.count;
              });
            }
            if (typeof data.currentMonthClicks === 'number' && typeof data.previousMonthClicks === 'number') {
              setMonthClickStats({ current: data.currentMonthClicks, previous: data.previousMonthClicks });
            }
          })
          .catch(err => console.error('Erro ao buscar cliques:', err));

        const mainDataPromise = (async () => {
          if (isSupabaseConfigured()) {
            const [{ data: lData }, { data: cData }] = await Promise.all([
              supabase.from('leads').select('*'),
              supabase.from('colaboradores').select('*'),
            ]);
            if (lData && lData.length > 0) leadsData = lData;
            if (cData && cData.length > 0) colabsData = cData;

            // Se Supabase client retornou vazio (possível restrição de RLS ou sessão do navegador), busca via API server-side
            if (leadsData.length === 0 || colabsData.length === 0) {
              try {
                const [lRes, cRes] = await Promise.all([
                  fetch('/api/leads'),
                  fetch('/api/colaboradores'),
                ]);
                if (lRes.ok) {
                  const lJson = await lRes.json();
                  if (lJson.success && Array.isArray(lJson.leads) && lJson.leads.length > 0) {
                    leadsData = lJson.leads;
                  }
                }
                if (cRes.ok) {
                  const cJson = await cRes.json();
                  if (cJson.success && Array.isArray(cJson.colaboradores) && cJson.colaboradores.length > 0) {
                    colabsData = cJson.colaboradores;
                  }
                }
              } catch (apiErr) {
                console.warn('Erro ao carregar dados do dashboard via API:', apiErr);
              }
            }
          } else {
            leadsData = initialLeads as Lead[];
            colabsData = initialColaboradores;

            if (typeof window !== 'undefined') {
              try {
                const locRaw = localStorage.getItem('gente_digital_local_colaboradores');
                if (locRaw) {
                  const localColabs: Colaborador[] = JSON.parse(locRaw);
                  const map = new Map<string, Colaborador>();
                  localColabs.forEach(c => map.set(c.id, c));
                  colabsData.forEach(c => {
                    if (!map.has(c.id)) map.set(c.id, c);
                  });
                  colabsData = Array.from(map.values());
                }

                const delRaw = localStorage.getItem('gente_digital_deleted_colaboradores');
                if (delRaw) {
                  const delIds: string[] = JSON.parse(delRaw);
                  colabsData = colabsData.filter(c => !delIds.includes(c.id));
                }
              } catch (e) {}
            }
          }
        })();

        await Promise.allSettled([clicksPromise, mainDataPromise]);

        setClickCounts(clicksMap);
        setLeads(leadsData);
        setColaboradores(colabsData);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardData();

    if (isSupabaseConfigured()) {
      const dashboardChannel = supabase
        .channel('dashboard_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, () => {
          fetchDashboardData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          fetchDashboardData();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(dashboardChannel);
      };
    }
  }, []);

  const filterState: DateFilterState = {
    period: dateFilter as any,
    month: specificMonth,
    year: specificYear,
  };
  const filteredLeads = leads.filter(l => matchesDateFilter(l.created_at, filterState));

  const totalLeads = filteredLeads.length;
  const conversoesCount = filteredLeads.filter(l => l.status === 'Ganho').length;
  const conversionRate = (totalLeads ? conversoesCount / totalLeads : 0).toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // Cliques reais nos links de indicação (somente refs que pertencem a colaboradores cadastrados)
  const clicks = colaboradores.reduce((acc, c) => {
    const normId = normalizeStr(c.id);
    const normName = normalizeStr(c.name);
    const refClicks = clickCounts[normId] || clickCounts[normName] || 0;
    return acc + refClicks;
  }, 0);

  const getTrends = () => {
    const dNow = new Date();
    const currentMonth = dNow.getMonth();
    const currentYear = dNow.getFullYear();

    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear = currentYear - 1;
    }

    const currentMonthLeads = leads.filter(l => {
      const d = parseFlexibleDate(l.created_at);
      if (!d) return false;
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const prevMonthLeads = leads.filter(l => {
      const d = parseFlexibleDate(l.created_at);
      if (!d) return false;
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });

    const curLeadsCount = currentMonthLeads.length;
    const prevLeadsCount = prevMonthLeads.length;
    let leadsTrend = '0% este mês';
    if (prevLeadsCount > 0) {
      const diff = ((curLeadsCount - prevLeadsCount) / prevLeadsCount) * 100;
      leadsTrend = `${diff >= 0 ? '+' : ''}${diff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% este mês`;
    } else if (curLeadsCount > 0) {
      leadsTrend = `+100% este mês`;
    }

    const curConvs = currentMonthLeads.filter(l => l.status === 'Ganho').length;
    const prevConvs = prevMonthLeads.filter(l => l.status === 'Ganho').length;
    let convsTrend = '0% este mês';
    if (prevConvs > 0) {
      const diff = ((curConvs - prevConvs) / prevConvs) * 100;
      convsTrend = `${diff >= 0 ? '+' : ''}${diff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% este mês`;
    } else if (curConvs > 0) {
      convsTrend = `+100% este mês`;
    }

    // Tendência REAL de cliques (mês atual vs mês anterior) calculada no servidor
    let clicksTrend = '0% este mês';
    const curClicks = monthClickStats.current;
    const prevClicks = monthClickStats.previous;
    if (prevClicks > 0) {
      const diff = ((curClicks - prevClicks) / prevClicks) * 100;
      clicksTrend = `${diff >= 0 ? '+' : ''}${diff.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% este mês`;
    } else if (curClicks > 0) {
      clicksTrend = '+100% este mês';
    }

    const curRate = curLeadsCount > 0 ? (curConvs / curLeadsCount) * 100 : 0;
    const prevRate = prevLeadsCount > 0 ? (prevConvs / prevLeadsCount) * 100 : 0;
    let rateTrend = '0,0 p.p. este mês';
    const diffRate = curRate - prevRate;
    if (diffRate !== 0) {
      rateTrend = `${diffRate >= 0 ? '+' : ''}${diffRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p. este mês`;
    }

    return {
      leadsTrend,
      convsTrend,
      clicksTrend,
      rateTrend,
    };
  };

  const trends = getTrends();

  const handleExportReport = () => {
    const headers = ['Colaborador', 'ID', 'Total de Leads (Indicações)', 'Conversões (Ganho)', 'Pontuação Total'];
    
    const allData = colaboradores.map(colab => {
      const normColabName = normalizeStr(colab.name);
      const normColabId = normalizeStr(colab.id);
      const referredLeads = leads.filter(l => {
        const normRef = normalizeStr(l.ref);
        return normRef === normColabId || normRef === normColabName;
      });
      const convs = referredLeads.filter(l => l.status === 'Ganho').length;
      const points = referredLeads.length * PROGRAM_RULES.pontos.porIndicacao + convs * PROGRAM_RULES.pontos.porConversao;
      
      return [
        sanitizeCsvField(colab.name),
        sanitizeCsvField(colab.id),
        sanitizeCsvField(referredLeads.length),
        sanitizeCsvField(convs),
        sanitizeCsvField(points)
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(','), ...allData.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_gerencial_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleGenerateAiSummary = async () => {
    try {
      setIsAiLoading(true);
      setShowAiModal(true);
      
      const metrics = {
        totalLeads,
        conversões: conversoesCount,
        conversionRate,
        cliques: clicks,
        leadsTrend: trends.leadsTrend,
        convsTrend: trends.convsTrend
      };

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dashboard-summary', metrics })
      });

      const data = await res.json();
      if (data.status === 'success') {
        setAiSummary(data.summary);
      } else {
        setAiSummary('Desculpe, ocorreu um erro ao gerar a análise. Tente novamente.');
      }
    } catch (err) {
      console.error(err);
      setAiSummary('Erro de conexão ao gerar análise.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const getTopColaboradores = () => {
    return colaboradores
      .map(colab => {
        const normColabName = normalizeStr(colab.name);
        const normColabId = normalizeStr(colab.id);

        const referredLeads = filteredLeads.filter(l => {
          const normRef = normalizeStr(l.ref);
          if (!normRef) return false;
          // Correspondência exata por ID ou Nome para evitar falso match de substrings
          return normRef === normColabId || normRef === normColabName;
        });
        
        const colabConversions = referredLeads.filter(l => l.status === 'Ganho').length;
        const totalReferred = referredLeads.length;
        const points = totalReferred * PROGRAM_RULES.pontos.porIndicacao + colabConversions * PROGRAM_RULES.pontos.porConversao;

        return {
          ...colab,
          points: points,
          conversions: colabConversions,
          totalReferred: totalReferred
        };
      })
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);
  };

  const getTopClientes = () => {
    const clientRefs = filteredLeads.map(l => l.ref).filter(ref => {
       const normRef = normalizeStr(ref);
       if (!normRef || normRef === "organico" || normRef === "") return false;
       
       const isColab = colaboradores.some(c => {
         const nName = normalizeStr(c.name);
         const nId = normalizeStr(c.id);
         return normRef === nId || normRef === nName;
       });
       return !isColab;
    });

    const uniqueRefs = Array.from(new Set(clientRefs.map(r => normalizeStr(r))));
    
    return uniqueRefs.map(uRef => {
      const originalName = clientRefs.find(r => normalizeStr(r) === uRef) || uRef;
      const referredLeads = filteredLeads.filter(l => normalizeStr(l.ref) === uRef);
      const conversions = referredLeads.filter(l => l.status === 'Ganho').length;
      const totalReferred = referredLeads.length;
      const points = totalReferred * PROGRAM_RULES.pontos.porIndicacao + conversions * PROGRAM_RULES.pontos.porConversao;
      
      return {
        id: uRef,
        name: originalName,
        points: points,
        conversions: conversions,
        totalReferred: totalReferred
      };
    })
    .filter(client => client.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  };

  const topColaboradores = getTopColaboradores();
  const topClientes = getTopClientes();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-yellow"></div>
      </div>
    );
  }

  return (
    <div className="workspace-page dashboard-page space-y-8 animate-in fade-in duration-300 pb-12">
      <div className="workspace-page-heading">
        <div>
          <h2 className="workspace-title">Painel de indicações</h2>
        </div>
        
        <div className="workspace-page-actions">
          <button
            onClick={() => setShowExecutiveModal(true)}
            aria-label="Gerar Relatório PDF"
            className="gd-button gd-button--primary cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Relatório PDF</span>
          </button>

          <button
            onClick={handleGenerateAiSummary}
            aria-label="Gerar Resumo com IA"
            className="gd-button gd-button--secondary cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Resumo IA</span>
          </button>

          <button
            onClick={handleExportReport}
            aria-label="Exportar relatório CSV"
            className="gd-button gd-button--secondary cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar CSV</span>
          </button>
          
          <select 
            aria-label="Filtrar dashboard por período"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="workspace-control cursor-pointer px-4 py-2.5 text-sm font-semibold"
          >
            <option value="all">Todo o Período</option>
            <option value="this_month">Este Mês</option>
            <option value="last_month">Mês Passado</option>
            <option value="this_year">Este Ano</option>
            <option value="specific_month">Mês Específico</option>
          </select>
          {dateFilter === 'specific_month' && (
            <div className="flex items-center gap-2">
              <select
                aria-label="Selecionar mês do dashboard"
                value={specificMonth}
                onChange={(e) => setSpecificMonth(Number(e.target.value))}
                className="workspace-control cursor-pointer px-3 py-2.5 text-sm font-semibold"
              >
                <option value={0}>Jan</option>
                <option value={1}>Fev</option>
                <option value={2}>Mar</option>
                <option value={3}>Abr</option>
                <option value={4}>Mai</option>
                <option value={5}>Jun</option>
                <option value={6}>Jul</option>
                <option value={7}>Ago</option>
                <option value={8}>Set</option>
                <option value={9}>Out</option>
                <option value={10}>Nov</option>
                <option value={11}>Dez</option>
              </select>
              <select
                aria-label="Selecionar ano do dashboard"
                value={specificYear}
                onChange={(e) => setSpecificYear(Number(e.target.value))}
                className="workspace-control cursor-pointer px-3 py-2.5 text-sm font-semibold"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
      
      {navigation}
      <div className="program-metrics" aria-label="Indicadores do programa">
        <ProgramMetric icon={Target} label="Conversões" value={conversoesCount.toLocaleString('pt-BR')} note={trends.convsTrend} />
        <ProgramMetric icon={UsersIcon} label="Total de leads" value={totalLeads.toLocaleString('pt-BR')} note={trends.leadsTrend} />
        <ProgramMetric icon={MousePointerClick} label="Cliques em links" value={clicks.toLocaleString('pt-BR')} note={'Acumulado · ' + trends.clicksTrend} />
        <ProgramMetric icon={TrendingUp} label="Taxa de conversão" value={conversionRate} note={trends.rateTrend} />
      </div>
      <ReferralCharts leads={leads} filtered={filteredLeads} period={filterState} team={topColaboradores} clients={topClientes} />

      {showAiModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ai-summary-title">
          <div className="bg-white dark:bg-[#18181b] w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-yellow/20 flex items-center justify-center text-brand-yellow">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h3 id="ai-summary-title" className="font-bold text-lg text-brand-charcoal dark:text-white">Análise Inteligente</h3>
              </div>
              <button type="button" aria-label="Fechar análise inteligente" onClick={() => setShowAiModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {isAiLoading ? (
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-yellow"></div>
                  <p className="text-sm text-brand-muted dark:text-gray-400 font-medium">Lendo seus gráficos...</p>
                </div>
              ) : (
                <div className="prose dark:prose-invert prose-sm">
                  <p className="text-[15px] leading-relaxed text-brand-charcoal dark:text-gray-200 whitespace-pre-wrap">
                    {aiSummary}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showExecutiveModal && (
        <ExecutiveReportModal 
          onClose={() => setShowExecutiveModal(false)}
          metrics={{
            totalLeads,
            conversões: conversoesCount,
            conversionRate,
            clicks,
            topColaboradores,
            topClientes
          }}
        />
      )}
    </div>
  );
}
