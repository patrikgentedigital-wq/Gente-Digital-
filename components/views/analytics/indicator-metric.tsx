import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface IndicatorMetricProps {
  label: string;
  icon: LucideIcon;
  value: string;
  children?: ReactNode;
}

export function IndicatorMetric({ label, icon: Icon, value, children }: IndicatorMetricProps) {
  return <>
    <span className="ix-kpi-label"><Icon size={17} aria-hidden="true" /><span>{label}</span></span>
    <span className="ix-kpi-value">{value}</span>
    {children && <span className="ix-kpi-note">{children}</span>}
  </>;
}
