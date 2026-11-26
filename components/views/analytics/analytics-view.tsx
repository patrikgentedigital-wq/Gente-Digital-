'use client';

import { useSearchParams } from 'next/navigation';
import { isAnalyticsTabId } from '@/lib/analytics/navigation';
import { CancelamentosView } from './cancelamentos-view';
import { CommercialView } from './commercial-view';
import './indicators.css';

export function AnalyticsView() {
  const section = useSearchParams().get('indicadores');
  return (
    <div className="ixc-insights">
      {isAnalyticsTabId(section) && section === 'cancelamentos' ? <CancelamentosView /> : <CommercialView />}
    </div>
  );
}
