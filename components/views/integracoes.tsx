'use client';

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import { Network, Database, CheckCircle2, Loader2, Users, ShieldCheck, UserCog, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/providers/toast-context';
import { supabase } from '@/lib/supabase';

export function IntegracoesView() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [ixcSaved, setIxcSaved] = useState(false);
  const [formsSaved, setFormsSaved] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<{ id: string; email: string; role: string; last_sign_in_at: string | null }[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );
  
  const [ixcDomain, setIxcDomain] = useState('');
  const [ixcToken, setIxcToken] = useState('');
  const [ixcLoading, setIxcLoading] = useState(false);
  const [ixcError, setIxcError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch('/api/integrations/ixc/config');
        const data = await response.json();
        if (data.success) {
          setIxcDomain(data.domain || '');
          setIxcToken(data.token || '');
        }
      } catch (err) {
        console.error('Error loading IXC config:', err);
      }
    }

    async function checkAdmin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const res = await fetch('/api/users');
      if (res.ok) {
        setIsAdmin(true);
        const data = await res.json();
        setUsers(data.users || []);
      }
    }

    loadConfig();
    checkAdmin();
  }, []);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch('/api/users');
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        toastSuccess('Role atualizado', `Usuário definido como ${newRole}.`);
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      } else {
        toastError('Erro', data.error || 'Não foi possível atualizar o role.');
      }
    } catch (err) {
      toastError('Erro de conexão', 'Não foi possível atualizar o role.');
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleSaveIxc = async () => {
    setIxcLoading(true);
    setIxcError(null);
    setIxcSaved(false);

    const trimmedDomain = (ixcDomain || '').trim();
    if (!trimmedDomain) {
      setIxcError('Informe o domínio do IXC antes de salvar.');
      toastError('Domínio Obrigatório', 'O domínio do IXC não pode ficar vazio.');
      setIxcLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/integrations/ixc/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: trimmedDomain,
          token: ixcToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setIxcError(data.error || 'Falha ao salvar configuração do IXC.');
        toastError('Erro no IXC', data.error || 'Falha ao salvar configuração.');
      } else {
        setIxcSaved(true);
        toastSuccess('Integração IXC', 'Configuração do IXC Soft salva com sucesso!');
        setTimeout(() => setIxcSaved(false), 3000);
      }
    } catch (err: any) {
      console.error('Error saving IXC config:', err);
      setIxcError('Erro de conexão ao salvar configuração.');
      toastError('Erro de Conexão', 'Não foi possível se conectar ao servidor.');
    } finally {
      setIxcLoading(false);
    }
  };

  const handleTestIxc = async () => {
    if (!ixcDomain || !ixcToken) {
      toastError('Dados Incompletos', 'Preencha o Domínio e Token antes de testar.');
      return;
    }

    setIxcLoading(true);
    setIxcError(null);

    try {
      const response = await fetch('/api/integrations/ixc/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domain: ixcDomain,
          token: ixcToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setIxcError(data.error || 'Falha na conexão com a API do IXC.');
        toastError('Conexão Falhou', data.error || 'Não foi possível autenticar no IXC Soft.');
      } else {
        toastSuccess('Conexão bem-sucedida!', 'Comunicação com a API do IXC Soft validada com sucesso.');
      }
    } catch (err: any) {
      console.error('Error testing IXC connection:', err);
      setIxcError('Erro de rede ao tentar conectar com a API do IXC.');
      toastError('Erro de Conexão', 'Verifique o domínio e sua conexão.');
    } finally {
      setIxcLoading(false);
    }
  };

  const webhookUrl = `${origin || 'https://sua-aplicacao.vercel.app'}/api/webhooks/ms-forms`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Integrações do Sistema</h2>
        <p className="text-brand-muted dark:text-gray-400 mt-1">Conecte o Gente Digital ao seu ERP IXC Soft e formulários do Microsoft Forms.</p>
      </div>

      {/* IXC Integration Panel */}
      <div className="saas-card p-8 transition-colors">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-amber-500/10 text-amber-500 rounded-2xl">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">ERP IXC Soft</h3>
            <p className="text-sm text-brand-muted dark:text-gray-400 mt-1">Sincronização automática de prospecções e conversões com o IXC.</p>
          </div>
        </div>

        {ixcError && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400">
            {ixcError}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">Domínio / Host do IXC (ex: ixc.suaempresa.com.br)</label>
            <input 
              type="text" 
              value={ixcDomain}
              onChange={(e) => setIxcDomain(e.target.value)}
              placeholder="ixc.suaprovedor.com.br"
              autoComplete="off"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#18181b] border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-gray-200 mb-1.5">Token de Autenticação Webservice (Bearer)</label>
            <input 
              type="password" 
              value={ixcToken}
              onChange={(e) => setIxcToken(e.target.value)}
              placeholder="Cole seu token gerado no IXC Soft"
              autoComplete="new-password"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-[#18181b] border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow transition-all font-mono"
            />
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center gap-3">
            <button 
              onClick={handleSaveIxc}
              disabled={ixcLoading}
              className="w-full sm:w-auto px-6 py-3 bg-brand-yellow hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {ixcLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Salvando...
                </>
              ) : ixcSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  Configuração Salva!
                </>
              ) : (
                'Salvar Integração IXC'
              )}
            </button>

            <button 
              onClick={handleTestIxc}
              disabled={ixcLoading}
              className="w-full sm:w-auto px-6 py-3 bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-brand-charcoal dark:text-white font-bold text-sm rounded-xl transition-all border border-brand-border dark:border-gray-700 disabled:opacity-50"
            >
              Testar Conexão
            </button>
          </div>
        </div>
      </div>

      {/* Microsoft Forms Integration Panel */}
      <div className="saas-card p-8 transition-colors">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-2xl">
            <Network className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Integração Microsoft Forms</h3>
            <p className="text-sm text-brand-muted dark:text-gray-400 mt-1">Receba leads diretamente de formulários externos via Webhook automatizado.</p>
          </div>
        </div>
        <div className="space-y-4 bg-gray-50 dark:bg-zinc-900/60 p-6 rounded-xl border border-brand-border dark:border-gray-700">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-white mb-1.5">
              URL do Webhook (Cole no Microsoft Power Automate)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input 
                readOnly 
                value={`${webhookUrl}?secret=SEU_WEBHOOK_SECRET`} 
                className="w-full bg-white dark:bg-[#27272a] px-4 py-3 border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-gray-200 outline-none font-mono" 
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${webhookUrl}?secret=SEU_WEBHOOK_SECRET`);
                  setFormsSaved(true);
                  toastSuccess('Copiado!', 'URL do Webhook copiada com o parâmetro de autenticação.');
                  setTimeout(() => setFormsSaved(false), 2000);
                }}
                className="px-6 py-3 border border-brand-border dark:border-gray-700 bg-brand-yellow hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl transition-colors shrink-0 shadow-sm"
              >
                {formsSaved ? 'Copiado!' : 'Copiar URL Autenticada'}
              </button>
            </div>
            <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-700 dark:text-amber-300 flex flex-col gap-1">
              <span className="font-bold">🔒 Requisito de Segurança (Token Obrigatório):</span>
              <span>
                Substitua <code className="bg-amber-100 dark:bg-amber-950/60 px-1 py-0.5 rounded font-mono font-bold">SEU_WEBHOOK_SECRET</code> pelo mesmo valor configurado na variável <code className="bg-amber-100 dark:bg-amber-950/60 px-1 py-0.5 rounded font-mono font-bold">WEBHOOK_SECRET</code> no seu servidor, ou adicione o cabeçalho HTTP <code className="bg-amber-100 dark:bg-amber-950/60 px-1 py-0.5 rounded font-mono font-bold">x-webhook-secret</code> na ação HTTP do Power Automate.
              </span>
            </div>
            
            <div className="mt-6 pt-5 border-t border-brand-border dark:border-gray-700">
              <h4 className="text-sm font-bold text-brand-charcoal dark:text-white mb-3">🏷️ Mapeamento Inteligente de Campos</h4>
              <p className="text-xs text-brand-muted dark:text-gray-400 mb-4 leading-relaxed">
                O Gente Digital analisa as perguntas do seu formulário no Microsoft Forms e faz a associação automática. 
                Você pode nomear as perguntas da forma que preferir, desde que contenham as seguintes palavras-chave:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-white dark:bg-[#27272a]/50 p-3.5 rounded-xl border border-brand-border dark:border-gray-700">
                  <span className="font-semibold text-brand-charcoal dark:text-white block mb-1">Nome do Lead</span>
                  <span className="text-brand-muted dark:text-gray-400">Pergunta contendo: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">nome</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">name</code> ou <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">cliente</code>.</span>
                  <span className="text-[10px] text-brand-muted/70 dark:text-gray-500 block mt-1">Ex: &quot;Qual seu nome completo?&quot;</span>
                </div>
                <div className="bg-white dark:bg-[#27272a]/50 p-3.5 rounded-xl border border-brand-border dark:border-gray-700">
                  <span className="font-semibold text-brand-charcoal dark:text-white block mb-1">WhatsApp / Telefone</span>
                  <span className="text-brand-muted dark:text-gray-400">Pergunta contendo: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">telefone</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">celular</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">whatsapp</code> ou <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">contato</code>.</span>
                  <span className="text-[10px] text-brand-muted/70 dark:text-gray-500 block mt-1">Ex: &quot;Qual o seu WhatsApp com DDD?&quot;</span>
                </div>
                <div className="bg-white dark:bg-[#27272a]/50 p-3.5 rounded-xl border border-brand-border dark:border-gray-700">
                  <span className="font-semibold text-brand-charcoal dark:text-white block mb-1">Indicador / Colaborador</span>
                  <span className="text-brand-muted dark:text-gray-400">Pergunta contendo: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">colaborador</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">indicador</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">codigo</code> ou <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">quem</code>.</span>
                  <span className="text-[10px] text-brand-muted/70 dark:text-gray-500 block mt-1">Ex: &quot;Quem indicou você?&quot;</span>
                </div>
                <div className="bg-white dark:bg-[#27272a]/50 p-3.5 rounded-xl border border-brand-border dark:border-gray-700">
                  <span className="font-semibold text-brand-charcoal dark:text-white block mb-1">Valor do Contrato</span>
                  <span className="text-brand-muted dark:text-gray-400">Pergunta contendo: <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">valor</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">preco</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">plano</code> ou <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-red-500 font-semibold font-mono">mensalidade</code>.</span>
                  <span className="text-[10px] text-brand-muted/70 dark:text-gray-500 block mt-1">Ex: &quot;Qual o valor do plano de interesse?&quot;</span>
                </div>
              </div>
              <div className="mt-4 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/20 text-xs text-blue-700 dark:text-blue-400 leading-relaxed flex flex-col gap-1">
                <span className="font-semibold">💡 Dica de Vinculação por Link:</span>
                <span>Você também pode passar o código do indicador direto na URL do webhook adicionando <code className="bg-blue-100/50 dark:bg-blue-900/30 px-1 py-0.5 rounded font-mono font-bold">?ref=CODIGO</code> ao final da URL (ex: <code className="font-mono text-[10px] opacity-80 break-all">{webhookUrl}?ref=EMP-042</code>). Isso serve como a indicação padrão se o formulário não tiver a pergunta de indicação.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* User Management Panel — somente admin */}
      {isAdmin && (
        <div className="saas-card p-8 transition-colors">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-violet-500/10 text-violet-500 rounded-2xl">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Gestão de Usuários</h3>
                <p className="text-sm text-brand-muted dark:text-gray-400 mt-1">Defina o nível de acesso de cada usuário do sistema.</p>
              </div>
            </div>
            <button
              onClick={fetchUsers}
              disabled={usersLoading}
              className="p-2 rounded-xl border border-brand-border dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              title="Atualizar lista"
            >
              <RefreshCw className={`w-4 h-4 text-brand-muted ${usersLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-zinc-900/60 rounded-xl border border-brand-border dark:border-gray-700"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <UserCog className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-charcoal dark:text-white truncate">{user.email || 'Sem e-mail'}</p>
                    <p className="text-xs text-brand-muted dark:text-gray-500">
                      {user.last_sign_in_at
                        ? `Último login: ${new Date(user.last_sign_in_at).toLocaleString('pt-BR')}`
                        : 'Nunca fez login'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {updatingRole === user.id ? (
                    <Loader2 className="w-5 h-5 animate-spin text-brand-muted" />
                  ) : (
                    <>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        user.role === 'admin'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        <ShieldCheck className="w-3 h-3" />
                        {user.role === 'admin' ? 'Admin' : 'Vendedor'}
                      </span>
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="text-xs px-3 py-1.5 bg-white dark:bg-zinc-800 border border-brand-border dark:border-gray-700 rounded-lg text-brand-charcoal dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow cursor-pointer"
                      >
                        <option value="vendedor">Vendedor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </>
                  )}
                </div>
              </div>
            ))}

            {users.length === 0 && !usersLoading && (
              <p className="text-sm text-brand-muted dark:text-gray-500 text-center py-6">
                Nenhum usuário encontrado. Execute o SQL de migração no Supabase.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
