import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, X, LayoutGrid, List, MessageSquare, Clock, Calendar, Phone, ChevronRight, ChevronLeft, GripVertical, Inbox, Sparkles, ShieldAlert, Loader2, Copy, RefreshCw, Trash2, Edit2 } from 'lucide-react';
import { supabase, Lead, LeadHistory, isSupabaseConfigured } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit';
import { motion, AnimatePresence } from 'motion/react';
import Avatar from 'boring-avatars';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/components/providers/toast-context';
import { LeadsSkeleton } from '@/components/views/leads-skeleton';
import { initialColaboradores } from '@/lib/mock-data';
import { ConfirmModal } from '@/components/providers/confirm-modal';
import { sanitizeCsvField } from '@/lib/utils';

const normalizePhoneDigits = (phone: string) => phone.replace(/\D/g, '');

const leadSchema = z.object({
  name: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  phone: z.string().min(10, 'Insira um telefone válido com DDD (mínimo 10 dígitos)'),
  value: z.string().optional().refine(val => {
    if (!val) return true;
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  }, 'O valor deve ser um número positivo'),
  ref: z.string().optional(),
  customRef: z.string().optional(),
}).refine(data => {
  if (data.ref === 'Outro') {
    return !!data.customRef && data.customRef.trim().length > 0;
  }
  return true;
}, {
  message: 'Digite o nome da pessoa que indicou',
  path: ['customRef'],
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
    responsible: 'Emmyly', waitingDays: 5, created_at: '2026-08-03T14:30:00Z',
    history: [
      { id: 101, lead_id: 1, date: '12/10/2026 14:30', action: 'Lead criado por indicação', note: 'Indicado por Leandro Costa Silva.' }
    ]
  },
  { 
    id: 2, name: 'Ilza Maria Ferreira Correa', phone: '(55) 91991-7195', ref: 'CLAUDIANE DE SOUSA RIBEIRO MELO', status: 'Ganho', value: 99.90,
    responsible: 'NIVEA', created_at: '2026-08-01T16:45:00Z',
    history: [
      { id: 201, lead_id: 2, date: '15/10/2026 16:45', action: 'Venda realizada', note: 'Plano contratado com sucesso.' }
    ]
  },
  { 
    id: 3, name: 'João Silva', phone: '(11) 98888-7777', ref: 'EMP-042', status: 'Ganho', value: 1200,
    responsible: 'NIVEA', created_at: '2026-07-15T11:20:00Z',
    history: [
      { id: 301, lead_id: 3, date: '08/10/2026 11:20', action: 'Lead convertido', note: 'Assinou o plano fibra 500MB.' }
    ]
  },
  { 
    id: 4, name: 'Maria Oliveira', phone: '(11) 95555-4444', ref: 'EMP-043', status: 'Contato inicial', value: 850,
    responsible: 'Emmyly', waitingDays: 2, created_at: '2026-06-20T10:00:00Z',
    history: [
      { id: 401, lead_id: 4, date: '14/10/2026 10:00', action: 'Lead criado', note: null }
    ]
  },
  { 
    id: 5, name: 'Carlos Santos', phone: '(11) 91111-2222', ref: 'Orgânico', status: 'Pendente', value: 500,
    responsible: 'Admin', waitingDays: 1, created_at: '2026-08-05T08:30:00Z',
    history: [
      { id: 501, lead_id: 5, date: '17/10/2026 08:30', action: 'Lead criado', note: 'Veio pela página inicial.' }
    ]
  }
];

