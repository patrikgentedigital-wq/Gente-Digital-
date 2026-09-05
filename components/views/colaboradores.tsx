'use client';

import { UserPlus, Link as LinkIcon, Edit2, HelpCircle, Search, Copy, BarChart2, Trash2, X, Users, QrCode, Upload, MessageCircle, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Colaborador, Lead, isSupabaseConfigured } from '@/lib/supabase';
import { initialColaboradores, initialLeads } from '@/lib/mock-data';
import Avatar from 'boring-avatars';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useToast } from '@/components/providers/toast-context';
import { ConfirmModal } from '@/components/providers/confirm-modal';
import QRCode from 'qrcode';
import { PROGRAM_RULES } from '@/lib/rules';
import { DateFilterState, matchesDateFilter, getPeriodLabel } from '@/lib/date-filters';
import { DateRangeFilter } from '@/components/date-range-filter';
import { ColaboradorExtratoModal } from './colaborador-extrato-modal';

const colaboradorSchema = z.object({
  name: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Insira um endereço de e-mail válido'),
  photo_url: z.string().optional().or(z.literal('')),
});

type ColaboradorFormData = z.infer<typeof colaboradorSchema>;

const normalizeRef = (str: string) =>
  str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";


export function ColaboradoresView() {
  const router = useRouter();
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>(isSupabaseConfigured() ? [] : initialColaboradores);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilterState>({ period: 'all' });
  const [selectedColabForExtrato, setSelectedColabForExtrato] = useState<Colaborador | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColabForQr, setSelectedColabForQr] = useState<Colaborador | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [baseLink, setBaseLink] = useState<string>(PROGRAM_RULES.linkBasePadrao);
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [tempBaseLink, setTempBaseLink] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ isOpen: boolean; id: string; name: string } | null>(null);
  const [editingColab, setEditingColab] = useState<Colaborador | null>(null);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});
  const [clicksLoaded, setClicksLoaded] = useState(false);

  // Busca os cliques por ref (rota admin; para vendedores o fetch retorna 401 e é ignorado)
  const fetchClicks = async () => {
    try {
      const res = await fetch('/api/track-click');
      if (!res.ok) return;
      const data = await res.json();
      if (data?.success && Array.isArray(data.clicks)) {
        const map: Record<string, number> = {};
        data.clicks.forEach((c: { ref: string; count: number }) => {
          map[normalizeRef(c.ref)] = (map[normalizeRef(c.ref)] || 0) + c.count;
        });
        setClickCounts(map);
        setClicksLoaded(true);
      }
    } catch (err) {
      console.error('Erro ao buscar cliques de links:', err);
    }
  };

  const openCreateModal = () => {
    setEditingColab(null);
    reset();
    setIsModalOpen(true);
  };

  const openEditModal = (colab: Colaborador) => {
    setEditingColab(colab);
    reset({ name: colab.name, email: colab.email, photo_url: colab.photo_url || '' });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingColab(null);
    reset();
  };

  // Fechar modais com a tecla Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setEditingColab(null);
        setSelectedColabForQr(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Gera o QR Code localmente (sem dependência de serviços de terceiros)
  useEffect(() => {
    if (!selectedColabForQr) return;
    let cancelled = false;
    QRCode.toDataURL(getFullReferralLink(baseLink, selectedColabForQr.id), { width: 180, margin: 1 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err) => console.error('Erro ao gerar QR Code:', err));
    return () => { cancelled = true; };
  }, [selectedColabForQr, baseLink]);

  const handleCopyLink = async (link: string, name: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(link);
      toastSuccess('Link copiado!', `Link de ${name} copiado para a área de transferência.`);
      return true;
    } catch (err) {
      console.error('Erro ao copiar link:', err);
      toastError('Erro ao Copiar', 'Não foi possível copiar o link. Copie manualmente.');
      return false;
    }
  };

  const getNextColabId = async (): Promise<string> => {
    let maxNum = 0;
    colaboradores.forEach(c => {
      const match = c.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    });

    // Consulta o banco para evitar colisão de IDs entre sessões/dispositivos
    if (isSupabaseConfigured()) {
      try {
        const { data } = await supabase.from('colaboradores').select('id');
        (data || []).forEach(c => {
          const match = c.id?.match(/\d+/);
          if (match) {
            const num = parseInt(match[0], 10);
            if (num > maxNum) maxNum = num;
          }
        });
      } catch (e) {
        console.error("Erro ao consultar IDs no banco:", e);
      }
    }

    return `EMP-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ColaboradorFormData>({
    resolver: zodResolver(colaboradorSchema)
  });

  const watchPhotoUrl = watch('photo_url');

  const getFullReferralLink = (base: string, refId: string) => {
    let cleanBase = base.trim();
    if (!/^https?:\/\//i.test(cleanBase)) {
      cleanBase = 'https://' + cleanBase;
    }
    const separator = cleanBase.includes('?') ? '&' : '?';
    return `${cleanBase}${separator}ref=${refId}`;
  };

  const loadBaseLink = async () => {
    try {
      const res = await fetch('/api/settings/base-link');
      if (res.ok) {
        const data = await res.json();
        if (data && data.base_link) {
          setBaseLink(data.base_link);
        }
      }
    } catch (err) {
      console.error("Error loading base link:", err);
    }
  };

  const handleSaveBaseLink = async () => {
    const trimmed = tempBaseLink.trim();
    if (!trimmed) return;

    try {
      const res = await fetch('/api/settings/base-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        toastError("Erro ao salvar link base", data.error || 'Falha ao salvar');
        return;
      }
      setBaseLink(trimmed);
      setIsEditingBase(false);
      toastSuccess("Link base atualizado!", "Sincronizado com sucesso.");
    } catch (err: any) {
      console.error("Error saving base link:", err);
      toastError("Erro ao salvar link base", err?.message);
    }
  };

  const fetchColaboradores = async () => {
    try {
      setIsLoading(true);
      let baseColabs: Colaborador[] = [];
      let loadedFromSupabase = false;

      if (isSupabaseConfigured()) {
        try {
          const { data, error } = await supabase.from('colaboradores').select('*').order('created_at', { ascending: false });
          if (!error && data) {
            baseColabs = data;
            loadedFromSupabase = true;
          }
        } catch (e) {
          console.error("Supabase fetch error:", e);
        }
      }

      if (!loadedFromSupabase) {
        baseColabs = [...initialColaboradores];
      }

      let leadsData: Lead[] = [];
      if (isSupabaseConfigured()) {
        try {
          const { data: lData } = await supabase
            .from('leads')
            .select('id, name, phone, ref, status, value, source, loss_reason, created_at')
            .order('created_at', { ascending: false });
          if (lData) leadsData = lData as Lead[];
        } catch (e) {
          console.error("Erro ao buscar leads em colaboradores:", e);
        }
      } else {
        leadsData = (initialLeads as any[]) as Lead[];
      }

      setAllLeads(leadsData);
      setColaboradores(baseColabs);
    } catch (error) {
      console.error("Error fetching colaboradores:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchColaboradores();
    loadBaseLink();
    fetchClicks();

    if (isSupabaseConfigured()) {
      const colabChannel = supabase
        .channel('colaboradores_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, () => {
          fetchColaboradores();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          fetchColaboradores();
        })
        .subscribe();

      const settingsChannel = supabase
        .channel('settings_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => {
          loadBaseLink();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(colabChannel);
        supabase.removeChannel(settingsChannel);
      };
    }
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 150;
        const MAX_HEIGHT = 150;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPEG
          setValue('photo_url', compressedDataUrl, { shouldValidate: true });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleAdd = async (data: ColaboradorFormData) => {
    if (editingColab) {
      const previousColabs = [...colaboradores];
      const updated: Colaborador = {
        ...editingColab,
        name: data.name,
        email: data.email,
        photo_url: data.photo_url || undefined,
      };
      setColaboradores(prev => prev.map(c => c.id === editingColab.id ? updated : c));

      if (isSupabaseConfigured()) {
        try {
          const { error } = await supabase.from('colaboradores').update({
            name: data.name,
            email: data.email,
            photo_url: data.photo_url || null,
          }).eq('id', editingColab.id);

          if (error) {
            console.error("Supabase update error:", error);
            toastError("Erro ao atualizar", error.message || "As alterações não puderam ser salvas.");
            setColaboradores(previousColabs);
          } else {
            toastSuccess("Colaborador atualizado!", "As alterações foram sincronizadas com todos os dispositivos.");
          }
        } catch (err: any) {
          console.error("Supabase update exception:", err);
          toastError("Erro de conexão", "Não foi possível conectar ao servidor para atualizar o colaborador.");
          setColaboradores(previousColabs);
        }
      } else {
        toastInfo("Modo Demonstração", "O Supabase não está configurado. As alterações são locais.");
      }

      closeModal();
      return;
    }

    const initials = data.name.substring(0, 2).toUpperCase();
    const id = await getNextColabId();
    
    const newColab: Colaborador = { 
      id, 
      name: data.name, 
      email: data.email, 
      initials, 
      count: 0, 
      photo_url: data.photo_url || undefined,
      created_at: new Date().toISOString()
    };

    setColaboradores(prev => [newColab, ...prev]);

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('colaboradores').insert([{
          id: newColab.id,
          name: newColab.name,
          email: newColab.email,
          initials: newColab.initials,
          count: 0,
          photo_url: newColab.photo_url || null
        }]);

        if (error) {
          console.error("Supabase insert error:", error);
          toastError("Erro ao salvar no banco", error.message || "As alterações não puderam ser sincronizadas.");
          fetchColaboradores();
        } else {
          toastSuccess("Colaborador cadastrado!", "Disponível instantaneamente em todos os dispositivos.");
        }
      } catch (err: any) {
        console.error("Supabase insert exception:", err);
        toastError("Erro de conexão", "Não foi possível conectar ao servidor para salvar o colaborador.");
      }
    } else {
      toastInfo("Modo Demonstração", "O Supabase não está configurado. As alterações são locais.");
    }

    closeModal();
  };

  const handleDelete = (id: string) => {
    const target = colaboradores.find(c => c.id === id);
    setConfirmDelete({ isOpen: true, id, name: target?.name || id });
  };

  const executeDelete = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    const previousColabs = [...colaboradores];
    setColaboradores(prev => prev.filter(c => c.id !== id));

    if (isSupabaseConfigured()) {
      try {
        const { error } = await supabase.from('colaboradores').delete().eq('id', id);
        if (error) {
          console.error("Supabase delete error:", error);
          toastError("Erro ao excluir", error.message || "Não foi possível excluir no servidor.");
          setColaboradores(previousColabs);
        } else {
          toastSuccess("Colaborador removido", "Exclusão refletida em todos os dispositivos.");
        }
      } catch (err: any) {
        console.error("Supabase delete exception:", err);
        toastError("Erro de conexão", "Não foi possível remover no servidor.");
        setColaboradores(previousColabs);
      }
    }
  };

  const colabsWithPeriodMetrics = colaboradores.map(colab => {
    const normColabName = normalizeRef(colab.name);
    const normColabId = normalizeRef(colab.id);

    const colabAllLeads = allLeads.filter(lead => {
      const normRef = normalizeRef(lead.ref);
      return normRef === normColabId || normRef === normColabName;
    });

    const periodLeads = colabAllLeads.filter(lead =>
      matchesDateFilter(lead.created_at, dateFilter)
    );

    const vendasGanhasPeriodo = periodLeads.filter(l => l.status === 'Ganho').length;

    return {
      ...colab,
      count: periodLeads.length,
      totalAllTime: colabAllLeads.length,
      vendasGanhas: vendasGanhasPeriodo,
    };
  });

  const filteredColabs = colabsWithPeriodMetrics.filter(c =>
    (c.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (c.id?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (c.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Gestão de Links & Técnicos</h2>
          <p className="text-brand-muted dark:text-gray-400 mt-1">Configure os links e monitore as indicações por período para pagamento de comissões.</p>
        </div>
        <button onClick={openCreateModal} className="px-6 py-3 bg-brand-yellow text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-level-2 transition-all flex items-center justify-center gap-2">
          <UserPlus className="w-5 h-5" />
          Novo Colaborador
        </button>
      </div>

      {/* Grid Info Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-level-1 p-6 transition-colors">
          <div className="flex items-center gap-2 mb-4 text-brand-charcoal dark:text-white">
            <LinkIcon className="w-5 h-5" />
            <h3 className="font-bold text-lg">Link Base Principal</h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {isEditingBase ? (
              <div className="flex-1 w-full flex items-center gap-2">
                <input
                  type="text"
                  value={tempBaseLink}
                  onChange={(e) => setTempBaseLink(e.target.value)}
                  className="w-full bg-white dark:bg-[#27272a] border border-brand-yellow rounded-xl px-4 py-3 font-mono text-sm text-brand-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow/20"
                  autoFocus
                />
                <button
                  onClick={handleSaveBaseLink}
                  className="w-full sm:w-auto px-6 py-3 bg-brand-yellow text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-level-2 transition-all flex items-center justify-center"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 w-full bg-gray-50 dark:bg-gray-800/60 border border-brand-border dark:border-gray-700 rounded-xl px-4 py-3 font-mono text-sm text-brand-charcoal dark:text-white">
                  {baseLink}
                </div>
                <button 
                  onClick={() => {
                    setTempBaseLink(baseLink);
                    setIsEditingBase(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 border-2 border-brand-charcoal dark:border-gray-700 text-brand-charcoal dark:text-white font-bold text-sm rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Alterar Base
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-brand-muted dark:text-gray-400 mt-4">
            Este é o endereço raiz para todas as indicações. O ID do colaborador será anexado automaticamente como parâmetro <span className="font-bold text-brand-charcoal dark:text-white">?ref=ID</span>.
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/40 rounded-2xl border-l-4 border-brand-yellow p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-brand-charcoal dark:text-white">
            <HelpCircle className="w-5 h-5" />
            <h4 className="font-bold">Apuração de Comissão</h4>
          </div>
          <p className="text-sm text-brand-muted dark:text-gray-400 leading-relaxed">
            Use o <span className="font-bold text-brand-charcoal dark:text-white">filtro por data</span> para consultar quantas indicações cada técnico realizou no mês ou período selecionado para efetuar o fechamento financeiro.
          </p>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-level-1 overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-brand-border dark:border-gray-800 flex flex-col lg:flex-row justify-between lg:items-center gap-4">
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Colaboradores & Técnicos</h3>
            <p className="text-xs text-brand-muted dark:text-gray-400 mt-0.5">
              Exibindo contagem de indicações para: <span className="font-semibold text-amber-600 dark:text-amber-400">{getPeriodLabel(dateFilter)}</span>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <DateRangeFilter value={dateFilter} onChange={setDateFilter} />

            <div className="relative w-full sm:w-60 text-brand-muted focus-within:text-brand-charcoal transition-colors">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Filtrar por nome ou ID..."
                className="w-full pl-9 pr-4 py-2 bg-white dark:bg-zinc-800 border border-brand-border dark:border-zinc-700 rounded-xl text-xs text-brand-charcoal dark:text-white focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/40 border-b border-brand-border dark:border-gray-800">
                <th className="px-6 py-4 font-bold text-xs text-brand-muted dark:text-gray-400 uppercase tracking-wider">Colaborador</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted dark:text-gray-400 uppercase tracking-wider text-center">ID</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted dark:text-gray-400 uppercase tracking-wider">Link Único</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted dark:text-gray-400 uppercase tracking-wider text-center">Indicações</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted dark:text-gray-400 uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border dark:divide-gray-800">
              {filteredColabs.map((colab) => (
                <tr key={colab.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/20 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {colab.photo_url ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={colab.photo_url} alt={colab.name} className="w-9 h-9 rounded-full object-cover border border-brand-border" />
                        </>
                      ) : (
                        <Avatar size={36} name={colab.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                      )}
                      <div>
                        <p className="font-semibold text-brand-charcoal dark:text-white text-sm">{colab.name}</p>
                        <p className="text-xs text-brand-muted dark:text-gray-400">{colab.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 border border-brand-border dark:border-gray-700 rounded-md text-xs font-mono text-brand-charcoal dark:text-white">
                      {colab.id}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-brand-link dark:text-blue-400 hover:underline cursor-pointer font-medium truncate max-w-[200px]" title={getFullReferralLink(baseLink, colab.id)}>
                        {getFullReferralLink(baseLink, colab.id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleCopyLink(getFullReferralLink(baseLink, colab.id), colab.name)}
                        aria-label={`Copiar link de ${colab.name}`}
                        className="text-brand-muted hover:text-brand-charcoal focus-visible:opacity-100 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-brand-charcoal dark:text-white text-base">{(colab.count ?? 0).toString().padStart(2, '0')}</span>
                    {dateFilter.period !== 'all' && (
                      <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                        {colab.totalAllTime ?? 0} no histórico total
                      </span>
                    )}
                    {colab.vendasGanhas !== undefined && colab.vendasGanhas > 0 && (
                      <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">
                        {colab.vendasGanhas} venda(s) instalada(s)
                      </span>
                    )}
                    {clicksLoaded && (
                      <span className="block text-[10px] text-brand-muted dark:text-gray-400 font-medium mt-0.5">
                        {clickCounts[normalizeRef(colab.id)] ?? clickCounts[normalizeRef(colab.name)] ?? 0} cliques no link
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setSelectedColabForExtrato(colab)}
                        aria-label={`Ver extrato de indicações de ${colab.name}`}
                        className="p-2 text-brand-muted hover:text-amber-600 dark:hover:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                        title="Ver Extrato de Indicações (Comissão)"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => router.push('/?tab=dashboard')}
                        aria-label={`Ver analytics de ${colab.name}`}
                        className="p-2 text-brand-muted hover:text-brand-charcoal rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
                        title="Ver Analytics"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(colab)}
                        aria-label={`Editar colaborador ${colab.name}`}
                        className="p-2 text-brand-muted hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedColabForQr(colab);
                          setCopiedLink(false);
                        }}
                        aria-label={`Gerar QR Code para ${colab.name}`}
                        className="p-2 text-brand-muted hover:text-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors" 
                        title="Gerar QR Code / Link"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(colab.id)}
                        aria-label={`Excluir colaborador ${colab.name}`}
                        className="p-2 text-brand-muted hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredColabs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-16">
                    <div className="flex flex-col items-center justify-center text-center">
                      <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 border-2 border-dashed border-gray-200">
                        <Users className="w-8 h-8 text-gray-300" />
                      </div>
                      <h4 className="text-brand-charcoal font-bold mb-1">Nenhum colaborador</h4>
                      <p className="text-brand-muted text-sm max-w-[250px]">Adicione colaboradores para que eles possam gerar links e trazer novos leads.</p>
                      <button onClick={openCreateModal} className="mt-6 px-6 py-2.5 bg-white border border-brand-border text-brand-charcoal font-bold text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm">
                        <UserPlus className="w-4 h-4" />
                        Novo Colaborador
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Colaborador */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="new-colaborator-title">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border dark:border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <h3 id="new-colaborator-title" className="font-display font-bold text-2xl text-brand-charcoal dark:text-white">{editingColab ? 'Editar Colaborador' : 'Novo Colaborador'}</h3>
              <button type="button" aria-label="Fechar cadastro de colaborador" onClick={closeModal} className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"><X className="w-5 h-5 text-brand-muted dark:text-gray-400" /></button>
            </div>
            <form onSubmit={handleSubmit(handleAdd)} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1">Nome Completo</label>
                <input 
                  autoFocus 
                  {...register('name')} 
                  type="text" 
                  placeholder="Ex: Maria Joaquina" 
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm text-brand-charcoal focus:outline-none focus:ring-1 transition-all ${
                    errors.name 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border focus:border-brand-yellow focus:ring-brand-yellow'
                  }`} 
                />
                {errors.name && <p className="text-red-500 text-xs mt-1 font-medium">{errors.name.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1">E-mail Profissional</label>
                <input 
                  {...register('email')} 
                  type="email" 
                  placeholder="maria@empresa.com" 
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-sm text-brand-charcoal focus:outline-none focus:ring-1 transition-all ${
                    errors.email 
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' 
                      : 'border-brand-border focus:border-brand-yellow focus:ring-brand-yellow'
                  }`} 
                />
                {errors.email && <p className="text-red-500 text-xs mt-1 font-medium">{errors.email.message}</p>}
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1">Foto (Opcional)</label>
                <div className="flex items-center gap-4">
                  {watchPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={watchPhotoUrl} alt="Preview" className="w-12 h-12 rounded-full object-cover border border-brand-border shadow-sm" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center border border-dashed border-gray-300">
                      <Upload className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={handleImageChange}
                    className="text-sm text-brand-muted file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-brand-yellow/20 file:text-brand-charcoal hover:file:bg-brand-yellow/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-yellow/50"
                  />
                </div>
                {errors.photo_url && <p className="text-red-500 text-xs mt-1 font-medium">{errors.photo_url.message}</p>}
              </div>
              <button type="submit" className="w-full py-3.5 bg-brand-yellow text-brand-charcoal font-bold rounded-xl mt-6 hover:shadow-level-2 transition-all">
                {editingColab ? 'Salvar Alterações' : 'Adicionar Colaborador'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal QR Code e Link de Indicação */}
      {selectedColabForQr && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="referral-link-title">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border dark:border-gray-800">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 id="referral-link-title" className="font-display font-bold text-2xl text-brand-charcoal dark:text-white">Link de Indicação</h3>
                <p className="text-xs text-brand-muted mt-1">{selectedColabForQr.name}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar link de indicação"
                onClick={() => setSelectedColabForQr(null)} 
                className="p-2 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-brand-muted dark:text-gray-400" />
              </button>
            </div>
            
            <div className="space-y-6 text-center">
              {/* QR Code Container */}
              <div className="bg-gray-50 border border-brand-border rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="QR Code de Indicação" className="w-44 h-44 border-4 border-white shadow-md rounded-xl hover:scale-105 transition-transform" />
                ) : (
                  <div className="w-44 h-44 flex items-center justify-center rounded-xl border-4 border-white bg-white text-xs text-brand-muted" role="status">Gerando QR Code...</div>
                )}
                <p className="text-[11px] text-brand-muted font-bold mt-4 uppercase tracking-wider">
                  Escaneie para indicar
                </p>
              </div>

              {/* URL Input Row */}
              <div className="space-y-2 text-left">
                <label className="block text-sm font-semibold text-brand-charcoal">URL Única</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getFullReferralLink(baseLink, selectedColabForQr.id)}
                    className="flex-1 bg-gray-50 border border-brand-border rounded-xl px-4 py-3 font-mono text-xs text-brand-charcoal focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label={`Copiar link de ${selectedColabForQr.name}`}
                    onClick={() => {
                      void handleCopyLink(getFullReferralLink(baseLink, selectedColabForQr.id), selectedColabForQr.name).then((wasCopied) => {
                        if (!wasCopied) return;
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2000);
                      });
                    }}
                    className={`px-4 py-3 ${copiedLink ? 'bg-green-600 text-white' : 'bg-brand-charcoal text-white hover:bg-gray-800'} font-bold text-xs rounded-xl shadow-sm hover:shadow transition-all`}
                  >
                    {copiedLink ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-left text-xs text-blue-700 leading-relaxed font-sans">
                💡 <strong>Dica do Sucesso:</strong> Compartilhe este link ou QR Code com seus colaboradores. Quando os novos clientes acessarem, o Gente Digital rastreará a indicação automaticamente!
              </div>

              {/* Botões de ação */}
              <div className="flex flex-col gap-3">
                {/* WhatsApp Share */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`🌐 Assine a internet da Gente Digital usando meu link exclusivo e aproveite as melhores ofertas! 🚀\n\n${getFullReferralLink(baseLink, selectedColabForQr.id)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Compartilhar link de ${selectedColabForQr.name} no WhatsApp`}
                  className="w-full py-3.5 bg-green-500 hover:bg-green-600 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm hover:shadow"
                >
                  <MessageCircle className="w-5 h-5" />
                  Compartilhar no WhatsApp
                </a>

                <button
                  type="button"
                  onClick={() => setSelectedColabForQr(null)}
                  className="w-full py-3.5 border-2 border-brand-charcoal dark:border-gray-700 text-brand-charcoal dark:text-white font-bold rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800 transition-all text-sm"
                >
                  Concluído
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão de colaborador */}
      {confirmDelete && (
        <ConfirmModal
          isOpen={confirmDelete.isOpen}
          title="Excluir Colaborador"
          message={`Tem certeza que deseja excluir o colaborador "${confirmDelete.name}"? O link de indicação deixará de funcionar. Os leads já registrados permanecerão no sistema.`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          variant="danger"
          icon="trash"
          onConfirm={executeDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Modal de Extrato Detalhado do Técnico (Apuração de Comissões) */}
      {selectedColabForExtrato && (
        <ColaboradorExtratoModal
          colaborador={selectedColabForExtrato}
          allLeads={allLeads}
          initialFilter={dateFilter}
          onClose={() => setSelectedColabForExtrato(null)}
        />
      )}
    </div>
  );
}
