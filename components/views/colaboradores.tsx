import { UserPlus, Link as LinkIcon, Edit2, HelpCircle, Search, Copy, BarChart2, Trash2, X, Users, QrCode } from 'lucide-react';
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
});

type ColaboradorFormData = z.infer<typeof colaboradorSchema>;


const initialColaboradores: Colaborador[] = [
  { id: 'EMP-042', name: 'Ana Costa Silva', email: 'ana.costa@empresa.com', initials: 'AC', count: 12 },
  { id: 'EMP-043', name: 'Carlos Oliveira', email: 'carlos.o@empresa.com', initials: 'CO', count: 8 }
];

export function ColaboradoresView() {
  const router = useRouter();
  const isSupabaseConfigured = typeof window !== 'undefined' && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>(isSupabaseConfigured ? [] : initialColaboradores);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedColabForQr, setSelectedColabForQr] = useState<Colaborador | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ColaboradorFormData>({
    resolver: zodResolver(colaboradorSchema)
  });

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
        const { data, error } = await supabase
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
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { data, error } = await supabase.from('colaboradores').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
           // Calcula dinamicamente a contagem de indicações baseada nos leads reais
           const { data: leadsData } = await supabase.from('leads').select('ref');
           const colabsWithCount = data.map(colab => {
             const colabCount = leadsData ? leadsData.filter(lead => 
               lead.ref === colab.id || 
               (lead.ref && lead.ref.toLowerCase() === colab.name.toLowerCase())
             ).length : (colab.count || 0);
             return { ...colab, count: colabCount };
           });
           setColaboradores(colabsWithCount);
        }
      } else {
        setColaboradores(initialColaboradores);
      }
    } catch (error) {
      console.error("Error fetching colaboradores:", error);
      const isConfigured = process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');
      setColaboradores(isConfigured ? [] : initialColaboradores);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchColaboradores();
    loadBaseLink();
  }, []);

  const handleAdd = async (data: ColaboradorFormData) => {
    const initials = data.name.substring(0,2).toUpperCase();
    const id = `EMP-0${Math.floor(Math.random() * 100) + 44}`;
    
    const newColab = { id, name: data.name, email: data.email, initials, count: 0 };

    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { error } = await supabase.from('colaboradores').insert([newColab]);
        if (error) throw error;
      }
      setColaboradores([newColab, ...colaboradores]);
    } catch (error) {
      console.error("Error adding colaborador:", error);
    }
    
    setIsModalOpen(false);
    reset();
  }

  const handleDelete = async (id: string) => {
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { error } = await supabase.from('colaboradores').delete().eq('id', id);
        if (error) throw error;
      }
      setColaboradores(colaboradores.filter(c => c.id !== id));
    } catch (error) {
      console.error("Error deleting colaborador:", error);
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
                      <Avatar size={36} name={colab.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
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
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getFullReferralLink(baseLink, selectedColabForQr.id))}`} 
                  alt="QR Code de Indicação" 
                  className="w-44 h-44 border-4 border-white shadow-md rounded-xl hover:scale-105 transition-transform" 
                />
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
