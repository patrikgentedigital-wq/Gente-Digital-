'use client';

import { useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';
import { DateFilterState, DatePeriodType, getPeriodLabel } from '@/lib/date-filters';

interface DateRangeFilterProps {
  value: DateFilterState;
  onChange: (value: DateFilterState) => void;
  className?: string;
  compact?: boolean;
}

export function DateRangeFilter({ value, onChange, className = '', compact = false }: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const periods: { id: DatePeriodType; label: string }[] = [
    { id: 'all', label: 'Todo o período' },
    { id: 'this_month', label: 'Este mês' },
    { id: 'last_month', label: 'Mês anterior' },
    { id: 'last_30_days', label: 'Últimos 30 dias' },
    { id: 'this_year', label: 'Este ano' },
    { id: 'custom', label: 'Personalizado' },
  ];

  const handlePeriodSelect = (period: DatePeriodType) => {
    if (period === 'custom') {
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      onChange({
        period: 'custom',
        startDate: value.startDate || past,
        endDate: value.endDate || today,
      });
    } else {
      onChange({
        period,
        startDate: undefined,
        endDate: undefined,
      });
      setIsOpen(false);
    }
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', val: string) => {
    onChange({
      ...value,
      period: 'custom',
      [field]: val,
    });
  };

  return (
    <div className={`relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${className}`}>
      {/* Botão Dropdown / Indicador do Período */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between gap-2.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 hover:border-amber-400 dark:hover:border-amber-400 transition-all shadow-xs w-full sm:w-auto"
          aria-label="Filtrar por data"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate max-w-[160px]">{getPeriodLabel(value)}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 sm:right-auto top-full mt-1.5 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-40 py-1.5 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                Período de Apuração
              </div>
              {periods.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePeriodSelect(p.id)}
                  className={`w-full text-left px-3.5 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    value.period === p.id
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>{p.label}</span>
                  {value.period === p.id && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Inputs de Data Personalizada quando 'custom' */}
      {value.period === 'custom' && (
        <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
          <input
            type="date"
            value={value.startDate || ''}
            onChange={(e) => handleCustomDateChange('startDate', e.target.value)}
            className="px-2 py-1 bg-transparent text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 rounded-lg"
            title="Data inicial"
          />
          <span className="text-zinc-400 text-xs font-bold">até</span>
          <input
            type="date"
            value={value.endDate || ''}
            onChange={(e) => handleCustomDateChange('endDate', e.target.value)}
            className="px-2 py-1 bg-transparent text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 rounded-lg"
            title="Data final"
          />
        </div>
      )}
    </div>
  );
}
