import { useState, useEffect } from 'react';
import { Search, Plus, X, LayoutGrid, List, MessageSquare, Clock, Calendar, Phone, ChevronRight, GripVertical, Inbox } from 'lucide-react';
import { supabase, Lead, LeadHistory } from '@/lib/supabase';
import { motion, AnimatePresence } from 'motion/react';
import Avatar from 'boring-avatars';

// Helper type for local UI rendering combining lead and history
export type UILead = Lead & {
  history: LeadHistory[];
};

const initialLeads: UILead[] = [
  { 
    id: 1, name: 'João Silva', phone: '(11) 98888-7777', ref: 'EMP-042', status: 'Vencemos', value: 1200,
    history: [
      { id: 101, lead_id: 1, date: '12/10/2023 14:30', action: 'Lead convertido', note: 'Assinou o plano fibra 500MB.' },
      { id: 102, lead_id: 1, date: '10/10/2023 09:15', action: 'Em Negociação', note: 'Enviada proposta comercial.' },
      { id: 103, lead_id: 1, date: '08/10/2023 11:20', action: 'Lead criado', note: null }
    ]
  },
  { 
    id: 2, name: 'Maria Oliveira', phone: '(11) 95555-4444', ref: 'EMP-043', status: 'Em contato', value: 850,
    history: [
      { id: 201, lead_id: 2, date: '15/10/2023 16:45', action: 'Contato realizado', note: 'Ficou de confirmar com o marido.' },
      { id: 202, lead_id: 2, date: '14/10/2023 10:00', action: 'Lead criado', note: null }
    ]
  },
  { 
    id: 3, name: 'Carlos Santos', phone: '(11) 91111-2222', ref: 'Orgânico', status: 'Novas indicações', value: 500,
    history: [
      { id: 301, lead_id: 3, date: '17/10/2023 08:30', action: 'Lead criado', note: 'Veio pela página inicial.' }
    ]
  },
  { 
    id: 4, name: 'Fernanda Lima', phone: '(11) 92222-3333', ref: 'EMP-042', status: 'Novas indicações', value: 1500,
    history: [
      { id: 401, lead_id: 4, date: '18/10/2023 14:30', action: 'Contato inicial', note: 'Mandou mensagem pelo WhatsApp.' },
      { id: 402, lead_id: 4, date: '18/10/2023 14:00', action: 'Lead criado', note: null }
    ]
  }
];

