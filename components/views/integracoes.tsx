import { useState, useEffect } from 'react';
import { Network, Database, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/components/providers/toast-context';

export function IntegracoesView() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [ixcSaved, setIxcSaved] = useState(false);
  const [formsSaved, setFormsSaved] = useState(false);
  const [origin, setOrigin] = useState('');
  
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  const handleSaveIxc = async () => {
    setIxcLoading(true);
    setIxcError(null);
    setIxcSaved(false);

    try {
      const response = await fetch('/api/integrations/ixc/config', {
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
            <label className="block text-sm font-semibold text-brand-charcoal dark:text-white mb-1.5">URL do Webhook (Gerada pelo Gente Digital)</label>
            <div className="flex gap-2">
              <input readOnly value={webhookUrl} className="w-full bg-white dark:bg-[#27272a] px-4 py-3 border border-brand-border dark:border-gray-700 rounded-xl text-sm text-brand-muted dark:text-gray-400 outline-none font-mono" />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  setFormsSaved(true);
                  toastSuccess('Copiado!', 'URL do Webhook copiada para a área de transferência.');
                  setTimeout(() => setFormsSaved(false), 2000);
                }}
                className="px-6 py-3 border border-brand-border dark:border-gray-700 bg-white dark:bg-gray-850 text-brand-charcoal dark:text-white font-bold text-sm rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
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
    </div>
  );
}
