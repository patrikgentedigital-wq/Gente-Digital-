'use client';

import { useEffect } from 'react';
import { StatusPage } from '@/app/_public-identity/status-page';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Erro global crítico na aplicação:', error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <StatusPage title="Não foi possível abrir o sistema" retry={reset} digest={error.digest}>
          Houve uma falha ao iniciar o aplicativo. Tente carregar a página novamente.
        </StatusPage>
      </body>
    </html>
  );
}
