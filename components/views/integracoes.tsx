import { useState, useEffect } from 'react';
import { Network, Database, CheckCircle2, Loader2, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export function IntegracoesView() {
  const [ixcSaved, setIxcSaved] = useState(false);
  const [formsSaved, setFormsSaved] = useState(false);
  const [origin, setOrigin] = useState('');
  
  const [ixcDomain, setIxcDomain] = useState('');
  const [ixcToken, setIxcToken] = useState('');
  const [ixcLoading, setIxcLoading] = useState(false);
  const [ixcError, setIxcError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [clearSuccess, setClearSuccess] = useState(false);

  const handleClearLeads = async () => {
    if (!window.confirm('🚨 ATENÇÃO: Você tem certeza absoluta? Isso irá APAGAR todos os LEADS do banco de dados (Os colaboradores serão mantidos intactos). Essa ação é irreversível.')) return;
    
    setIsClearing(true);
    setClearSuccess(false);
    try {
      const response = await fetch('/api/leads/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        alert('Erro ao apagar os leads: ' + (data.error || 'Falha na requisição'));
      } else {
        setClearSuccess(true);
        setTimeout(() => setClearSuccess(false), 4000);
        alert('✅ Sucesso! Todos os leads de teste foram apagados. O sistema está pronto para produção.');
      }
    } catch (err) {
      alert('Erro inesperado de conexão com o servidor.');
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch('/api/integrations/ixc/config');
        const data = await response.json();
        if (data.success) {
          setIxcDomain(data.domain || '');
          setIxcToken(data.token || '');
          if (data.domain && data.token && !data.tableMissing) {
            setIxcSaved(true);
          }
        }
      } catch (err) {
        console.error('Error loading IXC config:', err);
      }
    }
    loadConfig();
  }, []);

  const handleTestIxc = async () => {
    if (!ixcDomain || !ixcToken) {
      setIxcError('Por favor, preencha o domínio e o token.');
      return;
    }
    setIxcLoading(true);
    setIxcError(null);
    setIxcSaved(false);

    try {
      const response = await fetch('/api/integrations/ixc/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: ixcDomain, token: ixcToken })
      });
      const data = await response.json();
      if (data.success) {
        // Save config to database
        const saveResponse = await fetch('/api/integrations/ixc/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: ixcDomain, token: ixcToken })
        });
        const saveData = await saveResponse.json();
        if (saveData.success) {
          setIxcSaved(true);
        } else {
          setIxcError(saveData.error || 'Conectado com sucesso, mas falhou ao salvar credenciais.');
        }
      } else {
        setIxcError(data.error || 'Falha ao conectar com o IXC.');
      }
    } catch (err: any) {
      setIxcError('Erro de rede ao tentar conectar com o IXC.');
    } finally {
      setIxcLoading(false);
    }
  };

  useEffect(() => {
    setTimeout(() => {
      setOrigin(window.location.origin);
    }, 0);
  }, []);

  const webhookUrl = origin ? `${origin}/api/webhooks/ms-forms` : 'http://localhost:3000/api/webhooks/ms-forms';


  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-charcoal dark:text-white">Integrações</h2>
        <p className="text-brand-muted dark:text-gray-400 mt-1">Conecte o Gente Digital a outras plataformas de mercado (IXC Soft e Microsoft Forms).</p>
      </div>

      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-level-1 p-8 transition-colors">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Integração IXC Soft</h3>
            <p className="text-sm text-brand-muted dark:text-gray-400 mt-1">Sincronize clientes e status de fatura automaticamente com seu provedor.</p>
          </div>
        </div>
        <div className="space-y-5 bg-gray-50 dark:bg-gray-800/40 p-6 rounded-xl border border-brand-border dark:border-gray-700">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-white mb-1.5">Domínio IXC</label>
            <input 
              type="text" 
              value={ixcDomain}
              onChange={e => setIxcDomain(e.target.value)}
              placeholder="ex: ixc.suaempresa.com.br" 
              className="w-full px-4 py-3 bg-white dark:bg-[#27272a] border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow outline-none transition-all" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-white mb-1.5">Token de Acesso (API)</label>
            <input 
              type="password" 
              value={ixcToken}
              onChange={e => setIxcToken(e.target.value)}
              placeholder="••••••••••••••••" 
              className="w-full px-4 py-3 bg-white dark:bg-[#27272a] border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-charcoal dark:text-white focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow outline-none transition-all" 
            />
          </div>
          
          {ixcError && (
            <p className="text-red-500 text-xs font-semibold mt-1 leading-relaxed">{ixcError}</p>
          )}

          <button
            onClick={handleTestIxc}
            disabled={ixcLoading}
            className={`px-8 py-3.5 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
              ixcSaved 
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-brand-charcoal text-white hover:bg-black hover:shadow-level-2'
            } disabled:opacity-50`}
          >
            {ixcLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Testando Conexão...
              </>
            ) : ixcSaved ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Conectado com Sucesso
              </>
            ) : 'Salvar e Testar Conexão'}
          </button>

          <div className="pt-5 border-t border-brand-border dark:border-gray-700/80 space-y-2">
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-white">
              URL do Webhook em Tempo Real (Ativação de Contrato IXC)
            </label>
            <p className="text-xs text-brand-muted dark:text-gray-400 leading-relaxed">
              Cole esta URL em <strong>Gatilhos / Webhooks</strong> do IXC Soft para atualizar o lead para "Ganho" e importar o valor do plano automaticamente no instante em que o contrato for ativado:
            </p>
            <div className="flex gap-2 pt-1">
              <input 
                type="text" 
                readOnly 
                value={origin ? `${origin}/api/integrations/ixc/webhook?secret=CONFIGURE_SEU_TOKEN_AQUI` : 'https://seu-dominio.vercel.app/api/integrations/ixc/webhook?secret=CONFIGURE_SEU_TOKEN_AQUI'}
                className="flex-1 px-4 py-2.5 bg-white dark:bg-[#27272a] border border-brand-border dark:border-gray-700 rounded-xl text-xs font-mono text-brand-charcoal dark:text-gray-300 outline-none select-all" 
              />
              <button
                onClick={() => {
                  const url = origin ? `${origin}/api/integrations/ixc/webhook?secret=CONFIGURE_SEU_TOKEN_AQUI` : 'https://seu-dominio.vercel.app/api/integrations/ixc/webhook?secret=CONFIGURE_SEU_TOKEN_AQUI';
                  navigator.clipboard.writeText(url);
                  alert('URL do Webhook IXC copiada para a área de transferência!');
                }}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors shrink-0 shadow-sm"
              >
                Copiar URL
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#18181b] rounded-2xl border border-brand-border dark:border-gray-800 shadow-level-1 p-8 transition-colors">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-green-50 text-green-600 rounded-2xl">
            <Network className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal dark:text-white">Integração Microsoft Forms</h3>
            <p className="text-sm text-brand-muted dark:text-gray-400 mt-1">Receba leads diretamente de formulários externos via Webhook automatizado.</p>
          </div>
        </div>
        <div className="space-y-4 bg-gray-50 dark:bg-gray-800/40 p-6 rounded-xl border border-brand-border dark:border-gray-700">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-white mb-1.5">URL do Webhook (Gerada pelo Gente Digital)</label>
            <div className="flex gap-2">
              <input readOnly value={webhookUrl} className="w-full bg-white dark:bg-[#27272a] px-4 py-3 border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-muted dark:text-gray-400 outline-none font-mono" />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setFormsSaved(true);
                  setTimeout(() => setFormsSaved(false), 2000);
                }}
                className="px-6 py-3 border border-brand-border dark:border-gray-700 bg-white dark:bg-gray-850 text-brand-charcoal dark:text-white font-bold text-sm rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {formsSaved ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="text-sm text-brand-muted dark:text-gray-400 mt-3">Cole esta URL no <span className="font-semibold text-brand-charcoal dark:text-white">Microsoft Power Automate</span> para direcionar as respostas do Forms para sua base de leads.</p>
            
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

      {/* Seção de Administração do Sistema (Zerar Leads) */}
      <div className="bg-red-50 dark:bg-red-950/20 rounded-2xl border border-red-200 dark:border-red-900/50 shadow-level-1 p-8 transition-colors mt-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-2xl">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-red-800 dark:text-red-400">Administração do Sistema</h3>
            <p className="text-sm text-red-600 dark:text-red-400/80 mt-1">Ações destrutivas para manutenção do banco de dados.</p>
          </div>
        </div>
        
        <div className="bg-white/60 dark:bg-[#18181b]/60 p-6 rounded-xl border border-red-200/50 dark:border-red-900/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex-1">
            <h4 className="font-bold text-brand-charcoal dark:text-white text-base mb-1">Zerar Base de Leads (Modo Produção)</h4>
            <p className="text-sm text-brand-muted dark:text-gray-400 leading-relaxed max-w-2xl">
              Utilize esta opção para apagar permanentemente todos os leads cadastrados (dados de teste) e iniciar o sistema &quot;valendo&quot;. 
              <strong> Os colaboradores cadastrados NÃO serão afetados.</strong>
            </p>
          </div>
          
          <button
            onClick={handleClearLeads}
            disabled={isClearing}
            className={`shrink-0 px-6 py-3 font-bold text-sm rounded-xl transition-all flex items-center gap-2 shadow-sm ${
              clearSuccess
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-red-600 hover:bg-red-700 text-white'
            } disabled:opacity-50`}
          >
            {isClearing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Limpando...
              </>
            ) : clearSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Banco Limpo
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Zerar Todos os Leads
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
