import { useState, useEffect, useRef } from 'react';
import { Search, Plus, X, LayoutGrid, List, MessageSquare, Clock, Calendar, Phone, ChevronRight, GripVertical, Inbox, Sparkles, ShieldAlert, Loader2, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { supabase, Lead, LeadHistory } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { motion, AnimatePresence } from 'motion/react';
import Avatar from 'boring-avatars';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const leadSchema = z.object({
  name: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  phone: z.string().min(10, 'Insira um telefone válido com DDD (mínimo 10 dígitos)'),
  value: z.string().optional().refine(val => {
    if (!val) return true;
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  }, 'O valor deve ser um número positivo'),
  ref: z.string().optional(),
});

type LeadFormData = z.infer<typeof leadSchema>;


// Helper type for local UI rendering combining lead and history
export type UILead = Lead & {
  history: LeadHistory[];
  responsible?: string;
  waitingDays?: number;
};

const initialLeads: UILead[] = [
  { 
    id: 1, name: 'Benedita', phone: '(91) 98600-5106', ref: 'LEANDRO COSTA SILVA', status: 'Em negociação', value: 0,
    responsible: 'Emmyly', waitingDays: 5,
    history: [
      { id: 101, lead_id: 1, date: '12/10/2026 14:30', action: 'Lead criado por indicação', note: 'Indicado por Leandro Costa Silva.' }
    ]
  },
  { 
    id: 2, name: 'Ilza Maria Ferreira Correa', phone: '(55) 91991-7195', ref: 'CLAUDIANE DE SOUSA RIBEIRO MELO', status: 'Ganho', value: 99.90,
    responsible: 'NIVEA',
    history: [
      { id: 201, lead_id: 2, date: '15/10/2026 16:45', action: 'Venda realizada', note: 'Plano contratado com sucesso.' }
    ]
  },
  { 
    id: 3, name: 'João Silva', phone: '(11) 98888-7777', ref: 'EMP-042', status: 'Ganho', value: 1200,
    responsible: 'NIVEA',
    history: [
      { id: 301, lead_id: 3, date: '08/10/2026 11:20', action: 'Lead convertido', note: 'Assinou o plano fibra 500MB.' }
    ]
  },
  { 
    id: 4, name: 'Maria Oliveira', phone: '(11) 95555-4444', ref: 'EMP-043', status: 'Contato inicial', value: 850,
    responsible: 'Emmyly', waitingDays: 2,
    history: [
      { id: 401, lead_id: 4, date: '14/10/2026 10:00', action: 'Lead criado', note: null }
    ]
  },
  { 
    id: 5, name: 'Carlos Santos', phone: '(11) 91111-2222', ref: 'Orgânico', status: 'Pendente', value: 500,
    responsible: 'Admin', waitingDays: 1,
    history: [
      { id: 501, lead_id: 5, date: '17/10/2026 08:30', action: 'Lead criado', note: 'Veio pela página inicial.' }
    ]
  }
];

export function LeadsView() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [selectedLead, setSelectedLead] = useState<UILead | null>(null);

  const selectLead = (lead: UILead | null) => {
    setSelectedLead(lead);
    setAiResult(null);
    setCopiedMessage(false);
  };

  // Helper to read cookie
  const getReferralCookie = () => {
    if (typeof document === 'undefined') return null;
    const nameEQ = "gente_digital_ref=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const isSupabaseConfigured = typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
  const [leads, setLeads] = useState<UILead[]>(isSupabaseConfigured ? [] : initialLeads);
  const [isLoading, setIsLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState<{ id: string, name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedColabFilter, setSelectedColabFilter] = useState<string>('');
  const [minValueFilter, setMinValueFilter] = useState<number | ''>('');
  const [maxValueFilter, setMaxValueFilter] = useState<number | ''>('');

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncIxc = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/integrations/ixc/sync', {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        alert(data.message);
        await fetchLeads();
      } else {
        alert(`Erro na sincronização: ${data.error}`);
      }
    } catch (error) {
      console.error('Error syncing with IXC:', error);
      alert('Erro de rede ao tentar sincronizar com o IXC.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteLead = async (id: number) => {
    const targetLead = leads.find(l => l.id === id);
    const leadName = targetLead?.name || `ID ${id}`;

    if (!window.confirm("Tem certeza que deseja excluir este lead? Essa ação não pode ser desfeita.")) {
      return;
    }
    
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        await supabase.from('lead_history').delete().eq('lead_id', id);
        const { error } = await supabase.from('leads').delete().eq('id', id);
        if (error) throw error;
      }
      
      await logAuditEvent('Exclusão de Lead', `Lead "${leadName}" (ID: ${id}) foi excluído do sistema.`);
      setLeads(leads.filter(l => l.id !== id));
      setSelectedLead(null);
    } catch (err) {
      console.error("Erro ao excluir lead:", err);
      alert("Falha ao excluir o lead. Verifique sua conexão ou permissões.");
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Nome do Lead', 'Contato', 'Origem (Ref)', 'Status', 'Valor (R$)', 'Ultima Interacao'];
    const rows = leads.map(l => [
      l.id,
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.phone}"`,
      `"${l.ref}"`,
      `"${l.status}"`,
      l.value || 0,
      `"${l.history[0]?.date || 'Novo'}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `leads_gente_digital_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema)
  });

  useEffect(() => {
    if (isModalOpen) {
      const cookieRef = getReferralCookie();
      reset({
        name: '',
        phone: '',
        value: '',
        ref: cookieRef || ''
      });
    }
  }, [isModalOpen, reset]);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    type: 'qualify' | 'generate-message';
    qualification?: string;
    reason?: string;
    nextSteps?: string;
    message?: string;
  } | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // AI results are now cleared inside the custom selectLead handler to avoid synchronous useEffect state updates.

  const handleAIQualify = async () => {
    if (!selectedLead) return;
    setIsAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qualify', lead: selectedLead }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setAiResult({
          type: 'qualify',
          qualification: data.qualification,
          reason: data.reason,
          nextSteps: data.nextSteps,
        });
      } else {
        console.error('AI Error:', data.error);
      }
    } catch (err) {
      console.error('AI Request failed:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAIGenerateMessage = async () => {
    if (!selectedLead) return;
    setIsAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-message', lead: selectedLead }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setAiResult({
          type: 'generate-message',
          message: data.message,
        });
      } else {
        console.error('AI Error:', data.error);
      }
    } catch (err) {
      console.error('AI Request failed:', err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const fetchLeads = async () => {
    try {
      setIsLoading(true);
      // Ensure we don't crash if supabase url is placeholder
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { data: leadsData, error: leadsError } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
        if (leadsError) throw leadsError;

        if (leadsData && leadsData.length > 0) {
          const { data: historyData, error: historyError } = await supabase.from('lead_history').select('*').order('created_at', { ascending: false });
          if (historyError) throw historyError;
          
          const uiLeads: UILead[] = leadsData.map(lead => ({
            ...lead,
            history: historyData ? historyData.filter(h => h.lead_id === lead.id) : []
          }));
          setLeads(uiLeads);
        } else {
          setLeads([]);
        }
      } else {
         setLeads(initialLeads);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      // Fallback to initial local state only if not configured
      const isConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
      setLeads(isConfigured ? [] : initialLeads);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchColaboradores = async () => {
    try {
      let colabs: { id: string; name: string }[] = [];
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { data, error } = await supabase.from('colaboradores').select('id, name');
        if (!error && data && data.length > 0) {
          colabs = data;
        }
      }

      if (typeof window !== 'undefined') {
        try {
          const raw = localStorage.getItem('gente_digital_local_colaboradores');
          if (raw) {
            const local: any[] = JSON.parse(raw);
            const map = new Map<string, { id: string; name: string }>();
            colabs.forEach(c => map.set(c.id, c));
            local.forEach(c => map.set(c.id, { id: c.id, name: c.name }));
            colabs = Array.from(map.values());
          }
        } catch (e) {}
      }

      setColaboradores(colabs);
    } catch (err) {
      console.error("Error fetching contributors in leads view:", err);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchLeads();
      fetchColaboradores();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const statuses = ['Pendente', 'Contato inicial', 'Em negociação', 'Errado', 'Ganho'];

  // getReferralCookie was moved to the top of the component to prevent being called before declaration.

  const handleAdd = async (data: LeadFormData) => {
    const referral = data.ref || getReferralCookie() || 'Manual';
    const newLeadData = {
      name: data.name,
      phone: data.phone,
      ref: referral,
      status: 'Pendente',
      value: data.value ? parseFloat(data.value) : 0
    };

    try {
       if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
         const { data: inserted, error } = await supabase.from('leads').insert([newLeadData]).select();
         if (error) throw error;
         if (inserted && inserted[0]) {
           const historyData = { lead_id: inserted[0].id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Lead criado manualmente', note: null };
           await supabase.from('lead_history').insert([historyData]);
           setLeads([{ ...inserted[0], history: [{...historyData, id: inserted[0].id + 9999}] }, ...leads]);
         }
       } else {
         const newId = leads.length > 0 ? Math.max(...leads.map(l => l.id)) + 1 : 1;
         setLeads([{
            ...newLeadData,
            id: newId,
            history: [{ id: newId + 5000, lead_id: newId, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Lead criado manualmente', note: null }]
         }, ...leads]);
       }

       fetch('/api/integrations/ixc/prospect', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name: newLeadData.name, phone: newLeadData.phone, ref: newLeadData.ref })
       }).catch(err => console.error('Failed to send prospect to IXC:', err));
    } catch (error) {
      console.error("Error creating lead", error);
    }

    setIsModalOpen(false);
    reset();
  }

  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData('leadId', id.toString());
  };

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('leadId'));
    const currentLead = leads.find(l => l.id === id);
    if (!currentLead || currentLead.status === status) return;

    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
         await supabase.from('leads').update({ status }).eq('id', id);
         const historyData = { lead_id: id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: `Movido para ${status}`, note: null };
         await supabase.from('lead_history').insert([historyData]);
      }
      setLeads(leads.map(l => l.id === id ? { 
        ...l, 
        status, 
        history: [{ id: id + 9000, lead_id: id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: `Movido para ${status}`, note: null }, ...l.history]
      } : l));
    } catch(err) {
      console.error("Error updating lead status", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Pendente': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Contato inicial': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Em negociação': return 'bg-cyan-100 text-cyan-800 border-cyan-200';
      case 'Errado': return 'bg-red-100 text-red-800 border-red-200';
      case 'Ganho': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusCircleColor = (status: string) => {
    switch(status) {
      case 'Pendente': return 'border-gray-400';
      case 'Contato inicial': return 'border-blue-500';
      case 'Em negociação': return 'border-cyan-500';
      case 'Errado': return 'border-red-500';
      case 'Ganho': return 'border-green-500';
      default: return 'border-gray-400';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch(status) {
      case 'Ganho': return 'bg-green-100 text-green-700';
      case 'Errado': return 'bg-red-100 text-red-700';
      case 'Contato inicial': return 'bg-blue-100 text-blue-700';
      case 'Em negociação': return 'bg-cyan-100 text-cyan-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const [dateFilter, setDateFilter] = useState('all');

  const uniqueRefs = Array.from(new Set(leads.map(l => l.ref).filter(Boolean)));
  
  let activeFiltersCount = 0;
  if (selectedColabFilter) activeFiltersCount++;
  if (minValueFilter !== '') activeFiltersCount++;
  if (maxValueFilter !== '') activeFiltersCount++;
  if (dateFilter !== 'all') activeFiltersCount++;

  const now = new Date();

  const filteredLeads = leads.filter(l => {
    const matchesSearch = 
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (l.phone && l.phone.includes(searchQuery)) ||
      (l.ref && l.ref.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesColab = selectedColabFilter ? l.ref === selectedColabFilter : true;
    const matchesMinVal = minValueFilter !== '' ? (l.value || 0) >= Number(minValueFilter) : true;
    const matchesMaxVal = maxValueFilter !== '' ? (l.value || 0) <= Number(maxValueFilter) : true;
    
    let matchesDate = true;
    if (dateFilter !== 'all') {
      if (!l.created_at) {
        matchesDate = false;
      } else {
        const d = new Date(l.created_at);
        if (dateFilter === 'this_month') {
          matchesDate = d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        } else if (dateFilter === 'last_month') {
          const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
          const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          matchesDate = d.getMonth() === lastMonth && d.getFullYear() === lastYear;
        } else if (dateFilter === 'this_year') {
          matchesDate = d.getFullYear() === now.getFullYear();
        }
      }
    }

    return matchesSearch && matchesColab && matchesMinVal && matchesMaxVal && matchesDate;
  });

  return (
    <div className="w-full max-w-full mx-auto space-y-5 animate-in fade-in duration-300 flex flex-col relative pb-20">
      <div className="shrink-0">
        <div className="text-xs text-brand-muted dark:text-gray-400 font-bold mb-1 flex items-center gap-1.5 uppercase tracking-wide">
          <span>Marketing de indicações</span>
          <span className="text-gray-300 text-sm">›</span>
          <span className="text-brand-charcoal dark:text-gray-300 font-extrabold">Acompanhamento de leads</span>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-border pb-2 shrink-0">
        <div className="flex gap-4">
          <button 
            onClick={() => setViewMode('kanban')} 
            className={`px-5 py-3 font-bold text-sm transition-all border-b-2 -mb-[9px] ${
              viewMode === 'kanban' 
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                : 'border-transparent text-brand-muted hover:text-brand-charcoal dark:hover:text-gray-200'
            }`}
          >
            Kanban
          </button>
          <button 
            onClick={() => setViewMode('list')} 
            className={`px-5 py-3 font-bold text-sm transition-all border-b-2 -mb-[9px] ${
              viewMode === 'list' 
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400' 
                : 'border-transparent text-brand-muted hover:text-brand-charcoal dark:hover:text-gray-200'
            }`}
          >
            Lista
          </button>
        </div>
        
        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="relative text-brand-muted focus-within:text-brand-charcoal transition-colors">
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Busque pelo nome do lead" 
              className="pl-4 pr-10 py-2 border border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all w-60" 
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-xl font-bold text-sm transition-colors shadow-sm ${
                isFilterOpen || activeFiltersCount > 0 
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' 
                  : 'border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 text-brand-charcoal dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700'
              }`}
            >
              Filtros
              {activeFiltersCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {isFilterOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-[#18181b] border border-brand-border dark:border-gray-800 rounded-2xl shadow-xl z-50 p-5 space-y-4 animate-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center pb-2 border-b border-brand-border dark:border-gray-800">
                  <h4 className="font-bold text-sm text-brand-charcoal dark:text-white">Filtrar Leads</h4>
                  {activeFiltersCount > 0 && (
                    <button 
                      onClick={() => {
                        setSelectedColabFilter('');
                        setMinValueFilter('');
                        setMaxValueFilter('');
                        setDateFilter('all');
                      }}
                      className="text-xs text-red-500 hover:text-red-600 font-bold"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wide">
                    Período
                  </label>
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                  >
                    <option value="all">Todo o Período</option>
                    <option value="this_month">Este Mês</option>
                    <option value="last_month">Mês Passado</option>
                    <option value="this_year">Este Ano</option>
                  </select>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wide">
                    Origem / Indicador
                  </label>
                  <select
                    value={selectedColabFilter}
                    onChange={(e) => setSelectedColabFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                  >
                    <option value="">Todos</option>
                    {uniqueRefs.map(refVal => (
                      <option key={refVal} value={refVal}>{refVal}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wide">
                    Valor da Venda (R$)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Mín"
                      value={minValueFilter}
                      onChange={(e) => setMinValueFilter(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                    />
                    <span className="text-gray-300 dark:text-gray-600 text-xs">até</span>
                    <input
                      type="number"
                      placeholder="Máx"
                      value={maxValueFilter}
                      onChange={(e) => setMaxValueFilter(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setIsFilterOpen(false)}
                  className="w-full py-2 bg-brand-charcoal dark:bg-zinc-700 hover:bg-gray-800 dark:hover:bg-zinc-600 text-white font-bold text-xs rounded-xl shadow-sm transition-colors mt-2"
                >
                  Aplicar Filtros
                </button>
              </div>
            )}
          </div>
          
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 border border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 text-brand-charcoal dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 font-bold text-sm rounded-xl transition-colors shadow-sm"
          >
            Exportar
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-brand-border dark:border-gray-800 shadow-level-1 overflow-hidden shrink-0 flex-1 flex flex-col">
          <div className="px-6 py-5 border-b border-brand-border dark:border-gray-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
            <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Todos os Leads</h3>
            <div className="relative w-full sm:w-72 text-brand-muted focus-within:text-brand-charcoal transition-colors">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou telefone..." 
                className="w-full pl-9 pr-4 py-2 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" 
              />
            </div>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-zinc-800/80 border-b border-brand-border dark:border-gray-700 text-xs text-brand-muted dark:text-gray-400 uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-wider">Nome do Lead</th>
                  <th className="px-6 py-4 font-bold tracking-wider">Contato</th>
                  <th className="px-6 py-4 font-bold tracking-wider">Origem (Ref)</th>
                  <th className="px-6 py-4 font-bold tracking-wider">Status</th>
                  <th className="px-6 py-4 font-bold tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border dark:divide-gray-800 text-sm">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full"></div>
                          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-28"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-20"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-24"></div></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4 ml-auto"></div></td>
                    </tr>
                  ))
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-zinc-800 flex items-center justify-center mb-4 border-2 border-dashed border-gray-200 dark:border-gray-700">
                          <Inbox className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        </div>
                        <h4 className="text-brand-charcoal dark:text-white font-bold mb-1">Nenhum lead encontrado</h4>
                        <p className="text-brand-muted dark:text-gray-400 text-sm max-w-[250px]">Você ainda não possui leads cadastrados no seu funil de vendas.</p>
                        <button onClick={() => setIsModalOpen(true)} className="mt-6 px-6 py-2.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 text-brand-charcoal dark:text-white font-bold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 shadow-sm">
                          <Plus className="w-4 h-4" />
                          Novo Lead
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredLeads.map(lead => (
                  <tr key={lead.id} onClick={() => selectLead(lead)} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group font-sans">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar size={32} name={lead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                        <span className="font-semibold text-brand-charcoal dark:text-white">{lead.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-brand-muted dark:text-gray-400 font-medium">{lead.phone}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-md text-xs font-mono text-brand-charcoal dark:text-gray-300 font-medium">
                        {lead.ref}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-brand-muted transition-colors">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLead(lead.id);
                          }}
                          className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/50 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                          title="Excluir Lead"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-brand-charcoal dark:group-hover:text-white transition-colors" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div 
          ref={scrollContainerRef} 
          onDragOver={handleDragOver}
          className="flex-1 flex gap-6 overflow-x-auto pb-6 items-start min-h-[550px]"
        >
          {statuses.map(status => {
            const columnLeads = filteredLeads.filter(l => l.status === status);
            const totalValue = columnLeads.reduce((acc, lead) => acc + (lead.value || 0), 0);
            return (
              <div 
                key={status} 
                onDrop={(e) => handleDrop(e, status)}
                onDragOver={handleDragOver}
                className="flex-shrink-0 w-[310px] flex flex-col bg-gray-50 dark:bg-zinc-900 border border-brand-border dark:border-gray-800 rounded-[24px] p-4 max-h-[calc(100vh-220px)] min-h-[480px] shadow-sm"
              >
                <div className="flex items-center justify-between mb-4 px-1 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-3.5 h-3.5 rounded-full border-2 ${getStatusCircleColor(status)}`} />
                    <h3 className="font-bold text-brand-charcoal dark:text-white text-[14px]">{status}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${getStatusBadgeClass(status)}`}>
                      {columnLeads.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-1.5 space-y-3 min-h-0">
                  <AnimatePresence>
                    {columnLeads.length > 0 ? (
                      columnLeads.map(lead => (
                        <motion.div 
                          layoutId={lead.id.toString()}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2 }}
                          key={lead.id}
                          draggable
                          onDragStart={(e: any) => handleDragStart(e, lead.id)}
                          onClick={() => selectLead(lead)}
                          className="bg-white dark:bg-[#18181b] border border-brand-border dark:border-gray-700 p-4 rounded-[16px] shadow-sm cursor-grab active:cursor-grabbing hover:border-blue-500 dark:hover:border-blue-400 hover:shadow-md transition-all group relative flex flex-col gap-3"
                        >
                          <div className="absolute right-3 top-3.5 flex items-center gap-1">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLead(lead.id);
                              }}
                              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded transition-colors"
                              title="Excluir Lead"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                          </div>
                          
                          <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-100 dark:border-amber-900/50 text-[10px] font-bold px-2.5 py-0.5 rounded w-fit uppercase tracking-wider">
                            Marketing de indicações
                          </span>

                          {/* Lead Name */}
                          <h4 className="font-extrabold text-brand-charcoal dark:text-gray-100 text-[15px] -mt-1 pr-12">{lead.name}</h4>

                          {/* Details List */}
                          <div className="space-y-2">
                            {/* Phone */}
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-gray-400 tracking-wider">TELEFONE</span>
                              <div className="flex items-center text-xs font-semibold text-brand-charcoal dark:text-gray-300 mt-0.5">
                                <Phone className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                {lead.phone}
                              </div>
                            </div>

                            {/* Responsável / Indicador */}
                            <div className="flex flex-col">
                              <span className="text-[9px] font-bold text-gray-400 dark:text-gray-400 tracking-wider">RESPONSÁVEL / INDICADOR</span>
                              <div className="flex items-center text-xs font-bold text-brand-charcoal dark:text-white mt-0.5">
                                <Avatar size={16} name={lead.responsible || lead.ref || 'Admin'} variant="beam" colors={['#FFC700', '#3B82F6', '#10B981', '#F59E0B', '#6366F1']} className="mr-1.5 shrink-0" />
                                <span className="truncate">{lead.responsible || lead.ref || 'Admin'}</span>
                              </div>
                            </div>

                            {/* Espera (only if defined) */}
                            {lead.waitingDays !== undefined && (
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-gray-400 tracking-wider">ESPERA</span>
                                <div className="flex items-center text-xs font-semibold text-brand-charcoal dark:text-gray-300 mt-0.5">
                                  <Clock className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                  {lead.waitingDays} dias
                                </div>
                              </div>
                            )}

                            {/* Valor da Venda (if defined/greater than 0) */}
                            {lead.value !== undefined && lead.value > 0 && (
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-gray-400 tracking-wider">VALOR DA VENDA</span>
                                <div className="flex items-center text-xs font-semibold text-green-700 dark:text-green-500 mt-0.5">
                                  <span className="text-xs font-bold mr-1.5">$</span>
                                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.value)}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Footer Colaborador */}
                          <div className="text-[11px] text-gray-500 border-t border-gray-100 dark:border-gray-700/50 pt-2.5 flex items-center justify-between">
                            <span className="font-semibold text-gray-600 dark:text-gray-400">
                              Indicador {lead.ref.toUpperCase()}
                            </span>
                          </div>
                        </motion.div>
                      ))
                    ) : (
                      <div className="h-32 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-[20px] flex flex-col items-center justify-center text-gray-400 bg-white dark:bg-[#18181b]/50">
                        <Inbox className="w-6 h-6 mb-2 text-gray-300 dark:text-gray-600" />
                        <span className="text-[11px] font-bold">Não há leads nessa etapa</span>
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Action Button for New Lead (bottom right) */}
      <button 
        onClick={() => setIsModalOpen(true)} 
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all z-40"
        title="Novo Lead"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Floating Action Button for IXC Sync (bottom right next to New Lead) */}
      <button 
        onClick={handleSyncIxc} 
        disabled={isSyncing}
        className={`fixed bottom-8 right-24 w-14 h-14 bg-brand-yellow hover:bg-brand-yellow/80 text-brand-charcoal rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all z-40 ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
        title="Sincronizar com IXC Soft"
      >
        <RefreshCw className={`w-6 h-6 ${isSyncing ? 'animate-spin' : ''}`} />
      </button>

      {/* New Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-charcoal/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border dark:border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display font-bold text-2xl text-brand-charcoal dark:text-white">Novo Lead</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5 text-brand-muted dark:text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit(handleAdd)} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">Nome do Lead</label>
                <input 
                  autoFocus 
                  {...register('name')} 
                  type="text" 
                  placeholder="Ex: Cliente Silva" 
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-1 transition-all ${
                    errors.name 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow'
                  }`} 
                />
                {errors.name && <p className="text-red-500 text-xs mt-1 font-medium">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">Telefone / WhatsApp</label>
                <input 
                  {...register('phone')} 
                  type="tel" 
                  placeholder="(00) 00000-0000" 
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-1 transition-all ${
                    errors.phone 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow'
                  }`} 
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">Valor (R$)</label>
                <input 
                  {...register('value')} 
                  type="number"
                  step="0.01" 
                  placeholder="Ex: 1500.00" 
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-1 transition-all ${
                    errors.value 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow'
                  }`} 
                />
                {errors.value && <p className="text-red-500 text-xs mt-1 font-medium">{errors.value.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">Técnico / Indicador</label>
                <select
                  {...register('ref')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:border-brand-yellow focus:ring-brand-yellow transition-all text-brand-charcoal dark:text-white"
                >
                  <option value="Manual">Nenhum (Venda Manual)</option>
                  <option value="Orgânico">Orgânico (Pesquisa do Cliente)</option>
                  {colaboradores.map(c => (
                    <option key={c.id} value={c.name}>{c.name} ({c.id})</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="w-full py-3.5 bg-brand-yellow text-brand-charcoal font-bold rounded-xl mt-6 hover:shadow-level-2 hover:scale-[1.02] active:scale-95 transition-all">
                Adicionar Lead
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Lead History Sidebar Panel */}
      {selectedLead && (
        <>
          <div 
            className="fixed inset-0 bg-brand-charcoal/20 backdrop-blur-[2px] z-[50] transition-opacity" 
            onClick={() => selectLead(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white dark:bg-zinc-900 shadow-2xl z-[55] flex flex-col animate-in slide-in-from-right duration-300 border-l border-brand-border dark:border-gray-800">
            {/* Sidebar Header */}
            <div className="flex items-start justify-between p-6 border-b border-brand-border dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-4">
                <Avatar size={48} name={selectedLead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                <div>
                  <h3 className="font-display text-2xl font-bold text-brand-charcoal dark:text-white">{selectedLead.name}</h3>
                  <div className="flex flex-wrap gap-2 items-center mt-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(selectedLead.status)}`}>{selectedLead.status}</span>
                    <span className="text-xs font-medium text-brand-muted dark:text-gray-300 flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 px-3 py-1 rounded-full"><Phone className="w-3.5 h-3.5"/> {selectedLead.phone}</span>
                    <span className="text-xs font-semibold text-brand-charcoal dark:text-white flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 px-3 py-1 rounded-full">
                      <Avatar size={14} name={selectedLead.responsible || selectedLead.ref || 'Admin'} variant="beam" colors={['#FFC700', '#3B82F6', '#10B981', '#F59E0B', '#6366F1']} />
                      {selectedLead.responsible || selectedLead.ref || 'Admin'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDeleteLead(selectedLead.id)} 
                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full transition-colors shrink-0 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 shadow-sm"
                  title="Excluir Lead"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={() => selectLead(null)} className="p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-full transition-colors text-brand-muted dark:text-gray-400 shrink-0 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 shadow-sm">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Timeline Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-900">
              <h4 className="font-bold text-sm text-brand-charcoal dark:text-gray-300 mb-6 flex items-center gap-2 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-brand-muted" /> Linha do Tempo
              </h4>
              
              <div className="relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:ml-[1.3rem] md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-brand-yellow/80 before:to-transparent">
                {selectedLead.history.map((h, i) => (
                  <div key={i} className="relative flex gap-4 group items-start">
                    <div className="flex flex-col items-center">
                      <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-all z-10 shadow-sm border-2 ${
                        i === 0 
                          ? 'bg-brand-yellow border-white dark:border-[#18181b] text-brand-charcoal ring-4 ring-brand-yellow/20'
                          : 'bg-white dark:bg-[#27272a] border-gray-200 dark:border-gray-700 text-brand-muted group-hover:border-brand-yellow'
                      }`}>
                        {i === 0 ? <Sparkles className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                      </div>
                    </div>
                    <div className="flex-1 pt-1 pb-2">
                      <div className="bg-gray-50 dark:bg-[#27272a]/50 p-4 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <span className="font-bold text-[15px] text-brand-charcoal dark:text-gray-100">{h.action}</span>
                          <span className="text-[11px] font-bold text-brand-muted dark:text-gray-400 whitespace-nowrap bg-white dark:bg-[#18181b] px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-800 shadow-sm">{h.date}</span>
                        </div>
                        {h.note && <p className="text-[13px] text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">{h.note}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Assistant Section */}
              <div className="mt-8 pt-6 border-t border-brand-border dark:border-gray-800 space-y-4">
                <h4 className="font-bold text-sm text-brand-charcoal dark:text-gray-300 flex items-center gap-2 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-brand-yellow animate-pulse" /> Assistente de IA Gente Digital
                </h4>
                <div className="flex gap-3">
                  <button 
                    onClick={handleAIQualify}
                    disabled={isAiLoading}
                    className="flex-1 py-2.5 px-3 bg-brand-yellow/15 border border-brand-yellow/30 hover:bg-brand-yellow/25 text-brand-charcoal dark:text-brand-yellow font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                    Qualificar Lead
                  </button>
                  <button 
                    onClick={handleAIGenerateMessage}
                    disabled={isAiLoading}
                    className="flex-1 py-2.5 px-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-800 dark:text-blue-400 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                    Mensagem WhatsApp
                  </button>
                </div>

                {/* AI Output Result */}
                {aiResult && (
                  <div className="bg-gray-50 dark:bg-[#27272a]/50 border border-brand-border dark:border-gray-800 rounded-2xl p-4 space-y-3 relative overflow-hidden animate-in fade-in duration-300">
                    <button onClick={() => setAiResult(null)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {aiResult.type === 'qualify' ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">Qualificação:</span>
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            aiResult.qualification === 'Quente' ? 'bg-red-100 text-red-800 border-red-200' :
                            aiResult.qualification === 'Morno' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                            'bg-blue-100 text-blue-800 border-blue-200'
                          }`}>{aiResult.qualification}</span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-brand-charcoal dark:text-gray-200">Motivo:</p>
                          <p className="text-xs text-brand-muted mt-1 leading-relaxed">{aiResult.reason}</p>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-brand-charcoal dark:text-gray-200">Próximos Passos:</p>
                          <p className="text-xs text-brand-muted mt-1 leading-relaxed">{aiResult.nextSteps}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-muted">Mensagem Recomendada:</span>
                        <p className="text-xs text-brand-charcoal dark:text-gray-300 bg-white dark:bg-[#18181b] p-3 rounded-lg border border-gray-100 dark:border-gray-800 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap select-all">{aiResult.message}</p>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(aiResult.message || '');
                              setCopiedMessage(true);
                              setTimeout(() => setCopiedMessage(false), 2000);
                            }}
                            className="flex-1 py-2 bg-gray-100 dark:bg-[#27272a] hover:bg-gray-200 dark:hover:bg-[#3f3f46] text-brand-charcoal dark:text-white font-semibold text-[11px] rounded-lg transition-colors border border-brand-border dark:border-gray-700"
                          >
                            {copiedMessage ? 'Copiado!' : 'Copiar Texto'}
                          </button>
                          <a 
                            href={`https://wa.me/${selectedLead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(aiResult.message || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white font-semibold text-[11px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                          >
                            Enviar WhatsApp
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Add Note Area */}
              <div className="mt-8 pt-6 border-t border-brand-border dark:border-gray-800">
                <h4 className="font-bold text-sm text-brand-charcoal dark:text-gray-300 mb-3">Registrar Interação</h4>
                <textarea 
                  placeholder="Descreva a nova interação com o lead..." 
                  className="w-full bg-gray-50 dark:bg-[#27272a]/50 border border-brand-border dark:border-gray-800 rounded-2xl p-4 text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow resize-none h-28 transition-all dark:text-white dark:placeholder-gray-500"
                ></textarea>
                <button className="w-full mt-3 py-3.5 bg-brand-charcoal dark:bg-brand-yellow dark:text-brand-charcoal text-white font-bold text-sm rounded-xl hover:bg-black dark:hover:bg-yellow-400 hover:shadow-level-2 hover:scale-[1.01] active:scale-95 transition-all">
                  Salvar Nota
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
