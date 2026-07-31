import { Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard-shell';

export default function Page() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardShell />
    </Suspense>
  );
}

function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-surface dark:bg-gray-900">
      <div className="flex flex-col items-center gap-4 text-brand-muted">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-yellow border-t-transparent" />
        <p className="text-sm font-semibold">Carregando painel...</p>
      </div>
    </div>
  );
}
