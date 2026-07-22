import { UserPlus, Link as LinkIcon, Edit2, HelpCircle, Search, Copy, BarChart2, Trash2, X, Users, QrCode, Upload } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Colaborador } from '@/lib/supabase';
import Avatar from 'boring-avatars';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const colaboradorSchema = z.object({
  name: z.string().min(3, 'O nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Insira um endereço de e-mail válido'),
  photo_url: z.string().optional().or(z.literal('')),
});

type ColaboradorFormData = z.infer<typeof colaboradorSchema>;


const initialColaboradores: Colaborador[] = [
  { id: 'EMP-042', name: 'Ana Costa Silva', email: 'ana.costa@empresa.com', initials: 'AC', count: 12 },
  { id: 'EMP-043', name: 'Carlos Oliveira', email: 'carlos.o@empresa.com', initials: 'CO', count: 8 },
  { id: 'EMP-044', name: 'Claudiane de Sousa Ribeiro Melo', email: 'claudiane@gentedigital.com.br', initials: 'CM', count: 7 },
  { id: 'EMP-045', name: 'Leandro Costa Silva', email: 'leandro@gentedigital.com.br', initials: 'LS', count: 5 },
  { id: 'EMP-046', name: 'Alfredo Seixas', email: 'alfredo.seixas@gentedigital.com.br', initials: 'AS', count: 3 }
];

const getLocalColaboradores = (): Colaborador[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('gente_digital_local_colaboradores');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const saveLocalColaborador = (colab: Colaborador) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalColaboradores();
    const updated = [colab, ...existing.filter(c => c.id !== colab.id)];
    localStorage.setItem('gente_digital_local_colaboradores', JSON.stringify(updated));
  } catch (e) {}
};

const removeLocalColaborador = (id: string) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getLocalColaboradores();
    const updated = existing.filter(c => c.id !== id);
    localStorage.setItem('gente_digital_local_colaboradores', JSON.stringify(updated));
  } catch (e) {}
};

const getDeletedColaboradorIds = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('gente_digital_deleted_colaboradores');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
};

const addDeletedColaboradorId = (id: string) => {
  if (typeof window === 'undefined') return;
  try {
    const existing = getDeletedColaboradorIds();
    if (!existing.includes(id)) {
      const updated = [...existing, id];
      localStorage.setItem('gente_digital_deleted_colaboradores', JSON.stringify(updated));
    }
  } catch (e) {}
};