export function LeadsView() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [selectedLead, setSelectedLead] = useState<UILead | null>(null);

  // Auto-switch de visão conforme o tamanho da tela (lista no mobile, Kanban no desktop)
  useEffect(() => {
    const checkMobile = () => {
      setViewMode(window.innerWidth < 768 ? 'list' : 'kanban');
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Estado do modal de confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: number; name: string } | null>(null);

  // Fecha modais/painéis com a tecla Escape (o modal de confirmação trata o próprio Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isModalOpen) {
        setIsModalOpen(false);
        setEditingLead(null);
      } else if (selectedLead) selectLead(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const selectLead = (lead: UILead | null) => {
    setSelectedLead(lead);
    setAiResult(null);
    setCopiedMessage(false);
  };

  // Helper to read cookie (o valor é gravado com encodeURIComponent)
  const getReferralCookie = () => {
    if (typeof document === 'undefined') return null;
    const nameEQ = "gente_digital_ref=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        const raw = c.substring(nameEQ.length, c.length);
        try {
          return decodeURIComponent(raw);
        } catch (e) {
          return raw;
        }
      }
    }
    return null;
  };

  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<UILead | null>(null);

  const openCreateModal = () => {
    setEditingLead(null);
    setIsModalOpen(true);
  };

  const openEditModal = (lead: UILead) => {
    setEditingLead(lead);
    const isKnownRef = ['Manual', 'Orgânico', 'Outro'].includes(lead.ref);
    reset({
      name: lead.name,
      phone: lead.phone,
      value: lead.value ? String(lead.value) : '',
      ref: isKnownRef ? lead.ref : 'Outro',
      customRef: isKnownRef ? '' : lead.ref,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingLead(null);
    reset();
  };

  const [leads, setLeads] = useState<UILead[]>(isSupabaseConfigured() ? [] : initialLeads);
  const [isLoading, setIsLoading] = useState(true);
  const [colaboradores, setColaboradores] = useState<{ id: string, name: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedColabFilter, setSelectedColabFilter] = useState<string>('');
  const [minValueFilter, setMinValueFilter] = useState<number | ''>('');
  const [maxValueFilter, setMaxValueFilter] = useState<number | ''>('');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncIxc = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/integrations/ixc/sync', {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        toastSuccess('Sincronização IXC', data.message || 'Sincronização realizada com sucesso.');
        await fetchLeads();
      } else {
        toastError('Erro na Sincronização', data.error || 'Não foi possível sincronizar com o IXC.');
      }
    } catch (error) {
      console.error('Error syncing with IXC:', error);
      toastError('Erro de Conexão', 'Não foi possível conectar à API de sincronização do IXC.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteLead = (id: number) => {
    const targetLead = leads.find(l => l.id === id);
    const leadName = targetLead?.name || `ID ${id}`;
    setConfirmDelete({ isOpen: true, id, name: leadName });
  };

  const executeDeleteLead = async () => {
    if (!confirmDelete) return;
    const { id, name: leadName } = confirmDelete;
    setConfirmDelete(null);
    try {
      if (isSupabaseConfigured()) {
        const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Falha ao excluir no banco de dados.');
        }
      }
      await logAuditEvent('Exclusão de Lead', `Lead "${leadName}" (ID: ${id}) foi excluído do sistema.`);
      setLeads(prev => prev.filter(l => l.id !== id));
      setSelectedLead(null);
      toastSuccess('Lead Excluído', `O lead "${leadName}" foi removido com sucesso.`);
    } catch (err: any) {
      console.error("Erro ao excluir lead:", err);
      toastError('Erro ao Excluir', err.message || 'Falha ao excluir o lead. Verifique suas permissões.');
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Nome do Lead', 'Contato', 'Origem (Ref)', 'Canal', 'Status', 'Valor (R$)', 'Ultima Interacao'];
    const rows = filteredLeads.map(l => [
      sanitizeCsvField(l.id),
      sanitizeCsvField(l.name),
      sanitizeCsvField(l.phone),
      sanitizeCsvField(l.ref),
      sanitizeCsvField(l.source || 'manual'),
      sanitizeCsvField(l.status),
      sanitizeCsvField(l.value || 0),
      sanitizeCsvField(l.history[0]?.date || 'Novo')
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
    URL.revokeObjectURL(url);
  };

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema)
  });

  const selectedRef = watch('ref');

  useEffect(() => {
    // Só reinicializa o form ao ABRIR em modo criação; em edição o preenchimento
    // é feito pelo openEditModal para não apagar os valores pré-carregados.
    if (isModalOpen && !editingLead) {
      const cookieRef = getReferralCookie();
      reset({
        name: '',
        phone: '',
        value: '',
        ref: cookieRef || 'Manual',
        customRef: ''
      });
    }
  }, [isModalOpen, editingLead, reset]);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{
    type: 'qualify' | 'generate-message';
    qualification?: string;
    reason?: string;
    nextSteps?: string;
    message?: string;
  } | null>(null);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  const handleSaveNote = async () => {
    if (!selectedLead || !noteText.trim()) return;
    setIsSavingNote(true);
    try {
      const nowStr = new Date().toLocaleString('pt-BR').substring(0, 16);
      const historyEntry: LeadHistory = {
        id: Date.now(),
        lead_id: selectedLead.id,
        date: nowStr,
        action: 'Nota registrada',
        note: noteText.trim(),
      };

      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('lead_history').insert([{
          lead_id: selectedLead.id,
          date: nowStr,
          action: 'Nota registrada',
          note: noteText.trim(),
        }]);
        if (error) throw error;
      }

      setSelectedLead(prev => prev ? { ...prev, history: [historyEntry, ...(prev.history || [])] } : prev);
      setLeads(prev => prev.map(l => l.id === selectedLead.id ? { ...l, history: [historyEntry, ...(l.history || [])] } : l));
      setNoteText('');
      toastSuccess('Nota salva', 'Interação registrada no histórico do lead.');
    } catch (err: any) {
      console.error('Erro ao salvar nota:', err);
      toastError('Erro ao Salvar Nota', err?.message || 'Não foi possível registrar a nota.');
    } finally {
      setIsSavingNote(false);
    }
  };

  // AI results are now cleared inside the custom selectLead handler to avoid synchronous useEffect state updates.

  // Monta payload seguro para a IA: remove campos nulos/indefinidos que o backend rejeita
  const buildAiLeadPayload = (lead: UILead) => ({
    name: lead.name || 'Cliente',
    status: lead.status || 'Pendente',
    value: typeof lead.value === 'number' ? lead.value : 0,
    history: (lead.history || []).map(h => ({
      date: h.date ?? undefined,
      action: h.action ?? undefined,
      note: h.note ?? undefined,
    })),
  });

  const handleAIQualify = async () => {
    if (!selectedLead) return;
    setIsAiLoading(true);
    setAiResult(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'qualify', lead: buildAiLeadPayload(selectedLead) }),
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
        toastError('Erro na análise IA', data.error || 'Não foi possível qualificar o lead. Tente novamente.');
      }
    } catch (err) {
      console.error('AI Request failed:', err);
      toastError('Erro de conexão', 'Não foi possível conectar à IA. Verifique sua conexão.');
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
        body: JSON.stringify({ action: 'generate-message', lead: buildAiLeadPayload(selectedLead) }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setAiResult({
          type: 'generate-message',
          message: data.message,
        });
      } else {
        console.error('AI Error:', data.error);
        toastError('Erro na IA', data.error || 'Não foi possível gerar a mensagem. Tente novamente.');
      }
    } catch (err) {
      console.error('AI Request failed:', err);
      toastError('Erro de conexão', 'Não foi possível conectar à IA. Verifique sua conexão.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const fetchLeads = useCallback(async () => {
    try {
      setIsLoading(true);
      if (isSupabaseConfigured()) {
        // Carrega TODOS os leads para busca, filtros e exportação operarem no dataset completo.
        // (No dataset atual, a paginação é feita no cliente.)
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false });

        if (leadsError) throw leadsError;

        if (leadsData && leadsData.length > 0) {
          const leadIds = leadsData.map(l => l.id);
          const { data: historyData, error: historyError } = await supabase
            .from('lead_history')
            .select('*')
            .in('lead_id', leadIds)
            .order('created_at', { ascending: false });

          if (historyError) console.error("Error fetching lead history:", historyError);

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
      toastError('Erro no Carregamento', 'Falha ao buscar a lista de leads do banco.');
      setLeads(isSupabaseConfigured() ? [] : initialLeads);
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  const fetchColaboradores = async () => {
    try {
      const map = new Map<string, { id: string; name: string }>();

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.from('colaboradores').select('id, name');
        if (!error && data) {
          data.forEach(c => {
            map.set(c.id, { id: c.id, name: c.name });
          });
        }
      } else {
        initialColaboradores.forEach(c => {
          map.set(c.id, { id: c.id, name: c.name });
        });
      }

      setColaboradores(Array.from(map.values()));
    } catch (err) {
      console.error("Error fetching contributors in leads view:", err);
    }
  };

  useEffect(() => {
    fetchLeads();
    fetchColaboradores();

    if (isSupabaseConfigured()) {
      const colabChannel = supabase
        .channel('leads_colaboradores_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, () => {
          fetchColaboradores();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(colabChannel);
      };
    }
  }, [fetchLeads]);

  const statuses = ['Pendente', 'Contato inicial', 'Em negociação', 'Errado', 'Ganho'];

  const handleAdd = async (data: LeadFormData) => {
    let referral = data.ref || getReferralCookie() || 'Manual';
    if (referral === 'Outro' && data.customRef && data.customRef.trim() !== '') {
      referral = data.customRef.trim();
    }

    // Normaliza o telefone para dígitos, igual ao fluxo da API pública de indicações,
    // para que a deduplicação por phone funcione entre canais.
    const phoneDigits = normalizePhoneDigits(data.phone);
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      toastError('Telefone inválido', 'Informe um telefone com DDD válido (mínimo 10 dígitos).');
      return;
    }

    const newLeadData = {
      name: data.name,
      phone: phoneDigits,
      ref: referral,
      status: 'Pendente',
      value: data.value ? parseFloat(data.value) : 0
    };

    try {
       if (isSupabaseConfigured()) {
         const { data: inserted, error } = await supabase.from('leads').insert([newLeadData]).select();
         if (error) throw error;
         if (inserted && inserted[0]) {
           const historyData = { lead_id: inserted[0].id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Lead criado manualmente', note: null };
           await supabase.from('lead_history').insert([historyData]);
           setLeads(prev => [{ ...inserted[0], history: [{...historyData, id: -Date.now()}] }, ...prev]);
         }
       } else {
         setLeads(prev => {
           const newId = prev.length > 0 ? Math.max(...prev.map(l => l.id)) + 1 : 1;
           return [{
             ...newLeadData,
             id: newId,
             created_at: new Date().toISOString(),
             history: [{ id: -Date.now(), lead_id: newId, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Lead criado manualmente', note: null }]
           }, ...prev];
         });
       }

       toastSuccess('Lead Cadastrado!', `O lead "${newLeadData.name}" foi adicionado com sucesso.`);

       fetch('/api/integrations/ixc/prospect', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ name: newLeadData.name, phone: newLeadData.phone, ref: newLeadData.ref })
       }).catch(err => console.error('Failed to send prospect to IXC:', err));
    } catch (error) {
      console.error("Error creating lead", error);
      toastError('Erro ao Cadastrar', 'Não foi possível cadastrar o lead. Tente novamente.');
    }

    closeModal();
  }

  const handleEditSubmit = async (data: LeadFormData) => {
    if (!editingLead) return;

    const phoneDigits = normalizePhoneDigits(data.phone);
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      toastError('Telefone inválido', 'Informe um telefone com DDD válido (mínimo 10 dígitos).');
      return;
    }

    const updatedFields = {
      name: data.name,
      phone: phoneDigits,
      value: data.value ? parseFloat(data.value) : 0,
    };

    const nowStr = new Date().toLocaleString('pt-BR').substring(0, 16);
    const historyEntry: LeadHistory = {
      id: -Date.now(),
      lead_id: editingLead.id,
      date: nowStr,
      action: 'Dados atualizados',
      note: 'Nome, telefone e/ou valor revisados manualmente.',
    };

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('leads').update(updatedFields).eq('id', editingLead.id);
        if (error) throw error;

        const { error: historyError } = await supabase.from('lead_history').insert([{
          lead_id: editingLead.id,
          date: nowStr,
          action: historyEntry.action,
          note: historyEntry.note,
        }]);
        if (historyError) console.error('Erro ao registrar histórico de atualização:', historyError);
      }

      setLeads(prev => prev.map(l => l.id === editingLead.id ? {
        ...l,
        ...updatedFields,
        history: [historyEntry, ...(l.history || [])],
      } : l));
      setSelectedLead(prev => prev && prev.id === editingLead.id ? {
        ...prev,
        ...updatedFields,
        history: [historyEntry, ...(prev.history || [])],
      } : prev);

      toastSuccess('Lead atualizado!', `Os dados de "${data.name}" foram salvos com sucesso.`);
      closeModal();
    } catch (err: any) {
      console.error('Erro ao atualizar lead:', err);
      toastError('Erro ao Atualizar', err?.message || 'Não foi possível salvar as alterações do lead.');
    }
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
      if (isSupabaseConfigured()) {
         const { error: updateError } = await supabase.from('leads').update({ status }).eq('id', id);
         if (updateError) throw updateError;
         const historyData = { lead_id: id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: `Movido para ${status}`, note: null };
         const { error: historyError } = await supabase.from('lead_history').insert([historyData]);
         if (historyError) console.error('Erro ao registrar histórico de movimentação:', historyError);
      }
      setLeads(prev => prev.map(l => l.id === id ? {
        ...l,
        status,
        history: [{ id: -Date.now(), lead_id: id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: `Movido para ${status}`, note: null }, ...l.history]
      } : l));

      toastInfo('Status Atualizado', `Lead "${currentLead.name}" movido para "${status}".`);
    } catch(err) {
      console.error("Error updating lead status", err);
      toastError('Erro na Atualização', 'Não foi possível alterar o status do lead.');
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

  const uniqueRefs = useMemo(
    () => Array.from(new Set(leads.map(l => l.ref).filter(Boolean))),
    [leads]
  );
  
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedColabFilter) count++;
    if (minValueFilter !== '') count++;
    if (maxValueFilter !== '') count++;
    if (dateFilter !== 'all') count++;
    return count;
  }, [selectedColabFilter, minValueFilter, maxValueFilter, dateFilter]);

  const now = useMemo(() => new Date(), []);

  const filteredLeads = useMemo(() => leads.filter(l => {
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
        // Sem data cadastrada: mantém o lead visível (não esconde dados)
        matchesDate = true;
      } else {
        const d = new Date(l.created_at);
        const currentDate = new Date();
        if (dateFilter === 'this_month') {
          matchesDate = d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
        } else if (dateFilter === 'last_month') {
          const lastMonth = currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
          const lastYear = currentDate.getMonth() === 0 ? currentDate.getFullYear() - 1 : currentDate.getFullYear();
          matchesDate = d.getMonth() === lastMonth && d.getFullYear() === lastYear;
        } else if (dateFilter === 'this_year') {
          matchesDate = d.getFullYear() === currentDate.getFullYear();
        }
      }
    }

    return matchesSearch && matchesColab && matchesMinVal && matchesMaxVal && matchesDate;
  }), [leads, searchQuery, selectedColabFilter, minValueFilter, maxValueFilter, dateFilter]);

  // Paginação no cliente: o scroll/lista mostra apenas a página atual do dataset filtrado
  const pageLeads = useMemo(
    () => filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredLeads, currentPage, pageSize]
  );
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));

  // Ao mudar filtros/busca, volta para a primeira página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedColabFilter, minValueFilter, maxValueFilter, dateFilter]);

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

      {isLoading ? (
        <LeadsSkeleton viewMode={viewMode} />
      ) : viewMode === 'list' ? (
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
                {pageLeads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 rounded-full bg-gray-50 dark:bg-zinc-800 flex items-center justify-center mb-4 border-2 border-dashed border-gray-200 dark:border-gray-700">
                          <Inbox className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                        </div>
                        <h4 className="text-brand-charcoal dark:text-white font-bold mb-1">Nenhum lead encontrado</h4>
                        <p className="text-brand-muted dark:text-gray-400 text-sm max-w-[250px]">Você ainda não possui leads cadastrados no seu funil de vendas.</p>
                        <button onClick={openCreateModal} className="mt-6 px-6 py-2.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 text-brand-charcoal dark:text-white font-bold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 shadow-sm">
                          <Plus className="w-4 h-4" />
                          Novo Lead
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : pageLeads.map(lead => (
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
                            openEditModal(lead);
                          }}
                          aria-label={`Editar lead ${lead.name}`}
                          className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/50 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition-colors"
                          title="Editar Lead"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLead(lead.id);
                          }}
                          aria-label={`Excluir lead ${lead.name}`}
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
                                openEditModal(lead);
                              }}
                              aria-label={`Editar lead ${lead.name}`}
                              className="p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded transition-colors"
                              title="Editar Lead"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteLead(lead.id);
                              }}
                              aria-label={`Excluir lead ${lead.name}`}
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
                            Indicador {(lead.ref || 'Não especificado').toUpperCase()}
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

      {/* Pagination Bar (aplicável apenas à visão em lista) */}
      {viewMode === 'list' && (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 border-t border-brand-border dark:border-gray-800 text-sm mt-2">
        <div className="text-gray-500 dark:text-gray-400 text-xs font-medium">
          Mostrando <span className="font-bold text-brand-charcoal dark:text-white">{pageLeads.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> a <span className="font-bold text-brand-charcoal dark:text-white">{pageLeads.length > 0 ? (currentPage - 1) * pageSize + pageLeads.length : 0}</span> de <span className="font-bold text-brand-charcoal dark:text-white">{filteredLeads.length}</span> leads
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || isLoading}
            className="flex items-center gap-1 px-3.5 py-1.5 border border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 text-brand-charcoal dark:text-gray-200 rounded-xl font-medium text-xs hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>
          <span className="px-3.5 py-1.5 bg-gray-100 dark:bg-zinc-800 rounded-xl text-xs font-bold text-brand-charcoal dark:text-gray-200 border border-brand-border dark:border-gray-700">
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(prev => prev + 1)}
            disabled={currentPage >= totalPages || isLoading}
            className="flex items-center gap-1 px-3.5 py-1.5 border border-brand-border dark:border-gray-700 bg-white dark:bg-zinc-800 text-brand-charcoal dark:text-gray-200 rounded-xl font-medium text-xs hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Próximo
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      )}

      {/* Floating Action Button for New Lead (bottom right) */}
      <button
        onClick={openCreateModal}
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
        <div className="fixed inset-0 bg-brand-charcoal/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border dark:border-gray-800 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h3 className="font-display font-bold text-2xl text-brand-charcoal dark:text-white">{editingLead ? 'Editar Lead' : 'Novo Lead'}</h3>
                <p className="text-xs text-brand-muted dark:text-gray-400 mt-0.5">{editingLead ? `Atualizando os dados de "${editingLead.name}"` : 'Cadastre um novo cliente no sistema'}</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-brand-muted dark:text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit(editingLead ? handleEditSubmit : handleAdd)} className="space-y-4 overflow-y-auto pr-1 pb-2">
              {/* Campo 1: Nome do Cliente */}
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Nome do Cliente <span className="text-red-500">*</span>
                </label>
                <input 
                  autoFocus 
                  {...register('name')} 
                  type="text" 
                  placeholder="Digite o nome completo do cliente (Ex: João da Silva)" 
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                    errors.name 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow/30'
                  }`} 
                />
                {errors.name ? (
                  <p className="text-red-500 text-xs mt-1 font-medium">{errors.name.message}</p>
                ) : (
                  <p className="text-gray-400 text-xs mt-1">Este é o nome do cliente que aparecerá no sistema.</p>
                )}
              </div>

              {/* Campo 2: Telefone */}
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Telefone / WhatsApp <span className="text-red-500">*</span>
                </label>
                <input 
                  {...register('phone')} 
                  type="tel" 
                  placeholder="(91) 98000-0000" 
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                    errors.phone 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow/30'
                  }`} 
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.phone.message}</p>}
              </div>

              {/* Campo 3: Valor */}
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Valor da Venda (R$)
                </label>
                <input 
                  {...register('value')} 
                  type="number"
                  step="0.01" 
                  placeholder="Ex: 99.90" 
                  className={`w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border rounded-xl text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                    errors.value 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow/30'
                  }`} 
                />
                {errors.value && <p className="text-red-500 text-xs mt-1 font-medium">{errors.value.message}</p>}
              </div>

              {/* Campo 4: Técnico / Indicador (Origem) */}
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Técnico / Indicador (Origem da Venda)
                </label>
                <select
                  {...register('ref')}
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-brand-yellow focus:ring-brand-yellow/30 transition-all text-brand-charcoal dark:text-white cursor-pointer"
                >
                  <option value="Manual">Nenhum (Venda Manual)</option>
                  <option value="Orgânico">Orgânico (Pesquisa do Cliente)</option>
                  <option value="Outro">✏️ Outro (Digitar Nome da Indicação Manualmente)</option>
                  {colaboradores.length > 0 && (
                    <optgroup label="--- Técnicos e Colaboradores Cadastrados ---">
                      {colaboradores.map(c => (
                        <option key={c.id} value={c.name}>{c.name} ({c.id})</option>
                      ))}
                    </optgroup>
                  )}
                </select>

                {/* Campo condicional para digitação manual de quem indicou */}
                {selectedRef === 'Outro' && (
                  <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-150 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <label className="block text-xs font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                      Nome de Quem Indicou <span className="text-red-500">*</span>
                    </label>
                    <input 
                      {...register('customRef')} 
                      type="text" 
                      placeholder="Digite o nome da pessoa ou cliente que indicou..." 
                      className={`w-full px-3.5 py-2.5 bg-white dark:bg-zinc-800 border rounded-lg text-sm text-brand-charcoal dark:text-white dark:placeholder-gray-500 focus:outline-none focus:ring-2 transition-all ${
                        errors.customRef 
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                          : 'border-brand-border dark:border-gray-700 focus:border-brand-yellow focus:ring-brand-yellow/30'
                      }`} 
                    />
                    {errors.customRef ? (
                      <p className="text-red-500 text-xs mt-1 font-medium">{errors.customRef.message}</p>
                    ) : (
                      <p className="text-gray-400 text-xs mt-1">Este nome ficará registrado como o indicador do lead.</p>
                    )}
                  </div>
                )}

                <p className="text-gray-400 text-xs mt-1">Selecione o técnico, indicação manual ou origem da venda.</p>
              </div>

              <button type="submit" className="w-full py-3.5 bg-brand-yellow hover:bg-brand-yellow/90 text-brand-charcoal font-bold rounded-xl mt-6 hover:shadow-level-2 hover:scale-[1.01] active:scale-95 transition-all cursor-pointer">
                {editingLead ? 'Salvar Altera��es' : 'Adicionar Lead'}
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
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-1 rounded-full">
                      {selectedLead.source === 'ms_forms' ? 'MS Forms' : selectedLead.source === 'landing' ? 'Landing' : 'Manual'}
                    </span>
                    {selectedLead.history && selectedLead.history.filter(h => h.action && h.action.includes('MS Forms detectado e ignorado')).length > 0 && (
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-3 py-1 rounded-full">
                        Duplicata ignorada ({selectedLead.history.filter(h => h.action && h.action.includes('MS Forms detectado e ignorado')).length}x)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(selectedLead)}
                  aria-label={`Editar lead ${selectedLead.name}`}
                  className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full transition-colors shrink-0 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 shadow-sm"
                  title="Editar Lead"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteLead(selectedLead.id)}
                  aria-label={`Excluir lead ${selectedLead.name}`}
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
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Descreva a nova interação com o lead..." 
                  className="w-full bg-gray-50 dark:bg-[#27272a]/50 border border-brand-border dark:border-gray-800 rounded-2xl p-4 text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow resize-none h-28 transition-all dark:text-white dark:placeholder-gray-500"
                ></textarea>
                <button
                  onClick={handleSaveNote}
                  disabled={isSavingNote || !noteText.trim()}
                  className="w-full mt-3 py-3.5 bg-brand-charcoal dark:bg-brand-yellow dark:text-brand-charcoal text-white font-bold text-sm rounded-xl hover:bg-black dark:hover:bg-yellow-400 hover:shadow-level-2 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingNote ? 'Salvando...' : 'Salvar Nota'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal de confirmação de exclusão de lead */}
      {confirmDelete && (
        <ConfirmModal
          isOpen={confirmDelete.isOpen}
          title="Excluir Lead"
          message={`Tem certeza que deseja excluir o lead "${confirmDelete.name}"? Essa ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          icon="trash"
          onConfirm={executeDeleteLead}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
