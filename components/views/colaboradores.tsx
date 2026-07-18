import { UserPlus, Link as LinkIcon, Edit2, HelpCircle, Search, Copy, BarChart2, Trash2, X, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase, Colaborador } from '@/lib/supabase';
import Avatar from 'boring-avatars';

const initialColaboradores: Colaborador[] = [
  { id: 'EMP-042', name: 'Ana Costa Silva', email: 'ana.costa@empresa.com', initials: 'AC', count: 12 },
  { id: 'EMP-043', name: 'Carlos Oliveira', email: 'carlos.o@empresa.com', initials: 'CO', count: 8 }
];

export function ColaboradoresView() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>(initialColaboradores);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [baseLink, setBaseLink] = useState('gentedigital.com.br/indicar');
  const [isEditingBase, setIsEditingBase] = useState(false);
  const [tempBaseLink, setTempBaseLink] = useState('');

  const fetchColaboradores = async () => {
    try {
      setIsLoading(true);
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) {
        const { data, error } = await supabase.from('colaboradores').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        if (data && data.length > 0) {
           setColaboradores(data);
        } else {
           setColaboradores(initialColaboradores);
        }
      } else {
        setColaboradores(initialColaboradores);
      }
    } catch (error) {
      console.error("Error fetching colaboradores:", error);
      setColaboradores(initialColaboradores);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchColaboradores();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!newName) return;
    const initials = newName.substring(0,2).toUpperCase();
    const id = `EMP-0${Math.floor(Math.random() * 100) + 44}`;
    
    const newColab = { id, name: newName, email: newEmail, initials, count: 0 };

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
    setNewName('');
    setNewEmail('');
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
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold text-brand-charcoal">Gestão de Links de Indicação</h2>
          <p className="text-brand-muted mt-1">Configure e monitore os links de compartilhamento dos seus colaboradores.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-brand-yellow text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-level-2 transition-all flex items-center justify-center gap-2">
          <UserPlus className="w-5 h-5" />
          Novo Colaborador
        </button>
      </div>

      {/* Grid Info Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-brand-border shadow-level-1 p-6">
          <div className="flex items-center gap-2 mb-4 text-brand-charcoal">
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
                  className="w-full bg-white border border-brand-yellow rounded-xl px-4 py-3 font-mono text-sm text-brand-charcoal focus:outline-none focus:ring-2 focus:ring-brand-yellow/20"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (tempBaseLink.trim()) setBaseLink(tempBaseLink);
                    setIsEditingBase(false);
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-brand-yellow text-brand-charcoal font-bold text-sm rounded-xl hover:shadow-level-2 transition-all flex items-center justify-center"
                >
                  Salvar
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 w-full bg-gray-50 border border-brand-border rounded-xl px-4 py-3 font-mono text-sm text-brand-charcoal">
                  {baseLink}
                </div>
                <button 
                  onClick={() => {
                    setTempBaseLink(baseLink);
                    setIsEditingBase(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 border-2 border-brand-charcoal text-brand-charcoal font-bold text-sm rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Edit2 className="w-4 h-4" />
                  Alterar Base
                </button>
              </>
            )}
          </div>
          <p className="text-xs text-brand-muted mt-4">
            Este é o endereço raiz para todas as indicações. O ID do colaborador será anexado automaticamente como parâmetro <span className="font-bold text-brand-charcoal">?ref=ID</span>.
          </p>
        </div>

        <div className="bg-gray-50 rounded-2xl border-l-4 border-brand-yellow p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3 text-brand-charcoal">
            <HelpCircle className="w-5 h-5" />
            <h4 className="font-bold">Como funciona?</h4>
          </div>
          <p className="text-sm text-brand-muted leading-relaxed">
            Cada colaborador possui um <span className="font-bold text-brand-charcoal">ID Único</span>. Quando alguém acessa o link com esse ID, o sistema armazena um cookie por 30 dias para garantir o rastreamento da conversão.
          </p>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-brand-border shadow-level-1 overflow-hidden">
        <div className="px-6 py-5 border-b border-brand-border flex flex-col sm:flex-row justify-between sm:items-center gap-4">
          <h3 className="font-bold text-xl text-brand-charcoal">Colaboradores Ativos</h3>
          <div className="relative w-full sm:w-64 text-brand-muted focus-within:text-brand-charcoal transition-colors">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" />
            <input
              type="text"
              placeholder="Filtrar colaborador..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-brand-border">
                <th className="px-6 py-4 font-bold text-xs text-brand-muted uppercase tracking-wider">Colaborador</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted uppercase tracking-wider text-center">ID</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted uppercase tracking-wider">Link Único</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted uppercase tracking-wider text-center">Indicações</th>
                <th className="px-6 py-4 font-bold text-xs text-brand-muted uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {colaboradores.map((colab) => (
                <tr key={colab.id} className="hover:bg-gray-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Avatar size={36} name={colab.name} variant="beam" colors={['#FFC700', '#2E2D32', '#F9FAFB', '#D1D5DB', '#9CA3AF']} />
                      <div>
                        <p className="font-semibold text-brand-charcoal text-sm">{colab.name}</p>
                        <p className="text-xs text-brand-muted">{colab.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="px-2.5 py-1 bg-gray-100 border border-brand-border rounded-md text-xs font-mono text-brand-charcoal">
                      {colab.id}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-brand-link hover:underline cursor-pointer font-medium truncate max-w-[200px]" title={`${baseLink}?ref=${colab.id}`}>
                        {baseLink}?ref={colab.id}
                      </span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(`${baseLink}?ref=${colab.id}`)}
                        className="text-brand-muted hover:text-brand-charcoal opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-bold text-brand-charcoal text-base">{colab.count.toString().padStart(2, '0')}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="p-2 text-brand-muted hover:text-brand-charcoal rounded-lg hover:bg-gray-200 transition-colors" title="Ver Analytics">
                        <BarChart2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(colab.id)} className="p-2 text-brand-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {colaboradores.length === 0 && (
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
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1">Nome Completo</label>
                <input autoFocus required value={newName} onChange={e => setNewName(e.target.value)} type="text" placeholder="Ex: Maria Joaquina" className="w-full px-4 py-3 bg-gray-50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-brand-charcoal mb-1">E-mail Profissional</label>
                <input required value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" placeholder="maria@empresa.com" className="w-full px-4 py-3 bg-gray-50 border border-brand-border rounded-xl text-sm focus:outline-none focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow transition-all" />
              </div>
              <button type="submit" className="w-full py-3.5 bg-brand-yellow text-brand-charcoal font-bold rounded-xl mt-6 hover:shadow-level-2 transition-all">
                Adicionar Colaborador
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