export function ColaboradoresView() {
  const router = useRouter();
  const [colaboradores, setColaboradores] = useState<Colaborador[]>(initialColaboradores);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColabForQr, setSelectedColabForQr] = useState<Colaborador | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const getNextColabId = () => {
    let maxNum = 45;
    colaboradores.forEach(c => {
      const match = c.id.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `EMP-0${maxNum + 1}`;
  };

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ColaboradorFormData>({
    resolver: zodResolver(colaboradorSchema)
  });

  const watchPhotoUrl = watch('photo_url');

  const [baseLink, setBaseLink] = useState('gentedigital.com.br/indicar');
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [tempBaseLink, setTempBaseLink] = useState('');

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
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { data } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'base_link')
          .single();
        if (data && data.value) {
          setBaseLink(data.value);
        }
      }
    } catch (err) {
      console.error("Error loading base link from Supabase settings:", err);
    }
  };

  const handleSaveBaseLink = async () => {
    const trimmed = tempBaseLink.trim();
    if (!trimmed) return;
    setBaseLink(trimmed);
    setIsEditingBase(false);

    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        await supabase
          .from('settings')
          .upsert({ key: 'base_link', value: trimmed });
      }
    } catch (err) {
      console.error("Error saving base link:", err);
    }
  };

  const fetchColaboradores = async () => {
    try {
      setIsLoading(true);
      let baseColabs: Colaborador[] = [];

      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        try {
          const { data, error } = await supabase.from('colaboradores').select('*').order('created_at', { ascending: false });
          if (!error && data && data.length > 0) {
            baseColabs = data;
          }
        } catch (e) {}
      }

      if (baseColabs.length === 0) {
        baseColabs = initialColaboradores;
      }

      const localColabs = getLocalColaboradores();
      const deletedIds = getDeletedColaboradorIds();
      const colabsMap = new Map<string, Colaborador>();

      localColabs.forEach(c => {
        if (!deletedIds.includes(c.id)) {
          colabsMap.set(c.id, c);
        }
      });
      
      baseColabs.forEach(c => {
        if (!deletedIds.includes(c.id) && !colabsMap.has(c.id)) {
          colabsMap.set(c.id, c);
        }
      });

      const combinedColabs = Array.from(colabsMap.values());

      let leadsData: any[] = [];
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        try {
          const { data: lData } = await supabase.from('leads').select('ref');
          if (lData) leadsData = lData;
        } catch (e) {}
      }

      const normalizeStr = (str: string) => 
        str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim() : "";

      const colabsWithCount = combinedColabs.map(colab => {
        const normColabName = normalizeStr(colab.name);
        const normColabId = normalizeStr(colab.id);
        
        const colabCount = leadsData.length > 0 ? leadsData.filter(lead => {
          const normRef = normalizeStr(lead.ref);
          return normRef === normColabId || normRef === normColabName || (!!normRef && !!normColabName && (normRef.includes(normColabName) || normColabName.includes(normRef)));
        }).length : (colab.count || 0);
        
        return { ...colab, count: colabCount };
      });
      
      setColaboradores(colabsWithCount);
    } catch (error) {
      console.error("Error fetching colaboradores:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchColaboradores();
      loadBaseLink();
    }, 0);
    return () => clearTimeout(timer);
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
    const initials = data.name.substring(0, 2).toUpperCase();
    const id = getNextColabId();
    
    const newColab: Colaborador = { 
      id, 
      name: data.name, 
      email: data.email, 
      initials, 
      count: 0, 
      photo_url: data.photo_url || undefined,
      created_at: new Date().toISOString()
    };

    saveLocalColaborador(newColab);
    setColaboradores(prev => [newColab, ...prev]);

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      try {
        await supabase.from('colaboradores').insert([{
          id: newColab.id,
          name: newColab.name,
          email: newColab.email,
          initials: newColab.initials,
          count: 0,
          photo_url: newColab.photo_url || null
        }]);
      } catch (err) {
        console.warn("Supabase insert warning (saved locally):", err);
      }
    }
    
    setIsModalOpen(false);
    reset();
  };

  const handleDelete = async (id: string) => {
    addDeletedColaboradorId(id);
    removeLocalColaborador(id);
    setColaboradores(prev => prev.filter(c => c.id !== id));

    if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
      try {
        await supabase.from('colaboradores').delete().eq('id', id);
      } catch (err) {
        console.warn("Supabase delete warning:", err);
      }
    }
  };

  const filteredColabs = colaboradores.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Gestão de Links de Indicação</h2>
          <p className="text-brand-muted dark:text-gray-400 mt-1">Configure e monitore os links de compartilhamento dos seus colaboradores.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-brand-yellow text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-level-2 transition-all flex items-center justify-center gap-2">
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
            <h4 className="font-bold">Como funciona?</h4>
          </div>
          <p className="text-sm text-brand-muted dark:text-gray-400 leading-relaxed">
            Cada colaborador possui um <span className="font-bold text-brand-charcoal dark:text-white">ID Único</span>. Quando alguém acessa o link com esse ID, o sistema armazena um cookie por 30 dias para garantir o rastreamento da conversão.
          </p>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-level-1 overflow-hidden transition-colors">
        <div className="px-6 py-5 border-b border-brand-border dark:border-gray-800 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Colaboradores Ativos</h3>
          <div className="relative w-full sm:w-64 text-brand-muted focus-within:text-brand-charcoal transition-colors">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filtrar colaborador..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-brand-border rounded-xl text-sm text-brand-charcoal focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all"
            />
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
                        onClick={() => navigator.clipboard.writeText(getFullReferralLink(baseLink, colab.id))}
                        className="text-brand-muted hover:text-brand-charcoal dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-brand-charcoal dark:text-white text-base">{colab.count.toString().padStart(2, '0')}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button 
                        onClick={() => router.push('/?tab=dashboard')}
                        className="p-2 text-brand-muted hover:text-brand-charcoal rounded-lg hover:bg-gray-200 transition-colors" 
                        title="Ver Analytics"
                      >
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedColabForQr(colab);
                          setCopiedLink(false);
                        }}
                        className="p-2 text-brand-muted hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors" 
                        title="Gerar QR Code / Link"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(colab.id)} className="p-2 text-brand-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Excluir">
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
                      <button onClick={() => setIsModalOpen(true)} className="mt-6 px-6 py-2.5 bg-white border border-brand-border text-brand-charcoal font-bold text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 shadow-sm">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display font-bold text-2xl text-brand-charcoal">Novo Colaborador</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-brand-muted" /></button>
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
                Adicionar Colaborador
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal QR Code e Link de Indicação */}
      {selectedColabForQr && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200 border border-brand-border">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-display font-bold text-2xl text-brand-charcoal">Link de Indicação</h3>
                <p className="text-xs text-brand-muted mt-1">{selectedColabForQr.name}</p>
              </div>
              <button 
                onClick={() => setSelectedColabForQr(null)} 
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-brand-muted" />
              </button>
            </div>
            
            <div className="space-y-6 text-center">
              {/* QR Code Container */}
              <div className="bg-gray-50 border border-brand-border rounded-2xl p-6 flex flex-col items-center justify-center shadow-inner">
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getFullReferralLink(baseLink, selectedColabForQr.id))}`} 
                    alt="QR Code de Indicação" 
                    className="w-44 h-44 border-4 border-white shadow-md rounded-xl hover:scale-105 transition-transform" 
                  />
                </>
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
                    onClick={() => {
                      navigator.clipboard.writeText(getFullReferralLink(baseLink, selectedColabForQr.id));
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
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

              <button 
                onClick={() => setSelectedColabForQr(null)}
                className="w-full py-3.5 border-2 border-brand-charcoal text-brand-charcoal font-bold rounded-xl hover:bg-gray-50 transition-all text-sm"
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
