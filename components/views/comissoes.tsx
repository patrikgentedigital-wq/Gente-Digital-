'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, CheckCircle2, Clock, Search, Download, Wallet, Check, Sparkles, Award, Tag, UserCheck, Users, Loader2 } from 'lucide-react';
import { supabase, Lead, Colaborador } from '@/lib/supabase';
import { initialColaboradores } from '@/lib/mock-data';
import { logAuditEvent } from '@/lib/audit';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/providers/toast-context';
import Avatar from 'boring-avatars';
import { PROGRAM_RULES, RULES_COPY } from '@/lib/rules';

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
  payment_reference?: string;
}

type PaidMap = Record<string, { paidAt: string; reference?: string | null }>;

const itemKey = (id: string | number) => id.toString().replace(/^comm_/, '');

export function ComissoesView() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [commissions, setCommissions] = useState<CommissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pendente' | 'Paga'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [topColaborador, setTopColaborador] = useState<{ name: string; count: number } | null>(null);
  const [pendingPayment, setPendingPayment] = useState<CommissionItem | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentReference, setPaymentReference] = useState('');

  const normalizeStr = (str: string) =>
    str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

  // Busca o estado de pagamentos no servidor (fonte da verdade)
  const fetchPaidMap = useCallback(async (): Promise<PaidMap> => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      return {};
    }

    try {
      const res = await fetch('/api/commissions', { headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (data.success && Array.isArray(data.payments)) {
        const map: PaidMap = {};
        data.payments.forEach((p: any) => {
          if (p.commission_ref && p.paid_at) {
            map[p.commission_ref] = { paidAt: p.paid_at, reference: p.payment_reference };
          }
        });
        return map;
      }
      throw new Error(data.error || 'Falha ao carregar pagamentos');
    } catch (err) {
      console.error('Erro ao carregar baixas do servidor:', err);
      throw err;
    }
  }, []);

  // Fetch leads and calculate commissions using official rules
  const fetchCommissions = useCallback(async () => {
    try {
      setIsLoading(true);

      const isConfigured = typeof window !== 'undefined' &&
        !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

      let leadsData: Lead[] = [];
      let colabsData: Colaborador[] = [];

      if (isConfigured) {
        const { data: lData } = await supabase.from('leads').select('*').eq('status', 'Ganho');
        if (lData) leadsData = lData;

        const { data: cData } = await supabase.from('colaboradores').select('*');
        if (cData) colabsData = cData;
      } else {
        colabsData = initialColaboradores;
      }

      const paidMap = await fetchPaidMap();

      // Helper para verificar se um ref é um Colaborador oficial da empresa (match EXATO)
      const isColaborador = (refStr: string): { isColab: boolean; officialName: string } => {
        const norm = normalizeStr(refStr);
        if (!norm || norm === 'organico' || norm === 'nao especificado') {
          return { isColab: false, officialName: refStr || 'Orgânico' };
        }

        const found = colabsData.find(c => {
          const normId = normalizeStr(c.id);
          const normName = normalizeStr(c.name);
          return norm === normId || norm === normName;
        });

        if (found) {
          return { isColab: true, officialName: found.name };
        }
        return { isColab: false, officialName: refStr };
      };

      // Contagem de indicações instaladas por Colaborador, separada por mês
      const monthlyCounts: Record<string, Record<string, number>> = {};
      leadsData.forEach(lead => {
        const { isColab, officialName } = isColaborador(lead.ref);
        if (!isColab) return;
        const d = lead.created_at ? new Date(lead.created_at) : new Date();
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        if (!monthlyCounts[monthKey]) monthlyCounts[monthKey] = {};
        monthlyCounts[monthKey][officialName] = (monthlyCounts[monthKey][officialName] || 0) + 1;
      });

      // Identifica o TOP Colaborador do MÊS ATUAL (mínimo de 15 indicações instaladas para o bônus de R$ 100)
      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
      const currentCounts = monthlyCounts[currentMonthKey] || {};

      let maxCount = 0;
      let topColabName = '';
      Object.entries(currentCounts).forEach(([name, count]) => {
        if (count > maxCount) {
          maxCount = count;
          topColabName = name;
        }
      });

      const meetsMinThreshold = maxCount >= PROGRAM_RULES.bonusTop.minimoIndicacoes;

      if (topColabName && maxCount > 0) {
        setTopColaborador({ name: topColabName, count: maxCount });
      } else {
        setTopColaborador(null);
      }

      // Monta a lista de comissões aplicando as regras exatas
      const items: CommissionItem[] = leadsData.map(lead => {
        const { isColab, officialName } = isColaborador(lead.ref);
        const leadKey = itemKey(lead.id);
        const payment = paidMap[leadKey];

        if (isColab) {
          const d = lead.created_at ? new Date(lead.created_at) : new Date();
          const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
          const totalColabLeads = (monthlyCounts[monthKey] && monthlyCounts[monthKey][officialName]) || 1;
          const ratePerLead = totalColabLeads >= PROGRAM_RULES.colaborador.volumeThreshold
            ? PROGRAM_RULES.colaborador.taxaVolume
            : PROGRAM_RULES.colaborador.taxaPorVenda;

          return {
            id: `comm_${lead.id}`,
            lead_id: lead.id,
            lead_name: lead.name,
            colaborador_name: officialName,
            sale_value: lead.value || 0,
            commission_amount: ratePerLead,
            status: payment ? 'Paga' as const : 'Pendente' as const,
            date: lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '15/07/2026',
            paid_at: payment?.paidAt,
            payment_reference: payment?.reference || undefined,
            type: 'pix_colaborador' as const
          };
        } else {
          return {
            id: `comm_${lead.id}`,
            lead_id: lead.id,
            lead_name: lead.name,
            colaborador_name: officialName || 'Cliente Indicador',
            sale_value: lead.value || 0,
            commission_amount: PROGRAM_RULES.clienteIndicador.descontoMensalidade,
            status: payment ? 'Paga' as const : 'Pendente' as const,
            date: lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '15/07/2026',
            paid_at: payment?.paidAt,
            payment_reference: payment?.reference || undefined,
            type: 'desconto_cliente' as const
          };
        }
      });

      // Adiciona bônus de R$ 100 EXCLUSIVAMENTE se o Colaborador TOP do mês atual atingiu o mínimo de indicações
      if (topColabName && meetsMinThreshold) {
        const bonusId = `bonus_top_${topColabName.toLowerCase().replace(/\s+/g, '_')}`;
        const bonusPayment = paidMap[bonusId];
        items.unshift({
          id: bonusId,
          lead_id: 999999,
          lead_name: `🏆 Prêmio Bônus Top Indicador do Mês (${PROGRAM_RULES.bonusTop.minimoIndicacoes}+ indicações)`,
          colaborador_name: topColabName,
          sale_value: 0,
          commission_amount: PROGRAM_RULES.bonusTop.valor,
          status: bonusPayment ? 'Paga' : 'Pendente',
          date: new Date().toLocaleDateString('pt-BR'),
          paid_at: bonusPayment?.paidAt,
          payment_reference: bonusPayment?.reference || undefined,
          isBonus: true,
          type: 'bonus_top'
        });
      }

      setCommissions(items);
    } catch (err) {
      console.error('Error fetching commissions:', err);
      toastError('Erro ao carregar comissões', 'Não foi possível consultar as baixas registradas no servidor.');
      setCommissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [fetchPaidMap, toastError]);

  useEffect(() => {
    // Sincronização inicial com dados externos; o estado é atualizado após a consulta.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCommissions();
  }, [fetchCommissions]);

  const handlePayCommission = (comm: CommissionItem) => {
    setPendingPayment(comm);
    setPaymentReference('');
  };

  const confirmPayment = async () => {
    const comm = pendingPayment;
    if (!comm) return;
    if (paymentReference.trim().length < 3) {
      toastError('Comprovante obrigatório', 'Informe a referência do PIX, da fatura ou do protocolo antes de confirmar.');
      return;
    }

    setIsPaying(true);
    try {
      const commissionRef = itemKey(comm.id);
      const res = await fetch('/api/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pay',
          commissionRef,
          colaboradorName: comm.colaborador_name,
          leadName: comm.lead_name,
          amount: comm.commission_amount,
          type: comm.type,
          paymentReference: paymentReference.trim()
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Falha ao registrar pagamento');

      const nowStr = data.payment?.paid_at || new Date().toISOString();

      await logAuditEvent(
        comm.type === 'desconto_cliente' ? 'Baixa de Desconto na Mensalidade' : 'Baixa Financeira (PIX)',
        `${comm.type === 'desconto_cliente' ? 'Desconto' : 'Pagamento'} de R$ ${comm.commission_amount.toFixed(2)} registrado para ${comm.colaborador_name} (Ref: ${comm.lead_name})`
      );

      setCommissions(prev => prev.map(c => c.id === comm.id ? {
        ...c,
        status: 'Paga',
        paid_at: nowStr,
        payment_reference: data.payment?.payment_reference || paymentReference.trim(),
      } : c));
      setPendingPayment(null);
      toastSuccess(
        'Baixa registrada!',
        `R$ ${comm.commission_amount.toFixed(2)} foi salvo com a referência ${paymentReference.trim()}.`
      );
    } catch (err: any) {
      console.error('Erro ao registrar pagamento:', err);
      setPendingPayment(null);
      toastError('Erro ao Registrar', 'Não foi possível salvar o pagamento no banco. Tente novamente.');
    } finally {
      setIsPaying(false);
    }
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
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">R$ {PROGRAM_RULES.colaborador.taxaPorVenda},00 <span className="text-xs font-normal text-slate-500">no PIX / venda</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-emerald-500 text-white font-bold shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Colaborador (10+ vendas)</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">R$ {PROGRAM_RULES.colaborador.taxaVolume},00 <span className="text-xs font-normal text-slate-500">no PIX / venda</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-purple-600 text-white font-bold shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Top Colaborador ({PROGRAM_RULES.bonusTop.minimoIndicacoes}+ vendas)</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">+ R$ {PROGRAM_RULES.bonusTop.valor},00 <span className="text-xs font-normal text-slate-500">bônus PIX (mín. {PROGRAM_RULES.bonusTop.minimoIndicacoes} vendas no mês)</span></p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-blue-500 text-white font-bold shrink-0">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">Cliente Indicador</h4>
            <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">R$ {PROGRAM_RULES.clienteIndicador.descontoMensalidade},00 <span className="text-xs font-normal text-slate-500">desconto na mensalidade</span></p>
          </div>
        </div>
      </div>

      {/* Prazo de pagamento */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60">
        <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 dark:text-blue-300 font-medium leading-relaxed">
          {RULES_COPY.prazoPagamento} O desconto do cliente indicador é aplicado na primeira fatura após a instalação.
          O bônus de top indicador é calculado sobre as vendas do mês atual.
        </p>
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
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">🏆 Top Colaborador do Mês</span>
            <Award className="w-5 h-5 text-amber-500" />
          </div>
          <div className="mt-2">
            <p className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
              {topColaborador ? topColaborador.name : 'Nenhum líder'}
            </p>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
              {topColaborador ? (
                topColaborador.count >= PROGRAM_RULES.bonusTop.minimoIndicacoes
                  ? `${topColaborador.count} instalações (Bônus R$ ${PROGRAM_RULES.bonusTop.valor} Liberado! 🎉)`
                  : `${topColaborador.count}/${PROGRAM_RULES.bonusTop.minimoIndicacoes} instalações (Faltam ${PROGRAM_RULES.bonusTop.minimoIndicacoes - topColaborador.count} p/ bônus R$ ${PROGRAM_RULES.bonusTop.valor})`
              ) : `Mínimo de ${PROGRAM_RULES.bonusTop.minimoIndicacoes} indicações p/ bônus`}
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
                        <p className="text-xs text-brand-muted dark:text-gray-400">
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
                    {comm.type === 'desconto_cliente' && <span className="text-xs block font-normal text-slate-500 dark:text-slate-400">Desconto na Mensalidade</span>}
                    {comm.type !== 'desconto_cliente' && <span className="text-xs block font-normal text-emerald-600 dark:text-emerald-400">Pagamento PIX</span>}
                  </td>
                  <td className="px-6 py-4">
                    {comm.status === 'Paga' ? (
                      <span className="px-3 py-1 bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit">
                         <Check className="w-3.5 h-3.5" /> {comm.type === 'desconto_cliente' ? 'Desconto registrado' : 'Baixa registrada'}
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
                        onClick={() => handlePayCommission(comm)}
                        className={`px-4 py-2 font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 ml-auto ${
                          comm.type === 'desconto_cliente'
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                         {comm.type === 'desconto_cliente' ? 'Registrar desconto' : 'Registrar baixa'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium italic">
                        <span className="block">{comm.paid_at || comm.date}</span>
                        {comm.payment_reference && <span className="mt-1 block max-w-40 truncate text-[10px]" title={comm.payment_reference}>Ref.: {comm.payment_reference}</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingPayment}
        title={pendingPayment?.type === 'desconto_cliente' ? 'Registrar desconto com referência' : 'Registrar baixa do PIX'}
        message={
          pendingPayment
            ? `Informe a referência da transação, fatura ou protocolo para registrar R$ ${pendingPayment.commission_amount.toFixed(2)} para ${pendingPayment.colaborador_name}${pendingPayment.type === 'desconto_cliente' ? ' (cliente indicador)' : ''}. O registro fica salvo no banco e poderá ser conferido em qualquer dispositivo.`
            : ''
        }
        inputLabel="Referência do comprovante"
        inputValue={paymentReference}
        inputPlaceholder="Ex.: E2E4... ou FAT-2026-001"
        onInputChange={setPaymentReference}
        confirmLabel={pendingPayment?.type === 'desconto_cliente' ? 'Registrar desconto' : 'Registrar baixa'}
        tone={pendingPayment?.type === 'desconto_cliente' ? 'primary' : 'success'}
        onConfirm={confirmPayment}
        onCancel={() => setPendingPayment(null)}
      />
      {isPaying && (
        <div className="fixed inset-0 bg-black/40 z-[75] flex items-center justify-center">
          <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 rounded-2xl px-6 py-4 shadow-2xl">
            <Loader2 className="w-5 h-5 animate-spin text-brand-yellow" />
            <p className="text-sm font-semibold text-brand-charcoal dark:text-white">Registrando pagamento...</p>
          </div>
        </div>
      )}
    </div>
  );
}
