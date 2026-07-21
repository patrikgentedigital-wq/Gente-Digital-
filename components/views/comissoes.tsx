import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle2, Clock, Search, Download, Filter, Wallet, ArrowUpRight, Check, Sparkles } from 'lucide-react';
import { supabase, Lead } from '@/lib/supabase';
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
}

export function ComissoesView() {
  const [commissionPerLead, setCommissionPerLead] = useState<number>(50);
  const [commissions, setCommissions] = useState<CommissionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'Pendente' | 'Paga'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingCommissionRate, setEditingCommissionRate] = useState(false);

  // Fetch leads and calculate commissions
  const fetchCommissions = async () => {
    setIsLoading(true);
    try {
      // Read saved local paid states if any
      const paidStateRaw = localStorage.getItem('gente_digital_paid_commissions');
      const paidMap: Record<string, string> = paidStateRaw ? JSON.parse(paidStateRaw) : {};

      const rateSaved = localStorage.getItem('gente_digital_commission_rate');
      if (rateSaved) {
        setCommissionPerLead(parseFloat(rateSaved) || 50);
      }

      const isConfigured = typeof window !== 'undefined' && 
        !!process.env.NEXT_PUBLIC_SUPABASE_URL && 
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

      let leadsData: Lead[] = [];

      if (isConfigured) {
        const { data, error } = await supabase.from('leads').select('*').eq('status', 'Ganho');
        if (!error && data) {
          leadsData = data;
        }
      }

      // If no supabase data or empty, use fallback mock leads with Ganho status for preview
      if (leadsData.length === 0) {
        leadsData = [
          { id: 2, name: 'Ilza Maria Ferreira Correa', phone: '(91) 99171-9195', ref: 'CLAUDIANE DE SOUSA RIBEIRO MELO', status: 'Ganho', value: 99.90, created_at: '2026-07-15' },
          { id: 3, name: 'João Silva', phone: '(11) 98888-7777', ref: 'EMP-042', status: 'Ganho', value: 1200, created_at: '2026-07-18' },
          { id: 9, name: 'Benedito Silveira', phone: '(91) 98765-4321', ref: 'LEANDRO COSTA SILVA', status: 'Ganho', value: 149.90, created_at: '2026-07-20' }
        ];
      }

      const currentRate = parseFloat(rateSaved || '50');

      const items: CommissionItem[] = leadsData.map(lead => {
        const isPaid = paidMap[lead.id.toString()];
        return {
          id: `comm_${lead.id}`,
          lead_id: lead.id,
          lead_name: lead.name,
          colaborador_name: lead.ref || 'Não especificado',
          sale_value: lead.value || 0,
          commission_amount: currentRate,
          status: isPaid ? 'Paga' : 'Pendente',
          date: lead.created_at ? new Date(lead.created_at).toLocaleDateString('pt-BR') : '15/07/2026',
          paid_at: isPaid || undefined
        };
      });

      setCommissions(items);
    } catch (err) {
      console.error('Error fetching commissions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCommissions();
  }, []);

  const handlePayCommission = async (id: string | number, leadName: string, colabName: string, amount: number) => {
    if (!window.confirm(`Confirmar BAIXA FINANCEIRA do pagamento de R$ ${amount.toFixed(2)} PIX para ${colabName}?`)) {
      return;
    }

    const nowStr = new Date().toLocaleString('pt-BR');
    
    // Save paid state locally
    const paidStateRaw = localStorage.getItem('gente_digital_paid_commissions');
    const paidMap: Record<string, string> = paidStateRaw ? JSON.parse(paidStateRaw) : {};
    
    const numericId = id.toString().replace('comm_', '');
    paidMap[numericId] = nowStr;
    localStorage.setItem('gente_digital_paid_commissions', JSON.stringify(paidMap));

    // Log Audit event
    await logAuditEvent(
      'Baixa Financeira (PIX)',
      `Comissão de R$ ${amount.toFixed(2)} marcada como PAGA para o colaborador ${colabName} (Lead: ${leadName})`
    );

    // Update state in UI
    setCommissions(commissions.map(c => c.id === id ? { ...c, status: 'Paga', paid_at: nowStr } : c));
  };

  const handleSaveRate = () => {
    localStorage.setItem('gente_digital_commission_rate', commissionPerLead.toString());
    setEditingCommissionRate(false);
    fetchCommissions();
  };

  const handleExportCSV = () => {
    const headers = ['ID Lead', 'Nome do Lead', 'Colaborador (Indicador)', 'Valor da Venda (R$)', 'Comissao (R$)', 'Status', 'Data Conversao', 'Data Pagamento'];
    const rows = commissions.map(c => [
      c.lead_id,
      `"${c.lead_name.replace(/"/g, '""')}"`,
      `"${c.colaborador_name.replace(/"/g, '""')}"`,
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
  };

  const filteredCommissions = commissions.filter(c => {
    const matchesSearch = c.lead_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.colaborador_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalPendente = commissions.filter(c => c.status === 'Pendente').reduce((acc, c) => acc + c.commission_amount, 0);
  const totalPago = commissions.filter(c => c.status === 'Paga').reduce((acc, c) => acc + c.commission_amount, 0);
  const totalConversoes = commissions.length;

  return (
    <div className="w-full max-w-full mx-auto space-y-6 animate-in fade-in duration-300 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border dark:border-gray-800 pb-5">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Gestão de Comissões & Baixa PIX</h2>
          <p className="text-brand-muted dark:text-gray-400 mt-1">Acompanhe e confirme o pagamento de recompensas aos colaboradores por indicações convertidas.</p>
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
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">Aguardando baixa PIX</p>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Total Pago (PIX)</span>
          </div>
          <p className="font-display text-3xl font-extrabold text-green-600 dark:text-green-400">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPago)}
          </p>
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">Baixas confirmadas</p>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Contratos Convertidos</span>
          </div>
          <p className="font-display text-3xl font-extrabold text-brand-charcoal dark:text-white">
            {totalConversoes}
          </p>
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">Leads no status "Ganho"</p>
        </div>

        <div className="bg-white dark:bg-[#18181b] p-6 rounded-2xl border border-brand-border dark:border-gray-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wider">Comissão por Venda</span>
            <button 
              onClick={() => setEditingCommissionRate(!editingCommissionRate)}
              className="text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline"
            >
              {editingCommissionRate ? 'Cancelar' : 'Alterar'}
            </button>
          </div>
          {editingCommissionRate ? (
            <div className="flex items-center gap-2 mt-2">
              <input 
                type="number" 
                value={commissionPerLead} 
                onChange={e => setCommissionPerLead(parseFloat(e.target.value) || 0)}
                className="w-24 px-2 py-1 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded text-sm text-brand-charcoal dark:text-white font-bold"
              />
              <button 
                onClick={handleSaveRate}
                className="px-3 py-1 bg-brand-yellow text-brand-charcoal font-bold text-xs rounded shadow-sm"
              >
                Salvar
              </button>
            </div>
          ) : (
            <p className="font-display text-3xl font-extrabold text-brand-yellow mt-2">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(commissionPerLead)}
            </p>
          )}
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-1">Valor atribuído por contrato ativo</p>
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
              Pagas ({commissions.filter(c => c.status === 'Paga').length})
            </button>
          </div>

          <div className="relative text-brand-muted focus-within:text-brand-charcoal transition-colors w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por lead ou colaborador..." 
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
                <th className="px-6 py-4 font-bold tracking-wider">Colaborador / Indicador</th>
                <th className="px-6 py-4 font-bold tracking-wider">Valor do Contrato</th>
                <th className="px-6 py-4 font-bold tracking-wider">Comissão</th>
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
                    Nenhuma comissão localizada para o filtro selecionado.
                  </td>
                </tr>
              ) : filteredCommissions.map(comm => (
                <tr key={comm.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar size={30} name={comm.lead_name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB']} />
                      <div>
                        <p className="font-semibold text-brand-charcoal dark:text-white">{comm.lead_name}</p>
                        <p className="text-[11px] text-brand-muted dark:text-gray-400">Conversão em: {comm.date}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-bold text-brand-charcoal dark:text-gray-200">
                    {comm.colaborador_name}
                  </td>
                  <td className="px-6 py-4 text-brand-muted dark:text-gray-300 font-semibold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comm.sale_value)}
                  </td>
                  <td className="px-6 py-4 font-extrabold text-green-600 dark:text-green-400">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(comm.commission_amount)}
                  </td>
                  <td className="px-6 py-4">
                    {comm.status === 'Paga' ? (
                      <span className="px-3 py-1 bg-green-100 dark:bg-green-950/60 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800 rounded-full text-xs font-bold flex items-center gap-1.5 w-fit">
                        <Check className="w-3.5 h-3.5" /> Paga PIX
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
                        onClick={() => handlePayCommission(comm.id, comm.lead_name, comm.colaborador_name, comm.commission_amount)}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 ml-auto"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        Dar Baixa (PIX)
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-medium italic">
                        Pago em {comm.paid_at || comm.date}
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
