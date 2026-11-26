'use client';

import { useEffect } from 'react';
import { StatusPage } from '@/app/_public-identity/status-page';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Ocorreu um erro na aplicação:', error);
  }, [error]);

  return (
    <StatusPage title="Algo não saiu como esperado" retry={reset} digest={error.digest}>
      Encontramos uma instabilidade ao carregar esta página. Tente novamente em instantes.
    </StatusPage>
  );
}
