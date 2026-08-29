'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Erro global crítico na aplicação:', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="min-h-screen flex items-center justify-center bg-[#09090B] text-slate-100 p-4 font-sans antialiased">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <h1 className="text-xl font-bold tracking-tight text-white mb-2">
            Erro Crítico de Carregamento
          </h1>

          <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
            Houve uma falha ao iniciar o aplicativo. Clique no botão abaixo para tentar recarregar a interface.
          </p>

          <button
            onClick={() => reset()}
            className="w-full py-3 px-4 bg-[#FFE600] hover:bg-yellow-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Recarregar Aplicação
          </button>

          {error?.digest && (
            <p className="text-[10px] text-zinc-500 mt-6">
              Digest ID: <code className="font-mono">{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
