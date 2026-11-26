import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './program-views.css';

interface ProgramMetricProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  icon?: LucideIcon;
  compact?: boolean;
}

export function ProgramMetric({ label, value, note, icon: Icon, compact }: ProgramMetricProps) {
  return (
    <article className="program-metric">
      <h3>{Icon && <Icon aria-hidden="true" size={17} />}{label}</h3>
      <p className={compact ? 'program-value program-value--compact' : 'program-value'}>{value}</p>
      {note && <p className="program-note">{note}</p>}
    </article>
  );
}
