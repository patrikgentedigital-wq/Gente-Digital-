'use client';

import { Users as UsersIcon, Target, MousePointerClick, TrendingUp, Trophy, Medal, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Avatar from 'boring-avatars';
import { useRouter } from 'next/navigation';

import { useState, useEffect } from 'react';
import { supabase, Lead, Colaborador } from '@/lib/supabase';

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function DashboardView() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        let leadsData: Lead[] = [];
        let colabsData: Colaborador[] = [];

        const isSupabaseConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

        if (isSupabaseConfigured) {
          const { data: lData } = await supabase.from('leads').select('*');
          if (lData) leadsData = lData;

          const { data: cData } = await supabase.from('colaboradores').select('*');
          if (cData) colabsData = cData;
        } else {
          // Mocks for local display if DB is not configured
          leadsData = [
            { id: 1, name: 'Benedita', phone: '(91) 98600-5106', ref: 'Leandro Costa Silva', status: 'Em negociação', value: 0, created_at: '2026-07-10T12:00:00Z' },
            { id: 2, name: 'Ilza Maria Ferreira Correa', phone: '(55) 91991-7195', ref: 'Claudiane de Sousa Ribeiro Melo', status: 'Ganho', value: 99.90, created_at: '2026-07-12T12:00:00Z' },
            { id: 3, name: 'João Silva', phone: '(11) 98888-7777', ref: 'Ana Costa Silva', status: 'Ganho', value: 1200, created_at: '2026-06-15T12:00:00Z' },
            { id: 4, name: 'Maria Oliveira', phone: '(11) 95555-4444', ref: 'Carlos Oliveira', status: 'Contato inicial', value: 850, created_at: '2026-06-14T12:00:00Z' },
            { id: 5, name: 'Carlos Santos', phone: '(11) 91111-2222', ref: 'Orgânico', status: 'Pendente', value: 500, created_at: '2026-05-17T12:00:00Z' }
          ];

          colabsData = [
            { id: 'EMP-042', name: 'Ana Costa Silva', email: 'ana.costa@empresa.com', initials: 'AC', count: 12 },
            { id: 'EMP-043', name: 'Carlos Oliveira', email: 'carlos.o@empresa.com', initials: 'CO', count: 8 },
            { id: 'EMP-044', name: 'Beatriz Souza', email: 'beatriz.s@empresa.com', initials: 'BS', count: 5 }
          ];
        }

        setLeads(leadsData);
        setColaboradores(colabsData);
      } catch (err) {
        console.error("Dashboard error:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const now = new Date();
  const filteredLeads = leads.filter(l => {
    if (dateFilter === 'all') return true;
    if (!l.created_at) return false;
    const d = new Date(l.created_at);
    
    if (dateFilter === 'this_month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (dateFilter === 'last_month') {
      const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return d.getMonth() === lastMonth && d.getFullYear() === lastYear;
    }
    if (dateFilter === 'this_year') {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const totalLeads = filteredLeads.length;
  const conversões = filteredLeads.filter(l => l.status === 'Ganho').length;
  const conversionRate = totalLeads > 0 ? ((conversões / totalLeads) * 100).toFixed(1) + '%' : '0.0%';
  const clicks = colaboradores.reduce((acc, c) => acc + (c.count || 0), 0) * 15 + totalLeads * 4;

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
      const points = referredLeads.length * 20 + convs * 50;
      
      return [
        `"${colab.name}"`,
        `"${colab.id}"`,
        referredLeads.length,
        convs,
        points
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
  };

  const getDynamicChartData = () => {
    const baseData: any[] = [];
    const d = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
      baseData.push({
        name: months[monthDate.getMonth()],
        month: monthDate.getMonth(),
        year: monthDate.getFullYear(),
        pendente: 0,
        contatoInicial: 0,
        emNegociacao: 0,
        ganho: 0,
        errado: 0
      });
    }

    leads.forEach(lead => {
      const date = lead.created_at ? new Date(lead.created_at) : new Date();
      const chartMonth = baseData.find(d => d.month === date.getMonth() && d.year === date.getFullYear());
      if (chartMonth) {
        const status = lead.status;
        if (status === 'Pendente') chartMonth.pendente++;
        else if (status === 'Contato inicial') chartMonth.contatoInicial++;
        else if (status === 'Em negociação') chartMonth.emNegociacao++;
        else if (status === 'Ganho') chartMonth.ganho++;
        else if (status === 'Errado') chartMonth.errado++;
      }
    });

    return baseData;
  };

  const chartData = getDynamicChartData();

  const normalizeStr = (str: string) => 
    str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

  const getTopColaboradores = () => {
    return colaboradores
      .map(colab => {
        const normColabName = normalizeStr(colab.name);
        const normColabId = normalizeStr(colab.id);

        const referredLeads = filteredLeads.filter(l => {
          const normRef = normalizeStr(l.ref);
          return normRef === normColabId || normRef === normColabName;
        });
        
        const colabConversions = referredLeads.filter(l => l.status === 'Ganho').length;
        const points = referredLeads.length * 20 + colabConversions * 50;

        return {
          ...colab,
          points: points,
          conversions: colabConversions
        };
      })
      .sort((a, b) => b.points - a.points)
      .slice(0, 3)
      .map((colab, index) => {
        const ranks = [
          { rank: 1, color: 'text-amber-500', bg: 'bg-amber-100' },
          { rank: 2, color: 'text-gray-400', bg: 'bg-gray-100' },
          { rank: 3, color: 'text-amber-700', bg: 'bg-amber-50' }
        ];
        return {
          ...colab,
          ...ranks[index]
        };
      });
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
      const points = referredLeads.length * 20 + conversions * 50;
      
      return {
        id: uRef,
        name: originalName,
        points: points,
        conversions: conversions
      };
    })
    .filter(client => client.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((client, index) => {
        const ranks = [
          { rank: 1, color: 'text-blue-500', bg: 'bg-blue-100' },
          { rank: 2, color: 'text-gray-400', bg: 'bg-gray-100' },
          { rank: 3, color: 'text-blue-700', bg: 'bg-blue-50' }
        ];
        return {
          ...client,
          ...ranks[index]
        };
    });
  };

  const getTrends = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear = currentYear - 1;
    }

    const currentMonthLeads = leads.filter(l => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const prevMonthLeads = leads.filter(l => {
      if (!l.created_at) return false;
      const d = new Date(l.created_at);
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    });

    const curLeadsCount = currentMonthLeads.length;
    const prevLeadsCount = prevMonthLeads.length;
    let leadsTrend = '0% este mês';
    let leadsTrendUp = true;
    if (prevLeadsCount > 0) {
      const diff = ((curLeadsCount - prevLeadsCount) / prevLeadsCount) * 100;
      leadsTrend = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% este mês`;
      leadsTrendUp = diff >= 0;
    } else if (curLeadsCount > 0) {
      leadsTrend = `+100% este mês`;
      leadsTrendUp = true;
    }

    const curConvs = currentMonthLeads.filter(l => l.status === 'Ganho').length;
    const prevConvs = prevMonthLeads.filter(l => l.status === 'Ganho').length;
    let convsTrend = '0% este mês';
    let convsTrendUp = true;
    if (prevConvs > 0) {
      const diff = ((curConvs - prevConvs) / prevConvs) * 100;
      convsTrend = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% este mês`;
      convsTrendUp = diff >= 0;
    } else if (curConvs > 0) {
      convsTrend = `+100% este mês`;
      convsTrendUp = true;
    }

    let clicksTrend = '0% este mês';
    let clicksTrendUp = true;
    if (leads.length > 0) {
      const totalClicks = colaboradores.reduce((acc, c) => acc + (c.count || 0), 0) * 15 + leads.length * 4;
      if (totalClicks > 0) {
        clicksTrend = leadsTrend;
        clicksTrendUp = leadsTrendUp;
      }
    }

    const curRate = curLeadsCount > 0 ? (curConvs / curLeadsCount) * 100 : 0;
    const prevRate = prevLeadsCount > 0 ? (prevConvs / prevLeadsCount) * 100 : 0;
    let rateTrend = '0.0% vs mês ant.';
    let rateTrendUp = true;
    const diffRate = curRate - prevRate;
    if (diffRate !== 0) {
      rateTrend = `${diffRate >= 0 ? '+' : ''}${diffRate.toFixed(1)}% vs mês ant.`;
      rateTrendUp = diffRate >= 0;
    }

    return {
      leadsTrend,
      leadsTrendUp,
      convsTrend,
      convsTrendUp,
      clicksTrend,
      clicksTrendUp,
      rateTrend,
      rateTrendUp
    };
  };

  const topColaboradores = getTopColaboradores();
  const trends = getTrends();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-yellow"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Dashboard</h2>
          <p className="text-brand-muted dark:text-gray-400 mt-1">Visão geral do desempenho de indicações e leads em tempo real.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportReport}
            className="flex items-center gap-2 bg-white dark:bg-[#18181b] border border-brand-border dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-charcoal dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          
          <select 
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-white dark:bg-[#18181b] border border-brand-border dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm font-semibold text-brand-charcoal dark:text-white focus:ring-2 focus:ring-brand-yellow/50 outline-none shadow-sm"
          >
            <option value="all">Todo o Período</option>
            <option value="this_month">Este Mês</option>
            <option value="last_month">Mês Passado</option>
            <option value="this_year">Este Ano</option>
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard icon={UsersIcon} title="Total de Leads" value={totalLeads.toString()} trend={trends.leadsTrend} trendUp={trends.leadsTrendUp} />
        <StatCard icon={Target} title="Conversões" value={conversões.toString()} trend={trends.convsTrend} trendUp={trends.convsTrendUp} />
        <StatCard icon={MousePointerClick} title="Cliques em Links" value={clicks.toString()} trend={trends.clicksTrend} trendUp={trends.clicksTrendUp} />
        <StatCard icon={TrendingUp} title="Taxa de Conversão" value={conversionRate} trend={trends.rateTrend} trendUp={trends.rateTrendUp} />
      </div>

      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm p-6 flex flex-col min-h-[420px] transition-colors mb-6">
        <div className="mb-6">
          <h3 className="font-bold text-lg text-brand-charcoal dark:text-white">Desempenho de Leads por Mês</h3>
          <p className="text-sm text-brand-muted dark:text-gray-400">Comparativo de status de conversão ao longo do tempo.</p>
        </div>
        <div className="flex-1 w-full h-full min-h-[300px]">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:stroke-gray-700" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#83868C', fontSize: 12 }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#83868C', fontSize: 12 }} />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontWeight: 500 }}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '13px', fontWeight: 500 }} />
              <Bar dataKey="pendente" name="Pendente" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="contatoInicial" name="Contato Inicial" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="emNegociacao" name="Em Negociação" fill="#67e8f9" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="ganho" name="Ganho" fill="#4ade80" radius={[4, 4, 0, 0]} maxBarSize={40} />
              <Bar dataKey="errado" name="Errado" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leaderboard - Top Colaboradores */}
        <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm p-6 flex flex-col h-[420px] transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-brand-yellow/20 rounded-xl text-brand-charcoal dark:text-brand-yellow">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-brand-charcoal dark:text-white leading-tight">Top Colaboradores</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400">Ranking interno de indicações</p>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
            {topColaboradores.map((colab) => (
              <div key={colab.id} className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-gray-800 bg-gray-50/50 dark:bg-[#27272a]/50 hover:bg-gray-50 dark:hover:bg-[#27272a] transition-colors">
                <div className="relative">
                  <Avatar size={40} name={colab.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${colab.bg} ${colab.color} border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-bold shadow-sm`}>
                    {colab.rank}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-charcoal dark:text-white text-sm truncate">{colab.name}</p>
                  <p className="text-xs text-brand-muted dark:text-gray-400 truncate">{colab.conversions} conversões</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-brand-charcoal dark:text-white text-sm">{colab.points}</p>
                  <p className="text-[10px] text-brand-muted dark:text-gray-400 font-medium uppercase">Pts</p>
                </div>
              </div>
            ))}
            {topColaboradores.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-brand-muted">Nenhum colaborador ranqueado.</div>
            )}
          </div>
        </div>

        {/* Leaderboard - Top Clientes */}
        <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm p-6 flex flex-col h-[420px] transition-colors">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-blue-500/20 rounded-xl text-brand-charcoal dark:text-blue-500">
              <Medal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-brand-charcoal dark:text-white leading-tight">Top Clientes</h3>
              <p className="text-xs text-brand-muted dark:text-gray-400">Clientes que mais indicaram</p>
            </div>
          </div>
          
          <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
            {getTopClientes().map((cliente: any) => (
              <div key={cliente.id} className="flex items-center gap-4 p-4 rounded-xl border border-brand-border dark:border-gray-800 bg-gray-50/50 dark:bg-[#27272a]/50 hover:bg-gray-50 dark:hover:bg-[#27272a] transition-colors">
                <div className="relative">
                  <Avatar size={40} name={cliente.name} variant="marble" colors={['#3B82F6', '#2563EB', '#60A5FA', '#93C5FD', '#BFDBFE']} />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full ${cliente.bg} ${cliente.color} border-2 border-white dark:border-gray-800 flex items-center justify-center text-[10px] font-bold shadow-sm`}>
                    {cliente.rank}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-charcoal dark:text-white text-sm truncate capitalize">{cliente.name}</p>
                  <p className="text-xs text-brand-muted dark:text-gray-400 truncate">{cliente.conversions} conversões</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-brand-charcoal dark:text-white text-sm">{cliente.points}</p>
                  <p className="text-[10px] text-brand-muted dark:text-gray-400 font-medium uppercase">Pts</p>
                </div>
              </div>
            ))}
            {getTopClientes().length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-brand-muted">Nenhum cliente ranqueado.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, title, value, trend, trendUp }: any) {
  return (
    <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-brand-yellow/20 rounded-xl text-brand-charcoal dark:text-brand-yellow">
          <Icon className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-brand-muted dark:text-gray-400 text-sm">{title}</h3>
      </div>
      <p className="font-display text-4xl font-bold text-brand-charcoal dark:text-white mb-2">{value}</p>
      <p className={`text-xs font-bold ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
        {trend}
      </p>
    </div>
  );
}

