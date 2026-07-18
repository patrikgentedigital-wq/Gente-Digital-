import { useState } from 'react';
import { Network, Database, CheckCircle2 } from 'lucide-react';

export function IntegracoesView() {
  const [ixcSaved, setIxcSaved] = useState(false);
  const [formsSaved, setFormsSaved] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="font-display text-3xl font-bold text-brand-charcoal">Integrações</h2>
        <p className="text-brand-muted mt-1">Conecte o Gente Digital a outras plataformas de mercado (IXC Soft e Microsoft Forms).</p>
      </div>

      <div className="bg-white rounded-2xl border border-brand-border shadow-level-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal">Integração IXC Soft</h3>
            <p className="text-sm text-brand-muted mt-1">Sincronize clientes e status de fatura automaticamente com seu provedor.</p>
          </div>
        </div>
        <div className="space-y-5 bg-gray-50 p-6 rounded-xl border border-brand-border">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal mb-1.5">Domínio IXC</label>
            <input type="text" placeholder="ex: ixc.suaempresa.com.br" className="w-full px-4 py-3 bg-white border border-brand-border rounded-xl text-sm focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow outline-none transition-all" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal mb-1.5">Token de Acesso (API)</label>
            <input type="password" placeholder="••••••••••••••••" className="w-full px-4 py-3 bg-white border border-brand-border rounded-xl text-sm focus:border-brand-yellow focus:ring-1 focus:ring-brand-yellow outline-none transition-all" />
          </div>
          <button
            onClick={() => {
              setIxcSaved(false);
              setTimeout(() => setIxcSaved(true), 600);
            }}
            className={`px-8 py-3.5 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2 ${
              ixcSaved 
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-brand-charcoal text-white hover:bg-black hover:shadow-level-2'
            }`}
          >
            {ixcSaved ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Conectado com Sucesso
              </>
            ) : 'Salvar e Testar Conexão'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-brand-border shadow-level-1 p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-green-50 text-green-600 rounded-2xl">
            <Network className="w-8 h-8" />
          </div>
          <div>
            <h3 className="font-bold text-xl text-brand-charcoal">Integração Microsoft Forms</h3>
            <p className="text-sm text-brand-muted mt-1">Receba leads diretamente de formulários externos via Webhook automatizado.</p>
          </div>
        </div>
        <div className="space-y-4 bg-gray-50 p-6 rounded-xl border border-brand-border">
          <div>
            <label className="block text-sm font-semibold text-brand-charcoal mb-1.5">URL do Webhook (Gerada pelo Gente Digital)</label>
            <div className="flex gap-2">
              <input readOnly value="https://api.gentedigital.com.br/webhooks/ms-forms/x92j-8f2k-m1n4" className="w-full bg-white px-4 py-3 border border-brand-border rounded-xl text-sm text-brand-muted outline-none font-mono" />
              <button 
                onClick={() => setFormsSaved(true)}
                className="px-6 py-3 border border-brand-border bg-white text-brand-charcoal font-bold text-sm rounded-xl hover:bg-gray-100 transition-colors"
              >
                {formsSaved ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
            <p className="text-sm text-brand-muted mt-3">Cole esta URL no <span className="font-semibold text-brand-charcoal">Microsoft Power Automate</span> para direcionar as respostas do Forms para sua base de leads.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
