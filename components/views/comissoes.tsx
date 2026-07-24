'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, CheckCircle2, Clock, Search, Download, Wallet, Check, Sparkles, Award, Tag, UserCheck, Users } from 'lucide-react';
import { supabase, Lead, Colaborador } from '@/lib/supabase';
import { initialColaboradores } from '@/lib/mock-data';
import { logAuditEvent } from '@/lib/audit';
import Avatar from 'boring-avatars';

export interface CommissionItem {
  id: string | number;
  lead_id: number;
  lead_name: string;
  colaborador_name: string;
  sale_value: number;
  commission_amount: number;
  status: 'Pendente' | 'Paga';
  date: string;
  paid_at?: string;
  isBonus?: boolean;
  type: 'pix_colaborador' | 'desconto_cliente' | 'bonus_top';
}

export function ComissoesView() {
  const [commissions, setCommissions] = useState<CommissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pendente' | 'Paga'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [topColaborador, setTopColaborador] = useState<{ name: string; count: number } | null>(null);

  const normalizeStr = (str: string) => 
    str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

  // Fetch leads and calculate commissions using official rules
  const fetchCommissions = useCallback(async () => {
    try {
      setIsLoading(true);

      const paidStateRaw = localStorage.getItem('gente_digital_paid_commissions');
      const paidMap: Record<string, string> = paidStateRaw ? JSON.parse(paidStateRaw) : {};

      const isConfigured = typeof window !== 'undefined' && 
        !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

      let leadsData: Lead[] = [];
      let colabsData: Colaborador[] = initialColaboradores;

      if (isConfigured) {
        // Fetch leads
        const { data: lData } = await supabase.from('leads').select('*').eq('status', 'Ganho');
        if (lData) leadsData = lData;

        // Fetch colaboradores cadastrados
        const { data: cData } = await supabase.from('colaboradores').select('*');
        if (cData && cData.length > 0) colabsData = cData;
      }

      // Helper para verificar se um ref é um Colaborador oficial da empresa
      const isColaborador = (refStr: string): { isColab: boolean; officialName: string } => {
        const norm = normalizeStr(refStr);
        if (!norm || norm === 'organico' || norm === 'nao especificado') {
          return { isColab: false, officialName: refStr || 'Orgânico' };
        }

        const found = colabsData.find(c => {
          const normId = normalizeStr(c.id);
          const normName = normalizeStr(c.name);
          return norm === normId || norm === normName || (norm.length >= 4 && (normName.includes(norm) || norm.includes(normName)));
        });

        if (found) {
          return { isColab: true, officialName: found.name };
        }
        return { isColab: false, officialName: refStr };
      };

      // 1. Contagem de indicações instaladas por Colaboradores da Empresa
      const colabCounts: Record<string, number> = {};
      leadsData.forEach(lead => {
        const { isColab, officialName } = isColaborador(lead.ref);
        if (isColab) {
          colabCounts[officialName] = (colabCounts[officialName] || 0) + 1;
        }
      });

      // 2. Identifica o TOP Colaborador do Mês (mínimo de 15 indicações instaladas para ganhar o bônus de R$ 100)
      let maxCount = 0;
      let topColabName = '';
      Object.entries(colabCounts).forEach(([name, count]) => {
        if (count > maxCount) {
          maxCount = count;
          topColabName = name;
        }
      });

      const meetsMinThreshold = maxCount >= 15;

      if (topColabName && maxCount > 0) {
        setTopColaborador({ name: topColabName, count: maxCount });
      } else {
        setTopColaborador(null);
      }

      // 3. Monta a lista de comissões aplicando as regras exatas:
      // - COLABORADOR: R$ 20 (1-9 indicações) ou R$ 30 (10+ indicações) no PIX
      // - CLIENTE INDICADOR: R$ 50,00 de desconto na mensalidade (NÃO PIX / NÃO R$ 100)
      const items: CommissionItem[] = leadsData.map(lead => {
        const { isColab, officialName } = isColaborador(lead.ref);
        const isPaid = paidMap[lead.id.toString()];

        if (isColab) {
          const totalColabLeads = colabCounts[officialName] || 1;
          const ratePerLead = totalColabLeads >= 10 ? 30 : 20;

          return {
            id: `comm_${lead.id}`,
            lead_id: lead.id,
            lead_name: lead.name,
            colaborador_name: officialName,
            sale_value: lead.value || 0,
            commission_amount: ratePerLead,
            status: isPaid ? 'Paga' : 'Pendente',
            date: lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '15/07/2026',
            paid_at: isPaid || undefined,
            type: 'pix_colaborador'
          };
        } else {
          // Cliente em Geral indicando outro cliente
          return {
            id: `comm_${lead.id}`,
            lead_id: lead.id,
            lead_name: lead.name,
            colaborador_name: officialName || 'Cliente Indicador',
            sale_value: lead.value || 0,
            commission_amount: 50, // R$ 50 de desconto na mensalidade para o cliente indicador
            status: isPaid ? 'Paga' : 'Pendente',
            date: lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '15/07/2026',
            paid_at: isPaid || undefined,
            type: 'desconto_cliente'
          };
        }
      });

      // 4. Adiciona bônus de R$ 100 EXCLUSIVAMENTE se o Colaborador TOP tiver atingido NO MÍNIMO 15 INDICAÇÕES
      if (topColabName && meetsMinThreshold) {
        const bonusId = `bonus_top_${topColabName.toLowerCase().replace(/\s+/g, '_')}`;
        const isBonusPaid = paidMap[bonusId];
        items.unshift({
          id: bonusId,
          lead_id: 999999,
          lead_name: '🏆 Prêmio Bônus Top Indicador do Mês (15+ indicações)',
          colaborador_name: topColabName,
          sale_value: 0,
          commission_amount: 100, // R$ 100 de bônus PIX exclusivo para o colaborador TOP com 15+ indicações
          status: isBonusPaid ? 'Paga' : 'Pendente',
          date: new Date().toLocaleDateString('pt-BR'),
          paid_at: isBonusPaid || undefined,
          isBonus: true,
          type: 'bonus_top'
        });
      }

      setCommissions(items);
    } catch (err) {
      console.error('Error fetching commissions:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommissions();
  }, [fetchCommissions]);

  const handlePayCommission = async (id: string | number, leadName: string, colabName: string, amount: number, type: string) => {
    const isDesconto = type === 'desconto_cliente';
    const actionName = isDesconto ? 'Baixa de Desconto na Mensalidade' : 'Baixa Financeira (PIX)';
    const confirmMsg = isDesconto
      ? `Confirmar desconto de R$ ${amount.toFixed(2)} na MENSALIDADE de ${colabName}?`
      : `Confirmar pagamento via PIX no valor de R$ ${amount.toFixed(2)} para o colaborador ${colabName}?`;

    if (!window.confirm(confirmMsg)) return;

    const nowStr = new Date().toLocaleString('pt-BR');
    const paidStateRaw = localStorage.getItem('gente_digital_paid_commissions');
    const paidMap: Record<string, string> = paidStateRaw ? JSON.parse(paidStateRaw) : {};
    
    const cleanId = id.toString().replace('comm_', '');
    paidMap[cleanId] = nowStr;
    localStorage.setItem('gente_digital_paid_commissions', JSON.stringify(paidMap));

    await logAuditEvent(
      actionName,
      `${actionName}: R$ ${amount.toFixed(2)} registrado para ${colabName} (Ref: ${leadName})`
    );

    setCommissions(commissions.map(c => c.id === id ? { ...c, status: 'Paga', paid_at: nowStr } : c));
  };

  const handleExportCSV = () => {
    const headers = ['ID Lead', 'Nome do Lead / Prêmio', 'Indicador (Colaborador/Cliente)', 'Tipo', 'Valor Venda (R$)', 'Recompensa (R$)', 'Status', 'Data Conversao', 'Data Pagamento'];
    const rows = commissions.map(c => [
      c.lead_id,
      `"${c.lead_name.replace(/"/g, '""')}"`,
      `"${c.colaborador_name.replace(/"/g, '""')}"`,
      c.type === 'pix_colaborador' ? 'PIX Colaborador' : c.type === 'bonus_top' ? 'Bônus Top Colaborador' : 'Desconto Mensalidade Cliente',
      c.sale_value,
      c.commission_amount,
      c.status,
      c.date,
      `"${c.paid_at || '-'}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `extrato_comissoes_gente_digital_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredCommissions = commissions.filter(c => {
    const matchesSearch = c.lead_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.colaborador_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPendente = commissions.filter(c => c.status === 'Pendente').reduce((acc, c) => acc + c.commission_amount, 0);
  const totalPago = commissions.filter(c => c.status === 'Paga').reduce((acc, c) => acc + c.commission_amount, 0);
  const totalConversoes = commissions.filter(c => !c.isBonus).length;

  return (
    <div className="w-full max-w-full mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border dark:border-gray-800 pb-5">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Gestão de Comissões & Recompensas</h2>
          <p className="text-brand-muted dark:text-gray-400 mt-1">Acompanhamento diferenciado para Colaboradores (PIX) e Clientes Indicadores (Desconto na Mensalidade).</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 border border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 text-brand-charcoal dark:text-gray-200 font-bold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Exportar Extrato (CSV)
          </button>
        </div>
      </div>

      {/* Regras Comerciais Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 border border-amber-500/30">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-400 text-slate-950 font-bold shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Colaborador (1 a 9 vendas)</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">R$ 20,00 <span className="text-xs font-normal text-slate-500">no PIX / venda</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500 text-white font-bold shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Colaborador (10+ vendas)</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">R$ 30,00 <span className="text-xs font-normal text-slate-500">no PIX / venda</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-600 text-white font-bold shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Top Colaborador (15+ vendas)</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">+ R$ 100,00 <span className="text-xs font-normal text-slate-500">bônus PIX (mín. 15 vendas)</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-500 text-white font-bold shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Cliente Indicador</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">R$ 50,00 <span className="text-xs font-normal text-slate-500">desconto na mensalidade</span></p>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Total Pendente</span>
          </div>
          <p className="font-display text-3xl font-extrabold text-amber-600 dark:text-amber-400">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPendente)}
          </p>
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">Aguardando baixa / desconto</p>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Total Baixado</span>
          </div>
          <p className="font-display text-3xl font-extrabold text-green-600 dark:text-green-400">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPago)}
          </p>
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">PIX e descontos aplicados</p>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Contratos Instalados</span>
          </div>
          <p className="font-display text-3xl font-extrabold text-brand-charcoal dark:text-white">
            {totalConversoes}
          </p>
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">Leads no status &quot;Ganho&quot;</p>
        </div>

        <div className="bg-gradient-to-br from-amber-500/10 to-yellow-500/20 p-6 rounded-2xl border border-amber-400/30 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">🏆 Top Colaborador</span>
            <Award className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2">
            <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
              {topColaborador ? topColaborador.name : 'Nenhum líder'}
            </p>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
              {topColaborador ? (
                topColaborador.count >= 15 
                  ? `${topColaborador.count} instalações (Bônus R$ 100 Liberado! 🎉)`
                  : `${topColaborador.count}/15 instalações (Faltam ${15 - topColaborador.count} p/ bônus R$ 100)`
              ) : 'Mínimo de 15 indicações p/ bônus'}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Table Container */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-brand-border dark:border-gray-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                filterStatus === 'all'
                  ? 'bg-brand-charcoal dark:bg-zinc-700 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-zinc-800 text-brand-muted dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              Todas ({commissions.length})
            </button>
            <button
              onClick={() => setFilterStatus('Pendente')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                filterStatus === 'Pendente'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-zinc-800 text-brand-muted dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              Pendentes ({commissions.filter(c => c.status === 'Pendente').length})
            </button>
            <button
              onClick={() => setFilterStatus('Paga')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                filterStatus === 'Paga'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-zinc-800 text-brand-muted dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700'
              }`}
            >
              Pagas/Baixadas ({commissions.filter(c => c.status === 'Paga').length})
            </button>
          </div>

          <div className="relative text-brand-muted focus-within:text-brand-charcoal transition-colors w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por lead ou indicador..." 
              className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-xl text-xs text-brand-charcoal dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-brand-yellow transition-all" 
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 dark:bg-zinc-800/80 border-b border-brand-border dark:border-gray-700 text-xs text-brand-muted dark:text-gray-400 uppercase">
              <tr>
                <th className="px-6 py-4 font-bold tracking-wider">Cliente (Lead)</th>
                <th className="px-6 py-4 font-bold tracking-wider">Quem Indicou</th>
                <th className="px-6 py-4 font-bold tracking-wider">Tipo / Perfil</th>
                <th className="px-6 py-4 font-bold tracking-wider">Recompensa</th>
                <th className="px-6 py-4 font-bold tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold tracking-wider text-right">Ação / Baixa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border dark:divide-gray-800 text-sm">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-36"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div></td>
                    <td className="px-6 py-4 text-right"><div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-24 ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredCommissions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-brand-muted dark:text-gray-400">
                    Nenhuma comissão/desconto localizado para o filtro selecionado.
                  </td>
                </tr>
              ) : filteredCommissions.map(comm => (
                <tr key={comm.id} className={`hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${comm.isBonus ? 'bg-amber-500/10 dark:bg-amber-500/10' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {comm.isBonus ? (
                        <div className="w-8 h-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-bold">
                          🏆
                        </div>
                      ) : (
                        <Avatar size={30} name={comm.lead_name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB']} />
                      )}
                      <div>
                        <p className={`font-semibold ${comm.isBonus ? 'text-amber-600 dark:text-amber-400 font-extrabold' : 'text-brand-charcoal dark:text-white'}`}>
                          {comm.lead_name}
                        </p>
                        <p className="text-[11px] text-brand-muted dark:text-gray-400">
                          {comm.isBonus ? 'Prêmio de liderança mensal para colaborador' : `Conversão em: ${comm.date}`}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-brand-charcoal dark:text-gray-200">
                    {comm.colaborador_name}
                  </td>
                  <td className="px-6 py-4 font-semibold text-xs">
                    {comm.type === 'bonus_top' ? (
                      <span className="px-2.5 py-1 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                        🏆 Bônus Top Colaborador
                      </span>
                    ) : comm.type === 'pix_colaborador' ? (
                      <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                        💼 Colaborador (PIX)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                        👤 Cliente Indicador
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-extrabold text-green-600 dark:text-green-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comm.commission_amount)}
                    {comm.type === 'desconto_cliente' && <span className="text-[10px] block font-normal text-slate-500 dark:text-slate-400">Desconto na Mensalidade</span>}
                    {comm.type !== 'desconto_cliente' && <span className="text-[10px] block font-normal text-emerald-600 dark:text-emerald-400">Pagamento PIX</span>}
                  </td>
                  <td className="px-6 py-4">
                    {comm.status === 'Paga' ? (
                      <span className="px-3 py-1 bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit">
                        <Check className="w-3.5 h-3.5" /> {comm.type === 'desconto_cliente' ? 'Desconto Aplicado' : 'Pago PIX'}
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit">
                        <Clock className="w-3.5 h-3.5" /> Pendente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {comm.status === 'Pendente' ? (
                      <button
                        onClick={() => handlePayCommission(comm.id, comm.lead_name, comm.colaborador_name, comm.commission_amount, comm.type)}
                        className={`px-4 py-2 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 ml-auto ${
                          comm.type === 'desconto_cliente'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        {comm.type === 'desconto_cliente' ? 'Aplicar Desconto' : 'Dar Baixa (PIX)'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium italic">
                        {comm.paid_at || comm.date}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