export function LeadsView() {
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [selectedLead, setSelectedLead] = useState<UILead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newValue, setNewValue] = useState('');
  const [leads, setLeads] = useState<UILead[]>(initialLeads);
  const [isLoading, setIsLoading] = useState(true);

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
          setLeads(initialLeads);
        }
      } else {
         setLeads(initialLeads);
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
      // Fallback to initial local state
      setLeads(initialLeads);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLeads();
  }, []);

  const statuses = ['Novas indicações', 'Em contato', 'Vencemos', 'Não vencemos'];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newName) return;
    
    const newLeadData = {
      name: newName,
      phone: newPhone,
      ref: 'Manual',
      status: 'Novas indicações',
      value: Number(newValue) || 0
    };

    try {
       if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
         const { data, error } = await supabase.from('leads').insert([newLeadData]).select();
         if (error) throw error;
         if (data && data[0]) {
           const historyData = { lead_id: data[0].id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Lead criado manualmente', note: null };
           await supabase.from('lead_history').insert([historyData]);
           setLeads([{ ...data[0], history: [{...historyData, id: Math.random()}] }, ...leads]);
         }
       } else {
         const newId = leads.length > 0 ? Math.max(...leads.map(l => l.id)) + 1 : 1;
         setLeads([{
            ...newLeadData,
            id: newId,
            history: [{ id: Math.random(), lead_id: newId, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Lead criado manualmente', note: null }]
         }, ...leads]);
       }
    } catch (error) {
      console.error("Error creating lead", error);
    }

    setIsModalOpen(false);
    setNewName('');
    setNewPhone('');
  }

  // Drag and Drop Handlers
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
        history: [{ id: Math.random(), lead_id: id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: `Movido para ${status}`, note: null }, ...l.history]
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
      case 'Novas indicações': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Em contato': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Vencemos': return 'bg-green-100 text-green-800 border-green-200';
      case 'Não vencemos': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 animate-in fade-in duration-300 h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal">Gestão de Leads</h2>
          <p className="text-brand-muted mt-1">Acompanhe e mova os leads em seu funil de vendas.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 p-1 rounded-xl">
            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-brand-charcoal' : 'text-brand-muted hover:text-brand-charcoal'}`} title="Exibição em Lista">
              <List className="w-5 h-5" />
            </button>
            <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-lg transition-colors ${viewMode === 'kanban' ? 'bg-white shadow-sm text-brand-charcoal' : 'text-brand-muted hover:text-brand-charcoal'}`} title="Exibição Kanban">
              <LayoutGrid className="w-5 h-5" />
            </button>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-brand-yellow text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-level-2 transition-all flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" />
            Novo Lead
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'list' ? (
        <div className="bg-white rounded-2xl border border-brand-border shadow-level-1 overflow-hidden shrink-0 flex-1 flex flex-col">
          <div className="px-6 py-5 border-b border-brand-border flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
            <h3 className="font-bold text-xl text-brand-charcoal">Todos os Leads</h3>
            <div className="relative w-full sm:w-72 text-brand-muted focus-within:text-brand-charcoal transition-colors">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
              <input type="text" placeholder="Buscar por nome ou telefone..." className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" />
            </div>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-brand-border text-xs text-brand-muted uppercase sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-bold tracking-wider">Nome do Lead</th>
                  <th className="px-6 py-4 font-bold tracking-wider">Contato</th>
                  <th className="px-6 py-4 font-bold tracking-wider">Origem (Ref)</th>
                  <th className="px-6 py-4 font-bold tracking-wider">Status</th>
                  <th className="px-6 py-4 font-bold tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border text-sm">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                          <div className="h-4 bg-gray-200 rounded w-24"></div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><div className="h-4 bg-gray-200 rounded w-28"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded w-20"></div></td>
                      <td className="px-6 py-4"><div className="h-6 bg-gray-200 rounded-full w-24"></div></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 bg-gray-200 rounded w-4 ml-auto"></div></td>
                    </tr>
                  ))
                ) : leads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 border-2 border-dashed border-gray-200">
                          <Inbox className="w-8 h-8 text-gray-300" />
                        </div>
                        <h4 className="text-brand-charcoal font-bold mb-1">Nenhum lead encontrado</h4>
                        <p className="text-brand-muted text-sm max-w-[250px]">Você ainda não possui leads cadastrados no seu funil de vendas.</p>
                        <button onClick={() => setIsModalOpen(true)} className="mt-6 px-6 py-2.5 bg-white border border-brand-border text-brand-charcoal font-bold text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm">
                          <Plus className="w-4 h-4" />
                          Novo Lead
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : leads.map(lead => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar size={32} name={lead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                        <span className="font-semibold text-brand-charcoal">{lead.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-brand-muted font-medium">{lead.phone}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 bg-gray-100 border border-brand-border rounded-md text-xs font-mono text-brand-charcoal font-medium">
                        {lead.ref}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(lead.status)}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-brand-muted group-hover:text-brand-charcoal transition-colors">
                      <ChevronRight className="w-5 h-5 inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-x-auto pb-4 scrollbar-hide items-start">
          {statuses.map(status => {
            const columnLeads = leads.filter(l => l.status === status);
            const totalValue = columnLeads.reduce((acc, lead) => acc + (lead.value || 0), 0);
            return (
            <div 
              key={status} 
              onDrop={(e) => handleDrop(e, status)}
              onDragOver={handleDragOver}
              className="flex-shrink-0 w-[340px] flex flex-col bg-gray-50 border border-brand-border rounded-[24px] p-4 max-h-full overflow-hidden shadow-sm"
            >
              <div className="flex items-center justify-between mb-4 px-1 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-brand-charcoal text-[16px]">{status}</h3>
                  <span className="bg-white border border-brand-border text-brand-muted text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">
                    {columnLeads.length}
                  </span>
                  {totalValue > 0 && (
                    <span className="text-xs font-semibold text-green-700 bg-green-100 border border-green-200 px-2 py-1 rounded-full">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-brand-muted hover:text-brand-charcoal hover:bg-white border border-transparent hover:border-brand-border shadow-sm transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                <AnimatePresence>
                  {isLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          key={`skeleton-${i}`}
                          className="bg-white border border-brand-border p-5 rounded-[20px] shadow-sm animate-pulse flex flex-col gap-3"
                        >
                          <div className="flex flex-col gap-2">
                            <div className="h-3 w-16 bg-gray-200 rounded"></div>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gray-200"></div>
                              <div className="h-4 w-24 bg-gray-200 rounded"></div>
                            </div>
                          </div>
                          <div className="h-8 bg-gray-50 rounded-lg border border-gray-100"></div>
                          <div className="flex justify-between items-center mt-1 pt-3 border-t border-gray-50">
                            <div className="h-4 w-16 bg-gray-200 rounded"></div>
                            <div className="h-3 w-12 bg-gray-200 rounded"></div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : columnLeads.length > 0 ? (
                    <div className="space-y-3">
                      {columnLeads.map(lead => (
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
                          onClick={() => setSelectedLead(lead)}
                          className="bg-white border border-brand-border p-5 rounded-[20px] shadow-sm cursor-grab active:cursor-grabbing hover:border-brand-yellow hover:shadow-md transition-all group relative flex flex-col gap-1"
                        >
                          <GripVertical className="absolute right-3 top-5 w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          
                          <div className="flex flex-col pr-6 mb-2">
                            <span className="text-[11px] uppercase tracking-wider font-bold text-brand-muted mb-1.5 flex items-center gap-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor(lead.status).split(' ')[0]}`}></div>
                              Origem: {lead.ref}
                            </span>
                            <div className="flex items-center gap-2">
                              <Avatar size={24} name={lead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                              <h4 className="font-bold text-brand-charcoal text-[16px]">{lead.name}</h4>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mb-1 mt-1">
                            <div className="flex items-center text-[13px] font-medium text-brand-charcoal w-fit bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                              <Phone className="w-3.5 h-3.5 mr-2 text-gray-400" />
                              {lead.phone}
                            </div>
                            {lead.value !== undefined && lead.value > 0 && (
                              <div className="flex items-center text-[13px] font-medium text-green-700 bg-green-50 px-2.5 py-1.5 rounded-lg border border-green-100">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.value)}
                              </div>
                            )}
                          </div>

                          <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-50">
                             <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md border ${getStatusColor(lead.status)}`}>
                                {lead.status}
                              </span>
                            <div className="flex items-center text-[11px] text-brand-muted font-bold tracking-wide uppercase gap-1">
                              <Clock className="w-3 h-3" />
                              {lead.history[0]?.date.split(' ')[0] || 'Novo'}
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="h-32 border-2 border-dashed border-gray-200 rounded-[20px] flex flex-col items-center justify-center text-gray-400"
                    >
                      <Inbox className="w-6 h-6 mb-2 text-gray-300" />
                      <span className="text-xs font-semibold">Nenhum lead aqui</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* New Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-charcoal/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display font-bold text-2xl text-brand-charcoal">Novo Lead</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-brand-muted" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1.5">Nome do Lead</label>
                <input autoFocus required value={newName} onChange={e => setNewName(e.target.value)} type="text" placeholder="Ex: Cliente Silva" className="w-full px-4 py-3 bg-gray-50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1.5">Telefone / WhatsApp</label>
                <input required value={newPhone} onChange={e => setNewPhone(e.target.value)} type="tel" placeholder="(00) 00000-0000" className="w-full px-4 py-3 bg-gray-50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1.5">Valor (R$)</label>
                <input value={newValue} onChange={e => setNewValue(e.target.value)} type="number" placeholder="Ex: 1500" className="w-full px-4 py-3 bg-gray-50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" />
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
            onClick={() => setSelectedLead(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white shadow-2xl z-[55] flex flex-col animate-in slide-in-from-right duration-300 border-l border-brand-border">
            {/* Sidebar Header */}
            <div className="flex items-start justify-between p-6 border-b border-brand-border bg-gray-50/50">
              <div className="flex items-center gap-4">
                <Avatar size={48} name={selectedLead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                <div>
                  <h3 className="font-display text-2xl font-bold text-brand-charcoal">{selectedLead.name}</h3>
                  <div className="flex flex-wrap gap-2 items-center mt-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(selectedLead.status)}`}>{selectedLead.status}</span>
                    <span className="text-sm font-medium text-brand-muted flex items-center gap-1.5 bg-white border border-brand-border px-3 py-1 rounded-full"><Phone className="w-3.5 h-3.5"/> {selectedLead.phone}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-brand-muted shrink-0 bg-white border border-brand-border shadow-sm">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Timeline Area */}
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              <h4 className="font-bold text-sm text-brand-charcoal mb-6 flex items-center gap-2 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-brand-muted" /> Histórico de Interações
              </h4>
              
              <div className="space-y-4">
                {selectedLead.history.map((h, i) => (
                  <div key={i} className="flex gap-4 group">
                    <div className="flex flex-col items-center">
                      <div className="w-10 h-10 shrink-0 rounded-full bg-white border-2 border-brand-border flex items-center justify-center text-brand-muted group-hover:border-brand-yellow group-hover:text-brand-charcoal transition-colors z-10 shadow-sm">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      {i !== selectedLead.history.length - 1 && (
                        <div className="w-0.5 h-full bg-brand-border mt-2 rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="bg-gray-50 p-4 rounded-2xl border border-brand-border">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-sm text-brand-charcoal">{h.action}</span>
                          <span className="text-xs font-medium text-brand-muted whitespace-nowrap bg-white px-2 py-0.5 rounded-md border border-brand-border shadow-sm">{h.date}</span>
                        </div>
                        {h.note && <p className="text-sm text-brand-muted mt-2 leading-relaxed">{h.note}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Note Area */}
              <div className="mt-8 pt-6 border-t border-brand-border">
                <h4 className="font-bold text-sm text-brand-charcoal mb-3">Registrar Interação</h4>
                <textarea 
                  placeholder="Descreva a nova interação com o lead..." 
                  className="w-full bg-gray-50 border border-brand-border rounded-2xl p-4 text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow resize-none h-28 transition-all"
                ></textarea>
                <button className="w-full mt-3 py-3.5 bg-brand-charcoal text-white font-bold text-sm rounded-xl hover:bg-black hover:shadow-level-2 hover:scale-[1.01] active:scale-95 transition-all">
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
