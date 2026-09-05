'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  TrendingUp, 
  ShoppingBag, 
  AlertTriangle, 
  MousePointerClick, 
  Filter, 
  Download, 
  Search, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  Phone, 
  User, 
  Tag, 
  ArrowUpRight, 
  ExternalLink, 
  FileText, 
  RefreshCw,
  HelpCircle,
  Clock,
  Sparkles,
  ShieldCheck
} from 'lucide-react';
import Avatar from 'boring-avatars';
import { supabase, Lead, LeadHistory, Colaborador, isSupabaseConfigured } from '@/lib/supabase';
import { initialLeads, initialColaboradores } from '@/lib/mock-data';
import { DateFilterState, matchesDateFilter, getPeriodLabel, extractAvailableMonths } from '@/lib/date-filters';
import { DateRangeFilter } from '@/components/date-range-filter';
import { sanitizeCsvField } from '@/lib/utils';
import { useToast } from '@/components/providers/toast-context';
import { PROGRAM_RULES } from '@/lib/rules';

export function VendasRastreamentoView() {
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<'vendas' | 'erros' | 'rastreamento'>('vendas');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadHistories, setLeadHistories] = useState<Record<number, LeadHistory[]>>({});
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [clicks, setClicks] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Filtros
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ period: 'all' });
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [colaboradorFilter, setColaboradorFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const normalizeStr = (str?: string) =>
    str ? str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim() : '';

  const fetchData = useCallback(async () => {
    try {
      let leadsData: Lead[] = [];
      let colabsData: Colaborador[] = [];
      const historyMap: Record<number, LeadHistory[]> = {};

      if (isSupabaseConfigured()) {
        const [{ data: lData }, { data: cData }, { data: hData }] = await Promise.all([
          supabase.from('leads').select('*').order('created_at', { ascending: false }),
          supabase.from('colaboradores').select('*'),
          supabase.from('lead_history').select('*').order('created_at', { ascending: false }).limit(2000),
        ]);

        if (lData) leadsData = lData as Lead[];
        if (cData) colabsData = cData as Colaborador[];
        if (hData) {
          hData.forEach((h: LeadHistory) => {
            if (!historyMap[h.lead_id]) historyMap[h.lead_id] = [];
            historyMap[h.lead_id].push(h);
          });
        }
      } else {
        leadsData = (initialLeads as any[]) as Lead[];
        colabsData = initialColaboradores;
      }

      // Cliques
      try {
        const resClicks = await fetch('/api/track-click');
        if (resClicks.ok) {
          const cData = await resClicks.json();
          if (cData.success && Array.isArray(cData.clicks)) {
            const map: Record<string, number> = {};
            cData.clicks.forEach((c: { ref: string; count: number }) => {
              map[normalizeStr(c.ref)] = (map[normalizeStr(c.ref)] || 0) + c.count;
            });
            setClicks(map);
          }
        }
      } catch (e) {
        console.warn('Erro ao carregar cliques:', e);
      }

      setLeads(leadsData);
      setColaboradores(colabsData);
      setLeadHistories(historyMap);
    } catch (err) {
      console.error('Erro ao carregar dados de vendas e rastreamento:', err);
      toastError('Erro ao carregar dados', 'Não foi possível carregar os registros de vendas.');
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  // Lista de colaboradores únicos para o select
  const colabOptions = useMemo(() => {
    const list = colaboradores.map(c => ({ id: c.id, name: c.name }));
    // Adiciona refs existentes nos leads que não são colaboradores cadastrados
    leads.forEach(l => {
      if (l.ref && !list.some(c => normalizeStr(c.id) === normalizeStr(l.ref) || normalizeStr(c.name) === normalizeStr(l.ref))) {
        if (!['organico', 'manual', 'nao especificado'].includes(normalizeStr(l.ref))) {
          list.push({ id: l.ref, name: l.ref });
        }
      }
    });
    return list;
  }, [colaboradores, leads]);

  const availableMonths = useMemo(() => {
    return extractAvailableMonths(leads.map(l => l.created_at));
  }, [leads]);

  // Filtra leads de acordo com período, canal, colaborador e busca textual
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Filtro de data (data de indicação / criação)
      if (!matchesDateFilter(lead.created_at, dateFilter)) {
        return false;
      }

      // Filtro de canal / source
      if (sourceFilter !== 'all') {
        const leadSrc = lead.source || 'link_indicacao';
        if (sourceFilter === 'link_indicacao' && leadSrc !== 'landing' && leadSrc !== 'link_indicacao' && leadSrc !== 'link') {
          return false;
        }
        if (sourceFilter === 'ms_forms' && leadSrc !== 'ms_forms') {
          return false;
        }
        if (sourceFilter === 'manual' && leadSrc !== 'manual') {
          return false;
        }
      }

      // Filtro de colaborador / técnico
      if (colaboradorFilter !== 'all') {
        const normRef = normalizeStr(lead.ref);
        const normFilter = normalizeStr(colaboradorFilter);
        if (normRef !== normFilter) {
          // Checa por nome ou ID
          const colabMatch = colaboradores.find(
            c => normalizeStr(c.id) === normFilter || normalizeStr(c.name) === normFilter
          );
          if (!colabMatch) return false;
          if (normRef !== normalizeStr(colabMatch.id) && normRef !== normalizeStr(colabMatch.name)) {
            return false;
          }
        }
      }

      // Busca textual (cliente, telefone, ref, motivo)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesQuery = 
          lead.name?.toLowerCase().includes(q) ||
          lead.phone?.includes(q) ||
          lead.ref?.toLowerCase().includes(q) ||
          lead.loss_reason?.toLowerCase().includes(q) ||
          lead.external_ref?.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [leads, dateFilter, sourceFilter, colaboradorFilter, searchQuery, colaboradores]);

  // Subconjunto de vendas concluídas (Ganho)
  const vendasGanhas = useMemo(() => {
    return filteredLeads.filter(l => l.status === 'Ganho');
  }, [filteredLeads]);

  // Subconjunto de erros / descartes (Errado)
  const leadsErrados = useMemo(() => {
    return filteredLeads.filter(l => l.status === 'Errado');
  }, [filteredLeads]);

  // Métricas agregadas dos KPIs
  const totalFaturamento = useMemo(() => {
    return vendasGanhas.reduce((acc, v) => acc + (v.value || 0), 0);
  }, [vendasGanhas]);

  const taxaErroPercent = useMemo(() => {
    if (filteredLeads.length === 0) return 0;
    return Math.round((leadsErrados.length / filteredLeads.length) * 100);
  }, [filteredLeads.length, leadsErrados.length]);

  const totalCliquesPeriodo = useMemo(() => {
    return Object.values(clicks).reduce((acc, val) => acc + val, 0);
  }, [clicks]);

  const taxaConversaoCliquesParaVendas = useMemo(() => {
    if (totalCliquesPeriodo === 0) return 0;
    return ((vendasGanhas.length / totalCliquesPeriodo) * 100).toFixed(1);
  }, [vendasGanhas.length, totalCliquesPeriodo]);

  // Distribuição dos motivos de perda/erro
  const motivosDistribuicao = useMemo(() => {
    const map: Record<string, number> = {};
    leadsErrados.forEach(l => {
      const reason = l.loss_reason || 'Motivo não informado';
      map[reason] = (map[reason] || 0) + 1;
    });

    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const total = leadsErrados.length || 1;
    return entries.map(([reason, count]) => ({
      reason,
      count,
      percent: Math.round((count / total) * 100),
    }));
  }, [leadsErrados]);

  // Desempenho por canal de aquisição
  const canalStats = useMemo(() => {
    const stats: Record<string, { total: number; ganho: number; errado: number; valor: number }> = {
      link_indicacao: { total: 0, ganho: 0, errado: 0, valor: 0 },
      ms_forms: { total: 0, ganho: 0, errado: 0, valor: 0 },
      manual: { total: 0, ganho: 0, errado: 0, valor: 0 },
    };

    filteredLeads.forEach(l => {
      let key = 'link_indicacao';
      if (l.source === 'ms_forms') key = 'ms_forms';
      else if (l.source === 'manual') key = 'manual';

      stats[key].total += 1;
      if (l.status === 'Ganho') {
        stats[key].ganho += 1;
        stats[key].valor += l.value || 0;
      } else if (l.status === 'Errado') {
        stats[key].errado += 1;
      }
    });

    return [
      {
        id: 'link_indicacao',
        title: 'Links dos Técnicos / Landing',
        description: 'Indicações geradas pelos links com cookie de 30 dias',
        icon: ExternalLink,
        badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        ...stats.link_indicacao,
      },
      {
        id: 'ms_forms',
        title: 'Microsoft Forms',
        description: 'Formulários internos integrados via Webhook com anti-duplicação',
        icon: FileText,
        badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
        ...stats.ms_forms,
      },
      {
        id: 'manual',
        title: 'Cadastro Manual / Atendimento',
        description: 'Inseridos diretamente pela equipe comercial no painel',
        icon: User,
        badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
        ...stats.manual,
      },
    ];
  }, [filteredLeads]);

  // Exportação CSV
  const handleExportCSV = () => {
    const headers = [
      'ID Lead',
      'Cliente',
      'Telefone',
      'Técnico / Indicador',
      'Canal de Origem',
      'Data da Indicação',
      'Status Atual',
      'Valor Venda (R$)',
      'Motivo Perda/Erro',
      'Último Histórico / IXC'
    ];

    const rows = filteredLeads.map(l => {
      const history = leadHistories[l.id]?.[0];
      const historyNote = history ? `${history.action}: ${history.note || ''}` : '-';
      return [
        sanitizeCsvField(l.id),
        sanitizeCsvField(l.name),
        sanitizeCsvField(l.phone),
        sanitizeCsvField(l.ref || 'Não informado'),
        sanitizeCsvField(l.source || 'link_indicacao'),
        sanitizeCsvField(l.created_at ? new Date(l.created_at).toLocaleString('pt-BR') : '-'),
        sanitizeCsvField(l.status),
        sanitizeCsvField(l.value || 0),
        sanitizeCsvField(l.loss_reason || '-'),
        sanitizeCsvField(historyNote)
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_vendas_e_rastreamento_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toastSuccess('Relatório exportado!', 'O arquivo CSV foi baixado com sucesso.');
  };

  const formatSourceLabel = (src?: string) => {
    if (src === 'ms_forms') return 'MS Forms';
    if (src === 'manual') return 'Manual';
    return 'Link Técnico';
  };

  return (
    <div className="w-full max-w-full mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border dark:border-gray-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">
              Vendas & Rastreamento
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              Auditoria de Conversão
            </span>
          </div>
          <p className="text-brand-muted dark:text-gray-400 mt-1 text-sm">
            Monitore todas as vendas confirmadas, motivos de descarte, erros de integração e rastreabilidade da origem.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchData}
            className="flex items-center gap-2 px-3.5 py-2.5 border border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors shadow-xs"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-yellow hover:bg-amber-400 text-brand-charcoal font-bold text-xs rounded-xl shadow-xs transition-all"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Relatório Geral (CSV)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Vendas Ganhas */}
        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Vendas Instaladas</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <p className="font-display text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {vendasGanhas.length}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Receita: <strong className="text-zinc-900 dark:text-white font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFaturamento)}</strong>
          </p>
        </div>

        {/* Motivos de Perda / Erros */}
        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Leads Perdidos / Erros</span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="font-display text-3xl font-extrabold text-red-600 dark:text-red-400">
            {leadsErrados.length}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Taxa de perda: <strong className="text-red-600 dark:text-red-400 font-bold">{taxaErroPercent}%</strong> dos leads avaliados
          </p>
        </div>

        {/* Cliques Rastreados */}
        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Cliques nos Links</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <MousePointerClick className="w-5 h-5" />
            </div>
          </div>
          <p className="font-display text-3xl font-extrabold text-zinc-900 dark:text-white">
            {totalCliquesPeriodo}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Acessos registrados com cookie de 30 dias
          </p>
        </div>

        {/* Conversão Global */}
        <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/20 p-6 rounded-2xl border border-amber-400/30 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Conversão em Vendas</span>
            <Sparkles className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2">
            <p className="font-display text-3xl font-extrabold text-zinc-900 dark:text-white">
              {taxaConversaoCliquesParaVendas}%
            </p>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
              {vendasGanhas.length} contrato(s) fechado(s) de {filteredLeads.length} leads
            </p>
          </div>
        </div>
      </div>

      {/* Barra de Filtros Globais */}
      <div className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-brand-border dark:border-gray-800 shadow-xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <DateRangeFilter value={dateFilter} onChange={setDateFilter} availableMonths={availableMonths} />

          {/* Filtro por Canal de Origem */}
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            className="px-3.5 py-2 bg-white dark:bg-zinc-800 border border-brand-border dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-brand-yellow"
            aria-label="Filtrar por canal de origem"
          >
            <option value="all">Todos os Canais (De Onde Veio)</option>
            <option value="link_indicacao">Link do Técnico / Landing</option>
            <option value="ms_forms">Microsoft Forms (Webhook)</option>
            <option value="manual">Cadastro Manual</option>
          </select>

          {/* Filtro por Técnico / Indicador */}
          <select
            value={colaboradorFilter}
            onChange={e => setColaboradorFilter(e.target.value)}
            className="px-3.5 py-2 bg-white dark:bg-zinc-800 border border-brand-border dark:border-zinc-700 rounded-xl text-xs font-semibold text-zinc-700 dark:text-zinc-200 focus:outline-none focus:border-brand-yellow max-w-[220px]"
            aria-label="Filtrar por técnico"
          >
            <option value="all">Todos os Técnicos / Indicadores</option>
            {colabOptions.map(c => (
              <option key={c.id} value={c.name}>{c.name} ({c.id})</option>
            ))}
          </select>
        </div>

        <div className="relative text-brand-muted focus-within:text-brand-charcoal transition-colors w-full lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por cliente, telefone ou motivo..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-xl text-xs text-brand-charcoal dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-brand-yellow transition-all"
          />
        </div>
      </div>

      {/* Navegação entre Abas do Painel */}
      <div className="flex border-b border-brand-border dark:border-gray-800 gap-6 text-sm font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('vendas')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'vendas'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Vendas Concluídas ({vendasGanhas.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('erros')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'erros'
              ? 'border-red-500 text-red-600 dark:text-red-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Motivos de Perda & Erros ({leadsErrados.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rastreamento')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition-all ${
            activeTab === 'rastreamento'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Rastreamento de Origem & Tráfego</span>
        </button>
      </div>

      {/* CONTEÚDO DA ABA 1: VENDAS CONCLUÍDAS */}
      {activeTab === 'vendas' && (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <div className="p-5 border-b border-brand-border dark:border-gray-800 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-base text-zinc-900 dark:text-white">Contratos e Vendas Concluídas</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Leads com status &quot;Ganho&quot;, contrato ativo e comissão liberada.</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full border border-emerald-500/20">
              {vendasGanhas.length} vendas no filtro
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 uppercase font-bold border-b border-brand-border dark:border-gray-800">
                <tr>
                  <th className="px-5 py-3.5">Cliente (Lead)</th>
                  <th className="px-5 py-3.5">Técnico / Indicador</th>
                  <th className="px-5 py-3.5">Data Indicação</th>
                  <th className="px-5 py-3.5">Valor do Plano</th>
                  <th className="px-5 py-3.5">De Onde Veio</th>
                  <th className="px-5 py-3.5">Dados Sincronizados (IXC)</th>
                  <th className="px-5 py-3.5 text-right">Status Venda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                {vendasGanhas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-zinc-400">
                      Nenhuma venda localizada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  vendasGanhas.map(venda => {
                    const lastHistory = leadHistories[venda.id]?.[0];
                    return (
                      <tr key={venda.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar size={32} name={venda.name} variant="beam" colors={['#10B981', '#0F172A', '#F59E0B', '#2563EB']} />
                            <div>
                              <p className="font-bold text-zinc-900 dark:text-white text-sm">{venda.name}</p>
                              <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                                <Phone className="w-3 h-3" />
                                {venda.phone}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 font-semibold text-zinc-900 dark:text-zinc-100">
                          {venda.ref || 'Não especificado'}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {venda.created_at ? (
                            <>
                              <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                                {new Date(venda.created_at).toLocaleDateString('pt-BR')}
                              </span>
                              <span className="block text-[10px] text-zinc-400">
                                {new Date(venda.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-5 py-4 font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {venda.value && venda.value > 0
                            ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(venda.value)
                            : 'Plano Padrão'}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                            <Tag className="w-3 h-3 text-amber-500" />
                            {formatSourceLabel(venda.source)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs">
                          {lastHistory ? (
                            <div className="max-w-[220px]">
                              <p className="font-semibold text-zinc-800 dark:text-zinc-200 truncate" title={lastHistory.action}>
                                {lastHistory.action}
                              </p>
                              <p className="text-[10px] text-zinc-400 truncate" title={lastHistory.note || ''}>
                                {lastHistory.note || 'Sincronizado automaticamente'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-zinc-400">-</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold text-xs inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Instalado / Ganho
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: MOTIVOS DE PERDA & ERROS */}
      {activeTab === 'erros' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Card de Análise de Motivos */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
            <h3 className="font-bold text-base text-zinc-900 dark:text-white mb-1">
              Distribuição dos Motivos de Perda & Erro
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
              Entenda os principais gargalos que impediram as indicações de se tornarem vendas instaladas.
            </p>

            {motivosDistribuicao.length === 0 ? (
              <div className="p-8 text-center text-zinc-400 text-xs">
                Nenhum lead com status &quot;Errado&quot; ou motivo de perda registrado para o filtro atual.
              </div>
            ) : (
              <div className="space-y-3.5">
                {motivosDistribuicao.map((item, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs font-bold">
                      <span className="text-zinc-800 dark:text-zinc-200">{item.reason}</span>
                      <span className="text-red-600 dark:text-red-400">
                        {item.count} caso(s) ({item.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-red-500 to-rose-400 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(item.percent, 3)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabela de Leads com Erro */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-brand-border dark:border-gray-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white">Leads Descartados / Insucessos</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Detalhamento dos leads marcados como &quot;Errado&quot; com histórico de falhas.</p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-red-500/10 text-red-600 dark:text-red-400 rounded-full border border-red-500/20">
                {leadsErrados.length} ocorrências
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 uppercase font-bold border-b border-brand-border dark:border-gray-800">
                  <tr>
                    <th className="px-5 py-3.5">Cliente</th>
                    <th className="px-5 py-3.5">Técnico Indicador</th>
                    <th className="px-5 py-3.5">Data Tentativa</th>
                    <th className="px-5 py-3.5">Motivo do Erro / Perda</th>
                    <th className="px-5 py-3.5">Canal de Origem</th>
                    <th className="px-5 py-3.5">Histórico / Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {leadsErrados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-zinc-400">
                        Nenhum lead com erro para o filtro selecionado.
                      </td>
                    </tr>
                  ) : (
                    leadsErrados.map(lead => {
                      const lastNote = leadHistories[lead.id]?.[0];
                      return (
                        <tr key={lead.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                          <td className="px-5 py-4">
                            <p className="font-bold text-zinc-900 dark:text-white text-sm">{lead.name}</p>
                            <p className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3" />
                              {lead.phone}
                            </p>
                          </td>
                          <td className="px-5 py-4 font-semibold text-zinc-800 dark:text-zinc-200">
                            {lead.ref || 'Desconhecido'}
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                            {lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="px-5 py-4">
                            <span className="px-2.5 py-1 rounded-md bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 font-bold text-xs inline-block">
                              {lead.loss_reason || 'Motivo não categorizado'}
                            </span>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                              {formatSourceLabel(lead.source)}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-xs max-w-[260px]">
                            {lastNote ? (
                              <div>
                                <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{lastNote.action}</p>
                                <p className="text-[10px] text-zinc-400 truncate" title={lastNote.note || ''}>
                                  {lastNote.note || 'Sem anotações complementares'}
                                </p>
                              </div>
                            ) : (
                              <span className="text-zinc-400">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 3: RASTREAMENTO DE ORIGEM & TRÁFEGO */}
      {activeTab === 'rastreamento' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Cards dos Canais */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {canalStats.map(canal => {
              const Icon = canal.icon;
              return (
                <div key={canal.id} className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${canal.badgeColor}`}>
                        {canal.title}
                      </span>
                      <Icon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <h4 className="font-bold text-zinc-900 dark:text-white text-base">{canal.title}</h4>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{canal.description}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800/80 text-center">
                    <div>
                      <span className="text-[10px] font-bold text-zinc-400 block uppercase">Leads</span>
                      <span className="text-base font-extrabold text-zinc-900 dark:text-white">{canal.total}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block uppercase">Vendas</span>
                      <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">{canal.ganho}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-red-600 dark:text-red-400 block uppercase">Erros</span>
                      <span className="text-base font-extrabold text-red-600 dark:text-red-400">{canal.errado}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trilha de Rastreamento & Auditoria de Conversão */}
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
            <h3 className="font-bold text-base text-zinc-900 dark:text-white mb-1 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <span>Como Funciona o Rastreamento de Conversão da Plataforma</span>
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6">
              Entenda como cada lead é atribuído ao técnico desde o primeiro clique até a venda faturada.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-lg bg-amber-500 text-slate-950 font-bold flex items-center justify-center text-xs mb-3">
                  1
                </div>
                <h5 className="font-bold text-xs text-zinc-900 dark:text-white">Clique no Link Único</h5>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  O cliente acessa o link do técnico com o parâmetro <code className="font-mono text-amber-600 dark:text-amber-400 font-bold">?ref=ID</code>. O clique é registrado e um cookie é gravado por 30 dias.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-lg bg-blue-500 text-white font-bold flex items-center justify-center text-xs mb-3">
                  2
                </div>
                <h5 className="font-bold text-xs text-zinc-900 dark:text-white">Entrada no Funil</h5>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Pela landing page ou Microsoft Forms, os dados são capturados com deduplicação anti-spam por telefone e ref.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-lg bg-cyan-500 text-white font-bold flex items-center justify-center text-xs mb-3">
                  3
                </div>
                <h5 className="font-bold text-xs text-zinc-900 dark:text-white">Sincronização IXC Soft</h5>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  O sistema valida contratos ativos no IXC. Ao detectar instalação confirmada, o status é promovido automaticamente para &quot;Ganho&quot;.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white font-bold flex items-center justify-center text-xs mb-3">
                  4
                </div>
                <h5 className="font-bold text-xs text-zinc-900 dark:text-white">Comissão PIX Liberada</h5>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  O valor da comissão é computado na faixa do período (R$ 50 ou R$ 80) e disponibilizado no extrato do técnico para baixa PIX.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
