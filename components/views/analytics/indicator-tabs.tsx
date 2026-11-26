'use client';

import Link from 'next/link';
import { ChartNoAxesColumnIncreasing, ChartPie, CircleX } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ANALYTICS_TABS } from '@/lib/analytics/navigation';

export function IndicatorTabs({ cancellation }: { cancellation: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  function href(section?: string) {
    const next = new URLSearchParams(params);
    next.set('tab', section ? 'indicadores' : 'dashboard');
    if (section) next.set('indicadores', section);
    else next.delete('indicadores');
    return pathname + '?' + next.toString();
  }
  return (
    <nav aria-label="Abas de indicadores" className="ix-tabs">
      <Link href={href()} onNavigate={() => window.scrollTo(0, 0)}><ChartPie aria-hidden="true" size={16} />Visão geral</Link>
      {ANALYTICS_TABS.map(({ id, label }) => {
        const Icon = id === 'geral' ? ChartNoAxesColumnIncreasing : CircleX;
        return <Link key={id} href={href(id)} onNavigate={() => window.scrollTo(0, 0)} aria-current={id === (cancellation ? 'cancelamentos' : 'geral') ? 'page' : undefined}>
          <Icon aria-hidden="true" size={16} />{label}
        </Link>;
      })}
    </nav>
  );
}
