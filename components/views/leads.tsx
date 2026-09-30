import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Search, Plus, X, LayoutGrid, List, MessageSquare, Clock, Calendar, Phone, ChevronRight, ChevronLeft, GripVertical, Inbox, Sparkles, ShieldAlert, Loader2, Copy, RefreshCw, Trash2, Edit2, AlertTriangle } from 'lucide-react';
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
import { DateFilterState, matchesDateFilter } from '@/lib/date-filters';
import { PostSaleCollectionDialog } from '@/components/views/post-sale-collection-dialog';
import { PostSalePanel } from '@/components/views/post-sale-panel';

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
  const [activeSection, setActiveSection] = useState<'leads' | 'post-sale'>('leads');
  const [isPostSaleCollectionOpen, setIsPostSaleCollectionOpen] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [selectedLead, setSelectedLead] = useState<UILead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<UILead | null>(null);

  // Em telas estreitas, a lista evita cortar colunas do funil. O modo escolhido
  // pelo usuário permanece salvo ao redimensionar em telas maiores.
  useEffect(() => {
    const checkMobile = () => {
      setIsCompactLayout(window.innerWidth < 1100);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const displayViewMode = isCompactLayout ? 'list' : viewMode;

  // Estado do modal de confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: number; name: string } | null>(null);

  // Fecha modais/painéis com a tecla Escape (o modal de confirmação trata o próprio Escape)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Não fechar outros modais/painéis enquanto o ConfirmModal de exclusão estiver aberto
      if (confirmDelete?.isOpen) return;
      if (isModalOpen) {
        setIsModalOpen(false);
        setEditingLead(null);
      } else if (selectedLead) selectLead(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen, selectedLead, confirmDelete]);

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
  const [dateFilter, setDateFilter] = useState('all');
  const [specificMonth, setSpecificMonth] = useState(new Date().getMonth());
  const [specificYear, setSpecificYear] = useState(new Date().getFullYear());
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [lossReasonModalLead, setLossReasonModalLead] = useState<{ id: number; name: string } | null>(null);
  const [selectedLossReason, setSelectedLossReason] = useState<string>('Sem viabilidade técnica');
  const [customLossReason, setCustomLossReason] = useState<string>('');

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
  }, [selectedColabFilter, minValueFilter, maxValueFilter, dateFilter, customStartDate, customEndDate]);

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
      const filterState: DateFilterState = {
        period: dateFilter as any,
        month: specificMonth,
        year: specificYear,
        startDate: customStartDate || undefined,
        endDate: customEndDate || undefined,
      };
      matchesDate = matchesDateFilter(l.created_at, filterState);
    }

    return matchesSearch && matchesColab && matchesMinVal && matchesMaxVal && matchesDate;
  }), [leads, searchQuery, selectedColabFilter, minValueFilter, maxValueFilter, dateFilter, specificMonth, specificYear, customStartDate, customEndDate]);

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
        const apiRes = await fetch('/api/leads', { cache: 'no-store' });
        const apiData = await apiRes.json();
        if (!apiRes.ok || !apiData.success || !Array.isArray(apiData.leads)) {
          throw new Error(apiData.error || 'Não foi possível carregar os leads autorizados.');
        }
        // Uma lista vazia autorizada é resultado válido; nunca buscar todos os leads no browser.
        setLeads(apiData.leads);
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
        if (!error && data && data.length > 0) {
          data.forEach(c => {
            map.set(c.id, { id: c.id, name: c.name });
          });
        } else {
          // Fallback via API server-side
          try {
            const apiRes = await fetch('/api/colaboradores');
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.success && Array.isArray(apiData.colaboradores)) {
                apiData.colaboradores.forEach((c: any) => {
                  map.set(c.id, { id: c.id, name: c.name });
                });
              }
            }
          } catch (apiErr) {
            console.warn('Erro no fallback de colaboradores:', apiErr);
          }
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
      value: data.value ? parseFloat(data.value) : 0,
      source: 'manual',
      created_at: new Date().toISOString()
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

       closeModal();
     } catch (error: any) {
       console.error("Error creating lead", error);
       if (error?.code === '23505' || error?.message?.includes('unique') || error?.message?.includes('idx_leads_phone')) {
         toastError('Telefone Duplicado', 'Este número de telefone já está cadastrado para outro lead no sistema.');
       } else {
         toastError('Erro ao Cadastrar', 'Não foi possível cadastrar o lead. Tente novamente.');
       }
     }
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
      ref: data.ref === 'Outro'
        ? (data.customRef?.trim() || editingLead.ref || 'Manual')
        : (data.ref || editingLead.ref || 'Manual'),
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
      if (err?.code === '23505' || err?.message?.includes('unique') || err?.message?.includes('idx_leads_phone')) {
        toastError('Telefone Duplicado', 'Este número de telefone já está cadastrado para outro lead no sistema.');
      } else {
        toastError('Erro ao Atualizar', err?.message || 'Não foi possível salvar as alterações do lead.');
      }
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

    if (status === 'Errado') {
      setLossReasonModalLead({ id, name: currentLead.name });
      return;
    }

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

  const handleConfirmLossReason = async (reasonToUse?: string) => {
    if (!lossReasonModalLead) return;
    const { id, name: leadName } = lossReasonModalLead;
    const finalReason = reasonToUse || (selectedLossReason === 'Outro' ? (customLossReason.trim() || 'Outro motivo') : selectedLossReason);

    try {
      if (isSupabaseConfigured()) {
        const { error: updateError } = await supabase.from('leads').update({
          status: 'Errado',
          loss_reason: finalReason
        }).eq('id', id);
        if (updateError) throw updateError;

        const historyData = {
          lead_id: id,
          date: new Date().toLocaleString('pt-BR').substring(0, 16),
          action: 'Marcado como Errado / Descartado',
          note: `Motivo: ${finalReason}`
        };
        await supabase.from('lead_history').insert([historyData]);
      }

      setLeads(prev => prev.map(l => l.id === id ? {
        ...l,
        status: 'Errado',
        loss_reason: finalReason,
        history: [{ id: -Date.now(), lead_id: id, date: new Date().toLocaleString('pt-BR').substring(0, 16), action: 'Marcado como Errado', note: `Motivo: ${finalReason}` }, ...l.history]
      } : l));

      toastInfo('Lead Descartado', `Lead "${leadName}" marcado como Errado (${finalReason}).`);
    } catch (err: any) {
      console.error('Erro ao marcar lead como errado:', err);
      toastError('Erro na Atualização', err?.message || 'Falha ao registrar motivo.');
    } finally {
      setLossReasonModalLead(null);
      setCustomLossReason('');
      setSelectedLossReason('Sem viabilidade técnica');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Contato inicial': return 'gd-status gd-status--contact';
      case 'Em negociação': return 'gd-status gd-status--negotiation';
      case 'Errado': return 'gd-status gd-status--lost';
      case 'Ganho': return 'gd-status gd-status--won';
      default: return 'gd-status gd-status--pending';
    }
  };

  const getStatusCircleColor = (status: string) => {
    switch(status) {
      case 'Contato inicial': return 'gd-status-ring--contact';
      case 'Em negociação': return 'gd-status-ring--negotiation';
      case 'Errado': return 'gd-status-ring--lost';
      case 'Ganho': return 'gd-status-ring--won';
      default: return 'gd-status-ring--pending';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch(status) {
      case 'Ganho': return 'gd-status gd-status--won';
      case 'Errado': return 'gd-status gd-status--lost';
      case 'Contato inicial': return 'gd-status gd-status--contact';
      case 'Em negociação': return 'gd-status gd-status--negotiation';
      default: return 'gd-status gd-status--pending';
    }
  };


  // Paginação no cliente: o scroll/lista mostra apenas a página atual do dataset filtrado
  const pageLeads = useMemo(
    () => filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredLeads, currentPage, pageSize]
  );
  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));

  // Ao mudar filtros/busca, volta para a primeira página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedColabFilter, minValueFilter, maxValueFilter, dateFilter, specificMonth, specificYear, customStartDate, customEndDate]);

  // Se a lista filtrada encolher (ex.: exclusões/refetch), evita página órfã além de totalPages
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(1);
  }, [currentPage, totalPages]);

  // Deriva o lead exibido na sidebar a partir da lista atual, evitando dados obsoletos após edições/refetch
  const currentLead = selectedLead ? leads.find(l => l.id === selectedLead.id) || selectedLead : null;

  return (
    <div className="workspace-page leads-page relative flex w-full max-w-full flex-col gap-5 pb-20 animate-in fade-in duration-300">
      <div className="workspace-page-heading shrink-0">
        <div>
          <p className="workspace-eyebrow">Marketing de indicações</p>
          <h2 className="workspace-title mt-1">{activeSection === 'post-sale' ? 'Indicadores de pós-venda' : 'Acompanhamento de leads'}</h2>
          <p className="workspace-description">{activeSection === 'post-sale' ? 'Registre as indicações coletadas e acompanhe as conversões por responsável.' : 'Organize o funil, acompanhe contatos e avance oportunidades.'}</p>
        </div>
        {activeSection === 'leads' && <button type="button" onClick={openCreateModal} className="gd-button gd-button--primary shrink-0">
          <Plus className="h-4 w-4" />
          Novo lead
        </button>}
      </div>

      <div className="workspace-toolbar shrink-0 flex-wrap">
        <div className="flex gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveSection('leads')}
            className={`px-5 py-3 font-bold text-sm transition-all border-b-2 -mb-[9px] ${
              activeSection === 'leads'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-brand-muted hover:text-brand-charcoal dark:hover:text-gray-200'
            }`}
          >
            Leads
          </button>
          <button
            onClick={() => setActiveSection('post-sale')}
            className={`px-5 py-3 font-bold text-sm transition-all border-b-2 -mb-[9px] ${
              activeSection === 'post-sale'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-brand-muted hover:text-brand-charcoal dark:hover:text-gray-200'
            }`}
          >
            Pós-venda
          </button>
        </div>

        {activeSection === 'leads' ? (
          <>
          <div className="workspace-view-switch">
          <button 
            type="button"
            onClick={() => setViewMode('kanban')} 
            disabled={isCompactLayout}
            aria-pressed={displayViewMode === 'kanban'}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
              displayViewMode === 'kanban'
                ? 'bg-[var(--app-panel)] text-[var(--app-ink)] shadow-sm'
                : 'text-brand-muted hover:text-brand-charcoal dark:hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-45'
            }`}
          >
            Kanban
          </button>
          <button 
            type="button"
            onClick={() => setViewMode('list')} 
            aria-pressed={displayViewMode === 'list'}
            className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-all ${
              displayViewMode === 'list'
                ? 'bg-[var(--app-panel)] text-[var(--app-ink)] shadow-sm'
                : 'text-brand-muted hover:text-brand-charcoal dark:hover:text-gray-200'
            }`}
          >
            Lista
          </button>
        </div>
        
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2.5">
          <div className="relative text-brand-muted focus-within:text-brand-charcoal transition-colors">
            <input 
              type="text" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Busque pelo nome do lead" 
              className="workspace-control w-full min-w-[180px] py-2 pl-4 pr-10 text-sm sm:w-60"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          
          <div className="relative">
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                isFilterOpen || activeFiltersCount > 0 
                  ? 'border-amber-300 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'border-[var(--app-border)] bg-[var(--app-panel)] text-[var(--app-ink)] hover:bg-[var(--app-panel-muted)]'
              }`}
            >
              Filtros
              {activeFiltersCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-yellow text-[10px] font-bold text-brand-charcoal">
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
                        setSpecificMonth(new Date().getMonth());
                        setSpecificYear(new Date().getFullYear());
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                      className="text-xs text-red-500 hover:text-red-600 font-bold"
                    >
                      Limpar
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label htmlFor="lead-date-filter" className="block text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wide">
                    Período
                  </label>
                  <select
                    id="lead-date-filter"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                  >
                    <option value="all">Todo o Período</option>
                    <option value="this_month">Este Mês</option>
                    <option value="last_month">Mês Passado</option>
                    <option value="last_30_days">Últimos 30 Dias</option>
                    <option value="this_year">Este Ano</option>
                    <option value="specific_month">Mês Específico</option>
                    <option value="custom">Intervalo Personalizado</option>
                  </select>
                  {dateFilter === 'custom' && (
                    <div className="flex flex-col gap-2 mt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 w-10">De:</span>
                          <input
                            aria-label="Data inicial do filtro"
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-xs text-brand-charcoal dark:text-white focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-400 w-10">Até:</span>
                          <input
                            aria-label="Data final do filtro"
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="flex-1 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-xs text-brand-charcoal dark:text-white focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                  {dateFilter === 'specific_month' && (
                    <div className="flex items-center gap-2 mt-2">
                       <select
                         aria-label="Mês específico do filtro"
                        value={specificMonth}
                        onChange={(e) => setSpecificMonth(Number(e.target.value))}
                        className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                      >
                        <option value={0}>Janeiro</option>
                        <option value={1}>Fevereiro</option>
                        <option value={2}>Março</option>
                        <option value={3}>Abril</option>
                        <option value={4}>Maio</option>
                        <option value={5}>Junho</option>
                        <option value={6}>Julho</option>
                        <option value={7}>Agosto</option>
                        <option value={8}>Setembro</option>
                        <option value={9}>Outubro</option>
                        <option value={10}>Novembro</option>
                        <option value={11}>Dezembro</option>
                      </select>
                       <select
                         aria-label="Ano específico do filtro"
                        value={specificYear}
                        onChange={(e) => setSpecificYear(Number(e.target.value))}
                        className="w-24 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                      >
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                          <option key={year} value={year}>{year}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label htmlFor="lead-origin-filter" className="block text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wide">
                    Origem / Indicador
                  </label>
                  <select
                    id="lead-origin-filter"
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
                  <span className="block text-xs font-bold text-brand-muted dark:text-gray-400 uppercase tracking-wide">
                    Valor da Venda (R$)
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      aria-label="Valor mínimo da venda"
                      type="number"
                      placeholder="Mín"
                      value={minValueFilter}
                      onChange={(e) => setMinValueFilter(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-brand-charcoal dark:text-white"
                    />
                    <span className="text-gray-300 dark:text-gray-600 text-xs">até</span>
                    <input
                      aria-label="Valor máximo da venda"
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
            type="button"
            onClick={handleSyncIxc}
            disabled={isSyncing}
            className="gd-button gd-button--secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando' : 'Sincronizar'}
          </button>

          <button 
            type="button"
            onClick={handleExportCSV}
            className="gd-button gd-button--secondary"
          >
            Exportar
          </button>
          </div>
          </>
        ) : (
          <div className="flex items-center gap-3 self-end md:self-auto">
            <button
              onClick={() => setIsPostSaleCollectionOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-brand-charcoal dark:bg-brand-yellow text-white dark:text-brand-charcoal hover:bg-black dark:hover:bg-yellow-400 font-bold text-sm rounded-xl transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Registrar coleta
            </button>
          </div>
        )}
      </div>

      {activeSection === 'post-sale' ? (
        <PostSalePanel onRequestCollection={() => setIsPostSaleCollectionOpen(true)} />
      ) : isLoading ? (
        <LeadsSkeleton viewMode={displayViewMode} />
      ) : displayViewMode === 'list' ? (
        <div className="workspace-panel flex shrink-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-col justify-between gap-2 border-b border-[var(--app-border)] px-5 py-4 sm:flex-row sm:items-center sm:px-6">
            <h3 className="font-display text-lg font-bold tracking-tight text-brand-charcoal dark:text-white">Todos os Leads</h3>
            <span className="text-sm text-[var(--app-muted)]">{filteredLeads.length} {filteredLeads.length === 1 ? 'registro' : 'registros'}</span>
          </div>
          <div className="leads-mobile-list">
            {pageLeads.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-panel-muted)] px-5 py-10 text-center">
                <Inbox className="mb-3 h-7 w-7 text-[var(--app-muted)]" />
                <h4 className="font-semibold text-[var(--app-ink)]">Nenhum lead encontrado</h4>
                <p className="mt-1 max-w-[260px] text-sm text-[var(--app-muted)]">Ajuste os filtros ou cadastre um novo lead.</p>
              </div>
            ) : pageLeads.map(lead => (
              <article key={lead.id} className="rounded-xl border border-[var(--app-border)] bg-[var(--app-panel)] p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <Avatar size={36} name={lead.name} variant="beam" colors={['#d6bb00', '#59677a', '#a5adb5', '#2f7265', '#7d8792']} />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => selectLead(lead)}
                      className="break-words text-left text-sm font-bold leading-snug text-[var(--app-ink)] hover:underline"
                      aria-label={`Abrir detalhes do lead ${lead.name}`}
                    >
                      {lead.name}
                    </button>
                    <p className="mt-1 whitespace-nowrap text-xs text-[var(--app-muted)]">{lead.phone}</p>
                  </div>
                  <span className={`max-w-[116px] whitespace-normal rounded-full border px-2.5 py-1 text-center text-[10px] font-semibold leading-tight ${getStatusColor(lead.status)}`}>
                    {lead.status}
                  </span>
                </div>

                <div className="mt-3 border-t border-[var(--app-border)] pt-3">
                  <p className="text-[10px] font-semibold text-[var(--app-muted)]">Origem da indicação</p>
                  <p className="mt-0.5 break-words text-xs font-medium text-[var(--app-ink)]">{lead.ref || 'Não informado'}</p>
                </div>

                <div className="mt-3 flex justify-end gap-2 border-t border-[var(--app-border)] pt-3">
                  <button
                    type="button"
                    onClick={() => openEditModal(lead)}
                    aria-label={`Editar lead ${lead.name}`}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[var(--app-border)] px-3 text-xs font-semibold text-[var(--app-ink)] transition-colors hover:bg-[var(--app-panel-muted)]"
                  >
                    <Edit2 className="h-3.5 w-3.5" /> Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLead(lead.id)}
                    aria-label={`Excluir lead ${lead.name}`}
                    className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="leads-desktop-table flex-1 overflow-auto">
            <table className="w-full min-w-[780px] text-left border-collapse">
              <thead className="bg-gray-50 dark:bg-zinc-800/80 border-b border-brand-border dark:border-gray-700 text-xs text-brand-muted dark:text-gray-400 uppercase sticky top-0 z-10">
                <tr>
                  <th className="min-w-[205px] px-6 py-4 font-bold tracking-wider">Nome do Lead</th>
                  <th className="min-w-[145px] px-6 py-4 font-bold tracking-wider">Contato</th>
                  <th className="min-w-[170px] px-6 py-4 font-bold tracking-wider">Origem (Ref)</th>
                  <th className="min-w-[145px] px-6 py-4 font-bold tracking-wider">Status</th>
                  <th className="min-w-[115px] px-6 py-4 font-bold tracking-wider text-right">Ações</th>
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
                   <tr
                     key={lead.id}
                     onClick={() => selectLead(lead)}
                     onKeyDown={(event) => {
                       if (event.key === 'Enter' || event.key === ' ') {
                         event.preventDefault();
                         selectLead(lead);
                       }
                     }}
                     tabIndex={0}
                     role="button"
                     aria-label={`Abrir detalhes do lead ${lead.name}`}
                     className="hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group font-sans focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--app-accent)]"
                   >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Avatar size={32} name={lead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                        <span className="font-semibold text-brand-charcoal dark:text-white">{lead.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-medium text-brand-muted dark:text-gray-400">{lead.phone}</td>
                    <td className="px-6 py-4">
                      <span className="whitespace-nowrap rounded-md border border-brand-border bg-gray-100 px-2.5 py-1 font-mono text-xs font-medium text-brand-charcoal dark:border-gray-700 dark:bg-zinc-800 dark:text-gray-300">
                        {lead.ref}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold ${getStatusColor(lead.status)}`}>
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
          className="flex-1 flex gap-6 overflow-x-auto pb-6 items-start min-h-[550px] snap-x"
        >
          {statuses.map(status => {
            const columnLeads = filteredLeads.filter(l => l.status === status);
            return (
              <div 
                key={status} 
                onDrop={(e) => handleDrop(e, status)}
                onDragOver={handleDragOver}
                className="flex-shrink-0 w-[280px] lg:w-[310px] snap-start flex flex-col bg-[var(--app-panel-muted)] dark:bg-zinc-900 border border-[var(--app-border)] dark:border-gray-800 rounded-[22px] p-4 max-h-[calc(100vh-220px)] min-h-[480px] shadow-sm"
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
                           onKeyDown={(event) => {
                             if (event.key === 'Enter' || event.key === ' ') {
                               event.preventDefault();
                               selectLead(lead);
                             }
                           }}
                           role="button"
                           tabIndex={0}
                           aria-label={`Abrir detalhes do lead ${lead.name}`}
                           className="bg-[var(--app-panel)] dark:bg-[#18181b] border border-[var(--app-border)] dark:border-gray-700 p-4 rounded-[16px] shadow-sm cursor-grab active:cursor-grabbing hover:border-amber-300 dark:hover:border-amber-700 hover:shadow-md transition-all group flex flex-col gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                        >
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(lead);
                              }}
                              aria-label={`Editar lead ${lead.name}`}
                               className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-zinc-800 dark:hover:text-gray-200"
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
                               className="flex min-h-10 min-w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                              title="Excluir Lead"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                            <GripVertical aria-hidden="true" className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                          </div>

                          <h4 className="break-words font-display text-[15px] font-bold leading-snug text-brand-charcoal dark:text-gray-100">{lead.name}</h4>

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
      {activeSection === 'leads' && displayViewMode === 'list' && (
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

      {/* New Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-brand-charcoal/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="lead-dialog-title" aria-describedby="lead-dialog-description">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border dark:border-gray-800 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h3 id="lead-dialog-title" className="font-display font-bold text-2xl text-brand-charcoal dark:text-white">{editingLead ? 'Editar Lead' : 'Novo Lead'}</h3>
                <p id="lead-dialog-description" className="text-xs text-brand-muted dark:text-gray-400 mt-0.5">{editingLead ? `Atualizando os dados de "${editingLead.name}"` : 'Cadastre um novo cliente no sistema'}</p>
              </div>
              <button type="button" aria-label="Fechar cadastro de lead" onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-brand-muted dark:text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit(editingLead ? handleEditSubmit : handleAdd)} className="space-y-4 overflow-y-auto pr-1 pb-2">
              {/* Campo 1: Nome do Cliente */}
              <div>
                <label htmlFor="lead-name" className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Nome do Cliente <span className="text-red-500">*</span>
                </label>
                <input 
                  id="lead-name"
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
                <label htmlFor="lead-phone" className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Telefone / WhatsApp <span className="text-red-500">*</span>
                </label>
                <input 
                  id="lead-phone"
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
                <label htmlFor="lead-value" className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Valor da Venda (R$)
                </label>
                <input 
                  id="lead-value"
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
                <label htmlFor="lead-ref" className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                  Técnico / Indicador (Origem da Venda)
                </label>
                  <select
                    id="lead-ref"
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
                    <label htmlFor="lead-custom-ref" className="block text-xs font-semibold text-brand-charcoal dark:text-gray-200 mb-1">
                      Nome de Quem Indicou <span className="text-red-500">*</span>
                    </label>
                    <input 
                      id="lead-custom-ref"
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
      {currentLead && (
        <>
          <div 
            className="fixed inset-0 bg-brand-charcoal/20 backdrop-blur-[2px] z-[50] transition-opacity" 
            onClick={() => selectLead(null)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[450px] bg-white dark:bg-zinc-900 shadow-2xl z-[55] flex flex-col animate-in slide-in-from-right duration-300 border-l border-brand-border dark:border-gray-800">
            {/* Sidebar Header */}
            <div className="flex items-start justify-between p-6 border-b border-brand-border dark:border-gray-800 bg-gray-50/50 dark:bg-zinc-800/50">
              <div className="flex items-center gap-4">
                <Avatar size={48} name={currentLead.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                <div>
                  <h3 className="font-display text-2xl font-bold text-brand-charcoal dark:text-white">{currentLead.name}</h3>
                  <div className="flex flex-wrap gap-2 items-center mt-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(currentLead.status)}`}>{currentLead.status}</span>
                    <span className="text-xs font-medium text-brand-muted dark:text-gray-300 flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 px-3 py-1 rounded-full"><Phone className="w-3.5 h-3.5"/> {currentLead.phone}</span>
                    <span className="text-xs font-semibold text-brand-charcoal dark:text-white flex items-center gap-1.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 px-3 py-1 rounded-full">
                      <Avatar size={14} name={currentLead.responsible || currentLead.ref || 'Admin'} variant="beam" colors={['#FFC700', '#3B82F6', '#10B981', '#F59E0B', '#6366F1']} />
                      {currentLead.responsible || currentLead.ref || 'Admin'}
                    </span>
                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 px-3 py-1 rounded-full">
                      {currentLead.source === 'ms_forms' ? 'MS Forms' : currentLead.source === 'landing' ? 'Landing' : 'Manual'}
                    </span>
                    {currentLead.history && currentLead.history.filter(h => h.action && h.action.includes('MS Forms detectado e ignorado')).length > 0 && (
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 px-3 py-1 rounded-full">
                        Duplicata ignorada ({currentLead.history.filter(h => h.action && h.action.includes('MS Forms detectado e ignorado')).length}x)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openEditModal(currentLead)}
                  aria-label={`Editar lead ${currentLead.name}`}
                  className="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 rounded-full transition-colors shrink-0 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 shadow-sm"
                  title="Editar Lead"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteLead(currentLead.id)}
                  aria-label={`Excluir lead ${currentLead.name}`}
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
                {currentLead.history.map((h, i) => (
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
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(aiResult.message || '');
                                setCopiedMessage(true);
                                setTimeout(() => setCopiedMessage(false), 2000);
                              } catch (err) {
                                console.error('Erro ao copiar mensagem:', err);
                                toastError('Erro ao Copiar', 'Não foi possível copiar a mensagem para a área de transferência.');
                              }
                            }}
                            className="flex-1 py-2 bg-gray-100 dark:bg-[#27272a] hover:bg-gray-200 dark:hover:bg-[#3f3f46] text-brand-charcoal dark:text-white font-semibold text-[11px] rounded-lg transition-colors border border-brand-border dark:border-gray-700"
                          >
                            {copiedMessage ? 'Copiado!' : 'Copiar Texto'}
                          </button>
                          <a 
                            href={`https://wa.me/${(() => {
                              const digits = (currentLead.phone || '').replace(/\D/g, '');
                              // Prefixa o DDI 55 quando o número nacional (10-11 dígitos) não inclui o código do país
                              return digits.startsWith('55') || digits.length < 10 || digits.length > 11 ? digits : `55${digits}`;
                            })()}?text=${encodeURIComponent(aiResult.message || '')}`}
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

      {/* Modal de Motivo de Descarte / Erro */}
      {lossReasonModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#18181b] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-100 dark:bg-red-950/40 rounded-xl text-red-600 dark:text-red-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Registrar Motivo de Descarte
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Lead: <span className="font-semibold text-gray-700 dark:text-gray-300">{lossReasonModalLead.name}</span>
                </p>
              </div>
              <button
                onClick={() => setLossReasonModalLead(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                Selecione o motivo pelo qual este lead foi marcado como Errado / Descartado:
              </label>
              <div className="grid grid-cols-1 gap-2">
                {[
                  'Sem viabilidade técnica',
                  'Cliente desistiu / Sem interesse',
                  'Telefone inexistente / Não atende',
                  'Já é cliente da base',
                  'Lead duplicado',
                  'Preço / Condições comerciais',
                  'Outro'
                ].map((reason) => (
                  <label
                    key={reason}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      selectedLossReason === reason
                        ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-300 font-semibold'
                        : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="loss_reason"
                      value={reason}
                      checked={selectedLossReason === reason}
                      onChange={() => setSelectedLossReason(reason)}
                      className="text-red-600 focus:ring-red-500"
                    />
                    <span>{reason === 'Outro' ? 'Outro motivo (especificar)' : reason}</span>
                  </label>
                ))}
              </div>

              {selectedLossReason === 'Outro' && (
                <div className="pt-1">
                  <input
                    type="text"
                    value={customLossReason}
                    onChange={(e) => setCustomLossReason(e.target.value)}
                    placeholder="Descreva o motivo detalhado..."
                    className="w-full px-3.5 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setLossReasonModalLead(null)}
                className="flex-1 py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmLossReason()}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm hover:shadow"
              >
                Confirmar Descarte
              </button>
            </div>
          </div>
        </div>
      )}

      {isPostSaleCollectionOpen && (
        <PostSaleCollectionDialog
          onClose={() => setIsPostSaleCollectionOpen(false)}
          onSaved={async () => {
            toastSuccess('Coleta registrada', 'A coleta e os resultados dos contatos foram salvos.');
            await fetchLeads();
          }}
        />
      )}
    </div>
  )
}
