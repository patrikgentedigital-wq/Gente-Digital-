'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, Check } from 'lucide-react';
import { DateFilterState, DatePeriodType, getPeriodLabel, MONTH_NAMES_BR, AvailableMonthOption } from '@/lib/date-filters';

interface DateRangeFilterProps {
  value: DateFilterState;
  onChange: (value: DateFilterState) => void;
  className?: string;
  compact?: boolean;
  availableMonths?: AvailableMonthOption[];
}

export function DateRangeFilter({
  value,
  onChange,
  className = '',
  compact = false,
  availableMonths = [],
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const handleQuickPeriodSelect = (period: DatePeriodType) => {
    if (period === 'custom') {
      const today = now.toISOString().slice(0, 10);
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      onChange({
        period: 'custom',
        startDate: value.startDate || past,
        endDate: value.endDate || today,
      });
    } else if (period === 'specific_month') {
      onChange({
        period: 'specific_month',
        month: value.month !== undefined ? value.month : currentMonth,
        year: value.year !== undefined ? value.year : currentYear,
      });
      setIsOpen(false);
    } else {
      onChange({
        period,
        startDate: undefined,
        endDate: undefined,
        month: undefined,
        year: undefined,
      });
      setIsOpen(false);
    }
  };

  const handleSelectSpecificMonth = (month: number, year: number) => {
    onChange({
      period: 'specific_month',
      month,
      year,
    });
    setIsOpen(false);
  };

  const handleCustomDateChange = (field: 'startDate' | 'endDate', val: string) => {
    onChange({
      ...value,
      period: 'custom',
      [field]: val,
    });
  };

  // Anos disponíveis para apuração
  const availableYears = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];

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
            <span className="truncate max-w-[190px]">{getPeriodLabel(value)}</span>
          </div>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
            <div className="absolute left-0 sm:right-auto top-full mt-1.5 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl z-40 py-1.5 animate-in fade-in zoom-in-95 duration-150 max-h-96 overflow-y-auto">
              
              {/* Opções Rápidas */}
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-b border-zinc-100 dark:border-zinc-800 mb-1">
                Atalhos Rápidos
              </div>

              {[
                { id: 'all', label: 'Todo o período' },
                { id: 'this_month', label: 'Este mês (Atual)' },
                { id: 'last_month', label: 'Mês anterior' },
                { id: 'last_30_days', label: 'Últimos 30 dias' },
                { id: 'this_year', label: 'Este ano' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleQuickPeriodSelect(p.id as DatePeriodType)}
                  className={`w-full text-left px-3.5 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    value.period === p.id
                      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>{p.label}</span>
                  {value.period === p.id && <Check className="w-3.5 h-3.5 text-amber-500" />}
                </button>
              ))}

              {/* Meses com Registros Reais (se disponíveis) */}
              {availableMonths.length > 0 && (
                <>
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 border-t border-zinc-100 dark:border-zinc-800 mt-1">
                    Meses com Indicações ({availableMonths.length})
                  </div>
                  {availableMonths.map((m) => {
                    const isSelected = value.period === 'specific_month' && value.month === m.month && value.year === m.year;
                    return (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => handleSelectSpecificMonth(m.month, m.year)}
                        className={`w-full text-left px-3.5 py-1.5 text-xs transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <span>{m.label}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-semibold">
                          {m.count}
                        </span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Escolha Manual de Mês/Ano */}
              <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 border-t border-zinc-100 dark:border-zinc-800 mt-1">
                Outros Meses & Períodos
              </div>

              <button
                type="button"
                onClick={() => handleQuickPeriodSelect('specific_month')}
                className={`w-full text-left px-3.5 py-1.5 text-xs transition-colors flex items-center justify-between ${
                  value.period === 'specific_month'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span>Selecionar Mês & Ano...</span>
                {value.period === 'specific_month' && <Check className="w-3.5 h-3.5 text-amber-500" />}
              </button>

              <button
                type="button"
                onClick={() => handleQuickPeriodSelect('custom')}
                className={`w-full text-left px-3.5 py-1.5 text-xs transition-colors flex items-center justify-between ${
                  value.period === 'custom'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span>Intervalo Personalizado (De/Até)</span>
                {value.period === 'custom' && <Check className="w-3.5 h-3.5 text-amber-500" />}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Seletores Inline quando 'specific_month' */}
      {value.period === 'specific_month' && (
        <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs">
          <select
            value={value.month !== undefined ? value.month : currentMonth}
            onChange={(e) => onChange({ ...value, period: 'specific_month', month: parseInt(e.target.value, 10), year: value.year ?? currentYear })}
            className="px-2 py-1 bg-transparent text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none font-medium"
            aria-label="Selecionar mês"
          >
            {MONTH_NAMES_BR.map((name, idx) => (
              <option key={idx} value={idx} className="dark:bg-zinc-900">
                {name}
              </option>
            ))}
          </select>
          <span className="text-zinc-400 text-xs">/</span>
          <select
            value={value.year !== undefined ? value.year : currentYear}
            onChange={(e) => onChange({ ...value, period: 'specific_month', year: parseInt(e.target.value, 10), month: value.month ?? currentMonth })}
            className="px-2 py-1 bg-transparent text-zinc-800 dark:text-zinc-200 text-xs focus:outline-none font-medium"
            aria-label="Selecionar ano"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr} className="dark:bg-zinc-900">
                {yr}
              </option>
            ))}
          </select>
        </div>
      )}

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
